import {
  AllocationMethod,
  AppState,
  FilterState,
  MealCostAllocation,
  MealReimbursementComputed,
  MealSession,
  MemberReportRow,
  MonthlyBalanceCheck,
  MonthlyKPIReport,
  ProgramMembership,
  ReimbursementStatus,
} from './types';

/**
 * Chuyển đổi ISO timestamp sang ngày YYYY-MM-DD theo múi giờ Asia/Ho_Chi_Minh (UTC+7).
 * Đảm bảo AC-01: Chọn tháng 10/2026 chỉ thấy bữa thực tế diễn ra trong tháng theo UTC+7.
 */
export function getMealDateVN(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString.slice(0, 10);
  // Sử dụng Intl.DateTimeFormat với timeZone Asia/Ho_Chi_Minh
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '10';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function getMealMonthVN(isoString: string): string {
  return getMealDateVN(isoString).slice(0, 7);
}

export function formatDateTimeVN(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDateVN(isoOrDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) {
    const [y, m, d] = isoOrDate.split('-');
    return `${d}/${m}/${y}`;
  }
  const dStr = getMealDateVN(isoOrDate);
  const [y, m, d] = dStr.split('-');
  return `${d}/${m}/${y}`;
}

export function formatVnd(amount: number): string {
  const rounded = Math.round(amount || 0);
  return new Intl.NumberFormat('vi-VN').format(rounded) + 'đ';
}

/**
 * F06, AC-05, AC-06: Chia đều chi phí sang số nguyên đồng (VND).
 * Phần dư đồng được phân phối nhất quán theo thứ tự memberId ổn định.
 * Ví dụ: 100.000đ / 3 người -> 33.334 + 33.333 + 33.333 = 100.000đ.
 */
export function allocateEqualVnd(
  mealId: string,
  totalPaidVnd: number,
  attendeeMemberIds: string[]
): MealCostAllocation[] {
  const uniqueIds = Array.from(new Set(attendeeMemberIds)).sort((a, b) => a.localeCompare(b));
  const count = uniqueIds.length;
  const cleanTotal = Math.max(0, Math.round(totalPaidVnd));
  if (count === 0) return [];

  const base = Math.floor(cleanTotal / count);
  const remainder = cleanTotal - base * count;

  return uniqueIds.map((memberId, index) => ({
    mealId,
    memberId,
    amountVnd: base + (index < remainder ? 1 : 0),
    weight: 1,
    allocationMethod: 'EQUAL' as AllocationMethod,
  }));
}

/**
 * F06: Chia theo tỷ trọng (WEIGHTED), vẫn đảm bảo tổng bằng đúng số nguyên đồng.
 */
export function allocateWeightedVnd(
  mealId: string,
  totalPaidVnd: number,
  weightsByMember: { memberId: string; weight: number }[]
): MealCostAllocation[] {
  const sorted = [...weightsByMember]
    .filter((w) => w.weight > 0)
    .sort((a, b) => a.memberId.localeCompare(b.memberId));
  const cleanTotal = Math.max(0, Math.round(totalPaidVnd));
  if (sorted.length === 0) return [];

  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    return allocateEqualVnd(
      mealId,
      cleanTotal,
      sorted.map((s) => s.memberId)
    );
  }

  const rawAllocations = sorted.map((item) => {
    const exact = (cleanTotal * item.weight) / totalWeight;
    return {
      memberId: item.memberId,
      weight: item.weight,
      floorAmount: Math.floor(exact),
      fraction: exact - Math.floor(exact),
    };
  });

  const sumFloor = rawAllocations.reduce((s, x) => s + x.floorAmount, 0);
  let remainder = cleanTotal - sumFloor;

  // Ưu tiên phần thập phân lớn hơn, nếu bằng nhau thì theo thứ tự memberId ổn định
  const orderForRemainder = [...rawAllocations]
    .map((item, idx) => ({ idx, fraction: item.fraction, memberId: item.memberId }))
    .sort((a, b) => {
      if (Math.abs(b.fraction - a.fraction) > 1e-9) return b.fraction - a.fraction;
      return a.memberId.localeCompare(b.memberId);
    });

  const bonusSet = new Set<number>();
  for (let i = 0; i < remainder && i < orderForRemainder.length; i++) {
    bonusSet.add(orderForRemainder[i].idx);
  }

  return rawAllocations.map((item, idx) => ({
    mealId,
    memberId: item.memberId,
    amountVnd: item.floorAmount + (bonusSet.has(idx) ? 1 : 0),
    weight: item.weight,
    allocationMethod: 'WEIGHTED' as AllocationMethod,
  }));
}

/**
 * Kiểm tra tư cách thành viên hợp lệ của nhân sự u tại chương trình programId vào ngày mealDate (YYYY-MM-DD).
 * Phục vụ F08, AC-04, AC-20.
 */
export function isMemberEligibleOnDate(
  memberId: string,
  programId: string,
  mealDateVN: string,
  memberships: ProgramMembership[]
): boolean {
  return memberships.some(
    (pm) =>
      pm.memberId === memberId &&
      pm.programId === programId &&
      pm.startDate <= mealDateVN &&
      (pm.endDate === null || pm.endDate === '' || mealDateVN <= pm.endDate)
  );
}

/**
 * Kiểm tra không giao nhau của khoảng thời gian membership (Mục 8.1 PRD)
 */
export function validateMembershipOverlap(
  candidate: Omit<ProgramMembership, 'id'> & { id?: string },
  existingMemberships: ProgramMembership[]
): { valid: boolean; error?: string } {
  if (candidate.endDate && candidate.endDate < candidate.startDate) {
    return {
      valid: false,
      error: 'Ngày kết thúc tư cách thành viên phải lớn hơn hoặc bằng ngày bắt đầu.',
    };
  }
  const cStart = candidate.startDate;
  const cEnd = candidate.endDate || '9999-12-31';

  for (const pm of existingMemberships) {
    if (pm.id && candidate.id && pm.id === candidate.id) continue;
    if (pm.programId !== candidate.programId || pm.memberId !== candidate.memberId) continue;
    const eStart = pm.startDate;
    const eEnd = pm.endDate || '9999-12-31';
    if (cStart <= eEnd && eStart <= cEnd) {
      return {
        valid: false,
        error: `Khoảng thời gian giao nhau với lịch sử thành viên đã có (${pm.startDate} → ${pm.endDate || 'Hiện tại'}).`,
      };
    }
  }
  return { valid: true };
}

/**
 * F03: Phát hiện bữa ăn có khả năng ghi trùng (cùng chương trình, cùng ngày UTC+7, cùng địa điểm hoặc cùng số tiền).
 * Cảnh báo nhưng không tự khóa.
 */
export function detectDuplicateMeals(
  candidate: {
    id?: string;
    programId: string;
    occurredAt: string;
    venue: string;
    totalPaidVnd: number;
  },
  meals: MealSession[]
): MealSession[] {
  const candidateDate = getMealDateVN(candidate.occurredAt);
  const normVenue = candidate.venue.trim().toLowerCase();

  return meals.filter((m) => {
    if (candidate.id && m.id === candidate.id) return false;
    if (m.status === 'VOIDED') return false;
    const mDate = getMealDateVN(m.occurredAt);
    if (m.programId !== candidate.programId || mDate !== candidateDate) return false;
    const sameVenue = normVenue.length > 0 && m.venue.trim().toLowerCase() === normVenue;
    const sameAmount = candidate.totalPaidVnd > 0 && m.totalPaidVnd === candidate.totalPaidVnd;
    return sameVenue || sameAmount;
  });
}

/**
 * Mục 4.3 & 8.3: Tính toán trạng thái hoàn ứng của từng bữa ăn từ các đợt (batches) và giao dịch thanh toán thực tế (payments).
 * Không dùng gán tay tùy ý.
 */
export function computeAllMealsReimbursement(
  state: AppState
): Record<string, MealReimbursementComputed> {
  const result: Record<string, MealReimbursementComputed> = {};

  // Tính tổng đã thanh toán thực tế cho từng batch
  const paidByBatch: Record<string, number> = {};
  for (const payment of state.reimbursementPayments) {
    paidByBatch[payment.batchId] = (paidByBatch[payment.batchId] || 0) + Math.round(payment.amountVnd);
  }

  // Phân bổ số tiền đã thanh toán của batch xuống từng item trong batch (theo thứ tự ổn định)
  const itemReimbursedMap: Record<string, number> = {};
  for (const batch of state.reimbursementBatches) {
    if (batch.status === 'VOIDED') continue;
    const batchItems = state.reimbursementItems
      .filter((it) => it.batchId === batch.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    let remainingBatchPaid = paidByBatch[batch.id] || 0;

    for (const item of batchItems) {
      const allocatedPaid = Math.min(item.claimedAmountVnd, Math.max(0, remainingBatchPaid));
      itemReimbursedMap[item.id] = allocatedPaid;
      remainingBatchPaid -= allocatedPaid;
    }
  }

  // Duyệt từng bữa ăn
  for (const meal of state.meals) {
    const program = state.programs.find((p) => p.id === meal.programId);
    const policyPct = program ? program.reimbursementPolicyPct : 100;
    const isApprovedOrAllowed =
      meal.status === 'APPROVED' ||
      (!state.settings.requireFinanceApproval && meal.status === 'SUBMITTED');

    const eligibleAmountVnd = isApprovedOrAllowed
      ? Math.round((meal.totalPaidVnd * policyPct) / 100)
      : 0;

    // Tìm các item trong các batch đang hoạt động
    const activeItems = state.reimbursementItems.filter((it) => {
      const b = state.reimbursementBatches.find((batch) => batch.id === it.batchId);
      return it.mealId === meal.id && b && b.status !== 'VOIDED';
    });

    const batchCodes = activeItems
      .map((it) => state.reimbursementBatches.find((b) => b.id === it.batchId)?.batchCode || '')
      .filter(Boolean);

    const claimedAmountVnd = activeItems.reduce((sum, it) => sum + it.claimedAmountVnd, 0);
    const reimbursedAmountVnd = activeItems.reduce(
      (sum, it) => sum + (itemReimbursedMap[it.id] || 0),
      0
    );

    let status: ReimbursementStatus = 'NOT_ELIGIBLE';
    if (meal.status === 'REJECTED') {
      status = 'REJECTED_RETURNED';
    } else if (!isApprovedOrAllowed) {
      status = 'NOT_ELIGIBLE';
    } else if (reimbursedAmountVnd >= eligibleAmountVnd && eligibleAmountVnd > 0) {
      status = 'REIMBURSED';
    } else if (reimbursedAmountVnd > 0 && reimbursedAmountVnd < eligibleAmountVnd) {
      status = 'PARTIALLY_REIMBURSED';
    } else if (claimedAmountVnd > 0) {
      status = 'CLAIMED';
    } else {
      status = 'NOT_CLAIMED';
    }

    result[meal.id] = {
      mealId: meal.id,
      eligibleAmountVnd,
      claimedAmountVnd,
      reimbursedAmountVnd,
      remainingClaimableVnd: Math.max(0, eligibleAmountVnd - claimedAmountVnd),
      remainingUnpaidVnd: Math.max(0, eligibleAmountVnd - reimbursedAmountVnd),
      status,
      batchCodes,
    };
  }

  return result;
}

/**
 * Lọc danh sách bữa ăn theo bộ lọc đa chiều (F07).
 */
export function filterMeals(
  state: AppState,
  filters: FilterState,
  reimbursementMap?: Record<string, MealReimbursementComputed>
): MealSession[] {
  const reimbMap = reimbursementMap || computeAllMealsReimbursement(state);

  return state.meals
    .filter((meal) => {
      // 1. Lọc tháng theo Asia/Ho_Chi_Minh (AC-01)
      if (filters.month && filters.month !== 'ALL') {
        if (getMealMonthVN(meal.occurredAt) !== filters.month) return false;
      }

      // 2. Khoảng ngày phụ (nếu có)
      const mealDate = getMealDateVN(meal.occurredAt);
      if (filters.dateFrom && mealDate < filters.dateFrom) return false;
      if (filters.dateTo && mealDate > filters.dateTo) return false;

      // 3. Chương trình (AC-02)
      if (filters.programId && filters.programId !== 'ALL') {
        if (meal.programId !== filters.programId) return false;
      }

      // 4. Trạng thái hồ sơ (F07, AC-15: mặc định OPERATIONAL = SUBMITTED + APPROVED)
      if (filters.mealStatusScope === 'OPERATIONAL') {
        if (meal.status !== 'SUBMITTED' && meal.status !== 'APPROVED') return false;
      } else if (filters.mealStatusScope === 'APPROVED_ONLY') {
        if (meal.status !== 'APPROVED') return false;
      } else if (filters.mealStatusScope !== 'ALL') {
        if (meal.status !== filters.mealStatusScope) return false;
      }

      // 5. Lọc theo nhân sự tham gia (nếu chọn 1 người cụ thể)
      if (filters.memberId && filters.memberId !== 'ALL') {
        const attended = state.attendance.some(
          (a) => a.mealId === meal.id && a.memberId === filters.memberId && a.attended
        );
        if (!attended) return false;
      }

      // 6. Tình trạng hoàn ứng
      if (filters.reimbursementFilter && filters.reimbursementFilter !== 'ALL') {
        const rStatus = reimbMap[meal.id]?.status || 'NOT_ELIGIBLE';
        if (rStatus !== filters.reimbursementFilter) return false;
      }

      // 7. Tình trạng hóa đơn
      if (filters.invoiceFilter === 'HAS_INVOICE' && !meal.hasInvoice) return false;
      if (filters.invoiceFilter === 'NO_INVOICE' && meal.hasInvoice) return false;

      // 8. Người ứng tiền
      if (filters.payerMemberId && filters.payerMemberId !== 'ALL') {
        if (meal.payerMemberId !== filters.payerMemberId) return false;
      }

      // 9. Tìm kiếm địa điểm / mã bữa / ghi chú
      if (filters.venueQuery && filters.venueQuery.trim() !== '') {
        const q = filters.venueQuery.trim().toLowerCase();
        const inVenue = meal.venue.toLowerCase().includes(q);
        const inCode = meal.code.toLowerCase().includes(q);
        const inNote = (meal.note || '').toLowerCase().includes(q);
        const inAmount = String(meal.totalPaidVnd).includes(q);
        if (!inVenue && !inCode && !inNote && !inAmount) return false;
      }

      return true;
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

/**
 * Mục 6, 9, 13: Tính toàn bộ KPI báo cáo tháng, thống kê từng nhân sự, hoàn ứng và 5 kiểm tra cân đối.
 * Đảm bảo tuyệt đối không cộng trùng tổng chi phí nhóm khi có nhiều người tham gia (AC-11).
 */
export function computeMonthlyReport(
  state: AppState,
  filters: FilterState
): MonthlyKPIReport {
  const reimbMap = computeAllMealsReimbursement(state);
  const filteredMeals = filterMeals(state, filters, reimbMap);
  const mealIdsSet = new Set(filteredMeals.map((m) => m.id));

  const lunchProgramIds = new Set(
    state.programs.filter((p) => p.code === 'LEADERSHIP_LUNCH').map((p) => p.id)
  );
  const dinnerProgramIds = new Set(
    state.programs.filter((p) => p.code === 'GAME_STRATEGY_DINNER').map((p) => p.id)
  );

  // 1. Tổng số bữa & Tổng chi phí thực chi của nhóm (Mục 6.1: SUM trên mỗi bữa đúng 1 lần)
  const totalMeals = filteredMeals.length;
  let lunchMeals = 0;
  let dinnerMeals = 0;
  let totalGroupCostVnd = 0;
  let lunchCostVnd = 0;
  let dinnerCostVnd = 0;
  let costWithInvoiceVnd = 0;
  let costWithoutInvoiceVnd = 0;
  let mealsWithoutInvoiceCount = 0;

  for (const meal of filteredMeals) {
    const cost = Math.round(meal.totalPaidVnd);
    totalGroupCostVnd += cost;
    if (lunchProgramIds.has(meal.programId)) {
      lunchMeals += 1;
      lunchCostVnd += cost;
    } else if (dinnerProgramIds.has(meal.programId)) {
      dinnerMeals += 1;
      dinnerCostVnd += cost;
    } else {
      lunchMeals += 1;
      lunchCostVnd += cost;
    }

    if (meal.hasInvoice) {
      costWithInvoiceVnd += cost;
    } else {
      costWithoutInvoiceVnd += cost;
      mealsWithoutInvoiceCount += 1;
    }
  }

  // 2. Điểm danh hợp lệ (Chống trùng theo cặp (mealId, memberId) - Mục 6.1 & AC-09)
  const seenAttendanceKeys = new Set<string>();
  const validAttendance = state.attendance.filter((a) => {
    if (!a.attended || !mealIdsSet.has(a.mealId)) return false;
    const key = `${a.mealId}__${a.memberId}`;
    if (seenAttendanceKeys.has(key)) return false;
    seenAttendanceKeys.add(key);
    return true;
  });

  const totalAttendanceVisits = validAttendance.length;
  const uniqueAttendeeIds = new Set(validAttendance.map((a) => a.memberId));
  const uniqueAttendeesCount = uniqueAttendeeIds.size;

  const avgCostPerMealVnd = totalMeals > 0 ? Math.round(totalGroupCostVnd / totalMeals) : 0;
  const avgCostPerVisitVnd =
    totalAttendanceVisits > 0 ? Math.round(totalGroupCostVnd / totalAttendanceVisits) : 0;

  // 3. Thống kê theo từng nhân sự (F08, AC-03, AC-04, AC-10, AC-20)
  // Lưu ý: Để tính tỷ lệ tham gia chính xác khi không lọc riêng 1 nhân sự,
  // mẫu số eligible_sessions của nhân sự u là số bữa thực tế diễn ra trong các bữa đang xét (theo tháng & chương trình)
  // mà nhân sự u có tư cách thành viên hiệu lực vào ngày diễn ra bữa ăn.
  // Nếu người dùng đang chọn lọc 1 memberId trên bộ lọc thì vẫn cần lấy tập bữa ăn của tháng/chương trình để tính đúng mẫu số eligibleSessions!
  const mealsForEligibilityDenominator =
    filters.memberId && filters.memberId !== 'ALL'
      ? filterMeals(state, { ...filters, memberId: 'ALL' }, reimbMap)
      : filteredMeals;

  const memberRows: MemberReportRow[] = state.members
    .filter((m) => {
      if (!state.settings.includeGuestsInMemberKPI && m.memberType === 'GUEST') {
        // Vẫn trả về nếu đang lọc đích danh khách đó, còn mặc định tách khách khỏi bảng xếp hạng nhân sự chính thức
        return filters.memberId === m.id;
      }
      return true;
    })
    .map((member) => {
      const memberProgramIds = Array.from(
        new Set(
          state.programMemberships
            .filter((pm) => pm.memberId === member.id)
            .map((pm) => pm.programId)
        )
      );

      // Các bữa đủ điều kiện trong kỳ (mẫu số)
      const eligibleMeals = mealsForEligibilityDenominator.filter((meal) => {
        const mealDate = getMealDateVN(meal.occurredAt);
        return isMemberEligibleOnDate(
          member.id,
          meal.programId,
          mealDate,
          state.programMemberships
        );
      });
      const eligibleMealIds = eligibleMeals.map((m) => m.id);
      const eligibleMealIdsSet = new Set(eligibleMealIds);

      // Các bữa người này thực tế có mặt (trong phạm vi bữa ăn hợp lệ)
      const memberAttendedMealIds = validAttendance
        .filter((a) => a.memberId === member.id)
        .map((a) => a.mealId);

      // Nếu đang lọc riêng 1 người thì filteredMeals đã chỉ gồm bữa người đó có mặt;
      // các chỉ số trưa/tối tính trên tập bữa người đó thực sự tham gia
      let lunchAttended = 0;
      let dinnerAttended = 0;
      for (const mId of memberAttendedMealIds) {
        const mealObj = state.meals.find((m) => m.id === mId);
        if (!mealObj) continue;
        if (lunchProgramIds.has(mealObj.programId)) {
          lunchAttended += 1;
        } else if (dinnerProgramIds.has(mealObj.programId)) {
          dinnerAttended += 1;
        } else {
          lunchAttended += 1;
        }
      }

      const totalAttended = memberAttendedMealIds.length;
      const eligibleSessions = eligibleMeals.length;

      // Số buổi tham gia trong các buổi đủ điều kiện (hoặc tổng tham gia)
      const eligibleAttendedSessions = memberAttendedMealIds.filter((id) =>
        eligibleMealIdsSet.has(id)
      ).length;

      // F08: Tỷ lệ tham gia = Số buổi tham gia / Số buổi đủ điều kiện * 100%
      // Nếu mẫu số = 0 thì hiển thị '—' (null), không hiển thị 0%.
      const attendanceRatePct =
        eligibleSessions > 0
          ? Math.round((totalAttended / eligibleSessions) * 1000) / 10
          : null;

      // Chi phí phân bổ của nhân sự u trong các bữa đang lọc
      const allocatedCostVnd = state.allocations
        .filter((al) => mealIdsSet.has(al.mealId) && al.memberId === member.id)
        .reduce((sum, al) => sum + Math.round(al.amountVnd), 0);

      const avgMemberCost =
        totalAttended > 0 ? Math.round(allocatedCostVnd / totalAttended) : 0;

      return {
        member,
        programIds: memberProgramIds,
        lunchAttended,
        dinnerAttended,
        totalAttended,
        eligibleSessions,
        eligibleAttendedSessions,
        attendanceRatePct,
        allocatedCostVnd,
        avgCostPerVisitVnd: avgMemberCost,
        attendedMealIds: memberAttendedMealIds,
        eligibleMealIds,
      };
    })
    .sort((a, b) => {
      if (b.totalAttended !== a.totalAttended) return b.totalAttended - a.totalAttended;
      if (b.allocatedCostVnd !== a.allocatedCostVnd) return b.allocatedCostVnd - a.allocatedCostVnd;
      return a.member.fullName.localeCompare(b.member.fullName);
    });

  // 4. Chỉ số hoàn ứng theo người ứng (mặc định Doãn Thế Cường hoặc theo bộ lọc payerMemberId)
  const targetPayerId =
    filters.payerMemberId && filters.payerMemberId !== 'ALL'
      ? filters.payerMemberId
      : state.settings.defaultPayerMemberId;

  const payerMeals = filteredMeals.filter((m) => m.payerMemberId === targetPayerId);

  const payerTotalAdvancedVnd = payerMeals.reduce(
    (sum, m) => sum + Math.round(m.totalPaidVnd),
    0
  );

  const payerApprovedEligibleVnd = payerMeals.reduce(
    (sum, m) => sum + (reimbMap[m.id]?.eligibleAmountVnd || 0),
    0
  );

  const payerClaimedPendingVnd = payerMeals.reduce((sum, m) => {
    const r = reimbMap[m.id];
    if (!r) return sum;
    return sum + Math.max(0, r.claimedAmountVnd - r.reimbursedAmountVnd);
  }, 0);

  const payerReimbursedForPeriodMealsVnd = payerMeals.reduce(
    (sum, m) => sum + (reimbMap[m.id]?.reimbursedAmountVnd || 0),
    0
  );

  const payerRemainingBalanceVnd = Math.max(
    0,
    payerApprovedEligibleVnd - payerReimbursedForPeriodMealsVnd
  );

  // Tiền công ty thực hoàn trong tháng (tính theo paidAt - F07: chỉ số riêng)
  const payerReimbursedInPeriodVnd = state.reimbursementPayments
    .filter((p) => {
      if (p.payerMemberId !== targetPayerId) return false;
      if (filters.month && filters.month !== 'ALL') {
        return getMealMonthVN(p.paidAt) === filters.month;
      }
      return true;
    })
    .reduce((sum, p) => sum + Math.round(p.amountVnd), 0);

  // 5. Bộ kiểm tra cân đối mỗi tháng (Mục 13.1 PRD)
  const sumMealTotals = filteredMeals.reduce((s, m) => s + Math.round(m.totalPaidVnd), 0);
  const sumAllAllocationsIncludingGuests = state.allocations
    .filter((al) => mealIdsSet.has(al.mealId))
    .reduce((s, al) => s + Math.round(al.amountVnd), 0);

  const sumAllMemberVisitsIncludingGuests = state.members.reduce((sum, m) => {
    const count = validAttendance.filter((a) => a.memberId === m.id).length;
    return sum + count;
  }, 0);

  const balanceChecks: MonthlyBalanceCheck[] = [
    {
      id: 'CHK-01',
      label: 'Tổng tiền theo từng bữa hợp lệ = KPI Tổng chi phí nhóm',
      passed: sumMealTotals === totalGroupCostVnd,
      leftValue: sumMealTotals,
      rightValue: totalGroupCostVnd,
      unit: 'VND',
      detail: 'Đảm bảo không nhân trùng chi phí theo số người tham gia (AC-11).',
    },
    {
      id: 'CHK-02',
      label: 'Tổng phân bổ tất cả người tham gia (gồm khách) = Tổng chi phí nhóm',
      passed: sumAllAllocationsIncludingGuests === totalGroupCostVnd,
      leftValue: sumAllAllocationsIncludingGuests,
      rightValue: totalGroupCostVnd,
      unit: 'VND',
      detail: 'Đảm bảo chia tiền nguyên đồng chính xác 100% ở mọi bữa ăn (AC-05, AC-06).',
    },
    {
      id: 'CHK-03',
      label: 'Tổng số lượt theo từng thành viên (gồm khách) = Tổng lượt tham gia nhóm',
      passed: sumAllMemberVisitsIncludingGuests === totalAttendanceVisits,
      leftValue: sumAllMemberVisitsIncludingGuests,
      rightValue: totalAttendanceVisits,
      unit: 'VISITS',
      detail: 'Đảm bảo mỗi người tối đa 1 lượt/bữa, không đếm trùng (AC-09).',
    },
    {
      id: 'CHK-04',
      label: 'Đã hoàn + Chưa hoàn = Tổng tiền đủ điều kiện hoàn (Đã duyệt)',
      passed:
        payerReimbursedForPeriodMealsVnd + payerRemainingBalanceVnd === payerApprovedEligibleVnd,
      leftValue: payerReimbursedForPeriodMealsVnd + payerRemainingBalanceVnd,
      rightValue: payerApprovedEligibleVnd,
      unit: 'VND',
      detail: 'Đảm bảo đối soát công nợ người ứng tiền chính xác tới từng đồng (AC-13, AC-14).',
    },
  ];

  return {
    month: filters.month,
    totalMeals,
    lunchMeals,
    dinnerMeals,
    totalGroupCostVnd,
    lunchCostVnd,
    dinnerCostVnd,
    avgCostPerMealVnd,
    totalAttendanceVisits,
    avgCostPerVisitVnd,
    uniqueAttendeesCount,
    costWithInvoiceVnd,
    costWithoutInvoiceVnd,
    mealsWithoutInvoiceCount,
    payerTotalAdvancedVnd,
    payerApprovedEligibleVnd,
    payerClaimedPendingVnd,
    payerReimbursedInPeriodVnd,
    payerReimbursedForPeriodMealsVnd,
    payerRemainingBalanceVnd,
    memberRows,
    balanceChecks,
  };
}
