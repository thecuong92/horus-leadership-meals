'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowUpDown,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Download,
  Eye,
  FileSpreadsheet,
  GitCommit,
  Layers,
  LayoutDashboard,
  Plus,
  Printer,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  Utensils,
  Volume2,
  VolumeX,
  Wallet,
  XCircle,
} from 'lucide-react';
import AdminSection from '@/components/AdminSection';
import CommitModal from '@/components/CommitModal';
import MealCalendarView from '@/components/MealCalendarView';
import MealModal from '@/components/MealModal';
import MemberDrilldownModal from '@/components/MemberDrilldownModal';
import ReimbursementSection from '@/components/ReimbursementSection';
import TestingCenterModal from '@/components/TestingCenterModal';
import {
  computeAllMealsReimbursement,
  computeMonthlyReport,
  filterMeals,
  formatDateTimeVN,
  formatDateVN,
  formatVnd,
  getMealDateVN,
} from '@/lib/calculations';
import {
  exportAttachmentsZip,
  exportMonthlyExcel,
  openReimbursementPdfPrintWindow,
} from '@/lib/exporters';
import {
  createCleanProductionState,
  createDemoSampleState,
  createInitialSeedState,
} from '@/lib/seed-data';
import {
  isSoundEnabled,
  playClickSound,
  playSuccessSound,
  setSoundEnabled,
} from '@/lib/sound';
import {
  AppState,
  FilterState,
  MealAttachment,
  MealCostAllocation,
  MealSession,
  Member,
  MemberReportRow,
  ReimbursementBatch,
  ReimbursementItem,
  ReimbursementPayment,
  ReimbursementStatus,
  RoleKey,
} from '@/lib/types';

type NavTab =
  | 'DASHBOARD'
  | 'CALENDAR'
  | 'MEALS'
  | 'MEMBERS_STATS'
  | 'REIMBURSEMENTS'
  | 'EXPORTS'
  | 'ADMIN';

const ROLE_CONFIG: Record<
  RoleKey,
  { label: string; userName: string; badgeClass: string; desc: string }
> = {
  ADMIN: {
    label: 'Admin / Owner (Toàn quyền)',
    userName: 'Doãn Thế Cường (Admin)',
    badgeClass: 'bg-teal-500/20 text-teal-200 border-teal-400/40',
    desc: 'Quản lý chương trình, thành viên, tạo/sửa bữa ăn, duyệt & hoàn ứng',
  },
  PAYER: {
    label: 'Payer / Submitter (Doãn Thế Cường)',
    userName: 'Doãn Thế Cường',
    badgeClass: 'bg-blue-500/20 text-blue-200 border-blue-400/40',
    desc: 'Tạo bữa ăn, tải ảnh thanh toán, gửi đề nghị hoàn ứng',
  },
  FINANCE: {
    label: 'Finance / Kế toán duyệt',
    userName: 'Finance Horus',
    badgeClass: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
    desc: 'Kiểm tra chứng từ, duyệt/trả lại hồ sơ, xác nhận hoàn tiền & xuất báo cáo',
  },
  VIEWER: {
    label: 'Viewer / Leadership (Chỉ xem)',
    userName: 'Ban Lãnh Đạo (Viewer)',
    badgeClass: 'bg-slate-600/40 text-slate-200 border-slate-500/40',
    desc: 'Xem dashboard & thống kê; giới hạn quyền sửa và quyền xem chứng từ nhạy cảm',
  },
};

function shiftMonth(yyyyMm: string, delta: number): string {
  if (!/^\d{4}-\d{2}$/.test(yyyyMm)) return '2026-10';
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const ny = d.getUTCFullYear();
  const nm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}`;
}

export default function HorusMealsApp() {
  const [state, setState] = useState<AppState>(() => createInitialSeedState());
  const [syncStatus, setSyncStatus] = useState<string>('Đang tải dữ liệu...');
  const [activeTab, setActiveTab] = useState<NavTab>('DASHBOARD');
  const [role, setRole] = useState<RoleKey>('ADMIN');
  const [soundOn, setSoundOn] = useState<boolean>(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Bộ lọc đa chiều toàn cục (F07) — Mặc định hiển thị TẤT CẢ trạng thái (kể cả Nháp) để không bị ẩn bữa ăn lưu nháp
  const [filters, setFilters] = useState<FilterState>({
    month: '2026-10',
    programId: 'ALL',
    memberId: 'ALL',
    mealStatusScope: 'ALL',
    reimbursementFilter: 'ALL',
    invoiceFilter: 'ALL',
    payerMemberId: 'ALL',
    venueQuery: '',
    dateFrom: '',
    dateTo: '',
  });

  // Phân trang & Mở rộng dòng siêu gọn cho bảng Bữa ăn
  const [mealPage, setMealPage] = useState<number>(1);
  const [mealPageSize, setMealPageSize] = useState<number>(25);
  const [expandedMealIds, setExpandedMealIds] = useState<string[]>([]);

  // Sắp xếp bảng thống kê thành viên (F08)
  const [memberSortBy, setMemberSortBy] = useState<
    'VISITS' | 'RATE' | 'COST' | 'NAME'
  >('VISITS');
  const [onlyProgramMembersFilter, setOnlyProgramMembersFilter] =
    useState<boolean>(false);

  // Modals
  const [isMealModalOpen, setIsMealModalOpen] = useState<boolean>(false);
  const [editingMeal, setEditingMeal] = useState<MealSession | null>(null);
  const [mealModalPreset, setMealModalPreset] = useState<{
    programId: string;
    dateVN: string;
    timeVN: string;
  } | null>(null);
  const [drilldownMemberRow, setDrilldownMemberRow] =
    useState<MemberReportRow | null>(null);
  const [isCommitModalOpen, setIsCommitModalOpen] = useState<boolean>(false);
  const [isTestingModalOpen, setIsTestingModalOpen] = useState<boolean>(false);
  const [previewLightboxAtt, setPreviewLightboxAtt] =
    useState<MealAttachment | null>(null);

  const currentUserName = ROLE_CONFIG[role].userName;

  useEffect(() => {
    setSoundOn(isSoundEnabled());
  }, []);

  const showToast = useCallback((text: string) => {
    setToastMsg(text);
    setTimeout(() => {
      setToastMsg((prev) => (prev === text ? null : prev));
    }, 3200);
  }, []);

  const fetchStateFromServer = useCallback(
    async (currentRole: RoleKey, showSyncToast = false) => {
      try {
        const res = await fetch(`/api/state?role=${currentRole}&t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.state) {
            setState(data.state);
            setSyncStatus(
              `Cloud Sync (${data.source || 'CLOUDFLARE_D1'} • v${data.state.version})`
            );
            if (showSyncToast) {
              showToast(
                `Đã đồng bộ dữ liệu mới nhất từ Hệ thống chung (v${data.state.version} • ${data.state.meals.length} bữa ăn)`
              );
            }
          }
        }
      } catch {
        setSyncStatus('Offline Mode');
      }
    },
    [showToast]
  );

  // Đồng bộ tự động khi mở trang, khi chuyển qua lại giữa các thiết bị (focus / visibilitychange) và định kỳ mỗi 15 giây
  useEffect(() => {
    fetchStateFromServer(role);

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible' && !isMealModalOpen) {
        fetchStateFromServer(role);
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !isMealModalOpen) {
        fetchStateFromServer(role);
      }
    }, 15000);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.clearInterval(intervalId);
    };
  }, [fetchStateFromServer, role, isMealModalOpen]);

  const persistStateToServer = useCallback(
    async (nextState: AppState, summary?: string, forceReplace = false) => {
      setState(nextState);
      setSyncStatus('Đang đồng bộ lên Cloud...');
      if (summary) {
        showToast(summary);
      }
      try {
        const res = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: nextState,
            role,
            commitMessage: summary,
            forceReplace,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.state) {
            setState(data.state);
          }
          const targets = (data.savedTargets || ['CLOUDFLARE_D1']).join(', ');
          const finalVer = data.state?.version ?? nextState.version;
          setSyncStatus(`Đã đồng bộ Cloud (${targets} • v${finalVer})`);
        } else {
          setSyncStatus('Lưu cục bộ (Chờ Commit)');
        }
      } catch {
        setSyncStatus('Lưu cục bộ (Chờ kết nối)');
      }
    },
    [role, showToast]
  );

  const reimbMap = useMemo(() => computeAllMealsReimbursement(state), [state]);
  const monthlyReport = useMemo(
    () => computeMonthlyReport(state, filters),
    [state, filters]
  );
  const filteredMeals = useMemo(
    () => filterMeals(state, filters, reimbMap),
    [state, filters, reimbMap]
  );

  // Phân trang cho danh sách bữa ăn siêu gọn
  const totalMealPages = Math.max(
    1,
    Math.ceil(filteredMeals.length / mealPageSize)
  );
  const paginatedMeals = useMemo(() => {
    const safePage = Math.min(mealPage, totalMealPages);
    const start = (safePage - 1) * mealPageSize;
    return filteredMeals.slice(start, start + mealPageSize);
  }, [filteredMeals, mealPage, mealPageSize, totalMealPages]);

  const dailyChartData = useMemo(() => {
    const map: Record<
      string,
      { date: string; lunchVnd: number; dinnerVnd: number; count: number }
    > = {};
    const lunchProgIds = new Set(
      state.programs
        .filter((p) => p.code === 'LEADERSHIP_LUNCH')
        .map((p) => p.id)
    );
    for (const m of filteredMeals) {
      const d = getMealDateVN(m.occurredAt);
      if (!map[d]) {
        map[d] = { date: d, lunchVnd: 0, dinnerVnd: 0, count: 0 };
      }
      if (lunchProgIds.has(m.programId)) {
        map[d].lunchVnd += m.totalPaidVnd;
      } else {
        map[d].dinnerVnd += m.totalPaidVnd;
      }
      map[d].count += 1;
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredMeals, state.programs]);

  const sortedMemberRows = useMemo(() => {
    let rows = [...monthlyReport.memberRows];
    if (onlyProgramMembersFilter && filters.programId !== 'ALL') {
      rows = rows.filter((r) => r.programIds.includes(filters.programId));
    }
    rows.sort((a, b) => {
      if (memberSortBy === 'VISITS') {
        if (b.totalAttended !== a.totalAttended)
          return b.totalAttended - a.totalAttended;
        return b.allocatedCostVnd - a.allocatedCostVnd;
      }
      if (memberSortBy === 'RATE') {
        const ra = a.attendanceRatePct ?? -1;
        const rb = b.attendanceRatePct ?? -1;
        if (rb !== ra) return rb - ra;
        return b.totalAttended - a.totalAttended;
      }
      if (memberSortBy === 'COST') {
        if (b.allocatedCostVnd !== a.allocatedCostVnd)
          return b.allocatedCostVnd - a.allocatedCostVnd;
        return b.totalAttended - a.totalAttended;
      }
      return a.member.fullName.localeCompare(b.member.fullName);
    });
    return rows;
  }, [
    monthlyReport.memberRows,
    onlyProgramMembersFilter,
    filters.programId,
    memberSortBy,
  ]);

  const toggleExpandMealRow = (mealId: string) => {
    playClickSound();
    setExpandedMealIds((prev) =>
      prev.includes(mealId)
        ? prev.filter((id) => id !== mealId)
        : [...prev, mealId]
    );
  };

  // ============================================================================
  // Handlers
  // ============================================================================
  const handleSaveMeal = (payload: {
    meal: MealSession;
    attendeeIds: string[];
    allocations: MealCostAllocation[];
    attachments: MealAttachment[];
    newGuests: Member[];
    auditAction: string;
    auditSummary: string;
  }) => {
    const nextState: AppState = {
      ...state,
      members: [...state.members, ...payload.newGuests],
      meals: state.meals.some((m) => m.id === payload.meal.id)
        ? state.meals.map((m) =>
            m.id === payload.meal.id ? payload.meal : m
          )
        : [payload.meal, ...state.meals],
      attendance: [
        ...state.attendance.filter((a) => a.mealId !== payload.meal.id),
        ...Array.from(new Set(payload.attendeeIds)).map((memberId) => ({
          mealId: payload.meal.id,
          memberId,
          attended: true,
        })),
      ],
      allocations: [
        ...state.allocations.filter((al) => al.mealId !== payload.meal.id),
        ...payload.allocations,
      ],
      attachments: [
        ...state.attachments.filter((att) => att.mealId !== payload.meal.id),
        ...payload.attachments,
      ],
      auditLogs: [
        {
          id: `audit-${Date.now()}`,
          actorRole: role,
          actorName: currentUserName,
          entityType: 'MEAL',
          entityId: payload.meal.id,
          action: payload.auditAction,
          summary: payload.auditSummary,
          createdAt: new Date().toISOString(),
        },
        ...state.auditLogs,
      ],
    };

    persistStateToServer(nextState, payload.auditSummary);
  };

  const handleApproveOrRejectMeal = (
    mealId: string,
    decision: 'APPROVED' | 'REJECTED' | 'VOIDED',
    reason?: string
  ) => {
    const targetMeal = state.meals.find((m) => m.id === mealId);
    if (!targetMeal) return;

    if (decision === 'APPROVED') {
      const mealAllocs = state.allocations.filter((a) => a.mealId === mealId);
      const sumAlloc = mealAllocs.reduce((s, a) => s + a.amountVnd, 0);
      if (sumAlloc !== targetMeal.totalPaidVnd) {
        alert(
          `Không thể duyệt: Tổng phân bổ (${formatVnd(sumAlloc)}) không khớp tổng tiền thực chi (${formatVnd(targetMeal.totalPaidVnd)}).`
        );
        return;
      }
      const hasProof = state.attachments.some(
        (att) => att.mealId === mealId && att.type === 'PAYMENT_PROOF'
      );
      if (!hasProof) {
        alert(
          'AC-07: Không thể duyệt bữa ăn chưa có tối thiểu 1 ảnh chứng từ thanh toán.'
        );
        return;
      }
    }

    playSuccessSound();
    const summary = `Chuyển trạng thái bữa ${targetMeal.code} (${targetMeal.venue}) → ${decision}${
      reason ? ` (${reason})` : ''
    }`;

    const nextState: AppState = {
      ...state,
      meals: state.meals.map((m) =>
        m.id === mealId
          ? {
              ...m,
              status: decision,
              rejectionReason:
                decision === 'REJECTED' ? reason : m.rejectionReason,
              updatedBy: currentUserName,
              updatedAt: new Date().toISOString(),
            }
          : m
      ),
      auditLogs: [
        {
          id: `audit-${Date.now()}`,
          actorRole: role,
          actorName: currentUserName,
          entityType: 'MEAL',
          entityId: mealId,
          action: `MEAL_${decision}`,
          summary,
          createdAt: new Date().toISOString(),
        },
        ...state.auditLogs,
      ],
    };

    persistStateToServer(nextState, summary);
  };

  const handleCreateBatch = (payload: {
    batch: ReimbursementBatch;
    items: ReimbursementItem[];
    auditSummary: string;
  }) => {
    playSuccessSound();
    const nextState: AppState = {
      ...state,
      reimbursementBatches: [payload.batch, ...state.reimbursementBatches],
      reimbursementItems: [...state.reimbursementItems, ...payload.items],
      auditLogs: [
        {
          id: `audit-${Date.now()}`,
          actorRole: role,
          actorName: currentUserName,
          entityType: 'BATCH',
          entityId: payload.batch.id,
          action: 'CREATE_REIMBURSEMENT_BATCH',
          summary: payload.auditSummary,
          createdAt: new Date().toISOString(),
        },
        ...state.auditLogs,
      ],
    };
    persistStateToServer(nextState, payload.auditSummary);
  };

  const handleRemoveItemFromBatch = (
    batchId: string,
    itemId: string,
    mealCode: string
  ) => {
    playClickSound();
    const batch = state.reimbursementBatches.find((b) => b.id === batchId);
    const summary = `Loại bỏ bữa ${mealCode} khỏi đợt ${batch?.batchCode || batchId}`;
    const nextState: AppState = {
      ...state,
      reimbursementItems: state.reimbursementItems.filter(
        (it) => it.id !== itemId
      ),
      auditLogs: [
        {
          id: `audit-${Date.now()}`,
          actorRole: role,
          actorName: currentUserName,
          entityType: 'BATCH',
          entityId: batchId,
          action: 'REMOVE_BATCH_ITEM',
          summary,
          createdAt: new Date().toISOString(),
        },
        ...state.auditLogs,
      ],
    };
    persistStateToServer(nextState, summary);
  };

  const handleVoidBatch = (batchId: string, batchCode: string) => {
    playClickSound();
    const summary = `Hủy đợt hoàn ứng chưa thanh toán ${batchCode}`;
    const nextState: AppState = {
      ...state,
      reimbursementBatches: state.reimbursementBatches.map((b) =>
        b.id === batchId ? { ...b, status: 'VOIDED' } : b
      ),
      auditLogs: [
        {
          id: `audit-${Date.now()}`,
          actorRole: role,
          actorName: currentUserName,
          entityType: 'BATCH',
          entityId: batchId,
          action: 'VOID_BATCH',
          summary,
          createdAt: new Date().toISOString(),
        },
        ...state.auditLogs,
      ],
    };
    persistStateToServer(nextState, summary);
  };

  const handleConfirmPayment = (
    payment: ReimbursementPayment,
    updatedBatchStatus: 'PARTIALLY_PAID' | 'PAID',
    auditSummary: string
  ) => {
    if (
      payment.idempotencyKey &&
      state.reimbursementPayments.some(
        (p) => p.idempotencyKey === payment.idempotencyKey
      )
    ) {
      return;
    }
    playSuccessSound();
    const nextState: AppState = {
      ...state,
      reimbursementBatches: state.reimbursementBatches.map((b) =>
        b.id === payment.batchId
          ? {
              ...b,
              status: updatedBatchStatus,
              approvedAt: new Date().toISOString(),
            }
          : b
      ),
      reimbursementPayments: [payment, ...state.reimbursementPayments],
      auditLogs: [
        {
          id: `audit-${Date.now()}`,
          actorRole: role,
          actorName: currentUserName,
          entityType: 'PAYMENT',
          entityId: payment.id,
          action: 'CONFIRM_PAYMENT',
          summary: auditSummary,
          createdAt: new Date().toISOString(),
        },
        ...state.auditLogs,
      ],
    };
    persistStateToServer(nextState, auditSummary);
  };

  const handleImportBackupJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppState;
        if (
          parsed &&
          Array.isArray(parsed.programs) &&
          Array.isArray(parsed.members)
        ) {
          playSuccessSound();
          persistStateToServer(
            parsed,
            'Khôi phục dữ liệu từ file JSON Backup'
          );
        } else {
          alert('File JSON không đúng cấu trúc Horus Leadership Meals.');
        }
      } catch {
        alert('Không thể đọc file JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const renderStatusBadge = (status: MealSession['status']) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
            ✓ Duyệt
          </span>
        );
      case 'SUBMITTED':
        return (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
            Chờ duyệt
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold text-[10px]">
            Nháp
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
            Trả lại
          </span>
        );
      case 'VOIDED':
        return (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold text-[10px]">
            Hủy
          </span>
        );
    }
  };

  const renderReimbBadge = (status: ReimbursementStatus) => {
    switch (status) {
      case 'REIMBURSED':
        return (
          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
            Đã hoàn
          </span>
        );
      case 'PARTIALLY_REIMBURSED':
        return (
          <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 font-bold text-[10px]">
            Hoàn 1 phần
          </span>
        );
      case 'CLAIMED':
        return (
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
            Đang đề nghị
          </span>
        );
      case 'NOT_CLAIMED':
        return (
          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium text-[10px] border border-blue-200">
            Chưa lập đợt
          </span>
        );
      case 'REJECTED_RETURNED':
        return (
          <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-medium text-[10px]">
            Trả lại
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 text-[10px]">
            —
          </span>
        );
    }
  };

  /**
   * Bảng hiển thị danh sách bữa ăn SIÊU GỌN (High-Density Compact Table)
   * Thiết kế chuyên biệt để khi dữ liệu phình lên hàng trăm/nghìn bữa ăn vẫn nhỏ gọn, dễ nhìn.
   */
  const renderCompactMealsTable = (mealsToRender: MealSession[]) => {
    if (mealsToRender.length === 0) {
      return (
        <div className="py-8 px-4 text-center rounded-xl bg-slate-50 border border-dashed border-slate-300 animate-fade-in">
          <Utensils className="w-7 h-7 text-slate-400 mx-auto mb-2" />
          <div className="text-xs font-bold text-slate-700">
            Chưa có bữa ăn nào (Tổng chi phí = 0đ)
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 mb-3">
            Hệ thống đã được làm sạch về 0 để bạn bắt đầu nhập dữ liệu thực tế từ đầu.
          </p>
          {role !== 'VIEWER' && (
            <button
              type="button"
              onClick={() => {
                playClickSound();
                setEditingMeal(null);
                setIsMealModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" /> + Thêm bữa ăn đầu tiên
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/90 text-slate-600 border-b border-slate-200 text-[11px]">
                <th className="py-2 px-2.5 w-8 text-center"></th>
                <th className="py-2 px-2.5">Mã bữa</th>
                <th className="py-2 px-2.5">Ngày giờ (UTC+7)</th>
                <th className="py-2 px-2.5">Chương trình</th>
                <th className="py-2 px-2.5">Địa điểm / Quán ăn</th>
                <th className="py-2 px-2.5 text-center">Có mặt</th>
                <th className="py-2 px-2.5 text-right">Thực chi (VND)</th>
                <th className="py-2 px-2.5 text-center">Chứng từ</th>
                <th className="py-2 px-2.5 text-center">Hồ sơ</th>
                <th className="py-2 px-2.5 text-center">Hoàn ứng</th>
                <th className="py-2 px-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mealsToRender.map((meal) => {
                const prog = state.programs.find((p) => p.id === meal.programId);
                const payer = state.members.find(
                  (m) => m.id === meal.payerMemberId
                );
                const attendeeMembers = state.attendance
                  .filter((a) => a.mealId === meal.id && a.attended)
                  .map((a) => state.members.find((m) => m.id === a.memberId))
                  .filter(Boolean) as Member[];
                const atts = state.attachments.filter(
                  (a) => a.mealId === meal.id
                );
                const rInfo = reimbMap[meal.id];
                const isExpanded = expandedMealIds.includes(meal.id);

                return (
                  <React.Fragment key={meal.id}>
                    <tr
                      className={`hover:bg-teal-50/40 transition ${
                        isExpanded ? 'bg-slate-50/80' : ''
                      }`}
                    >
                      <td className="py-1.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggleExpandMealRow(meal.id)}
                          className="p-1 rounded hover:bg-slate-200 text-slate-500 transition"
                          title="Mở rộng xem nhanh người có mặt & phân bổ"
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-150 ${
                              isExpanded ? 'rotate-180 text-teal-600' : ''
                            }`}
                          />
                        </button>
                      </td>
                      <td
                        onClick={() => {
                          playClickSound();
                          setEditingMeal(meal);
                          setIsMealModalOpen(true);
                        }}
                        className="py-1.5 px-2.5 font-mono font-bold text-[11px] text-slate-900 cursor-pointer hover:text-teal-700 whitespace-nowrap"
                      >
                        {meal.code}
                      </td>
                      <td className="py-1.5 px-2.5 text-[11px] text-slate-600 whitespace-nowrap">
                        {formatDateTimeVN(meal.occurredAt)}
                      </td>
                      <td className="py-1.5 px-2.5 whitespace-nowrap">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            prog?.code === 'LEADERSHIP_LUNCH'
                              ? 'bg-teal-50 text-teal-800 border border-teal-200'
                              : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                          }`}
                        >
                          {prog?.code === 'LEADERSHIP_LUNCH'
                            ? 'Ăn trưa'
                            : 'Tối T5'}
                        </span>
                      </td>
                      <td
                        onClick={() => {
                          playClickSound();
                          setEditingMeal(meal);
                          setIsMealModalOpen(true);
                        }}
                        className="py-1.5 px-2.5 font-semibold text-slate-900 max-w-[200px] truncate cursor-pointer hover:text-teal-700"
                        title={`${meal.venue}${meal.note ? ` — ${meal.note}` : ''}`}
                      >
                        {meal.venue}
                      </td>
                      <td
                        onClick={() => toggleExpandMealRow(meal.id)}
                        className="py-1.5 px-2.5 text-center cursor-pointer"
                        title={attendeeMembers.map((m) => m.fullName).join(', ')}
                      >
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-100 hover:bg-teal-100 text-slate-700 font-bold text-[11px]">
                          {attendeeMembers.length} người
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-extrabold text-slate-900 whitespace-nowrap">
                        {formatVnd(meal.totalPaidVnd)}
                      </td>
                      <td className="py-1.5 px-2.5 text-center whitespace-nowrap">
                        {atts.length === 0 ? (
                          <span className="text-[11px] text-slate-400">—</span>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            {atts.slice(0, 2).map((att) =>
                              att.dataUrl ? (
                                <button
                                  key={att.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playClickSound();
                                    setPreviewLightboxAtt(att);
                                  }}
                                  className="relative group rounded-lg overflow-hidden border-2 border-teal-400 shadow-2xs w-9 h-9 bg-slate-100 hover:scale-110 transition-transform"
                                  title={`Bấm để xem rõ ảnh chuyển khoản: ${att.filename}`}
                                >
                                  <img
                                    src={att.dataUrl}
                                    alt={att.filename}
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ) : null
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                playClickSound();
                                if (atts[0]) {
                                  setPreviewLightboxAtt(atts[0]);
                                }
                              }}
                              className="px-1.5 py-0.5 rounded bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-[10px] font-bold"
                            >
                              🔍 Xem ({atts.length})
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 px-2.5 text-center whitespace-nowrap">
                        {renderStatusBadge(meal.status)}
                      </td>
                      <td className="py-1.5 px-2.5 text-center whitespace-nowrap">
                        {renderReimbBadge(rInfo?.status || 'NOT_ELIGIBLE')}
                      </td>
                      <td className="py-1.5 px-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {(role === 'ADMIN' || role === 'FINANCE') &&
                            meal.status === 'SUBMITTED' && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleApproveOrRejectMeal(meal.id, 'APPROVED')
                                }
                                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold"
                                title="Duyệt nhanh"
                              >
                                Duyệt
                              </button>
                            )}
                          <button
                            type="button"
                            onClick={() => {
                              playClickSound();
                              setEditingMeal(meal);
                              setIsMealModalOpen(true);
                            }}
                            className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
                          >
                            Chi tiết
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Dòng mở rộng siêu gọn (Micro-Drawer) khi người dùng bấm mũi tên */}
                    {isExpanded && (
                      <tr className="bg-slate-50/90 border-b border-slate-200 animate-fade-in">
                        <td colSpan={11} className="px-4 py-3 text-[11px] space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="font-bold text-slate-600 mr-1">
                                Người tham gia & Phân bổ:
                              </span>
                              {attendeeMembers.map((m) => {
                                const al = state.allocations.find(
                                  (x) =>
                                    x.mealId === meal.id && x.memberId === m.id
                                );
                                return (
                                  <span
                                    key={m.id}
                                    className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700"
                                  >
                                    <strong>{m.fullName}</strong>:{' '}
                                    <span className="text-teal-700 font-semibold">
                                      {formatVnd(al?.amountVnd || 0)}
                                    </span>
                                  </span>
                                );
                              })}
                            </div>
                            <div className="text-slate-500">
                              Ứng bởi: <strong>{payer?.fullName}</strong>
                              {meal.note ? ` • Ghi chú: ${meal.note}` : ''}
                            </div>
                          </div>

                          {/* Hiển thị trực tiếp ảnh chuyển khoản rõ nét ngay trong dòng mở rộng */}
                          {atts.length > 0 && (
                            <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-start gap-3">
                              {atts.map((att) => (
                                <div
                                  key={att.id}
                                  onClick={() => {
                                    playClickSound();
                                    setPreviewLightboxAtt(att);
                                  }}
                                  className="rounded-xl bg-white border border-slate-200 p-2 shadow-2xs hover:border-teal-400 cursor-zoom-in transition flex items-center gap-3"
                                >
                                  {att.dataUrl ? (
                                    <img
                                      src={att.dataUrl}
                                      alt={att.filename}
                                      className="h-36 w-auto max-w-[240px] object-contain rounded-lg bg-slate-50 border border-slate-100"
                                    />
                                  ) : null}
                                  <div className="space-y-1 pr-2">
                                    <span className="inline-block px-2 py-0.5 rounded bg-teal-600 text-white text-[10px] font-bold">
                                      Ảnh Chuyển khoản / Bill
                                    </span>
                                    <div className="font-bold text-slate-800 text-xs">
                                      {att.filename}
                                    </div>
                                    <div className="text-[10px] text-teal-700 font-semibold">
                                      🔍 Bấm vào ảnh để phóng to toàn màn hình
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Toast thông báo nổi có animation */}
      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-xl border border-teal-500/40 flex items-center gap-2 animate-slide-up">
          <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* =====================================================================
          TOP HEADER BAR (Gọn, hiện đại, có Bật/Tắt Âm thanh & Kiểm thử 5 Tầng)
         ===================================================================== */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-slate-950 font-black text-base shadow-inner">
              H
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold tracking-tight">
                  HORUS LEADERSHIP MEALS
                </h1>
                <span className="hidden lg:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-teal-300 border border-slate-700 font-medium">
                  <Cloud className="w-3 h-3" /> {syncStatus}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Ăn trưa BOD • Ăn tối Chiến lược Game • Điểm danh & Đối soát Hoàn ứng
              </p>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Nút Bật/Tắt Âm thanh tương tác */}
            <button
              type="button"
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                setSoundEnabled(next);
              }}
              className={`p-1.5 rounded-xl border text-xs transition ${
                soundOn
                  ? 'bg-slate-800 border-teal-500/40 text-teal-300 hover:bg-slate-700'
                  : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:text-slate-300'
              }`}
              title={
                soundOn
                  ? 'Âm thanh tương tác: ĐANG BẬT (Bấm để tắt)'
                  : 'Âm thanh tương tác: ĐANG TẮT (Bấm để bật)'
              }
            >
              {soundOn ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </button>

            {/* Nút Mở Trung tâm Kiểm thử 5 Tầng */}
            <button
              type="button"
              onClick={() => {
                playClickSound();
                setIsTestingModalOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-400/40 text-indigo-200 text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
              title="Mở Trung tâm Kiểm thử Tự động 5 Tầng (AC-01 → AC-20)"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-300" />
              <span className="hidden sm:inline">Kiểm thử 5 Tầng</span>
            </button>

            {/* Chọn vai trò */}
            <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-xl px-2 py-1">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400 mr-1 shrink-0" />
              <select
                value={role}
                onChange={(e) => {
                  playClickSound();
                  setRole(e.target.value as RoleKey);
                }}
                className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
              >
                <option value="ADMIN" className="bg-slate-900 text-white">
                  👑 Admin
                </option>
                <option value="PAYER" className="bg-slate-900 text-white">
                  💳 Payer (Anh Cường)
                </option>
                <option value="FINANCE" className="bg-slate-900 text-white">
                  📋 Finance
                </option>
                <option value="VIEWER" className="bg-slate-900 text-white">
                  👁️ Viewer
                </option>
              </select>
            </div>

            {/* Nút Đồng bộ Đa thiết bị (Cloud Sync Now) */}
            <button
              type="button"
              onClick={() => {
                playClickSound();
                fetchStateFromServer(role, true);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-400/40 text-emerald-300 text-xs font-bold flex items-center gap-1 transition active:scale-95"
              title="Đồng bộ dữ liệu mới nhất giữa Điện thoại / Máy tính (Cloudflare D1)"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Đồng bộ Cloud</span>
            </button>

            {/* Nút Commit Hệ thống */}
            <button
              type="button"
              onClick={() => {
                playClickSound();
                setIsCommitModalOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-teal-500/40 text-teal-300 text-xs font-bold flex items-center gap-1 transition active:scale-95"
            >
              <GitCommit className="w-3.5 h-3.5" />
              <span>Commit (v{state.version})</span>
            </button>

            {/* Nút Thêm bữa ăn */}
            {role !== 'VIEWER' && (
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  setEditingMeal(null);
                  setMealModalPreset(null);
                  setIsMealModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-extrabold flex items-center gap-1 shadow-sm transition active:scale-95"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Thêm bữa ăn</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-950/60 border-t border-slate-800/80">
          <div className="max-w-7xl mx-auto px-3 sm:px-5 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {(
              [
                {
                  id: 'DASHBOARD',
                  label: '1. Tổng quan',
                  icon: LayoutDashboard,
                },
                {
                  id: 'CALENDAR',
                  label: '2. Lịch Note Tiền (Trưa / Tối T5)',
                  icon: Calendar,
                },
                {
                  id: 'MEALS',
                  label: `3. Bảng Bữa ăn (${filteredMeals.length})`,
                  icon: Utensils,
                },
                {
                  id: 'MEMBERS_STATS',
                  label: '4. Thống kê thành viên',
                  icon: Users,
                },
                {
                  id: 'REIMBURSEMENTS',
                  label: '5. Hoàn ứng',
                  icon: Wallet,
                },
                {
                  id: 'EXPORTS',
                  label: '6. Xuất báo cáo',
                  icon: FileSpreadsheet,
                },
                {
                  id: 'ADMIN',
                  label: '7. Quản trị & Audit',
                  icon: Settings,
                },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setActiveTab(tab.id);
                  }}
                  className={`px-3 py-2 text-xs font-bold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition ${
                    active
                      ? 'border-teal-400 text-teal-300 bg-slate-900/60'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* =====================================================================
          COMPACT GLOBAL FILTER BAR (F07)
         ===================================================================== */}
      {activeTab !== 'ADMIN' && (
        <section className="bg-white border-b border-slate-200 shadow-2xs">
          <div className="max-w-7xl mx-auto px-3 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Tháng/Năm */}
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setFilters((f) => ({
                      ...f,
                      month: shiftMonth(
                        f.month === 'ALL' ? '2026-10' : f.month,
                        -1
                      ),
                    }));
                  }}
                  className="p-1 rounded hover:bg-white text-slate-700"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <div className="px-2 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-teal-600" />
                  <input
                    type="month"
                    value={filters.month === 'ALL' ? '2026-10' : filters.month}
                    onChange={(e) => {
                      playClickSound();
                      setFilters((f) => ({
                        ...f,
                        month: e.target.value || '2026-10',
                      }));
                    }}
                    className="bg-transparent text-xs font-extrabold text-slate-900 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setFilters((f) => ({
                      ...f,
                      month: shiftMonth(
                        f.month === 'ALL' ? '2026-10' : f.month,
                        1
                      ),
                    }));
                  }}
                  className="p-1 rounded hover:bg-white text-slate-700"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setFilters((f) => ({
                      ...f,
                      month: f.month === 'ALL' ? '2026-10' : 'ALL',
                    }));
                  }}
                  className={`ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    filters.month === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  Tất cả
                </button>
              </div>

              {/* Chương trình */}
              <select
                value={filters.programId}
                onChange={(e) => {
                  playClickSound();
                  setFilters((f) => ({ ...f, programId: e.target.value }));
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800"
              >
                <option value="ALL">Chương trình: Tất cả</option>
                {state.programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.shortName}
                  </option>
                ))}
              </select>

              {/* Nhân sự */}
              <select
                value={filters.memberId}
                onChange={(e) => {
                  playClickSound();
                  setFilters((f) => ({ ...f, memberId: e.target.value }));
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800"
              >
                <option value="ALL">Nhân sự: Tất cả ({state.members.length})</option>
                {state.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </select>

              {/* Trạng thái */}
              <select
                value={filters.mealStatusScope}
                onChange={(e) => {
                  playClickSound();
                  setFilters((f) => ({
                    ...f,
                    mealStatusScope: e.target
                      .value as FilterState['mealStatusScope'],
                  }));
                }}
                className="px-2.5 py-1.5 rounded-lg border border-teal-200 bg-teal-50/70 text-xs font-bold text-teal-900"
              >
                <option value="OPERATIONAL">Đã gửi + Đã duyệt</option>
                <option value="APPROVED_ONLY">Chỉ Đã duyệt</option>
                <option value="SUBMITTED">Chờ duyệt</option>
                <option value="DRAFT">Bản Nháp</option>
                <option value="ALL">Mọi trạng thái</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  exportMonthlyExcel(state, filters, currentUserName, role);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  openReimbursementPdfPrintWindow(state, {
                    filters,
                    includeAttachmentImages: true,
                    exporterName: currentUserName,
                    role,
                  });
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          MAIN CONTENT
         ===================================================================== */}
      <main className="max-w-7xl mx-auto w-full px-3 sm:px-5 py-4 flex-1 space-y-4">
        {/* HỘP HIỂN THỊ BỮA ĂN LƯU NHÁP (NẾU CÓ) ĐỂ KIỂM TRA & CHỐT 1-CHẠM */}
        {state.meals.some((m) => m.status === 'DRAFT') && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 shadow-2xs animate-slide-up">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-amber-600 text-white text-[11px] font-extrabold">
                  📝 BẢN LƯU NHÁP ({state.meals.filter((m) => m.status === 'DRAFT').length})
                </span>
                <span className="text-xs font-bold text-amber-950">
                  Các bữa ăn bạn đã bấm &ldquo;Lưu nháp&rdquo; nằm ngay tại đây — chỉ cần 1 ảnh chuyển khoản là đủ chốt chính thức!
                </span>
              </div>
              {role !== 'VIEWER' && (
                <button
                  type="button"
                  onClick={() => {
                    playSuccessSound();
                    const draftIds = new Set(
                      state.meals.filter((m) => m.status === 'DRAFT').map((m) => m.id)
                    );
                    const nextState: AppState = {
                      ...state,
                      version: state.version + 1,
                      meals: state.meals.map((m) =>
                        draftIds.has(m.id)
                          ? {
                              ...m,
                              status: 'APPROVED',
                              updatedAt: new Date().toISOString(),
                              updatedBy: currentUserName,
                            }
                          : m
                      ),
                      attachments: state.attachments.map((att) =>
                        draftIds.has(att.mealId)
                          ? { ...att, type: 'PAYMENT_PROOF' }
                          : att
                      ),
                    };
                    persistStateToServer(
                      nextState,
                      `Đã chốt chính thức ${draftIds.size} bữa ăn từ Lưu nháp!`
                    );
                  }}
                  className="px-3 py-1 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold shadow-xs transition active:scale-95"
                >
                  ✓ Chốt chính thức tất cả ({state.meals.filter((m) => m.status === 'DRAFT').length} bữa)
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {state.meals
                .filter((m) => m.status === 'DRAFT')
                .map((draftMeal) => {
                  const mealAtts = state.attachments.filter(
                    (a) => a.mealId === draftMeal.id
                  );
                  const attCount = mealAtts.length;
                  const attPeople = state.attendance.filter(
                    (a) => a.mealId === draftMeal.id && a.attended
                  ).length;
                  return (
                    <div
                      key={draftMeal.id}
                      className="bg-white rounded-xl border border-amber-200 p-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {mealAtts[0]?.dataUrl && (
                          <div
                            onClick={() => {
                              playClickSound();
                              setPreviewLightboxAtt(mealAtts[0]);
                            }}
                            className="relative w-24 h-24 rounded-xl overflow-hidden border-2 border-teal-400 bg-slate-50 shrink-0 cursor-zoom-in group shadow-xs"
                            title="Bấm để phóng to ảnh chuyển khoản toàn màn hình"
                          >
                            <img
                              src={mealAtts[0].dataUrl}
                              alt={mealAtts[0].filename}
                              className="w-full h-full object-contain p-0.5 group-hover:scale-105 transition-transform"
                            />
                            <span className="absolute bottom-0 inset-x-0 bg-slate-900/80 text-white text-[9px] font-bold text-center py-0.5">
                              🔍 Phóng to
                            </span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                            <span className="text-amber-700">{draftMeal.code}</span>
                            <span>•</span>
                            <span className="truncate">{draftMeal.venue}</span>
                            <span>•</span>
                            <span className="text-teal-700">
                              {formatVnd(draftMeal.totalPaidVnd)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Ngày: {formatDateTimeVN(draftMeal.occurredAt)} • {attPeople} người ăn •{' '}
                            {attCount} ảnh đính kèm
                          </div>
                          {mealAtts[0] && (
                            <button
                              type="button"
                              onClick={() => {
                                playClickSound();
                                setPreviewLightboxAtt(mealAtts[0]);
                              }}
                              className="mt-1.5 px-2 py-0.5 rounded bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-[10px] font-bold inline-flex items-center gap-1"
                            >
                              🔍 Xem rõ ảnh CK ({mealAtts[0].filename})
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            playClickSound();
                            setEditingMeal(draftMeal);
                            setMealModalPreset(null);
                            setIsMealModalOpen(true);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 text-[11px] font-bold"
                        >
                          Xem / Sửa
                        </button>
                        {role !== 'VIEWER' && (
                          <button
                            type="button"
                            onClick={() => {
                              playSuccessSound();
                              const nextState: AppState = {
                                ...state,
                                version: state.version + 1,
                                meals: state.meals.map((m) =>
                                  m.id === draftMeal.id
                                    ? {
                                        ...m,
                                        status: 'APPROVED',
                                        updatedAt: new Date().toISOString(),
                                        updatedBy: currentUserName,
                                      }
                                    : m
                                ),
                                attachments: state.attachments.map((att) =>
                                  att.mealId === draftMeal.id
                                    ? { ...att, type: 'PAYMENT_PROOF' }
                                    : att
                                ),
                              };
                              persistStateToServer(
                                nextState,
                                `Đã chốt chính thức bữa ăn ${draftMeal.code} (${draftMeal.venue})!`
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
                          >
                            ✓ Chốt luôn
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 1: TỔNG QUAN THÁNG (Gọn, có animation & đối soát)
           =================================================================== */}
        {activeTab === 'DASHBOARD' && (
          <div className="space-y-4 animate-slide-up">
            {/* 8 Compact KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white rounded-xl p-3 border border-slate-200 kpi-card-hover">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                  <span>1. Tổng chi phí nhóm</span>
                  <Wallet className="w-3.5 h-3.5 text-teal-600" />
                </div>
                <div className="text-xl font-black text-slate-900 mt-1">
                  {formatVnd(monthlyReport.totalGroupCostVnd)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex justify-between">
                  <span>Trưa: {formatVnd(monthlyReport.lunchCostVnd)}</span>
                  <span>Tối: {formatVnd(monthlyReport.dinnerCostVnd)}</span>
                </div>
              </div>

              <div
                onClick={() => {
                  playClickSound();
                  setActiveTab('MEALS');
                }}
                className="bg-white rounded-xl p-3 border border-slate-200 kpi-card-hover cursor-pointer"
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                  <span>2. Số bữa ăn thực tế</span>
                  <Utensils className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div className="text-xl font-black text-slate-900 mt-1">
                  {monthlyReport.totalMeals} bữa
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex justify-between">
                  <span>
                    Trưa: {monthlyReport.lunchMeals} • Tối:{' '}
                    {monthlyReport.dinnerMeals}
                  </span>
                  <span>BQ: {formatVnd(monthlyReport.avgCostPerMealVnd)}</span>
                </div>
              </div>

              <div
                onClick={() => {
                  playClickSound();
                  setActiveTab('MEMBERS_STATS');
                }}
                className="bg-white rounded-xl p-3 border border-slate-200 kpi-card-hover cursor-pointer"
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                  <span>3. Tổng lượt tham gia</span>
                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <div className="text-xl font-black text-slate-900 mt-1">
                  {monthlyReport.totalAttendanceVisits} lượt
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex justify-between">
                  <span>{monthlyReport.uniqueAttendeesCount} người</span>
                  <span>BQ: {formatVnd(monthlyReport.avgCostPerVisitVnd)}</span>
                </div>
              </div>

              <div className="bg-white rounded-xl p-3 border border-slate-200 kpi-card-hover">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                  <span>4. Không có HĐ VAT</span>
                  <Receipt className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="text-xl font-black text-slate-900 mt-1">
                  {formatVnd(monthlyReport.costWithoutInvoiceVnd)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex justify-between">
                  <span>{monthlyReport.mealsWithoutInvoiceCount} bữa</span>
                  <span className="text-emerald-700 font-semibold">
                    Có HĐ: {formatVnd(monthlyReport.costWithInvoiceVnd)}
                  </span>
                </div>
              </div>

              <div
                onClick={() => {
                  playClickSound();
                  setActiveTab('REIMBURSEMENTS');
                }}
                className="bg-white rounded-xl p-3 border border-slate-200 kpi-card-hover cursor-pointer"
              >
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  5. Đã ứng (Doãn Thế Cường)
                </div>
                <div className="text-xl font-black text-slate-900 mt-1">
                  {formatVnd(monthlyReport.payerTotalAdvancedVnd)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Đủ ĐK hoàn: {formatVnd(monthlyReport.payerApprovedEligibleVnd)}
                </div>
              </div>

              <div
                onClick={() => {
                  playClickSound();
                  setActiveTab('REIMBURSEMENTS');
                }}
                className="bg-white rounded-xl p-3 border border-amber-200 kpi-card-hover cursor-pointer"
              >
                <div className="text-[10px] font-bold uppercase text-amber-800">
                  6. Đang đề nghị hoàn
                </div>
                <div className="text-xl font-black text-amber-700 mt-1">
                  {formatVnd(monthlyReport.payerClaimedPendingVnd)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Đã lập đợt, chờ chuyển tiền
                </div>
              </div>

              <div
                onClick={() => {
                  playClickSound();
                  setActiveTab('REIMBURSEMENTS');
                }}
                className="bg-white rounded-xl p-3 border border-emerald-200 kpi-card-hover cursor-pointer"
              >
                <div className="text-[10px] font-bold uppercase text-emerald-800">
                  7. Công ty đã hoàn
                </div>
                <div className="text-xl font-black text-emerald-700 mt-1">
                  {formatVnd(monthlyReport.payerReimbursedForPeriodMealsVnd)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Đã xác nhận giao dịch UNC
                </div>
              </div>

              <div
                onClick={() => {
                  playClickSound();
                  setActiveTab('REIMBURSEMENTS');
                }}
                className="bg-rose-50/60 rounded-xl p-3 border border-rose-200 kpi-card-hover cursor-pointer"
              >
                <div className="text-[10px] font-bold uppercase text-rose-800">
                  8. Công ty còn phải hoàn
                </div>
                <div className="text-xl font-black text-rose-700 mt-1">
                  {formatVnd(monthlyReport.payerRemainingBalanceVnd)}
                </div>
                <div className="text-[11px] text-rose-700 mt-0.5">
                  = Đủ ĐK hoàn − Đã hoàn
                </div>
              </div>
            </div>

            {/* Lịch Note Tiền (2 Màu: Xanh Teal Ăn trưa & Tím Indigo Ăn tối Thứ 5 + Cảnh báo ngày sót) */}
            <MealCalendarView
              state={state}
              month={filters.month}
              role={role}
              onShiftMonth={(delta) =>
                setFilters((f) => ({
                  ...f,
                  month: shiftMonth(f.month === 'ALL' ? '2026-10' : f.month, delta),
                }))
              }
              onSelectMeal={(meal) => {
                setEditingMeal(meal);
                setMealModalPreset(null);
                setIsMealModalOpen(true);
              }}
              onQuickAddMealForDate={(preset) => {
                setEditingMeal(null);
                setMealModalPreset(preset);
                setIsMealModalOpen(true);
              }}
            />

            {/* Bữa ăn gần nhất (Siêu gọn) & Thống kê nhân sự */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Cột trái: Danh sách bữa ăn siêu gọn */}
              <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Bữa ăn trong kỳ ({filteredMeals.length})
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                      Giao diện Bảng siêu gọn
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      setActiveTab('MEALS');
                    }}
                    className="text-xs font-bold text-teal-700 hover:underline"
                  >
                    Xem tất cả →
                  </button>
                </div>

                {renderCompactMealsTable(filteredMeals.slice(0, 10))}
              </div>

              {/* Cột phải: Thống kê 8 thành viên BOD gọn */}
              <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Thống kê 8 Thành viên BOD (Bấm để xem)
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      setActiveTab('MEMBERS_STATS');
                    }}
                    className="text-xs font-bold text-teal-700 hover:underline"
                  >
                    Chi tiết →
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 text-[11px]">
                        <th className="py-1.5 px-2.5">Thành viên</th>
                        <th className="py-1.5 px-2 text-center">Lượt</th>
                        <th className="py-1.5 px-2 text-center">Tỷ lệ</th>
                        <th className="py-1.5 px-2.5 text-right">Phân bổ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {monthlyReport.memberRows.map((row) => (
                        <tr
                          key={row.member.id}
                          onClick={() => {
                            playClickSound();
                            setDrilldownMemberRow(row);
                          }}
                          className="hover:bg-teal-50/50 cursor-pointer transition"
                        >
                          <td className="py-1.5 px-2.5">
                            <div className="font-bold text-slate-900">
                              {row.member.fullName}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {row.member.title || 'Thành viên'}
                            </div>
                          </td>
                          <td className="py-1.5 px-2 text-center font-bold text-slate-800">
                            {row.totalAttended}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            {row.attendanceRatePct !== null ? (
                              <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 font-bold text-[10px]">
                                {row.totalAttended}/{row.eligibleSessions} (
                                {row.attendanceRatePct}%)
                              </span>
                            ) : (
                              <span className="text-slate-400 font-bold">—</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-bold text-indigo-700">
                            {formatVnd(row.allocatedCostVnd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 1B: LỊCH NOTE TIỀN (2 MÀU + KIỂM TRA SÓT NGÀY TRONG TUẦN / THÁNG)
           =================================================================== */}
        {activeTab === 'CALENDAR' && (
          <div className="space-y-4 animate-slide-up">
            <MealCalendarView
              state={state}
              month={filters.month}
              role={role}
              onShiftMonth={(delta) =>
                setFilters((f) => ({
                  ...f,
                  month: shiftMonth(f.month === 'ALL' ? '2026-10' : f.month, delta),
                }))
              }
              onSelectMeal={(meal) => {
                setEditingMeal(meal);
                setMealModalPreset(null);
                setIsMealModalOpen(true);
              }}
              onQuickAddMealForDate={(preset) => {
                setEditingMeal(null);
                setMealModalPreset(preset);
                setIsMealModalOpen(true);
              }}
            />
          </div>
        )}

        {/* ===================================================================
            TAB 2: BỮA ĂN — CHẾ ĐỘ BẢNG SIÊU GỌN MẬT ĐỘ CAO + PHÂN TRANG
           =================================================================== */}
        {activeTab === 'MEALS' && (
          <div className="space-y-3 animate-slide-up">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
              {/* Thanh công cụ gọn trên 1 hàng */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900">
                    Danh sách Bữa ăn Siêu gọn ({filteredMeals.length} bữa • Tổng:{' '}
                    <span className="text-teal-700">
                      {formatVnd(monthlyReport.totalGroupCostVnd)}
                    </span>
                    )
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                    <input
                      type="text"
                      placeholder="Tìm quán, mã bữa, số tiền..."
                      value={filters.venueQuery}
                      onChange={(e) => {
                        setMealPage(1);
                        setFilters((f) => ({ ...f, venueQuery: e.target.value }));
                      }}
                      className="w-48 sm:w-60 pl-8 pr-2.5 py-1 rounded-lg border border-slate-300 text-xs"
                    />
                  </div>

                  <select
                    value={mealPageSize}
                    onChange={(e) => {
                      setMealPage(1);
                      setMealPageSize(Number(e.target.value));
                    }}
                    className="px-2 py-1 rounded-lg border border-slate-300 text-xs bg-slate-50 font-semibold"
                  >
                    <option value={15}>15 dòng/trang</option>
                    <option value={25}>25 dòng/trang</option>
                    <option value={50}>50 dòng/trang</option>
                    <option value={100}>100 dòng/trang</option>
                  </select>

                  {role !== 'VIEWER' && (
                    <button
                      type="button"
                      onClick={() => {
                        playClickSound();
                        setEditingMeal(null);
                        setIsMealModalOpen(true);
                      }}
                      className="px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm bữa
                    </button>
                  )}
                </div>
              </div>

              {/* Bảng dữ liệu mật độ cao */}
              {renderCompactMealsTable(paginatedMeals)}

              {/* Thanh phân trang gọn */}
              {filteredMeals.length > mealPageSize && (
                <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Hiển thị trang <strong>{mealPage}</strong> /{' '}
                    <strong>{totalMealPages}</strong> ({filteredMeals.length} bữa ăn)
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={mealPage <= 1}
                      onClick={() => {
                        playClickSound();
                        setMealPage((p) => Math.max(1, p - 1));
                      }}
                      className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40 font-semibold"
                    >
                      ← Trước
                    </button>
                    <button
                      type="button"
                      disabled={mealPage >= totalMealPages}
                      onClick={() => {
                        playClickSound();
                        setMealPage((p) => Math.min(totalMealPages, p + 1));
                      }}
                      className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40 font-semibold"
                    >
                      Sau →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 3: THỐNG KÊ THÀNH VIÊN (Mục 7.3 & F08)
           =================================================================== */}
        {activeTab === 'MEMBERS_STATS' && (
          <div className="space-y-4 animate-slide-up">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Bảng Xếp hạng Tần suất Tham gia, Tỷ lệ & Chi phí Phân bổ Cá nhân (F08)
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Bấm vào một nhân sự để xem danh sách các bữa ăn cụ thể trong kỳ.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {filters.programId !== 'ALL' && (
                    <label className="inline-flex items-center gap-1.5 text-xs bg-slate-100 px-2.5 py-1 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={onlyProgramMembersFilter}
                        onChange={(e) =>
                          setOnlyProgramMembersFilter(e.target.checked)
                        }
                        className="rounded text-teal-600"
                      />
                      Chỉ nhân sự thuộc chương trình đang xem
                    </label>
                  )}

                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
                    {(
                      [
                        { id: 'VISITS', label: 'Số lượt' },
                        { id: 'RATE', label: 'Tỷ lệ %' },
                        { id: 'COST', label: 'Chi phí' },
                        { id: 'NAME', label: 'Tên' },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          playClickSound();
                          setMemberSortBy(s.id);
                        }}
                        className={`px-2 py-1 rounded-md text-[11px] font-bold transition ${
                          memberSortBy === s.id
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:bg-white'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 text-[11px]">
                      <th className="py-2 px-3 text-center w-10">#</th>
                      <th className="py-2 px-3">Nhân sự</th>
                      <th className="py-2 px-3">Chức danh</th>
                      <th className="py-2 px-3 text-center">Ăn trưa</th>
                      <th className="py-2 px-3 text-center">Ăn tối</th>
                      <th className="py-2 px-3 text-center">Tần suất</th>
                      <th className="py-2 px-3 text-center">
                        Tỷ lệ (Tham dự / Đủ ĐK)
                      </th>
                      <th className="py-2 px-3 text-right">Chi phí phân bổ</th>
                      <th className="py-2 px-3 text-right">TB / lượt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedMemberRows.map((row, idx) => (
                      <tr
                        key={row.member.id}
                        onClick={() => {
                          playClickSound();
                          setDrilldownMemberRow(row);
                        }}
                        className="hover:bg-teal-50/60 cursor-pointer transition"
                      >
                        <td className="py-2 px-3 text-center font-bold text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">
                          {row.member.fullName}
                        </td>
                        <td className="py-2 px-3 text-slate-500">
                          {row.member.title || (
                            <span className="italic text-slate-400">
                              Chưa cung cấp
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center font-semibold text-teal-700">
                          {row.lunchAttended}
                        </td>
                        <td className="py-2 px-3 text-center font-semibold text-indigo-700">
                          {row.dinnerAttended}
                        </td>
                        <td className="py-2 px-3 text-center font-extrabold text-slate-900">
                          {row.totalAttended} lần
                        </td>
                        <td className="py-2 px-3 text-center">
                          {row.attendanceRatePct !== null ? (
                            <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold text-[11px]">
                              {row.totalAttended}/{row.eligibleSessions} —{' '}
                              {row.attendanceRatePct}%
                            </span>
                          ) : (
                            <span className="text-slate-400 font-bold">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-extrabold text-indigo-700">
                          {formatVnd(row.allocatedCostVnd)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600">
                          {formatVnd(row.avgCostPerVisitVnd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 4: HOÀN ỨNG (F11)
           =================================================================== */}
        {activeTab === 'REIMBURSEMENTS' && (
          <div className="animate-slide-up">
            <ReimbursementSection
              state={state}
              filters={filters}
              role={role}
              currentUserName={currentUserName}
              onCreateBatch={handleCreateBatch}
              onRemoveItemFromBatch={handleRemoveItemFromBatch}
              onVoidBatch={handleVoidBatch}
              onConfirmPayment={handleConfirmPayment}
              onInspectMeal={(meal) => {
                setEditingMeal(meal);
                setIsMealModalOpen(true);
              }}
            />
          </div>
        )}

        {/* ===================================================================
            TAB 5: BÁO CÁO & XUẤT FILE (F12)
           =================================================================== */}
        {activeTab === 'EXPORTS' && (
          <div className="space-y-4 animate-slide-up">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <h2 className="text-base font-bold text-slate-900">
                Trung tâm Xuất Báo cáo Kế toán, Bảng kê Hoàn ứng & Lưu trữ Chứng từ (F12)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Phiên bản dữ liệu hiện tại: <code>v{state.version}</code> • Chống cộng trùng 3 hệ số liệu.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 flex flex-col justify-between space-y-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      1. Xuất Excel (.xlsx) 4 Sheet (AC-16)
                    </h3>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Gồm 4 sheet: <code>Tong_quan_thang</code>, <code>Danh_sach_bua_an</code>, <code>Thong_ke_nhan_su</code>, <code>Hoan_ung</code>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      exportMonthlyExcel(state, filters, currentUserName, role);
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Tải xuống Excel (.xlsx)
                  </button>
                </div>

                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 flex flex-col justify-between space-y-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      2. Xuất PDF Bảng kê Hoàn ứng A4 (AC-17)
                    </h3>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Bảng kê trình ký hoàn ứng chuẩn A4 kèm khung chữ ký và phụ lục ảnh chứng từ.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      openReimbursementPdfPrintWindow(state, {
                        filters,
                        includeAttachmentImages: true,
                        exporterName: currentUserName,
                        role,
                      });
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" /> In / Lưu PDF Bảng kê
                  </button>
                </div>

                <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 flex flex-col justify-between space-y-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      3. Xuất Gói ZIP Ảnh Chứng từ
                    </h3>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Đóng gói ảnh thanh toán & hóa đơn kèm <code>manifest.csv</code> và <code>manifest.json</code>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      exportAttachmentsZip(state, {
                        filters,
                        exporterName: currentUserName,
                        role,
                      });
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Archive className="w-3.5 h-3.5" /> Tải xuống ZIP Chứng từ
                  </button>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700">
                  Sao lưu & Khôi phục JSON Toàn hệ thống:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      const blob = new Blob([JSON.stringify(state, null, 2)], {
                        type: 'application/json',
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `horus_meals_backup_v${state.version}.json`;
                      a.click();
                    }}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> Xuất JSON
                  </button>
                  {role !== 'VIEWER' && (
                    <label className="px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800 cursor-pointer flex items-center gap-1">
                      <Upload className="w-3.5 h-3.5" /> Nhập JSON
                      <input
                        type="file"
                        accept="application/json"
                        onChange={handleImportBackupJson}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 6: QUẢN TRỊ & AUDIT LOG
           =================================================================== */}
        {activeTab === 'ADMIN' && (
          <div className="animate-slide-up">
            <AdminSection
              state={state}
              role={role}
              currentUserName={currentUserName}
              onUpdateState={(updater, summary) => {
                playSuccessSound();
                const updated = updater(state);
                updated.auditLogs = [
                  {
                    id: `audit-${Date.now()}`,
                    actorRole: role,
                    actorName: currentUserName,
                    entityType: 'SETTINGS',
                    entityId: 'admin',
                    action: 'ADMIN_CONFIG_UPDATE',
                    summary,
                    createdAt: new Date().toISOString(),
                  },
                  ...updated.auditLogs,
                ];
                persistStateToServer(updated, summary);
              }}
              onResetToSampleData={() => {
                playSuccessSound();
                const demo = createDemoSampleState();
                demo.version = state.version + 1;
                persistStateToServer(
                  demo,
                  'Đã nạp bộ dữ liệu mẫu Demo tháng 10/2026',
                  true
                );
              }}
              onClearTransactionsOnly={() => {
                playSuccessSound();
                const clean = createCleanProductionState(state);
                persistStateToServer(
                  clean,
                  'Đã xóa sạch toàn bộ bữa ăn & hoàn ứng về 0đ (Giữ 8 thành viên BOD)',
                  true
                );
              }}
            />
          </div>
        )}
      </main>

      {/* Modals */}
      <MealModal
        isOpen={isMealModalOpen}
        onClose={() => {
          setIsMealModalOpen(false);
          setMealModalPreset(null);
        }}
        state={state}
        role={role}
        currentUserName={currentUserName}
        editingMeal={editingMeal}
        initialPreset={mealModalPreset}
        onSaveMeal={handleSaveMeal}
        onApproveOrRejectMeal={handleApproveOrRejectMeal}
      />

      <MemberDrilldownModal
        row={drilldownMemberRow}
        state={state}
        monthLabel={filters.month === 'ALL' ? 'Toàn thời gian' : filters.month}
        onClose={() => setDrilldownMemberRow(null)}
        onInspectMeal={(meal) => {
          setEditingMeal(meal);
          setIsMealModalOpen(true);
        }}
      />

      <CommitModal
        isOpen={isCommitModalOpen}
        onClose={() => setIsCommitModalOpen(false)}
        state={state}
        role={role}
        currentUserName={currentUserName}
        onCommitted={(updatedState) => {
          playSuccessSound();
          setState(updatedState);
          setSyncStatus(`Đã Commit v${updatedState.version} lên Hệ thống`);
        }}
      />

      <TestingCenterModal
        isOpen={isTestingModalOpen}
        onClose={() => setIsTestingModalOpen(false)}
        liveState={state}
        currentFilters={filters}
      />

      {/* Lightbox Phóng to Ảnh Chuyển khoản / Hóa đơn Toàn màn hình */}
      {previewLightboxAtt && (
        <div
          onClick={() => setPreviewLightboxAtt(null)}
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full p-4 shadow-2xl border border-slate-200 animate-scale-in flex flex-col max-h-[92vh]"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2 py-0.5 rounded bg-teal-600 text-white text-xs font-extrabold shrink-0">
                  {previewLightboxAtt.type === 'PAYMENT_PROOF'
                    ? 'Ảnh Chuyển khoản'
                    : 'Ảnh Hóa đơn / Bill'}
                </span>
                <span className="text-sm font-bold text-slate-900 truncate">
                  {previewLightboxAtt.filename}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewLightboxAtt(null)}
                className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold shrink-0"
              >
                ✕ Đóng
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-slate-900/5 rounded-xl p-2 flex items-center justify-center min-h-[280px]">
              {previewLightboxAtt.dataUrl ? (
                <img
                  src={previewLightboxAtt.dataUrl}
                  alt={previewLightboxAtt.filename}
                  className="max-h-[78vh] w-auto object-contain rounded-lg shadow-sm"
                />
              ) : (
                <div className="py-12 text-slate-500 text-xs">
                  Không có dữ liệu ảnh hiển thị.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
