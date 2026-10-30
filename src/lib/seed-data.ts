import { DEFAULT_RECIPIENT_MAPPINGS } from './bill-ocr';
import { allocateEqualVnd } from './calculations';
import {
  AppState,
  MealAttendance,
  MealAttachment,
  MealCostAllocation,
  MealSession,
  Member,
  Program,
  ProgramMembership,
} from './types';

function makeSvgReceiptDataUrl(
  title: string,
  subtitle: string,
  amountText: string,
  dateText: string,
  accentColor = '#0f766e'
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="680" viewBox="0 0 520 680">
    <rect width="520" height="680" fill="#f8fafc"/>
    <rect x="30" y="24" width="460" height="632" rx="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
    <rect x="30" y="24" width="460" height="96" rx="16" fill="${accentColor}"/>
    <text x="60" y="68" font-family="sans-serif" font-size="22" font-weight="bold" fill="#ffffff">${title}</text>
    <text x="60" y="98" font-family="sans-serif" font-size="14" fill="#e2e8f0">${subtitle}</text>
    <text x="60" y="168" font-family="sans-serif" font-size="14" fill="#64748b">NGƯỜI THANH TOÁN (ỨNG TRƯỚC)</text>
    <text x="60" y="194" font-family="sans-serif" font-size="18" font-weight="bold" fill="#0f172a">DOÃN THẾ CƯỜNG — HORUS ENTERTAINMENT</text>
    <line x1="60" y1="220" x2="460" y2="220" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="6,4"/>
    <text x="60" y="258" font-family="sans-serif" font-size="14" fill="#64748b">SỐ TIỀN THANH TOÁN</text>
    <text x="60" y="302" font-family="sans-serif" font-size="34" font-weight="bold" fill="${accentColor}">${amountText}</text>
    <text x="60" y="352" font-family="sans-serif" font-size="14" fill="#64748b">THỜI GIAN GIAO DỊCH (UTC+7)</text>
    <text x="60" y="378" font-family="sans-serif" font-size="16" font-weight="bold" fill="#1e293b">${dateText}</text>
    <text x="60" y="428" font-family="sans-serif" font-size="14" fill="#64748b">TRẠNG THÁI CHỨNG TỪ</text>
    <rect x="60" y="442" width="210" height="34" rx="8" fill="#dcfce7"/>
    <text x="76" y="464" font-family="sans-serif" font-size="14" font-weight="bold" fill="#166534">✓ GIAO DỊCH THÀNH CÔNG</text>
    <line x1="60" y1="510" x2="460" y2="510" stroke="#e2e8f0" stroke-width="1.5"/>
    <text x="60" y="545" font-family="sans-serif" font-size="13" fill="#475569">Chứng từ lưu trữ nội bộ Horus Leadership Meals</text>
    <text x="60" y="570" font-family="sans-serif" font-size="12" fill="#94a3b8">Đối soát hoàn ứng &amp; kiểm toán nội bộ</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getBaseProgramsAndMembers(): {
  programs: Program[];
  members: Member[];
  programMemberships: ProgramMembership[];
} {
  const programs: Program[] = [
    {
      id: 'prog-lunch',
      code: 'LEADERSHIP_LUNCH',
      name: 'Leadership Lunch — Ăn trưa đội ngũ lãnh đạo/nhân sự chủ chốt',
      shortName: 'Leadership Lunch (Ăn trưa)',
      description:
        'Knowledge sharing, cập nhật xã hội, kết nối, grow-up mindset, phối hợp liên phòng ban.',
      scheduleDesc: 'Thứ 2 – Thứ 6 & Thứ 7 cách tuần',
      reimbursementPolicyPct: 100,
      policyNote: 'Công ty chi trả 100%',
      active: true,
    },
    {
      id: 'prog-dinner',
      code: 'GAME_STRATEGY_DINNER',
      name: 'Game Strategy Dinner — Ăn tối Ban Chiến lược Game',
      shortName: 'Game Strategy Dinner (Tối T5)',
      description:
        'Sinh hoạt định kỳ của Ban Chiến lược Game; thảo luận định hướng sản phẩm và chiến lược.',
      scheduleDesc: 'Tối thứ Năm hằng tuần',
      reimbursementPolicyPct: 100,
      policyNote: 'Quy trình ứng trước/ghi nhận; cấu hình tỷ lệ công ty hoàn ứng (mặc định 100%)',
      active: true,
    },
  ];

  // Danh sách 8 thành viên chính thức ban đầu theo Mục 2.1 PRD
  const members: Member[] = [
    {
      id: 'mem-01',
      fullName: 'Nguyễn Duy Sơn',
      title: 'CEO',
      email: 'son.nd@horusent.com',
      memberType: 'EMPLOYEE',
      isActive: true,
    },
    {
      id: 'mem-02',
      fullName: 'Doãn Thế Cường',
      title: 'CPO',
      email: 'cuong.dt@horusent.com',
      memberType: 'EMPLOYEE',
      isDefaultPayer: true,
      isActive: true,
      note: 'Người thanh toán / ứng tiền mặc định',
    },
    {
      id: 'mem-03',
      fullName: 'Huỳnh Kiều Xuân Trường',
      title: 'CTO Game',
      email: 'truong.hkx@horusent.com',
      memberType: 'EMPLOYEE',
      isActive: true,
    },
    {
      id: 'mem-04',
      fullName: 'Nguyễn Đức Tùng',
      title: 'CTO AI',
      email: 'tung.nd@horusent.com',
      memberType: 'EMPLOYEE',
      isActive: true,
    },
    {
      id: 'mem-05',
      fullName: 'Chu Văn Mai',
      title: 'Lead Game Design',
      email: 'mai.cv@horusent.com',
      memberType: 'EMPLOYEE',
      isActive: true,
    },
    {
      id: 'mem-06',
      fullName: 'Nguyễn Văn Duệ',
      title: 'HRM / Trợ lý Chủ tịch',
      email: 'due.nv@horusent.com',
      memberType: 'EMPLOYEE',
      isActive: true,
    },
    {
      id: 'mem-07',
      fullName: 'Trịnh Thị Ngọc Hân',
      title: 'Trợ lý HRM',
      email: 'han.ttn@horusent.com',
      memberType: 'EMPLOYEE',
      isActive: true,
    },
    {
      id: 'mem-08',
      fullName: 'Trần Việt Phú',
      title: '', // Chức danh chưa cung cấp theo Mục 2.1 & 14 PRD
      email: 'phu.tv@horusent.com',
      memberType: 'EMPLOYEE',
      isActive: true,
      note: 'Thành viên mới bổ sung từ 15/10/2026',
    },
  ];

  const programMemberships: ProgramMembership[] = [
    { id: 'pm-01', programId: 'prog-lunch', memberId: 'mem-01', startDate: '2026-01-01', endDate: null },
    { id: 'pm-02', programId: 'prog-lunch', memberId: 'mem-02', startDate: '2026-01-01', endDate: null },
    { id: 'pm-03', programId: 'prog-lunch', memberId: 'mem-03', startDate: '2026-01-01', endDate: null },
    { id: 'pm-04', programId: 'prog-lunch', memberId: 'mem-04', startDate: '2026-01-01', endDate: null },
    { id: 'pm-05', programId: 'prog-lunch', memberId: 'mem-05', startDate: '2026-01-01', endDate: null },
    { id: 'pm-06', programId: 'prog-lunch', memberId: 'mem-06', startDate: '2026-01-01', endDate: null },
    { id: 'pm-07', programId: 'prog-lunch', memberId: 'mem-07', startDate: '2026-01-01', endDate: null },
    { id: 'pm-08', programId: 'prog-lunch', memberId: 'mem-08', startDate: '2026-10-15', endDate: null },
    // Cấu hình Ban Chiến lược Game
    { id: 'pm-09', programId: 'prog-dinner', memberId: 'mem-01', startDate: '2026-01-01', endDate: null },
    { id: 'pm-10', programId: 'prog-dinner', memberId: 'mem-02', startDate: '2026-01-01', endDate: null },
    { id: 'pm-11', programId: 'prog-dinner', memberId: 'mem-03', startDate: '2026-01-01', endDate: null },
    { id: 'pm-12', programId: 'prog-dinner', memberId: 'mem-04', startDate: '2026-01-01', endDate: null },
    { id: 'pm-13', programId: 'prog-dinner', memberId: 'mem-05', startDate: '2026-01-01', endDate: null },
  ];

  return { programs, members, programMemberships };
}

/**
 * Trạng thái khởi tạo mặc định: SẠCH GIAO DỊCH (Tổng = 0đ, 0 bữa ăn, 0 đợt hoàn ứng)
 * Chỉ giữ lại 2 chương trình và 8 thành viên BOD chính thức để bắt đầu nhập thực tế từ đầu.
 */
export function createInitialSeedState(): AppState {
  const { programs, members, programMemberships } = getBaseProgramsAndMembers();
  const nowIso = new Date().toISOString();

  return {
    version: 1,
    lastUpdatedAt: nowIso,
    programs,
    members,
    programMemberships,
    meals: [],
    attendance: [],
    allocations: [],
    attachments: [],
    reimbursementBatches: [],
    reimbursementItems: [],
    reimbursementPayments: [],
    recipientMappings: DEFAULT_RECIPIENT_MAPPINGS,
    auditLogs: [
      {
        id: 'audit-init-zero',
        actorRole: 'ADMIN',
        actorName: 'Doãn Thế Cường',
        entityType: 'SYSTEM_COMMIT',
        entityId: 'zero-init',
        action: 'RESET_TO_ZERO',
        summary:
          'Khởi tạo hệ thống sạch dữ liệu (Tổng = 0đ, 0 bữa ăn). Sẵn sàng nhập dữ liệu thực tế với 8 thành viên BOD và 2 chương trình.',
        createdAt: nowIso,
      },
    ],
    commits: [
      {
        id: 'commit-zero-01',
        version: 1,
        message: 'Khởi tạo hệ thống sạch (Tổng = 0đ) để bắt đầu nhập dữ liệu thực tế',
        authorName: 'Doãn Thế Cường',
        authorRole: 'ADMIN',
        storageTargets: ['CLOUDFLARE_D1_APAC', 'SERVER_DB'],
        createdAt: nowIso,
      },
    ],
    settings: {
      requireFinanceApproval: true,
      includeGuestsInMemberKPI: false,
      viewerCanSeeAttachments: false,
      viewerCanSeeReimbursements: true,
      defaultPayerMemberId: 'mem-02',
      companyName: 'Horus Entertainment',
    },
  };
}

/**
 * Tạo trạng thái sạch giao dịch (Tổng = 0đ)
 */
export function createCleanProductionState(current?: AppState): AppState {
  const clean = createInitialSeedState();
  return {
    ...clean,
    version: (current?.version || 1) + 1,
    programs: current?.programs || clean.programs,
    members: (current?.members || clean.members).filter((m) => m.memberType === 'EMPLOYEE'),
    programMemberships: current?.programMemberships || clean.programMemberships,
    settings: current?.settings || clean.settings,
  };
}

/**
 * Bộ dữ liệu giả lập (Sandbox) phục vụ Kiểm thử 5 Tầng (AC-01 -> AC-20)
 * hoặc khi người dùng muốn nạp thử dữ liệu mẫu.
 */
export function createDemoSampleState(): AppState {
  const base = createInitialSeedState();
  const members: Member[] = [
    ...base.members,
    {
      id: 'mem-guest-01',
      fullName: 'Khách mời Cố vấn Game',
      title: 'Khách mời chuyên môn',
      memberType: 'GUEST',
      isActive: true,
      note: 'Khách mời theo buổi',
    },
  ];

  const rawMeals: {
    meal: MealSession;
    attendees: string[];
    attachments: MealAttachment[];
  }[] = [
    {
      meal: {
        id: 'meal-202610-01',
        code: 'B-202610-001',
        programId: 'prog-lunch',
        occurredAt: '2026-10-05T12:15:00+07:00',
        venue: 'Cơm Niêu Sài Gòn - Quận 3',
        totalPaidVnd: 1050000,
        payerMemberId: 'mem-02',
        paymentMethod: 'BANK_TRANSFER',
        status: 'APPROVED',
        allocationMethod: 'EQUAL',
        hasInvoice: true,
        note: 'Ăn trưa BOD đầu tuần: Cập nhật tiến độ Q4 & văn hóa học tập.',
        createdBy: 'Doãn Thế Cường',
        createdAt: '2026-10-05T13:30:00+07:00',
        updatedBy: 'Finance Horus',
        updatedAt: '2026-10-06T09:00:00+07:00',
      },
      attendees: ['mem-01', 'mem-02', 'mem-03', 'mem-04', 'mem-05', 'mem-06', 'mem-07'],
      attachments: [
        {
          id: 'att-01',
          mealId: 'meal-202610-01',
          type: 'PAYMENT_PROOF',
          filename: 'UNC_B202610001_ComNieu.svg',
          mimeType: 'image/svg+xml',
          sizeBytes: 24500,
          dataUrl: makeSvgReceiptDataUrl(
            'ỦY NHIỆM CHI / CHUYỂN KHOẢN',
            'Mã bữa: B-202610-001 • Cơm Niêu Sài Gòn',
            '1.050.000 VND',
            '05/10/2026 12:48 (UTC+7)'
          ),
          uploadedAt: '2026-10-05T13:25:00+07:00',
          uploadedBy: 'Doãn Thế Cường',
        },
      ],
    },
    {
      meal: {
        id: 'meal-202610-02',
        code: 'B-202610-002',
        programId: 'prog-dinner',
        occurredAt: '2026-10-08T19:00:00+07:00',
        venue: 'Izakaya Ten - Thảo Điền',
        totalPaidVnd: 1850000,
        payerMemberId: 'mem-02',
        paymentMethod: 'CARD',
        status: 'APPROVED',
        allocationMethod: 'EQUAL',
        hasInvoice: true,
        note: 'Ăn tối thứ Năm Ban Chiến lược Game.',
        createdBy: 'Doãn Thế Cường',
        createdAt: '2026-10-08T21:10:00+07:00',
        updatedBy: 'Finance Horus',
        updatedAt: '2026-10-09T10:00:00+07:00',
      },
      attendees: ['mem-01', 'mem-02', 'mem-03', 'mem-04', 'mem-05'],
      attachments: [
        {
          id: 'att-03',
          mealId: 'meal-202610-02',
          type: 'PAYMENT_PROOF',
          filename: 'Bill_The_B202610002_Izakaya.svg',
          mimeType: 'image/svg+xml',
          sizeBytes: 25100,
          dataUrl: makeSvgReceiptDataUrl(
            'BIÊN LAI QUẸT THẺ POS',
            'Mã bữa: B-202610-002 • Izakaya Ten',
            '1.850.000 VND',
            '08/10/2026 20:52 (UTC+7)',
            '#7c3aed'
          ),
          uploadedAt: '2026-10-08T21:08:00+07:00',
          uploadedBy: 'Doãn Thế Cường',
        },
      ],
    },
    {
      meal: {
        id: 'meal-202610-03',
        code: 'B-202610-003',
        programId: 'prog-lunch',
        occurredAt: '2026-10-12T12:10:00+07:00',
        venue: 'Bếp Nhà Lục Tỉnh',
        totalPaidVnd: 1000000,
        payerMemberId: 'mem-02',
        paymentMethod: 'BANK_TRANSFER',
        status: 'APPROVED',
        allocationMethod: 'EQUAL',
        hasInvoice: false,
        note: 'Chia sẻ ứng dụng AI Agent.',
        createdBy: 'Doãn Thế Cường',
        createdAt: '2026-10-12T13:40:00+07:00',
        updatedBy: 'Finance Horus',
        updatedAt: '2026-10-13T09:15:00+07:00',
      },
      attendees: ['mem-01', 'mem-02', 'mem-03', 'mem-04', 'mem-06', 'mem-07'],
      attachments: [
        {
          id: 'att-04',
          mealId: 'meal-202610-03',
          type: 'PAYMENT_PROOF',
          filename: 'UNC_B202610003_LucTinh.svg',
          mimeType: 'image/svg+xml',
          sizeBytes: 24100,
          dataUrl: makeSvgReceiptDataUrl(
            'CHỨNG TỪ CHUYỂN KHOẢN 24/7',
            'Mã bữa: B-202610-003 • Bếp Nhà Lục Tỉnh',
            '1.000.000 VND',
            '12/10/2026 13:12 (UTC+7)'
          ),
          uploadedAt: '2026-10-12T13:38:00+07:00',
          uploadedBy: 'Doãn Thế Cường',
        },
      ],
    },
    {
      meal: {
        id: 'meal-202610-04',
        code: 'B-202610-004',
        programId: 'prog-lunch',
        occurredAt: '2026-10-16T12:00:00+07:00',
        venue: 'Phở Hòa Pasteur & Cafe',
        totalPaidVnd: 960000,
        payerMemberId: 'mem-02',
        paymentMethod: 'BANK_TRANSFER',
        status: 'APPROVED',
        allocationMethod: 'EQUAL',
        hasInvoice: false,
        note: 'Buổi ăn trưa đầu tiên có Trần Việt Phú tham gia sau ngày hiệu lực 15/10.',
        createdBy: 'Doãn Thế Cường',
        createdAt: '2026-10-16T13:20:00+07:00',
        updatedBy: 'Finance Horus',
        updatedAt: '2026-10-16T16:00:00+07:00',
      },
      attendees: ['mem-01', 'mem-02', 'mem-03', 'mem-04', 'mem-05', 'mem-06', 'mem-07', 'mem-08'],
      attachments: [
        {
          id: 'att-05',
          mealId: 'meal-202610-04',
          type: 'PAYMENT_PROOF',
          filename: 'UNC_B202610004_PhoHoa.svg',
          mimeType: 'image/svg+xml',
          sizeBytes: 23800,
          dataUrl: makeSvgReceiptDataUrl(
            'CHỨNG TỪ THANH TOÁN QR',
            'Mã bữa: B-202610-004 • Phở Hòa Pasteur & Cafe',
            '960.000 VND',
            '16/10/2026 12:55 (UTC+7)'
          ),
          uploadedAt: '2026-10-16T13:18:00+07:00',
          uploadedBy: 'Doãn Thế Cường',
        },
      ],
    },
    {
      meal: {
        id: 'meal-202610-05',
        code: 'B-202610-005',
        programId: 'prog-dinner',
        occurredAt: '2026-10-22T19:15:00+07:00',
        venue: 'Nhà hàng Hoàng Yến Cuisine',
        totalPaidVnd: 2100000,
        payerMemberId: 'mem-02',
        paymentMethod: 'BANK_TRANSFER',
        status: 'APPROVED',
        allocationMethod: 'EQUAL',
        hasInvoice: true,
        note: 'Ăn tối thứ Năm Ban Chiến lược Game + 1 Khách mời.',
        createdBy: 'Doãn Thế Cường',
        createdAt: '2026-10-22T21:30:00+07:00',
        updatedBy: 'Finance Horus',
        updatedAt: '2026-10-23T09:30:00+07:00',
      },
      attendees: ['mem-01', 'mem-02', 'mem-03', 'mem-04', 'mem-05', 'mem-guest-01'],
      attachments: [
        {
          id: 'att-06',
          mealId: 'meal-202610-05',
          type: 'PAYMENT_PROOF',
          filename: 'UNC_B202610005_HoangYen.svg',
          mimeType: 'image/svg+xml',
          sizeBytes: 25400,
          dataUrl: makeSvgReceiptDataUrl(
            'CHỨNG TỪ CHUYỂN KHOẢN',
            'Mã bữa: B-202610-005 • Hoàng Yến Cuisine',
            '2.100.000 VND',
            '22/10/2026 21:05 (UTC+7)',
            '#7c3aed'
          ),
          uploadedAt: '2026-10-22T21:25:00+07:00',
          uploadedBy: 'Doãn Thế Cường',
        },
      ],
    },
    {
      meal: {
        id: 'meal-202610-06',
        code: 'B-202610-006',
        programId: 'prog-lunch',
        occurredAt: '2026-10-26T12:15:00+07:00',
        venue: 'Salad Poké & Healthy Bowl',
        totalPaidVnd: 840000,
        payerMemberId: 'mem-02',
        paymentMethod: 'BANK_TRANSFER',
        status: 'SUBMITTED',
        allocationMethod: 'EQUAL',
        hasInvoice: false,
        note: 'Ăn trưa BOD tuần cuối tháng 10 — Đang chờ Finance duyệt.',
        createdBy: 'Doãn Thế Cường',
        createdAt: '2026-10-26T13:10:00+07:00',
        updatedBy: 'Doãn Thế Cường',
        updatedAt: '2026-10-26T13:10:00+07:00',
      },
      attendees: ['mem-01', 'mem-02', 'mem-03', 'mem-05', 'mem-06', 'mem-08'],
      attachments: [
        {
          id: 'att-07',
          mealId: 'meal-202610-06',
          type: 'PAYMENT_PROOF',
          filename: 'UNC_B202610006_PokeBowl.svg',
          mimeType: 'image/svg+xml',
          sizeBytes: 23900,
          dataUrl: makeSvgReceiptDataUrl(
            'CHỨNG TỪ THANH TOÁN VIETQR',
            'Mã bữa: B-202610-006 • Salad Poké & Healthy Bowl',
            '840.000 VND',
            '26/10/2026 12:50 (UTC+7)'
          ),
          uploadedAt: '2026-10-26T13:09:00+07:00',
          uploadedBy: 'Doãn Thế Cường',
        },
      ],
    },
    {
      meal: {
        id: 'meal-202609-01',
        code: 'B-202609-001',
        programId: 'prog-lunch',
        occurredAt: '2026-09-28T12:15:00+07:00',
        venue: 'Bún Chả Hà Nội Xưa',
        totalPaidVnd: 700000,
        payerMemberId: 'mem-02',
        paymentMethod: 'CASH',
        status: 'APPROVED',
        allocationMethod: 'EQUAL',
        hasInvoice: false,
        note: 'Bữa ăn tháng 09/2026 (Dùng kiểm thử lọc tháng AC-01).',
        createdBy: 'Doãn Thế Cường',
        createdAt: '2026-09-28T13:10:00+07:00',
        updatedBy: 'Finance Horus',
        updatedAt: '2026-09-29T09:00:00+07:00',
      },
      attendees: ['mem-01', 'mem-02', 'mem-03', 'mem-04', 'mem-05', 'mem-06', 'mem-07'],
      attachments: [
        {
          id: 'att-08',
          mealId: 'meal-202609-01',
          type: 'PAYMENT_PROOF',
          filename: 'BienLai_B202609001.svg',
          mimeType: 'image/svg+xml',
          sizeBytes: 22000,
          dataUrl: makeSvgReceiptDataUrl(
            'PHIẾU THANH TOÁN TIỀN MẶT',
            'Mã bữa: B-202609-001 • Bún Chả Hà Nội Xưa',
            '700.000 VND',
            '28/09/2026 12:45 (UTC+7)'
          ),
          uploadedAt: '2026-09-28T13:08:00+07:00',
          uploadedBy: 'Doãn Thế Cường',
        },
      ],
    },
  ];

  const meals: MealSession[] = [];
  const attendance: MealAttendance[] = [];
  const allocations: MealCostAllocation[] = [];
  const attachments: MealAttachment[] = [];

  for (const item of rawMeals) {
    meals.push(item.meal);
    for (const memberId of item.attendees) {
      attendance.push({
        mealId: item.meal.id,
        memberId,
        attended: true,
      });
    }
    allocations.push(
      ...allocateEqualVnd(item.meal.id, item.meal.totalPaidVnd, item.attendees)
    );
    attachments.push(...item.attachments);
  }

  return {
    ...base,
    members,
    meals,
    attendance,
    allocations,
    attachments,
    reimbursementBatches: [
      {
        id: 'batch-202610-01',
        batchCode: 'HU-2026-10-001',
        payerMemberId: 'mem-02',
        title: 'Hoàn ứng ăn trưa & tối Chiến lược Game đợt 1 tháng 10/2026',
        note: 'Đã đối soát đủ UNC & hóa đơn đợt 1',
        status: 'PAID',
        submittedAt: '2026-10-10T10:00:00+07:00',
        approvedAt: '2026-10-11T15:00:00+07:00',
        createdBy: 'Doãn Thế Cường',
      },
      {
        id: 'batch-202610-02',
        batchCode: 'HU-2026-10-002',
        payerMemberId: 'mem-02',
        title: 'Đề nghị hoàn ứng đợt 2 tháng 10/2026',
        note: 'Đã xuất bảng kê gửi Kế toán, đang chờ chuyển khoản',
        status: 'PENDING_PAYMENT',
        submittedAt: '2026-10-20T14:00:00+07:00',
        createdBy: 'Doãn Thế Cường',
      },
    ],
    reimbursementItems: [
      { id: 'ri-01', batchId: 'batch-202610-01', mealId: 'meal-202610-01', claimedAmountVnd: 1050000 },
      { id: 'ri-02', batchId: 'batch-202610-01', mealId: 'meal-202610-02', claimedAmountVnd: 1850000 },
      { id: 'ri-03', batchId: 'batch-202610-02', mealId: 'meal-202610-03', claimedAmountVnd: 1000000 },
      { id: 'ri-04', batchId: 'batch-202610-02', mealId: 'meal-202610-04', claimedAmountVnd: 960000 },
    ],
    reimbursementPayments: [
      {
        id: 'pay-202610-01',
        batchId: 'batch-202610-01',
        payerMemberId: 'mem-02',
        amountVnd: 2900000,
        paidAt: '2026-10-11T15:30:00+07:00',
        reference: 'FT26284991820 - VCB Horus Entertainment',
        note: 'Hoàn ứng 100% đợt HU-2026-10-001',
        confirmedBy: 'Finance Horus',
        idempotencyKey: 'init-pay-01',
        createdAt: '2026-10-11T15:30:00+07:00',
      },
    ],
  };
}
