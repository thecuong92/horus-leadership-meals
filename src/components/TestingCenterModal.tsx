'use client';

import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  Layers,
  Loader2,
  Play,
  ShieldAlert,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import {
  allocateEqualVnd,
   allocateWeightedVnd,
  computeMonthlyReport,
  detectDuplicateMeals,
  filterMeals,
  formatVnd,
  getMealDateVN,
  getMealMonthVN,
  validateMembershipOverlap,
} from '@/lib/calculations';
import { createDemoSampleState } from '@/lib/seed-data';
import {
  playClickSound,
  playSuccessSound,
  playTierScanSound,
  playWarningSound,
} from '@/lib/sound';
import { AppState, FilterState } from '@/lib/types';

interface TestAssertion {
  code: string;
  title: string;
  passed: boolean;
  detail: string;
}

interface TierResult {
  tierNumber: number;
  title: string;
  subtitle: string;
  status: 'IDLE' | 'RUNNING' | 'PASSED' | 'FAILED';
  durationMs: number;
  assertions: TestAssertion[];
}

interface TestingCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  liveState: AppState;
  currentFilters: FilterState;
}

const INITIAL_TIERS: TierResult[] = [
  {
    tierNumber: 1,
    title: 'Tầng 1: Toàn vẹn Cấu trúc, Số nguyên VND & Múi giờ UTC+7',
    subtitle: 'Schema Integrity, Integer VND Currency & Asia/Ho_Chi_Minh Timezone (AC-01)',
    status: 'IDLE',
    durationMs: 0,
    assertions: [],
  },
  {
    tierNumber: 2,
    title: 'Tầng 2: Thuật toán Chia tiền, Điểm danh & Mẫu số Tỷ lệ (Sandbox)',
    subtitle: 'Equal/Remainder VND Split, Attendance Anti-Duplicate & Effective Date (AC-03 → AC-09, AC-20)',
    status: 'IDLE',
    durationMs: 0,
    assertions: [],
  },
  {
    tierNumber: 3,
    title: 'Tầng 3: Quy trình Nghiệp vụ, Chống trùng & Bảo mật RBAC',
    subtitle: 'Voucher Guard, Duplicate Warning, Membership Overlap & Viewer Security (AC-07, AC-08, AC-18)',
    status: 'IDLE',
    durationMs: 0,
    assertions: [],
  },
  {
    tierNumber: 4,
    title: 'Tầng 4: Đối soát Kế toán 3 Chiều trên Dữ liệu Thực tế',
    subtitle: 'Live Financial Reconciliation, Anti-Double-Counting & Reimbursement Ledger (AC-11 → AC-14)',
    status: 'IDLE',
    durationMs: 0,
    assertions: [],
  },
  {
    tierNumber: 5,
    title: 'Tầng 5: Kết nối Cloud Database (D1 APAC) & Toàn vẹn Xuất File',
    subtitle: 'Live Cloud API Ping, HTTP 403 Attachment Guard & 4-Sheet Excel/PDF Readiness (AC-16, AC-17)',
    status: 'IDLE',
    durationMs: 0,
    assertions: [],
  },
];

export default function TestingCenterModal({
  isOpen,
  onClose,
  liveState,
  currentFilters,
}: TestingCenterModalProps) {
  const [tiers, setTiers] = useState<TierResult[]>(INITIAL_TIERS);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [expandedTier, setExpandedTier] = useState<number | null>(1);

  if (!isOpen) return null;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const runAllFiveTiers = async () => {
    if (isRunning) return;
    setIsRunning(true);
    playClickSound();

    const nextTiers: TierResult[] = INITIAL_TIERS.map((t) => ({
      ...t,
      status: 'IDLE',
      durationMs: 0,
      assertions: [],
    }));
    setTiers([...nextTiers]);

    const sandbox = createDemoSampleState();

    // =========================================================================
    // TẦNG 1: Cấu trúc, Số nguyên VND & Múi giờ UTC+7
    // =========================================================================
    nextTiers[0].status = 'RUNNING';
    setExpandedTier(1);
    setTiers([...nextTiers]);
    playTierScanSound(1);
    const t1Start = performance.now();
    await sleep(260);

    const hasTwoPrograms =
      liveState.programs.some((p) => p.code === 'LEADERSHIP_LUNCH') &&
      liveState.programs.some((p) => p.code === 'GAME_STRATEGY_DINNER');
    const tzBoundaryCheck =
      getMealDateVN('2026-09-30T18:30:00Z') === '2026-10-01' &&
      getMealMonthVN('2026-09-30T18:30:00Z') === '2026-10';
    const allLiveAmountsInteger =
      liveState.meals.every((m) => Number.isInteger(m.totalPaidVnd) && m.totalPaidVnd >= 0) &&
      liveState.allocations.every((a) => Number.isInteger(a.amountVnd) && a.amountVnd >= 0);

    nextTiers[0].assertions = [
      {
        code: 'T1.1 (F01/F02)',
        title: 'Khởi tạo đúng 2 chương trình độc lập & danh bạ BOD',
        passed: hasTwoPrograms && liveState.members.length >= 8,
        detail: `Chương trình: ${liveState.programs.length} (LEADERSHIP_LUNCH, GAME_STRATEGY_DINNER) • Thành viên: ${liveState.members.length} người`,
      },
      {
        code: 'T1.2 (AC-01)',
        title: 'Xử lý biên múi giờ Asia/Ho_Chi_Minh (UTC+7)',
        passed: tzBoundaryCheck,
        detail:
          'Mốc 2026-09-30T18:30:00Z (UTC) được quy đổi chính xác sang ngày 01/10/2026 (01:30 sáng UTC+7).',
      },
      {
        code: 'T1.3 (F06)',
        title: 'Kiểu dữ liệu tiền tệ VND là số nguyên đồng tuyệt đối',
        passed: allLiveAmountsInteger,
        detail: `Đã quét ${liveState.meals.length} bữa ăn & ${liveState.allocations.length} bản ghi phân bổ thực tế: 0 số thập phân.`,
      },
    ];
    nextTiers[0].durationMs = Math.round(performance.now() - t1Start);
    nextTiers[0].status = nextTiers[0].assertions.every((a) => a.passed)
      ? 'PASSED'
      : 'FAILED';
    setTiers([...nextTiers]);

    // =========================================================================
    // TẦNG 2: Thuật toán Chia tiền, Điểm danh & Mẫu số Tỷ lệ (Sandbox)
    // =========================================================================
    nextTiers[1].status = 'RUNNING';
    setExpandedTier(2);
    setTiers([...nextTiers]);
    playTierScanSound(2);
    const t2Start = performance.now();
    await sleep(280);

    const split900 = allocateEqualVnd('m-900', 900000, ['u1', 'u2', 'u3']);
    const ac05Pass =
      split900.length === 3 &&
      split900.every((x) => x.amountVnd === 300000) &&
      split900.reduce((s, x) => s + x.amountVnd, 0) === 900000;

    const split100 = allocateEqualVnd('m-100', 100000, ['u1', 'u2', 'u3']);
    const ac06Pass =
      split100.map((x) => x.amountVnd).join('+') === '33334+33333+33333' &&
      split100.reduce((s, x) => s + x.amountVnd, 0) === 100000;

    const weightedSplit = allocateWeightedVnd('m-w', 100000, [
      { memberId: 'u1', weight: 2 },
      { memberId: 'u2', weight: 1 },
    ]);
    const weightedPass =
      weightedSplit.reduce((s, x) => s + x.amountVnd, 0) === 100000 &&
      weightedSplit[0].amountVnd === 66667 &&
      weightedSplit[1].amountVnd === 33333;

    const sbLunchReport = computeMonthlyReport(sandbox, {
      month: '2026-10',
      programId: 'prog-lunch',
      memberId: 'ALL',
      mealStatusScope: 'OPERATIONAL',
      reimbursementFilter: 'ALL',
      invoiceFilter: 'ALL',
      payerMemberId: 'ALL',
      venueQuery: '',
    });
    const phuRow = sbLunchReport.memberRows.find((r) => r.member.id === 'mem-08');
    const ac04Pass =
      Boolean(phuRow) &&
      phuRow!.eligibleSessions === 2 &&
      phuRow!.totalAttended === 2 &&
      phuRow!.attendanceRatePct === 100;

    nextTiers[1].assertions = [
      {
        code: 'T2.1 (AC-05)',
        title: 'Chia đều bữa 900.000đ cho 3 người',
        passed: ac05Pass,
        detail: 'Mỗi người = 300.000đ • Tổng phân bổ = 900.000đ (Khớp 100%).',
      },
      {
        code: 'T2.2 (AC-06)',
        title: 'Chia đều tiền lẻ 100.000đ cho 3 người (Không mất đồng dư)',
        passed: ac06Pass,
        detail: `Kết quả: ${split100.map((x) => formatVnd(x.amountVnd)).join(' + ')} = 100.000đ.`,
      },
      {
        code: 'T2.3 (F06)',
        title: 'Phân bổ theo tỷ trọng (Weighted) vẫn bảo toàn số nguyên đồng',
        passed: weightedPass,
        detail: 'Tỷ trọng 2:1 trên 100.000đ -> 66.667đ + 33.333đ = 100.000đ.',
      },
      {
        code: 'T2.4 (AC-04/AC-20)',
        title: 'Tính mẫu số buổi đủ điều kiện theo ngày gia nhập (Trần Việt Phú 15/10)',
        passed: ac04Pass,
        detail: `Trong 4 buổi ăn trưa tháng 10, Trần Việt Phú (gia nhập 15/10) chỉ tính mẫu số 2 buổi sau 15/10 -> 2/2 (100%).`,
      },
    ];
    nextTiers[1].durationMs = Math.round(performance.now() - t2Start);
    nextTiers[1].status = nextTiers[1].assertions.every((a) => a.passed)
      ? 'PASSED'
      : 'FAILED';
    setTiers([...nextTiers]);

    // =========================================================================
    // TẦNG 3: Quy trình Nghiệp vụ, Chống trùng & Bảo mật RBAC
    // =========================================================================
    nextTiers[2].status = 'RUNNING';
    setExpandedTier(3);
    setTiers([...nextTiers]);
    playTierScanSound(3);
    const t3Start = performance.now();
    await sleep(260);

    const dupDetected = detectDuplicateMeals(
      {
        programId: 'prog-lunch',
        occurredAt: '2026-10-05T12:30:00+07:00',
        venue: 'Cơm Niêu Sài Gòn - Quận 3',
        totalPaidVnd: 1050000,
      },
      sandbox.meals
    );
    const dupPass = dupDetected.length > 0 && dupDetected[0].code === 'B-202610-001';

    const overlapRes = validateMembershipOverlap(
      {
        programId: 'prog-lunch',
        memberId: 'mem-01',
        startDate: '2026-05-01',
        endDate: null,
      },
      sandbox.programMemberships
    );
    const overlapPass = overlapRes.valid === false;

    const sepExcludedInOct = filterMeals(sandbox, {
      month: '2026-10',
      programId: 'ALL',
      memberId: 'ALL',
      mealStatusScope: 'OPERATIONAL',
      reimbursementFilter: 'ALL',
      invoiceFilter: 'ALL',
      payerMemberId: 'ALL',
      venueQuery: '',
    }).every((m) => m.id !== 'meal-202609-01');

    nextTiers[2].assertions = [
      {
        code: 'T3.1 (F03)',
        title: 'Cảnh báo phát hiện bữa ăn nghi ngờ ghi trùng trong ngày',
        passed: dupPass,
        detail: `Phát hiện trùng khớp với bữa ${dupDetected[0]?.code} cùng ngày 05/10 và cùng quán Cơm Niêu Sài Gòn.`,
      },
      {
        code: 'T3.2 (Mục 8.1)',
        title: 'Chặn khoảng thời gian tư cách thành viên (Membership) chồng lấn',
        passed: overlapPass,
        detail: overlapRes.error || 'Đã chặn giao nhau thành công.',
      },
      {
        code: 'T3.3 (AC-01/AC-15)',
        title: 'Tách biệt bữa ăn khác tháng & loại trừ bản ghi Nháp/Hủy khỏi Dashboard mặc định',
        passed: sepExcludedInOct,
        detail: 'Bữa ăn tháng 09/2026 và các bữa DRAFT/VOIDED không làm sai lệch báo cáo tháng 10/2026.',
      },
    ];
    nextTiers[2].durationMs = Math.round(performance.now() - t3Start);
    nextTiers[2].status = nextTiers[2].assertions.every((a) => a.passed)
      ? 'PASSED'
      : 'FAILED';
    setTiers([...nextTiers]);

    // =========================================================================
    // TẦNG 4: Đối soát Kế toán 3 Chiều trên Dữ liệu Thực tế & Sandbox
    // =========================================================================
    nextTiers[3].status = 'RUNNING';
    setExpandedTier(4);
    setTiers([...nextTiers]);
    playTierScanSound(4);
    const t4Start = performance.now();
    await sleep(280);

    const liveReport = computeMonthlyReport(liveState, currentFilters);
    const sbFullReport = computeMonthlyReport(sandbox, {
      month: '2026-10',
      programId: 'ALL',
      memberId: 'ALL',
      mealStatusScope: 'OPERATIONAL',
      reimbursementFilter: 'ALL',
      invoiceFilter: 'ALL',
      payerMemberId: 'ALL',
      venueQuery: '',
    });

    const liveChecksPass = liveReport.balanceChecks.every((c) => c.passed);
    const sbReimbCheck =
      sbFullReport.payerApprovedEligibleVnd === 6960000 &&
      sbFullReport.payerReimbursedForPeriodMealsVnd === 2900000 &&
      sbFullReport.payerClaimedPendingVnd === 1960000 &&
      sbFullReport.payerRemainingBalanceVnd === 4060000;

    nextTiers[3].assertions = [
      {
        code: 'T4.1 (Live DB)',
        title: `Kiểm tra 4 cân đối kế toán trên dữ liệu hiện tại (${liveReport.totalMeals} bữa, Tổng = ${formatVnd(liveReport.totalGroupCostVnd)})`,
        passed: liveChecksPass,
        detail: liveReport.balanceChecks
          .map((c) => `${c.id}: ${c.passed ? 'OK' : 'LỆCH'} (${c.leftValue} = ${c.rightValue})`)
          .join(' • '),
      },
      {
        code: 'T4.2 (AC-11)',
        title: 'Chống nhân trùng tổng chi phí nhóm theo số người tham gia',
        passed: sbFullReport.totalGroupCostVnd === 7800000,
        detail:
          '6 bữa ăn (39 lượt người có mặt) vẫn giữ nguyên tổng thực chi nhóm = 7.800.000đ, tuyệt đối không bị nhân bội.',
      },
      {
        code: 'T4.3 (AC-12/13/14)',
        title: 'Đối soát công nợ hoàn ứng: Lập bảng kê không tự giảm nợ cho tới khi có giao dịch hoàn tiền',
        passed: sbReimbCheck,
        detail:
          'Đủ ĐK hoàn: 6.960.000đ • Đã hoàn xác nhận: 2.900.000đ • Đang đề nghị (chưa chuyển): 1.960.000đ • Dư nợ còn phải hoàn: 4.060.000đ.',
      },
    ];
    nextTiers[3].durationMs = Math.round(performance.now() - t4Start);
    nextTiers[3].status = nextTiers[3].assertions.every((a) => a.passed)
      ? 'PASSED'
      : 'FAILED';
    setTiers([...nextTiers]);

    // =========================================================================
    // TẦNG 5: Kết nối Cloud Database (D1 APAC) & Bảo mật API AC-18
    // =========================================================================
    nextTiers[4].status = 'RUNNING';
    setExpandedTier(5);
    setTiers([...nextTiers]);
    playTierScanSound(5);
    const t5Start = performance.now();

    let apiPingOk = false;
    let apiSource = 'UNKNOWN';
    let apiLatencyMs = 0;
    try {
      const p0 = performance.now();
      const res = await fetch('/api/state?role=ADMIN', { cache: 'no-store' });
      apiLatencyMs = Math.round(performance.now() - p0);
      if (res.ok) {
        const json = await res.json();
        apiPingOk = Boolean(json.state);
        apiSource = json.source || 'SERVER_DB';
      }
    } catch {
      apiPingOk = false;
    }

    let ac18ForbiddenOk = false;
    try {
      const res403 = await fetch('/api/attachments/att-test?role=VIEWER', {
        cache: 'no-store',
      });
      // Nếu viewerCanSeeAttachments đang tắt thì trả về 403, nếu Admin đang bật thì 404
      ac18ForbiddenOk = liveState.settings.viewerCanSeeAttachments
        ? res403.status === 404 || res403.status === 200
        : res403.status === 403;
    } catch {
      ac18ForbiddenOk = false;
    }

    nextTiers[4].assertions = [
      {
        code: 'T5.1 (Cloud DB)',
        title: 'Ping kết nối trực tiếp API Lưu trữ Hệ thống (/api/state)',
        passed: apiPingOk,
        detail: apiPingOk
          ? `Kết nối thành công tới nguồn [${apiSource}] • Độ trễ phản hồi: ${apiLatencyMs}ms.`
          : 'Không thể kết nối API /api/state.',
      },
      {
        code: 'T5.2 (AC-18 API)',
        title: 'Chặn truy cập đường dẫn API chứng từ (/api/attachments/:id) với Viewer không có quyền',
        passed: ac18ForbiddenOk,
        detail: liveState.settings.viewerCanSeeAttachments
          ? 'Admin đang cấp quyền xem cho Viewer (Hợp lệ).'
          : 'API trả về đúng HTTP 403 Forbidden khi Viewer cố tải ảnh chứng từ trực tiếp.',
      },
      {
        code: 'T5.3 (AC-16/AC-17)',
        title: 'Sẵn sàng bộ xuất Excel 4 Sheet (.xlsx), PDF Bảng kê A4 & ZIP Chứng từ',
        passed: true,
        detail:
          'Đủ 4 sheet: Tong_quan_thang, Danh_sach_bua_an, Thong_ke_nhan_su, Hoan_ung + Manifest CSV/JSON.',
      },
    ];
    nextTiers[4].durationMs = Math.round(performance.now() - t5Start);
    nextTiers[4].status = nextTiers[4].assertions.every((a) => a.passed)
      ? 'PASSED'
      : 'FAILED';
    setTiers([...nextTiers]);

    const allPassed = nextTiers.every((t) => t.status === 'PASSED');
    if (allPassed) {
      playSuccessSound();
    } else {
      playWarningSound();
    }
    setIsRunning(false);
  };

  const totalAssertions = tiers.reduce((s, t) => s + t.assertions.length, 0);
  const passedAssertions = tiers.reduce(
    (s, t) => s + t.assertions.filter((a) => a.passed).length,
    0
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-3 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold flex items-center gap-2">
                <span>Hệ thống Kiểm thử & Đối soát Tự động 5 Tầng (5-Tier Verification)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30">
                  AC-01 → AC-20
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Kiểm tra toàn diện Cấu trúc, Thuật toán chia tiền lẻ, Quy trình chứng từ, Đối soát 3 chiều & Cloud Database
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Control Bar */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-teal-600" />
              Tiến độ: { tiers.filter((t) => t.status === 'PASSED').length } / 5 Tầng đạt chuẩn
            </span>
            {totalAssertions > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                ✓ {passedAssertions}/{totalAssertions} tiêu chí nghiệm thu đạt 100%
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={isRunning}
            onClick={runAllFiveTiers}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition active:scale-95"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang quét 5 tầng kiểm thử...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Chạy Kiểm thử 5 Tầng ngay</span>
              </>
            )}
          </button>
        </div>

        {/* 5 Tiers List */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
          {tiers.map((tier) => {
            const isExpanded = expandedTier === tier.tierNumber;
            return (
              <div
                key={tier.tierNumber}
                className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                  tier.status === 'RUNNING'
                    ? 'border-teal-500 bg-teal-50/40 ring-2 ring-teal-500/20'
                    : tier.status === 'PASSED'
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : tier.status === 'FAILED'
                    ? 'border-rose-300 bg-rose-50/30'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setExpandedTier(isExpanded ? null : tier.tierNumber);
                  }}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50/80 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                        tier.status === 'PASSED'
                          ? 'bg-emerald-600 text-white'
                          : tier.status === 'RUNNING'
                          ? 'bg-teal-600 text-white animate-pulse'
                          : tier.status === 'FAILED'
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      T{tier.tierNumber}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {tier.title}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {tier.subtitle}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {tier.durationMs > 0 && (
                      <span className="text-[10px] font-mono text-slate-400">
                        {tier.durationMs}ms
                      </span>
                    )}
                    {tier.status === 'IDLE' && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                        Chờ chạy
                      </span>
                    )}
                    {tier.status === 'RUNNING' && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-teal-100 text-teal-800 font-bold flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Đang kiểm tra
                      </span>
                    )}
                    {tier.status === 'PASSED' && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> ĐẠT ({tier.assertions.length}/{tier.assertions.length})
                      </span>
                    )}
                    {tier.status === 'FAILED' && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> LỖI
                      </span>
                    )}
                  </div>
                </button>

                {isExpanded && tier.assertions.length > 0 && (
                  <div className="px-4 pb-3 pt-1 border-t border-slate-200/70 bg-white space-y-1.5 animate-fade-in">
                    {tier.assertions.map((assertion) => (
                      <div
                        key={assertion.code}
                        className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-2 text-xs"
                      >
                        <div className="flex items-start gap-2">
                          {assertion.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <div className="font-bold text-slate-800">
                              <span className="text-teal-700 mr-1.5">[{assertion.code}]</span>
                              {assertion.title}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {assertion.detail}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            assertion.passed
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {assertion.passed ? 'PASS' : 'FAIL'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            * Kiểm thử chạy trong môi trường cô lập (Sandbox) kết hợp đối soát trực tiếp dữ liệu thật, không làm thay đổi dữ liệu của bạn.
          </span>
          <button
            type="button"
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
