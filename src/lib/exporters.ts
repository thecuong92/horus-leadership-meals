import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  computeAllMealsReimbursement,
  computeMonthlyReport,
  filterMeals,
  formatDateTimeVN,
  formatDateVN,
  formatVnd,
} from './calculations';
import {
  AppState,
  FilterState,
  ReimbursementBatch,
  RoleKey,
} from './types';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/**
 * F12 & AC-16: Xuất file Excel (.xlsx) 4 sheet chuẩn đối soát kế toán Horus
 */
export function exportMonthlyExcel(
  state: AppState,
  filters: FilterState,
  exporterName: string,
  role: RoleKey
) {
  const report = computeMonthlyReport(state, filters);
  const reimbMap = computeAllMealsReimbursement(state);
  const meals = filterMeals(state, filters, reimbMap);
  const canSeeAttachments = role !== 'VIEWER' || state.settings.viewerCanSeeAttachments;

  const wb = XLSX.utils.book_new();
  const nowStr = formatDateTimeVN(new Date().toISOString());

  // =========================================================================
  // SHEET 1: Tong_quan_thang
  // =========================================================================
  const progName =
    filters.programId === 'ALL'
      ? 'Tất cả chương trình'
      : state.programs.find((p) => p.id === filters.programId)?.name || filters.programId;

  const memberFilterName =
    filters.memberId === 'ALL'
      ? 'Tất cả nhân sự'
      : state.members.find((m) => m.id === filters.memberId)?.fullName || filters.memberId;

  const payerObj = state.members.find(
    (m) =>
      m.id ===
      (filters.payerMemberId !== 'ALL'
        ? filters.payerMemberId
        : state.settings.defaultPayerMemberId)
  );

  const sheet1Rows = [
    ['HORUS LEADERSHIP MEALS — BÁO CÁO TỔNG QUAN THÁNG'],
    ['Tổ chức', state.settings.companyName || 'Horus Entertainment'],
    ['Kỳ báo cáo (UTC+7)', filters.month === 'ALL' ? 'Toàn thời gian' : filters.month],
    ['Chương trình lọc', progName],
    ['Nhân sự lọc', memberFilterName],
    ['Phạm vi trạng thái bữa ăn', filters.mealStatusScope],
    ['Người xuất báo cáo', `${exporterName} (${role})`],
    ['Thời điểm xuất (UTC+7)', nowStr],
    ['Đơn vị tiền tệ', 'VND (Số nguyên đồng)'],
    ['Phiên bản dữ liệu', `v${state.version}`],
    [
      'Quy tắc kế toán trọng yếu',
      'Tổng tiền thực chi nhóm, chi phí phân bổ cá nhân và công nợ hoàn ứng là 3 hệ số liệu độc lập; KHÔNG cộng tiền phân bổ cá nhân vào tổng thực chi của nhóm.',
    ],
    [],
    ['CHỈ SỐ TÀI CHÍNH & HOẠT ĐỘNG CHÍNH', 'GIÁ TRỊ', 'GHI CHÚ ĐỐI SOÁT'],
    ['1. Tổng chi phí thực chi của nhóm (VND)', report.totalGroupCostVnd, 'SUM(total_paid_vnd) trên từng bữa duy nhất'],
    ['2. Tổng số bữa ăn thực tế', report.totalMeals, `Ăn trưa: ${report.lunchMeals} | Ăn tối: ${report.dinnerMeals}`],
    ['3. Chi phí Ăn trưa (Leadership Lunch)', report.lunchCostVnd, `${report.lunchMeals} bữa`],
    ['4. Chi phí Ăn tối (Game Strategy Dinner)', report.dinnerCostVnd, `${report.dinnerMeals} bữa`],
    ['5. Chi phí trung bình / bữa (VND)', report.avgCostPerMealVnd, 'Tổng chi phí / Tổng số bữa'],
    ['6. Tổng lượt tham gia (lượt)', report.totalAttendanceVisits, '1 người tại 1 bữa = 1 lượt (chống trùng)'],
    ['7. Chi phí trung bình / lượt tham gia (VND)', report.avgCostPerVisitVnd, 'Tổng chi phí / Tổng lượt tham gia'],
    ['8. Số thành viên riêng biệt đã tham gia', report.uniqueAttendeesCount, 'COUNT(DISTINCT member_id)'],
    ['9. Chi phí có hóa đơn (VND)', report.costWithInvoiceVnd, ''],
    ['10. Chi phí không có hóa đơn (VND)', report.costWithoutInvoiceVnd, `${report.mealsWithoutInvoiceCount} bữa chưa có hóa đơn VAT`],
    [],
    [`CHỈ SỐ HOÀN ỨNG (${payerObj?.fullName || 'Doãn Thế Cường'})`, 'GIÁ TRỊ (VND)', 'DIỄN GIẢI'],
    ['Tổng tiền đã ứng trong kỳ', report.payerTotalAdvancedVnd, 'Tính theo các bữa hợp lệ trong bộ lọc'],
    ['Tổng tiền đủ điều kiện hoàn (Đã duyệt)', report.payerApprovedEligibleVnd, 'Các bữa đã được duyệt hoàn ứng'],
    ['Số tiền đang đề nghị hoàn (Trong đợt chờ chi)', report.payerClaimedPendingVnd, 'Đã đưa vào bảng kê đợt hoàn nhưng chưa nhận tiền'],
    ['Số tiền đã hoàn xác nhận (Theo bữa trong kỳ)', report.payerReimbursedForPeriodMealsVnd, 'Chỉ giảm dư nợ khi có giao dịch xác nhận thực hoàn'],
    ['Số dư công ty còn phải hoàn (VND)', report.payerRemainingBalanceVnd, '= Đủ điều kiện hoàn - Đã hoàn xác nhận'],
    ['Tiền công ty thực chuyển hoàn trong tháng (theo ngày chuyển)', report.payerReimbursedInPeriodVnd, 'Chỉ số dòng tiền theo ngày thanh toán'],
    [],
    ['BỘ KIỂM TRA CÂN ĐỐI MỖI THÁNG (MỤC 13.1 PRD)', 'TRẠNG THÁI', 'VẾ TRÁI', 'VẾ PHẢI', 'CHI TIẾT'],
    ...report.balanceChecks.map((chk) => [
      chk.label,
      chk.passed ? 'ĐẠT (OK)' : 'LỆCH (CẦN KIỂM TRA)',
      chk.leftValue,
      chk.rightValue,
      chk.detail,
    ]),
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows);
  ws1['!cols'] = [{ wch: 48 }, { wch: 24 }, { wch: 48 }, { wch: 18 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Tong_quan_thang');

  // =========================================================================
  // SHEET 2: Danh_sach_bua_an
  // =========================================================================
  const sheet2Header = [
    'Mã bữa',
    'Ngày diễn ra (UTC+7)',
    'Giờ (UTC+7)',
    'Chương trình',
    'Địa điểm / Quán ăn',
    'Số người có mặt',
    'Danh sách người có mặt',
    'Tổng chi thực tế (VND)',
    'Người ứng tiền',
    'Phương thức TT',
    'Có hóa đơn',
    'Trạng thái hồ sơ',
    'Trạng thái hoàn ứng',
    'Mã đợt hoàn ứng',
    'Đã hoàn (VND)',
    'Còn phải hoàn (VND)',
    'Chứng từ đính kèm',
    'Ghi chú',
  ];

  const sheet2Data = meals.map((meal) => {
    const prog = state.programs.find((p) => p.id === meal.programId);
    const payer = state.members.find((m) => m.id === meal.payerMemberId);
    const attMembers = state.attendance
      .filter((a) => a.mealId === meal.id && a.attended)
      .map((a) => state.members.find((m) => m.id === a.memberId)?.fullName || a.memberId);

    const rInfo = reimbMap[meal.id];
    const mealAtts = state.attachments.filter((att) => att.mealId === meal.id);
    const attText = canSeeAttachments
      ? mealAtts.map((a) => `[${a.type}] ${a.filename}`).join('; ')
      : `(${mealAtts.length} chứng từ - hạn chế quyền xem)`;

    const dtStr = formatDateTimeVN(meal.occurredAt);
    return [
      meal.code,
      formatDateVN(meal.occurredAt),
      dtStr.split(' ')[0] || dtStr,
      prog?.shortName || meal.programId,
      meal.venue,
      attMembers.length,
      attMembers.join(', '),
      meal.totalPaidVnd,
      payer?.fullName || meal.payerMemberId,
      meal.paymentMethod,
      meal.hasInvoice ? 'Có' : 'Không',
      meal.status,
      rInfo?.status || 'NOT_ELIGIBLE',
      rInfo?.batchCodes.join(', ') || '',
      rInfo?.reimbursedAmountVnd || 0,
      rInfo?.remainingUnpaidVnd || 0,
      attText,
      meal.note || '',
    ];
  });

  // Hàng tổng cộng cuối bảng bữa ăn
  const totalPaidSum = meals.reduce((s, m) => s + m.totalPaidVnd, 0);
  const totalReimbSum = meals.reduce((s, m) => s + (reimbMap[m.id]?.reimbursedAmountVnd || 0), 0);
  const totalRemainSum = meals.reduce((s, m) => s + (reimbMap[m.id]?.remainingUnpaidVnd || 0), 0);

  sheet2Data.push([
    'TỔNG CỘNG',
    '',
    '',
    `${meals.length} bữa ăn`,
    '',
    report.totalAttendanceVisits,
    `${report.uniqueAttendeesCount} người duy nhất`,
    totalPaidSum,
    '',
    '',
    '',
    '',
    '',
    '',
    totalReimbSum,
    totalRemainSum,
    '',
    'Tổng thực chi từng bữa (không nhân theo người)',
  ]);

  const ws2 = XLSX.utils.aoa_to_sheet([sheet2Header, ...sheet2Data]);
  ws2['!cols'] = [
    { wch: 15 },
    { wch: 14 },
    { wch: 16 },
    { wch: 28 },
    { wch: 28 },
    { wch: 14 },
    { wch: 45 },
    { wch: 20 },
    { wch: 20 },
    { wch: 16 },
    { wch: 12 },
    { wch: 16 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 36 },
    { wch: 35 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Danh_sach_bua_an');

  // =========================================================================
  // SHEET 3: Thong_ke_nhan_su
  // =========================================================================
  const sheet3Header = [
    'STT',
    'Họ và tên',
    'Chức danh',
    'Phân loại',
    'Số bữa Ăn trưa',
    'Số bữa Ăn tối',
    'Tổng lượt tham gia',
    'Số buổi đủ điều kiện',
    'Tỷ lệ tham gia (%)',
    'Hiển thị tỷ lệ',
    'Chi phí phân bổ (VND)',
    'Chi phí TB / lượt (VND)',
    'Ghi chú phân bổ',
  ];

  const sheet3Data = report.memberRows.map((row, idx) => [
    idx + 1,
    row.member.fullName,
    row.member.title || '(Chưa cung cấp)',
    row.member.memberType === 'EMPLOYEE' ? 'Nhân sự nội bộ' : 'Khách mời',
    row.lunchAttended,
    row.dinnerAttended,
    row.totalAttended,
    row.eligibleSessions,
    row.attendanceRatePct !== null ? row.attendanceRatePct : '—',
    row.attendanceRatePct !== null
      ? `${row.totalAttended}/${row.eligibleSessions} (${row.attendanceRatePct}%)`
      : '— (Chưa có buổi đủ ĐK)',
    row.allocatedCostVnd,
    row.avgCostPerVisitVnd,
    'Chi phí phân bổ để phân tích nội bộ, KHÔNG cộng vào tổng thực chi nhóm',
  ]);

  const sumAllocatedShown = report.memberRows.reduce((s, r) => s + r.allocatedCostVnd, 0);
  sheet3Data.push([
    '',
    'TỔNG PHÂN BỔ TRONG BẢNG',
    '',
    '',
    report.memberRows.reduce((s, r) => s + r.lunchAttended, 0),
    report.memberRows.reduce((s, r) => s + r.dinnerAttended, 0),
    report.memberRows.reduce((s, r) => s + r.totalAttended, 0),
    '',
    '',
    '',
    sumAllocatedShown,
    '',
    'Lưu ý: Chỉ số phân bổ cá nhân không làm tăng số tiền công ty phải hoàn',
  ]);

  const ws3 = XLSX.utils.aoa_to_sheet([sheet3Header, ...sheet3Data]);
  ws3['!cols'] = [
    { wch: 6 },
    { wch: 26 },
    { wch: 24 },
    { wch: 16 },
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
    { wch: 22 },
    { wch: 22 },
    { wch: 20 },
    { wch: 48 },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'Thong_ke_nhan_su');

  // =========================================================================
  // SHEET 4: Hoan_ung
  // =========================================================================
  const sheet4Rows: (string | number)[][] = [
    ['DANH SÁCH ĐỢT HOÀN ỨNG & GIAO DỊCH THANH TOÁN'],
    [],
    [
      'Mã đợt hoàn ứng',
      'Tiêu đề đợt',
      'Người thụ hưởng (Ứng trước)',
      'Ngày lập đợt',
      'Số bữa trong đợt',
      'Tổng tiền đề nghị hoàn (VND)',
      'Số tiền công ty đã hoàn (VND)',
      'Số dư còn phải hoàn của đợt (VND)',
      'Trạng thái đợt',
      'Mã giao dịch ngân hàng / Tham chiếu',
    ],
  ];

  for (const batch of state.reimbursementBatches) {
    const payer = state.members.find((m) => m.id === batch.payerMemberId);
    const items = state.reimbursementItems.filter((it) => it.batchId === batch.id);
    const claimedTotal = items.reduce((s, it) => s + it.claimedAmountVnd, 0);
    const payments = state.reimbursementPayments.filter((p) => p.batchId === batch.id);
    const paidTotal = payments.reduce((s, p) => s + p.amountVnd, 0);
    const remain = Math.max(0, claimedTotal - paidTotal);
    const refs = payments.map((p) => `${p.reference} (${formatDateVN(p.paidAt)})`).join('; ');

    sheet4Rows.push([
      batch.batchCode,
      batch.title,
      payer?.fullName || batch.payerMemberId,
      formatDateTimeVN(batch.submittedAt),
      items.length,
      claimedTotal,
      paidTotal,
      remain,
      batch.status,
      refs || 'Chưa thanh toán',
    ]);
  }

  sheet4Rows.push([]);
  sheet4Rows.push(['CHI TIẾT TỪNG KHOẢN ỨNG TRONG KỲ LỌC']);
  sheet4Rows.push([
    'Mã bữa',
    'Ngày bữa ăn',
    'Chương trình',
    'Địa điểm',
    'Người ứng',
    'Thực chi bữa ăn (VND)',
    'Đủ điều kiện hoàn (VND)',
    'Đã đưa vào đợt (VND)',
    'Thực tế đã hoàn (VND)',
    'Còn phải hoàn (VND)',
    'Trạng thái hoàn ứng',
    'Mã đợt',
  ]);

  for (const meal of meals) {
    const prog = state.programs.find((p) => p.id === meal.programId);
    const payer = state.members.find((m) => m.id === meal.payerMemberId);
    const r = reimbMap[meal.id];
    sheet4Rows.push([
      meal.code,
      formatDateVN(meal.occurredAt),
      prog?.shortName || meal.programId,
      meal.venue,
      payer?.fullName || meal.payerMemberId,
      meal.totalPaidVnd,
      r?.eligibleAmountVnd || 0,
      r?.claimedAmountVnd || 0,
      r?.reimbursedAmountVnd || 0,
      r?.remainingUnpaidVnd || 0,
      r?.status || 'NOT_ELIGIBLE',
      r?.batchCodes.join(', ') || '—',
    ]);
  }

  const ws4 = XLSX.utils.aoa_to_sheet(sheet4Rows);
  ws4['!cols'] = [
    { wch: 18 },
    { wch: 34 },
    { wch: 24 },
    { wch: 22 },
    { wch: 18 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 20 },
    { wch: 36 },
  ];
  XLSX.utils.book_append_sheet(wb, ws4, 'Hoan_ung');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const monthSlug = filters.month === 'ALL' ? 'all' : filters.month;
  triggerDownload(blob, `Horus_Leadership_Meals_${monthSlug}_v${state.version}.xlsx`);
}

/**
 * F12: Xuất file ZIP chứa toàn bộ ảnh chứng từ theo đợt hoàn ứng hoặc theo kỳ lọc + manifest.csv & manifest.json
 */
export async function exportAttachmentsZip(
  state: AppState,
  options: {
    batchId?: string;
    filters?: FilterState;
    exporterName: string;
    role: RoleKey;
  }
) {
  if (options.role === 'VIEWER' && !state.settings.viewerCanSeeAttachments) {
    alert('AC-18: Vai trò Viewer chưa được cấp quyền tải xuống chứng từ thanh toán.');
    return;
  }

  const zip = new JSZip();
  const reimbMap = computeAllMealsReimbursement(state);

  let targetMeals = state.meals;
  let folderPrefix = 'Chung_tu_Horus';

  if (options.batchId) {
    const batch = state.reimbursementBatches.find((b) => b.id === options.batchId);
    const mealIds = new Set(
      state.reimbursementItems.filter((it) => it.batchId === options.batchId).map((it) => it.mealId)
    );
    targetMeals = state.meals.filter((m) => mealIds.has(m.id));
    folderPrefix = batch ? batch.batchCode : 'Dot_hoan_ung';
  } else if (options.filters) {
    targetMeals = filterMeals(state, options.filters, reimbMap);
    folderPrefix = `Chung_tu_${options.filters.month || 'Horus'}`;
  }

  const manifestRows: string[][] = [
    [
      'Ma_Bua',
      'Ngay_Dien_Ra',
      'Chuong_Trinh',
      'Dia_Diem',
      'Tong_Tien_VND',
      'Loai_Chung_Tu',
      'Ten_File_Trong_Zip',
      'Nguoi_Tai_Len',
      'Thoi_Diem_Tai',
    ],
  ];

  const manifestJson: Record<string, unknown>[] = [];

  for (const meal of targetMeals) {
    const prog = state.programs.find((p) => p.id === meal.programId);
    const mealAtts = state.attachments.filter((a) => a.mealId === meal.id);

    for (const att of mealAtts) {
      const zipPath = `${folderPrefix}/${meal.code}_${att.type}_${att.filename}`;
      if (att.dataUrl && att.dataUrl.startsWith('data:')) {
        const commaIdx = att.dataUrl.indexOf(',');
        const header = att.dataUrl.slice(0, commaIdx);
        const dataPart = att.dataUrl.slice(commaIdx + 1);
        if (header.includes(';base64')) {
          zip.file(zipPath, dataPart, { base64: true });
        } else {
          zip.file(zipPath, decodeURIComponent(dataPart));
        }
      } else {
        zip.file(zipPath, `Attachment reference: ${att.filename}`);
      }

      manifestRows.push([
        meal.code,
        formatDateVN(meal.occurredAt),
        prog?.code || meal.programId,
        `"${meal.venue.replace(/"/g, '""')}"`,
        String(meal.totalPaidVnd),
        att.type,
        zipPath,
        `"${att.uploadedBy}"`,
        att.uploadedAt,
      ]);

      manifestJson.push({
        mealCode: meal.code,
        occurredAt: meal.occurredAt,
        programCode: prog?.code,
        venue: meal.venue,
        totalPaidVnd: meal.totalPaidVnd,
        attachmentType: att.type,
        zipPath,
        uploadedBy: att.uploadedBy,
        uploadedAt: att.uploadedAt,
      });
    }
  }

  const csvContent = '\uFEFF' + manifestRows.map((r) => r.join(',')).join('\n');
  zip.file(`${folderPrefix}/manifest.csv`, csvContent);
  zip.file(
    `${folderPrefix}/manifest.json`,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        exportedBy: options.exporterName,
        totalMeals: targetMeals.length,
        totalAttachments: manifestJson.length,
        items: manifestJson,
      },
      null,
      2
    )
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${folderPrefix}_Attachments.zip`);
}

/**
 * F12 & AC-17: Mở cửa sổ in / xuất PDF Bảng kê đề nghị hoàn ứng chuẩn A4 (có tùy chọn in phụ lục ảnh chứng từ)
 */
export function openReimbursementPdfPrintWindow(
  state: AppState,
  options: {
    batch?: ReimbursementBatch;
    filters?: FilterState;
    includeAttachmentImages: boolean;
    exporterName: string;
    role: RoleKey;
  }
) {
  const canSeeAttachments = options.role !== 'VIEWER' || state.settings.viewerCanSeeAttachments;
  const reimbMap = computeAllMealsReimbursement(state);

  let targetMeals = state.meals;
  let titleText = 'BẢNG KÊ ĐỀ NGHỊ HOÀN ỨNG & ĐỐI SOÁT CHI PHÍ BỮA ĂN';
  let subtitleText = '';
  let payerId = state.settings.defaultPayerMemberId;

  if (options.batch) {
    const batch = options.batch;
    const itemMealIds = new Set(
      state.reimbursementItems.filter((it) => it.batchId === batch.id).map((it) => it.mealId)
    );
    targetMeals = state.meals.filter((m) => itemMealIds.has(m.id));
    titleText = `BẢNG KÊ ĐỀ NGHỊ HOÀN ỨNG — ĐỢT ${batch.batchCode}`;
    subtitleText = batch.title;
    payerId = batch.payerMemberId;
  } else if (options.filters) {
    targetMeals = filterMeals(state, options.filters, reimbMap);
    subtitleText = `Kỳ báo cáo: Tháng ${options.filters.month} (Múi giờ Asia/Ho_Chi_Minh UTC+7)`;
    if (options.filters.payerMemberId !== 'ALL') {
      payerId = options.filters.payerMemberId;
    }
  }

  const payer = state.members.find((m) => m.id === payerId);
  const totalPaid = targetMeals.reduce((s, m) => s + m.totalPaidVnd, 0);
  const totalEligible = targetMeals.reduce(
    (s, m) => s + (reimbMap[m.id]?.eligibleAmountVnd || 0),
    0
  );
  const totalReimbursed = targetMeals.reduce(
    (s, m) => s + (reimbMap[m.id]?.reimbursedAmountVnd || 0),
    0
  );
  const totalRemaining = Math.max(0, totalEligible - totalReimbursed);

  const rowsHtml = targetMeals
    .map((meal, idx) => {
      const prog = state.programs.find((p) => p.id === meal.programId);
      const attendees = state.attendance
        .filter((a) => a.mealId === meal.id && a.attended)
        .map((a) => state.members.find((m) => m.id === a.memberId)?.fullName || a.memberId);
      const atts = state.attachments.filter((a) => a.mealId === meal.id);
      const r = reimbMap[meal.id];

      return `
        <tr>
          <td style="text-align:center">${idx + 1}</td>
          <td><strong>${meal.code}</strong><br/><span style="font-size:11px;color:#475569">${formatDateTimeVN(meal.occurredAt)}</span></td>
          <td>${prog?.shortName || meal.programId}</td>
          <td><strong>${meal.venue}</strong><br/><span style="font-size:11px;color:#475569">${meal.note || ''}</span></td>
          <td>${attendees.length} người:<br/><span style="font-size:11px;color:#334155">${attendees.join(', ')}</span></td>
          <td style="text-align:right;font-weight:bold">${formatVnd(meal.totalPaidVnd)}</td>
          <td style="text-align:right">${formatVnd(r?.eligibleAmountVnd || 0)}</td>
          <td style="font-size:11px">${atts.map((a) => `[${a.type === 'PAYMENT_PROOF' ? 'UNC/Bill' : 'HĐ VAT'}] ${a.filename}`).join('<br/>') || '—'}</td>
        </tr>
      `;
    })
    .join('');

  let appendixHtml = '';
  if (options.includeAttachmentImages && canSeeAttachments) {
    const cards: string[] = [];
    for (const meal of targetMeals) {
      const atts = state.attachments.filter((a) => a.mealId === meal.id && a.dataUrl);
      for (const att of atts) {
        cards.push(`
          <div style="border:1px solid #cbd5e1;border-radius:8px;padding:12px;margin-bottom:14px;page-break-inside:avoid">
            <div style="font-size:12px;font-weight:bold;margin-bottom:6px">
              Mã bữa: ${meal.code} (${formatDateVN(meal.occurredAt)}) — ${meal.venue} — Số tiền: ${formatVnd(meal.totalPaidVnd)}
            </div>
            <div style="font-size:11px;color:#475569;margin-bottom:8px">
              Loại chứng từ: ${att.type === 'PAYMENT_PROOF' ? 'Ảnh chứng từ thanh toán' : 'Hóa đơn VAT'} • File: ${att.filename}
            </div>
            <img src="${att.dataUrl}" alt="${att.filename}" style="max-width:340px;max-height:440px;border:1px solid #e2e8f0;border-radius:4px" />
          </div>
        `);
      }
    }
    if (cards.length > 0) {
      appendixHtml = `
        <div style="page-break-before:always;margin-top:28px">
          <h3 style="font-size:16px;border-bottom:2px solid #0f172a;padding-bottom:6px">
            PHỤ LỤC CHỨNG TỪ THANH TOÁN & HÓA ĐƠN ĐÍNH KÈM (${cards.length} chứng từ)
          </h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            ${cards.join('')}
          </div>
        </div>
      `;
    }
  }

  const html = `<!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>${titleText}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 24px; font-size: 13px; line-height: 1.45; }
      table { width: 100%; border-collapse: collapse; margin-top: 14px; }
      th, td { border: 1px solid #94a3b8; padding: 7px 8px; vertical-align: top; }
      th { background: #f1f5f9; font-size: 12px; text-align: left; }
      .header-bar { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
      .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
      .kpi-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #f8fafc; }
      .sig-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 32px; text-align: center; page-break-inside: avoid; }
      @media print {
        .no-print { display: none !important; }
        body { margin: 10mm; }
      }
    </style>
  </head>
  <body>
    <div class="no-print" style="background:#0f172a;color:#fff;padding:12px 16px;border-radius:8px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
      <div><strong>Chế độ xuất PDF / In Bảng kê chuẩn A4</strong> — Bấm nút bên phải và chọn "Save as PDF" (Lưu dưới dạng PDF) hoặc máy in.</div>
      <button onclick="window.print()" style="background:#10b981;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:bold;cursor:pointer">🖨️ In / Lưu file PDF</button>
    </div>

    <div class="header-bar">
      <div>
        <div style="font-size:12px;font-weight:bold;color:#475569">${state.settings.companyName || 'HORUS ENTERTAINMENT'}</div>
        <h1 style="font-size:18px;margin:4px 0">${titleText}</h1>
        <div style="font-size:12px;color:#334155">${subtitleText}</div>
      </div>
      <div style="text-align:right;font-size:12px">
        <div><strong>Người đề nghị / Ứng tiền:</strong> ${payer?.fullName || 'Doãn Thế Cường'}</div>
        <div><strong>Thời điểm xuất:</strong> ${formatDateTimeVN(new Date().toISOString())}</div>
        <div><strong>Người xuất:</strong> ${options.exporterName} (${options.role}) • Phiên bản: v${state.version}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box">
        <div style="font-size:11px;color:#64748b">TỔNG SỐ BỮA ĂN</div>
        <div style="font-size:18px;font-weight:bold;margin-top:4px">${targetMeals.length} bữa</div>
      </div>
      <div class="kpi-box">
        <div style="font-size:11px;color:#64748b">TỔNG THỰC CHI ĐÃ ỨNG</div>
        <div style="font-size:18px;font-weight:bold;margin-top:4px">${formatVnd(totalPaid)}</div>
      </div>
      <div class="kpi-box">
        <div style="font-size:11px;color:#64748b">CÔNG TY ĐÃ HOÀN XÁC NHẬN</div>
        <div style="font-size:18px;font-weight:bold;color:#15803d;margin-top:4px">${formatVnd(totalReimbursed)}</div>
      </div>
      <div class="kpi-box">
        <div style="font-size:11px;color:#64748b">SỐ DƯ ĐỀ NGHỊ HOÀN</div>
        <div style="font-size:18px;font-weight:bold;color:#b91c1c;margin-top:4px">${formatVnd(totalRemaining)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:36px;text-align:center">STT</th>
          <th style="width:125px">Mã bữa / Ngày giờ</th>
          <th style="width:130px">Chương trình</th>
          <th>Địa điểm / Nội dung</th>
          <th style="width:190px">Người tham gia thực tế</th>
          <th style="width:105px;text-align:right">Thực chi (VND)</th>
          <th style="width:105px;text-align:right">Đề nghị hoàn</th>
          <th style="width:150px">Tham chiếu chứng từ</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr style="background:#f8fafc;font-weight:bold">
          <td colspan="5" style="text-align:right">TỔNG CỘNG ĐỀ NGHỊ HOÀN ỨNG:</td>
          <td style="text-align:right">${formatVnd(totalPaid)}</td>
          <td style="text-align:right">${formatVnd(totalEligible)}</td>
          <td>Đã hoàn: ${formatVnd(totalReimbursed)}<br/>Còn phải hoàn: ${formatVnd(totalRemaining)}</td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top:10px;font-size:11px;color:#475569">
      * Ghi chú nguyên tắc đối soát: Tổng tiền đề nghị hoàn ứng được tính trên chi phí thực tế người ứng đã thanh toán ở từng bữa ăn hợp lệ, không cộng trùng với bảng chi phí phân bổ cá nhân.
    </div>

    <div class="sig-grid">
      <div>
        <strong>NGƯỜI ĐỀ NGHỊ / ỨNG TIỀN</strong>
        <div style="font-size:11px;color:#64748b">(Ký, ghi rõ họ tên)</div>
        <div style="height:75px"></div>
        <strong>${payer?.fullName || 'Doãn Thế Cường'}</strong>
      </div>
      <div>
        <strong>KẾ TOÁN KIỂM TRA (FINANCE)</strong>
        <div style="font-size:11px;color:#64748b">(Đối soát chứng từ & số dư)</div>
        <div style="height:75px"></div>
        <strong>........................................</strong>
      </div>
      <div>
        <strong>BAN GIÁM ĐỐC PHÊ DUYỆT</strong>
        <div style="font-size:11px;color:#64748b">(Ký duyệt chi hoàn ứng)</div>
        <div style="height:75px"></div>
        <strong>Nguyễn Duy Sơn</strong>
      </div>
    </div>

    ${appendixHtml}
  </body>
  </html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
  } else {
    alert('Vui lòng cho phép mở cửa sổ bật lên (Pop-up) để xem và in bảng kê PDF.');
  }
}
