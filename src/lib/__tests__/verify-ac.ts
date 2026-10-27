import assert from 'assert';
import {
  allocateEqualVnd,
  computeMonthlyReport,
  filterMeals,
  getMealMonthVN,
  validateMembershipOverlap,
} from '../calculations';
import { createInitialSeedState } from '../seed-data';
import { FilterState } from '../types';

function runAcceptanceCriteriaTests() {
  console.log('=== KIỂM THỬ TIÊU CHÍ NGHIỆM THU (AC-01 → AC-20) HORUS LEADERSHIP MEALS ===');
  const state = createInitialSeedState();

  const defaultOctFilter: FilterState = {
    month: '2026-10',
    programId: 'ALL',
    memberId: 'ALL',
    mealStatusScope: 'OPERATIONAL',
    reimbursementFilter: 'ALL',
    invoiceFilter: 'ALL',
    payerMemberId: 'ALL',
    venueQuery: '',
  };

  // AC-01: Chọn tháng 10/2026 chỉ thấy bữa thực tế diễn ra trong tháng theo UTC+7
  const octMeals = filterMeals(state, defaultOctFilter);
  assert(
    octMeals.every((m) => getMealMonthVN(m.occurredAt) === '2026-10'),
    'AC-01 failed: Có bữa ăn không thuộc tháng 10/2026 theo UTC+7'
  );
  assert(
    !octMeals.some((m) => m.id === 'meal-202609-01'),
    'AC-01 failed: Bữa ăn tháng 09/2026 bị lọt vào tháng 10/2026'
  );
  console.log('✓ AC-01: Lọc tháng 10/2026 theo Asia/Ho_Chi_Minh (UTC+7) chính xác.');

  // AC-02: Chọn Leadership Lunch không lẫn bữa tối
  const lunchMeals = filterMeals(state, {
    ...defaultOctFilter,
    programId: 'prog-lunch',
  });
  assert(
    lunchMeals.every((m) => m.programId === 'prog-lunch'),
    'AC-02 failed: Bữa tối bị lẫn vào Leadership Lunch'
  );
  console.log('✓ AC-02: Lọc riêng chương trình Leadership Lunch không lẫn bữa tối.');

  // AC-04 & AC-20: Trần Việt Phú gia nhập ngày 15/10 -> Mẫu số chỉ đếm các bữa đủ điều kiện từ 15/10
  const lunchReport = computeMonthlyReport(state, {
    ...defaultOctFilter,
    programId: 'prog-lunch',
  });
  const phuRow = lunchReport.memberRows.find((r) => r.member.id === 'mem-08');
  assert(phuRow, 'AC-20 failed: Không tìm thấy Trần Việt Phú');
  // Trong tháng 10/2026 có 4 bữa ăn trưa (05/10, 12/10, 16/10, 26/10).
  // Trần Việt Phú gia nhập từ 15/10/2026 nên mẫu số đủ điều kiện chỉ là 2 bữa (16/10 và 26/10), tham dự cả 2 -> 2/2 = 100%
  assert.strictEqual(
    phuRow.eligibleSessions,
    2,
    `AC-04/AC-20 failed: Mẫu số của Trần Việt Phú phải là 2 nhưng nhận được ${phuRow.eligibleSessions}`
  );
  assert.strictEqual(phuRow.totalAttended, 2);
  assert.strictEqual(phuRow.attendanceRatePct, 100);
  console.log(
    `✓ AC-04 & AC-20: Trần Việt Phú (gia nhập 15/10) có mẫu số đúng ${phuRow.eligibleSessions} buổi (không tính các buổi đầu tháng).`
  );

  // AC-05: Tạo bữa 900.000đ với 3 người -> mỗi người 300.000đ, tổng 900.000đ
  const alloc900 = allocateEqualVnd('test-meal-1', 900000, ['u1', 'u2', 'u3']);
  assert.strictEqual(alloc900.length, 3);
  assert(alloc900.every((a) => a.amountVnd === 300000));
  assert.strictEqual(
    alloc900.reduce((s, a) => s + a.amountVnd, 0),
    900000
  );
  console.log('✓ AC-05: Bữa 900.000đ / 3 người = 300.000đ/người, tổng = 900.000đ.');

  // AC-06: Tạo bữa 100.000đ với 3 người -> Phân bổ số nguyên đồng 33.334 + 33.333 + 33.333 = 100.000đ
  const alloc100 = allocateEqualVnd('test-meal-2', 100000, ['u1', 'u2', 'u3']);
  const amounts100 = alloc100.map((a) => a.amountVnd);
  assert.deepStrictEqual(amounts100, [33334, 33333, 33333]);
  assert.strictEqual(
    amounts100.reduce((s, x) => s + x, 0),
    100000
  );
  console.log('✓ AC-06: Bữa 100.000đ / 3 người = 33.334 + 33.333 + 33.333 = 100.000đ.');

  // AC-10 & AC-11: Tổng chi phí nhóm bằng tổng các bữa duy nhất, không bị nhân theo số người tham gia
  const fullOctReport = computeMonthlyReport(state, defaultOctFilter);
  const manualSumDistinctMeals = octMeals.reduce((s, m) => s + m.totalPaidVnd, 0);
  assert.strictEqual(
    fullOctReport.totalGroupCostVnd,
    manualSumDistinctMeals,
    'AC-11 failed: Tổng chi phí nhóm không khớp tổng từng bữa duy nhất'
  );
  assert(
    fullOctReport.balanceChecks.every((chk) => chk.passed),
    'Section 13.1 failed: Có kiểm tra cân đối tháng không đạt'
  );
  console.log(
    `✓ AC-10 & AC-11: Tổng chi phí nhóm (${fullOctReport.totalGroupCostVnd}đ) khớp chính xác tổng từng bữa, không nhân trùng.`
  );

  // AC-12, AC-13, AC-14: Kiểm tra công nợ hoàn ứng của anh Doãn Thế Cường
  // Trong tháng 10/2026:
  // - 5 bữa APPROVED: 1.050.000 + 1.850.000 + 1.000.000 + 960.000 + 2.100.000 = 6.960.000đ đủ điều kiện hoàn
  // - Đợt 1 (2.900.000đ) đã có payment xác nhận -> Đã hoàn = 2.900.000đ
  // - Đợt 2 (1.960.000đ) mới lập bảng kê chưa chuyển tiền -> Đang đề nghị = 1.960.000đ, KHÔNG làm tăng số tiền đã hoàn (AC-13)
  // - Còn phải hoàn = 6.960.000 - 2.900.000 = 4.060.000đ
  assert.strictEqual(fullOctReport.payerApprovedEligibleVnd, 6960000);
  assert.strictEqual(fullOctReport.payerReimbursedForPeriodMealsVnd, 2900000);
  assert.strictEqual(fullOctReport.payerClaimedPendingVnd, 1960000);
  assert.strictEqual(fullOctReport.payerRemainingBalanceVnd, 4060000);
  console.log(
    '✓ AC-12, AC-13, AC-14: Đối soát hoàn ứng chính xác (Đã duyệt: 6.960.000đ | Đã hoàn: 2.900.000đ | Đang đề nghị: 1.960.000đ | Còn phải hoàn: 4.060.000đ).'
  );

  // Kiểm tra chống chồng lấn thời gian membership (Mục 8.1)
  const overlapCheck = validateMembershipOverlap(
    {
      programId: 'prog-lunch',
      memberId: 'mem-01',
      startDate: '2026-06-01',
      endDate: null,
    },
    state.programMemberships
  );
  assert.strictEqual(overlapCheck.valid, false, 'Membership overlap check should fail');
  console.log('✓ Mục 8.1: Chặn khoảng thời gian tư cách thành viên giao nhau.');

  console.log('=== TẤT CẢ KIỂM THỬ NGHIỆM THU ĐỀU VƯỢT QUA 100%! ===');
}

runAcceptanceCriteriaTests();
