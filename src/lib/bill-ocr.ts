import { Member, RecipientVenueMapping } from './types';

export const DEFAULT_RECIPIENT_MAPPINGS: RecipientVenueMapping[] = [
  {
    id: 'map-bundo-tuyetanh',
    recipientName: 'VU THI TUYET ANH',
    accountKeywords: ['MS00P00000001093528', 'MSOOP00000001093528', '1093528', '2899991980'],
    venueName: 'Quán bún dọc mùng',
    defaultProgramId: 'prog-lunch',
    bankName: 'Techcombank',
    updatedAt: '2026-10-30T00:00:00.000Z',
  },
  {
    id: 'map-phoga-mailan',
    recipientName: 'NGUYEN THI MAI LAN',
    accountKeywords: ['MS00P00000001217065', 'MSOOP00000001217065', '1217065', '3061976666'],
    venueName: 'Phở Gà',
    defaultProgramId: 'prog-lunch',
    bankName: 'Techcombank',
    updatedAt: '2026-10-30T00:00:00.000Z',
  },
  {
    id: 'map-comga-thuha',
    recipientName: 'NGUYEN THI THU HA',
    accountKeywords: ['TNG61002150310', '61002150310', '2150310'],
    venueName: 'Cơm gà',
    defaultProgramId: 'prog-lunch',
    bankName: 'Sacombank',
    updatedAt: '2026-10-30T00:00:00.000Z',
  },
  {
    id: 'map-quanbia-vanbang',
    recipientName: 'NGUYEN VAN BANG',
    accountKeywords: ['19036102376019', '6102376019'],
    venueName: 'Quán bia',
    defaultProgramId: 'prog-dinner',
    bankName: 'Techcombank',
    updatedAt: '2026-10-30T00:00:00.000Z',
  },
];

export interface BillOcrResult {
  rawText: string;
  amountVnd: number | null;
  occurredAtInput: string | null; // YYYY-MM-DDTHH:mm
  dateDisplayVN: string | null; // DD/MM/YYYY HH:mm
  recipientName: string | null;
  recipientAccount: string | null;
  senderName: string | null;
  matchedVenue: string | null;
  matchedProgramId: string | null;
  matchedPayerMemberId: string | null;
  matchedMappingId: string | null;
  transferNote: string | null;
}

export function normalizeAsciiUpper(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getMergedRecipientMappings(
  customMappings?: RecipientVenueMapping[]
): RecipientVenueMapping[] {
  const map = new Map<string, RecipientVenueMapping>();
  for (const item of DEFAULT_RECIPIENT_MAPPINGS) {
    map.set(item.id, item);
  }
  for (const item of customMappings || []) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

/**
 * Nén ảnh chụp màn hình ngân hàng xuống kích thước chuẩn sắc nét (max 1150px, JPEG 0.82)
 * Giúp giảm dung lượng từ ~750KB PNG xuống ~55KB JPEG mà chữ vẫn rõ nét 100%,
 * chống tuyệt đối lỗi vượt giới hạn CPU/Memory trên Cloudflare Workers (Error 1102).
 */
export async function compressTransferImage(
  file: File
): Promise<{ dataUrl: string; sizeBytes: number; mimeType: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!file.type.startsWith('image/')) {
        resolve({
          dataUrl: rawDataUrl,
          sizeBytes: file.size,
          mimeType: file.type || 'application/octet-stream',
        });
        return;
      }

      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1150;
        let width = img.width;
        let height = img.height;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            dataUrl: rawDataUrl,
            sizeBytes: file.size,
            mimeType: file.type,
          });
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const compressedUrl = canvas.toDataURL('image/jpeg', 0.82);
        const approxBytes = Math.round((compressedUrl.length * 3) / 4);
        resolve({
          dataUrl: compressedUrl,
          sizeBytes: approxBytes,
          mimeType: 'image/jpeg',
        });
      };
      img.onerror = () => {
        resolve({
          dataUrl: rawDataUrl,
          sizeBytes: file.size,
          mimeType: file.type || 'image/jpeg',
        });
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Phân tích văn bản OCR từ ảnh chụp màn hình chuyển khoản ngân hàng (VPBank, Techcombank, TPBank, Vietcombank, MB, BIDV, Sacombank...)
 */
export function parseBankBillText(
  rawText: string,
  customMappings?: RecipientVenueMapping[],
  members?: Member[]
): BillOcrResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const allMappings = getMergedRecipientMappings(customMappings);
  const fullUpper = normalizeAsciiUpper(rawText);

  // ===========================================================================
  // 1. NHẬN DIỆN SỐ TIỀN CHUYỂN KHOẢN (amountVnd)
  // ===========================================================================
  let amountVnd: number | null = null;

  // Các mẫu ưu tiên cao: có chữ VND / đ hoặc dấu trừ đứng trước số tiền hàng nghìn
  const amountPatterns: RegExp[] = [
    // Techcombank: -VND 190,000 hoặc VND 315,000
    /[-+]?\s*VND\s*([0-9]{1,3}(?:[\s.,][0-9]{3})+)/i,
    // TPBank / VCB / MB: 260,000 VND hoặc -350 000 d / đ
    /[-+]?\s*([0-9]{1,4}(?:[\s.,][0-9]{3})+)\s*(?:VND|VNĐ|D|Đ)\b/i,
    // VPBank đôi khi OCR mất chữ đ phía sau: dòng ngay dưới "Thanh cong" có dạng "-350 000" hoặc "250 000"
    /(?:THANH\s*CONG|SO\s*TIEN)[\s\S]{0,35}?[-+]?\s*([0-9]{1,4}(?:[\s.,][0-9]{3})+)\b/i,
  ];

  for (const regex of amountPatterns) {
    const match = rawText.match(regex);
    if (match && match[1]) {
      const digitsOnly = match[1].replace(/[^0-9]/g, '');
      const val = Number(digitsOnly);
      if (val >= 10000 && val <= 100000000) {
        amountVnd = val;
        break;
      }
    }
  }

  // Fallback quét từng dòng tìm số dạng XXX 000 hoặc X XXX 000
  if (!amountVnd) {
    for (const line of lines) {
      const m = line.match(/^[-+]?\s*([0-9]{1,4}(?:[\s.,][0-9]{3})+)\s*(?:d|đ|VND)?$/i);
      if (m && m[1]) {
        const val = Number(m[1].replace(/[^0-9]/g, ''));
        if (val >= 15000 && val <= 50000000 && val % 100 === 0) {
          amountVnd = val;
          break;
        }
      }
    }
  }

  // ===========================================================================
  // 2. NHẬN DIỆN NGÀY & GIỜ GIAO DỊCH (occurredAtInput)
  // ===========================================================================
  let occurredAtInput: string | null = null;
  let dateDisplayVN: string | null = null;
  let detectedHour: number | null = null;

  // Mẫu 1: HH:mm DD/MM/YYYY (VPBank, Techcombank: "12:57 15/10/2026" hoặc "20:23 29/10/2026")
  const mTimeFirst = rawText.match(
    /\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\s+([0-3]?\d)[/-]([01]?\d)[/-](20\d{2})\b/
  );
  // Mẫu 2: DD/MM/YYYY HH:mm(:ss) (TPBank, VCB: "27/10/2026 12:34:55")
  const mDateFirst = rawText.match(
    /\b([0-3]?\d)[/-]([01]?\d)[/-](20\d{2})\s+([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/
  );
  // Mẫu 3: Chỉ có ngày DD/MM/YYYY (VD: VPBank "28/10/2026" kèm đồng hồ góc trên điện thoại "12:43")
  const mDateOnly = rawText.match(/\b([0-3]?\d)[/-]([01]?\d)[/-](20\d{2})\b/);

  if (mTimeFirst) {
    const hh = mTimeFirst[1].padStart(2, '0');
    const mm = mTimeFirst[2].padStart(2, '0');
    const dd = mTimeFirst[3].padStart(2, '0');
    const mo = mTimeFirst[4].padStart(2, '0');
    const yyyy = mTimeFirst[5];
    occurredAtInput = `${yyyy}-${mo}-${dd}T${hh}:${mm}`;
    dateDisplayVN = `${dd}/${mo}/${yyyy} ${hh}:${mm}`;
    detectedHour = Number(hh);
  } else if (mDateFirst) {
    const dd = mDateFirst[1].padStart(2, '0');
    const mo = mDateFirst[2].padStart(2, '0');
    const yyyy = mDateFirst[3];
    const hh = mDateFirst[4].padStart(2, '0');
    const mm = mDateFirst[5].padStart(2, '0');
    occurredAtInput = `${yyyy}-${mo}-${dd}T${hh}:${mm}`;
    dateDisplayVN = `${dd}/${mo}/${yyyy} ${hh}:${mm}`;
    detectedHour = Number(hh);
  } else if (mDateOnly) {
    const dd = mDateOnly[1].padStart(2, '0');
    const mo = mDateOnly[2].padStart(2, '0');
    const yyyy = mDateOnly[3];
    // Tìm giờ trên thanh trạng thái điện thoại ở 3 dòng đầu nếu có, mặc định 12:15
    const topLines = lines.slice(0, 4).join(' ');
    const phoneClock = topLines.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    const hh = phoneClock ? phoneClock[1].padStart(2, '0') : '12';
    const mm = phoneClock ? phoneClock[2].padStart(2, '0') : '15';
    occurredAtInput = `${yyyy}-${mo}-${dd}T${hh}:${mm}`;
    dateDisplayVN = `${dd}/${mo}/${yyyy} ${hh}:${mm}`;
    detectedHour = Number(hh);
  }

  // ===========================================================================
  // 3. NHẬN DIỆN NGƯỜI NHẬN & NGƯỜI CHUYỂN + QUÁN ĂN TƯƠNG ỨNG
  // ===========================================================================
  let recipientName: string | null = null;
  let recipientAccount: string | null = null;
  let senderName: string | null = null;
  let matchedVenue: string | null = null;
  let matchedProgramId: string | null = null;
  let matchedMappingId: string | null = null;

  // Bước 3A: Quét trực tiếp trong Danh bạ Người nhận -> Quán ăn đã lưu (Chính xác 100%)
  for (const mapping of allMappings) {
    const normRecip = normalizeAsciiUpper(mapping.recipientName);
    const hasNameMatch = normRecip.length >= 4 && fullUpper.includes(normRecip);
    const hasAccMatch = (mapping.accountKeywords || []).some((kw) => {
      const cleanKw = kw.trim().toUpperCase();
      return cleanKw.length >= 5 && fullUpper.includes(cleanKw);
    });

    if (hasNameMatch || hasAccMatch) {
      recipientName = mapping.recipientName;
      matchedVenue = mapping.venueName;
      matchedProgramId = mapping.defaultProgramId || null;
      matchedMappingId = mapping.id;
      if (mapping.accountKeywords && mapping.accountKeywords.length > 0) {
        recipientAccount = mapping.accountKeywords[0];
      }
      break;
    }
  }

  // Bước 3B: Nếu là người nhận mới chưa có trong danh bạ, trích xuất theo nhãn "Thông tin người nhận" / "Tới tài khoản" / "Chuyển khoản đến"
  const normLines = lines.map((l) => ({
    raw: l,
    upper: normalizeAsciiUpper(l),
  }));

  for (let i = 0; i < normLines.length; i++) {
    const u = normLines[i].upper;

    // Tìm Người chuyển (Tài khoản nguồn / Từ tài khoản / Chuyển khoản từ)
    if (
      !senderName &&
      (u.includes('TAI KHOAN NGUON') ||
        u.includes('TAI KHOAN NGU6EN') ||
        u.includes('TU TAI KHOAN') ||
        u.includes('TU TAI KNOAN') ||
        u.includes('CHUYEN KHOAN TU') ||
        u.includes('CHUYEN KHOAN TV'))
    ) {
      for (let j = i + 1; j <= Math.min(i + 4, normLines.length - 1); j++) {
        const cand = normLines[j].upper
          .replace(/^TEN TAI KHOAN\s*/, '')
          .replace(/^TEN TAI KHODN\s*/, '')
          .replace(/^[YVWQO0-9\s]+/, '')
          .trim();
        if (
          cand.length >= 6 &&
          /^[A-Z]+(\s+[A-Z]+){1,5}$/.test(cand) &&
          !cand.includes('TECHCOMBANK') &&
          !cand.includes('VPBANK') &&
          !cand.includes('SO TAI')
        ) {
          senderName = cand;
          break;
        }
      }
    }

    // Tìm Người nhận (Thông tin người nhận / Tới tài khoản / Chuyển khoản đến)
    if (
      u.includes('NGUOI NHAN') ||
      u.includes('NGUDI NHAN') ||
      u.includes('NGUEI NHAN') ||
      u.includes('TOI TAI KHOAN') ||
      u.includes('TDI TAI KKHOAN') ||
      u.includes('T6I TAI KHOAN') ||
      u.includes('CHUYEN KHOAN DEN') ||
      u.includes('CHUYEN KHODN DEN')
    ) {
      for (let j = i + 1; j <= Math.min(i + 5, normLines.length - 1); j++) {
        const rawLine = normLines[j].upper;
        const cand = rawLine
          .replace(/^TEN TAI KHOAN\s*/, '')
          .replace(/^TEN TAI KHODN\s*/, '')
          .trim();

        if (
          !recipientName &&
          cand.length >= 6 &&
          /^[A-Z]+(\s+[A-Z]+){1,5}$/.test(cand) &&
          !cand.includes('TECHCOMBANK') &&
          !cand.includes('SACOMBANK') &&
          !cand.includes('VIETCOMBANK') &&
          !cand.includes('NGAN HANG') &&
          !cand.includes('SO TAI')
        ) {
          recipientName = cand;
        }

        const accMatch = normLines[j].raw.match(/\b([A-Z0-9]{8,22})\b/);
        if (
          accMatch &&
          /\d{5,}/.test(accMatch[1]) &&
          !accMatch[1].startsWith('FT') &&
          !accMatch[1].startsWith('VPB')
        ) {
          recipientAccount = accMatch[1];
        }
      }
    }
  }

  // Bước 3C: Nhận diện Người ứng tiền (matchedPayerMemberId)
  let matchedPayerMemberId: string | null = null;
  if (fullUpper.includes('TRINH THI NGOC HAN')) {
    senderName = senderName || 'TRINH THI NGOC HAN';
    matchedPayerMemberId = 'mem-07';
  } else if (fullUpper.includes('DOAN THE CUONG')) {
    senderName = senderName || 'DOAN THE CUONG';
    matchedPayerMemberId = 'mem-02';
  } else if (senderName && members) {
    const foundMem = members.find(
      (m) => normalizeAsciiUpper(m.fullName) === senderName
    );
    if (foundMem) matchedPayerMemberId = foundMem.id;
  }

  // Bước 3D: Suy luận chương trình (Ăn trưa vs Ăn tối Thứ 5)
  if (!matchedProgramId) {
    if (
      (detectedHour !== null && detectedHour >= 17) ||
      fullUpper.includes('CHIEN LUOC') ||
      fullUpper.includes('AN TOI')
    ) {
      matchedProgramId = 'prog-dinner';
    } else {
      matchedProgramId = 'prog-lunch';
    }
  }

  // Trích xuất nội dung chuyển khoản nếu có
  let transferNote: string | null = null;
  for (let i = 0; i < normLines.length; i++) {
    const u = normLines[i].upper;
    if (u.startsWith('NOI DUNG') || u.startsWith('NDI DUNG') || u.startsWith('LOI NHAN')) {
      const rest = normLines[i].raw.replace(/^(Nội dung|Ndi dung|N6i dung|Lời nhắn|Loi nhan)\s*/i, '').trim();
      if (rest) {
        transferNote = rest;
      } else if (normLines[i + 1]) {
        transferNote = normLines[i + 1].raw;
      }
      break;
    }
  }

  return {
    rawText,
    amountVnd,
    occurredAtInput,
    dateDisplayVN,
    recipientName,
    recipientAccount,
    senderName,
    matchedVenue,
    matchedProgramId,
    matchedPayerMemberId,
    matchedMappingId,
    transferNote,
  };
}
