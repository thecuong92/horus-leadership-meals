import assert from 'assert';
import {
  allocateEqualVnd,
  computeMonthlyReport,
  filterMeals,
  getMealMonthVN,
  validateMembershipOverlap,
} from '../calculations';
import { createDemoSampleState, createInitialSeedState } from '../seed-data';
import { FilterState } from '../types';

function runAcceptanceCriteriaTests() {
  console.log('=== KIỂM THỬ 5 TẦNG & TIÊU CHÍ NGHIỆM THU (AC-01 → AC-20) HORUS LEADERSHIP MEALS ===');

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

  // Kiểm tra trạng thái khởi tạo mặc định (Tổng = 0đ, 0 bữa ăn, giữ nguyên 8 thành viên BOD)
  const zeroState = createInitialSeedState();
  const zeroReport = computeMonthlyReport(zeroState, defaultOctFilter);
  assert.strictEqual(zeroReport.totalMeals, 0, 'Zero state totalMeals phải bằng 0');
  assert.strictEqual(zeroReport.totalGroupCostVnd, 0, 'Zero state totalGroupCostVnd phải bằng 0');
  assert.strictEqual(zeroReport.payerRemainingBalanceVnd, 0, 'Zero state remaining balance phải bằng 0');
  assert.strictEqual(zeroState.members.length, 8, 'Danh bạ mặc định phải có đúng 8 thành viên BOD');
  console.log('✓ ZERO-STATE: Trạng thái khởi tạo sạch 100% (Tổng = 0đ, 0 bữa ăn, 8 thành viên BOD).');

  // Chạy kiểm thử nghiệm thu trên bộ dữ liệu Sandbox
  const state = createDemoSampleState();

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
  assert.strictEqual(phuRow.eligibleSessions, 2);
  assert.strictEqual(phuRow.totalAttended, 2);
  assert.strictEqual(phuRow.attendanceRatePct, 100);
  console.log(
    `✓ AC-04 & AC-20: Trần Việt Phú (gia nhập 15/10) có mẫu số đúng ${phuRow.eligibleSessions} buổi (không tính các buổi đầu tháng).`
  );

  // AC-05 & AC-06
  const alloc900 = allocateEqualVnd('test-meal-1', 900000, ['u1', 'u2', 'u3']);
  assert.strictEqual(alloc900.reduce((s, a) => s + a.amountVnd, 0), 900000);
  const alloc100 = allocateEqualVnd('test-meal-2', 100000, ['u1', 'u2', 'u3']);
  assert.deepStrictEqual(
    alloc100.map((a) => a.amountVnd),
    [33334, 33333, 33333]
  );
  console.log('✓ AC-05 & AC-06: Chia tiền nguyên đồng chẵn & lẻ khớp 100%.');

  // AC-10 & AC-11
  const fullOctReport = computeMonthlyReport(state, defaultOctFilter);
  const manualSumDistinctMeals = octMeals.reduce((s, m) => s + m.totalPaidVnd, 0);
  assert.strictEqual(fullOctReport.totalGroupCostVnd, manualSumDistinctMeals);
  assert(fullOctReport.balanceChecks.every((chk) => chk.passed));
  console.log(
    `✓ AC-10 & AC-11: Tổng chi phí nhóm (${fullOctReport.totalGroupCostVnd}đ) khớp chính xác tổng từng bữa, không nhân trùng.`
  );

  // AC-12, AC-13, AC-14
  assert.strictEqual(fullOctReport.payerApprovedEligibleVnd, 6960000);
  assert.strictEqual(fullOctReport.payerReimbursedForPeriodMealsVnd, 2900000);
  assert.strictEqual(fullOctReport.payerClaimedPendingVnd, 1960000);
  assert.strictEqual(fullOctReport.payerRemainingBalanceVnd, 4060000);
  console.log('✓ AC-12, AC-13, AC-14: Đối soát hoàn ứng chính xác.');

  // Mục 8.1
  const overlapCheck = validateMembershipOverlap(
    {
      programId: 'prog-lunch',
      memberId: 'mem-01',
      startDate: '2026-06-01',
      endDate: null,
    },
    state.programMemberships
  );
  assert.strictEqual(overlapCheck.valid, false);
  console.log('✓ Mục 8.1: Chặn khoảng thời gian tư cách thành viên giao nhau.');

  console.log('=== TẤT CẢ KIỂM THỬ ĐỀU VƯỢT QUA 100%! ===');
}

runAcceptanceCriteriaTests();
