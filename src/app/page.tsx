'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowUpDown,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  GitCommit,
  LayoutDashboard,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  Utensils,
  Wallet,
  XCircle,
} from 'lucide-react';
import AdminSection from '@/components/AdminSection';
import CommitModal from '@/components/CommitModal';
import MealModal from '@/components/MealModal';
import MemberDrilldownModal from '@/components/MemberDrilldownModal';
import ReimbursementSection from '@/components/ReimbursementSection';
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
  createInitialSeedState,
} from '@/lib/seed-data';
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
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string>('Đang tải dữ liệu...');
  const [activeTab, setActiveTab] = useState<NavTab>('DASHBOARD');
  const [role, setRole] = useState<RoleKey>('ADMIN');

  // Bộ lọc đa chiều toàn cục (F07)
  const [filters, setFilters] = useState<FilterState>({
    month: '2026-10',
    programId: 'ALL',
    memberId: 'ALL',
    mealStatusScope: 'OPERATIONAL', // Mặc định: SUBMITTED + APPROVED (F07)
    reimbursementFilter: 'ALL',
    invoiceFilter: 'ALL',
    payerMemberId: 'ALL',
    venueQuery: '',
    dateFrom: '',
    dateTo: '',
  });

  // Sắp xếp bảng thống kê thành viên (F08)
  const [memberSortBy, setMemberSortBy] = useState<
    'VISITS' | 'RATE' | 'COST' | 'NAME'
  >('VISITS');
  const [onlyProgramMembersFilter, setOnlyProgramMembersFilter] =
    useState<boolean>(false);

  // Modals
  const [isMealModalOpen, setIsMealModalOpen] = useState<boolean>(false);
  const [editingMeal, setEditingMeal] = useState<MealSession | null>(null);
  const [drilldownMemberRow, setDrilldownMemberRow] =
    useState<MemberReportRow | null>(null);
  const [isCommitModalOpen, setIsCommitModalOpen] = useState<boolean>(false);

  const currentUserName = ROLE_CONFIG[role].userName;

  // Tải trạng thái từ Server API khi mở trang hoặc đổi vai trò
  const fetchStateFromServer = useCallback(async (currentRole: RoleKey) => {
    try {
      const res = await fetch(`/api/state?role=${currentRole}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state) {
          setState(data.state);
          setSyncStatus(
            `Đã đồng bộ (${data.source || 'SERVER_DB'} • v${data.state.version})`
          );
        }
      }
    } catch {
      setSyncStatus('Chế độ Offline / Bộ nhớ trình duyệt');
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchStateFromServer(role);
  }, [fetchStateFromServer, role]);

  // Hàm lưu tự động lên Server mỗi khi có thao tác nghiệp vụ
  const persistStateToServer = useCallback(
    async (nextState: AppState, summary?: string) => {
      setState(nextState);
      setSyncStatus('Đang lưu lên hệ thống...');
      try {
        const res = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: nextState,
            role,
            commitMessage: summary,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const targets = (data.savedTargets || ['SERVER_DB']).join(', ');
          setSyncStatus(`Đã lưu tự động (${targets} • v${nextState.version})`);
        } else {
          setSyncStatus('Lưu cục bộ (Chờ Commit)');
        }
      } catch {
        setSyncStatus('Lưu cục bộ (Chờ kết nối Server)');
      }
    },
    [role]
  );

  // Tính toán toàn bộ báo cáo tháng & trạng thái hoàn ứng
  const reimbMap = useMemo(() => computeAllMealsReimbursement(state), [state]);
  const monthlyReport = useMemo(
    () => computeMonthlyReport(state, filters),
    [state, filters]
  );
  const filteredMeals = useMemo(
    () => filterMeals(state, filters, reimbMap),
    [state, filters, reimbMap]
  );

  // Dữ liệu biểu đồ theo ngày trong tháng
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

  // Danh sách nhân sự đã sắp xếp theo lựa chọn trên trang Thống kê thành viên
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

  // ============================================================================
  // Handlers cho các thao tác nghiệp vụ
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

    // Kiểm tra ràng buộc Mục 8.1 trước khi duyệt: SUM(allocations) == total_paid_vnd & có >=1 ảnh chứng từ TT
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

    const summary = `Chuyển trạng thái bữa ăn ${targetMeal.code} (${targetMeal.venue}) từ ${targetMeal.status} → ${decision}${
      reason ? ` (Lý do: ${reason})` : ''
    }`;

    const nextState: AppState = {
      ...state,
      meals: state.meals.map((m) =>
        m.id === mealId
          ? {
              ...m,
              status: decision,
              rejectionReason: decision === 'REJECTED' ? reason : m.rejectionReason,
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
    const batch = state.reimbursementBatches.find((b) => b.id === batchId);
    const summary = `Loại bỏ bữa ăn ${mealCode} khỏi đợt hoàn ứng ${batch?.batchCode || batchId}`;
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
    // Kiểm tra idempotency key tránh bấm 2 lần
    if (
      payment.idempotencyKey &&
      state.reimbursementPayments.some(
        (p) => p.idempotencyKey === payment.idempotencyKey
      )
    ) {
      return;
    }

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
        if (parsed && Array.isArray(parsed.programs) && Array.isArray(parsed.members)) {
          persistStateToServer(parsed, 'Khôi phục dữ liệu từ file JSON Backup');
          alert('Đã nhập dữ liệu sao lưu thành công!');
        } else {
          alert('File JSON không đúng cấu trúc dữ liệu Horus Leadership Meals.');
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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
            <CheckCircle2 className="w-3 h-3" /> Đã duyệt
          </span>
        );
      case 'SUBMITTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[11px]">
            <Clock className="w-3 h-3" /> Chờ duyệt
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold text-[11px]">
            Nháp
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">
            <XCircle className="w-3 h-3" /> Trả lại
          </span>
        );
      case 'VOIDED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold text-[11px]">
            Đã hủy
          </span>
        );
    }
  };

  const renderReimbBadge = (status: ReimbursementStatus) => {
    switch (status) {
      case 'REIMBURSED':
        return (
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
            ✓ Đã hoàn đủ
          </span>
        );
      case 'PARTIALLY_REIMBURSED':
        return (
          <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold text-[11px]">
            Hoàn 1 phần
          </span>
        );
      case 'CLAIMED':
        return (
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">
            Đang đề nghị
          </span>
        );
      case 'NOT_CLAIMED':
        return (
          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold text-[11px] border border-blue-200">
            Chưa lập đợt
          </span>
        );
      case 'REJECTED_RETURNED':
        return (
          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold text-[11px]">
            Hồ sơ trả lại
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px]">
            Chưa đủ ĐK
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* =====================================================================
          TOP HEADER BAR
         ===================================================================== */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-slate-950 font-black text-lg shadow-inner">
              H
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold tracking-tight">
                  HORUS LEADERSHIP MEALS
                </h1>
                <span className="hidden md:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-teal-300 border border-slate-700 font-medium">
                  <Cloud className="w-3 h-3" /> {syncStatus}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Quản lý Ăn trưa BOD • Ăn tối Chiến lược Game • Điểm danh & Đối soát Hoàn ứng
              </p>
            </div>
          </div>

          {/* Right Controls: Role Switcher + Commit Button + Add Meal Button */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Bộ chọn vai trò trực tiếp (Không cần mật khẩu theo yêu cầu) */}
            <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-xl px-2.5 py-1.5">
              <ShieldCheck className="w-4 h-4 text-teal-400 mr-1.5 shrink-0" />
              <span className="text-[11px] text-slate-400 mr-1.5 hidden sm:inline">
                Vai trò:
              </span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as RoleKey)}
                className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
              >
                <option value="ADMIN" className="bg-slate-900 text-white">
                  👑 Admin / Owner (Toàn quyền)
                </option>
                <option value="PAYER" className="bg-slate-900 text-white">
                  💳 Payer (Doãn Thế Cường)
                </option>
                <option value="FINANCE" className="bg-slate-900 text-white">
                  📋 Finance / Kế toán duyệt
                </option>
                <option value="VIEWER" className="bg-slate-900 text-white">
                  👁️ Viewer / Leadership (Chỉ xem)
                </option>
              </select>
            </div>

            {/* Nút Commit lên hệ thống */}
            <button
              type="button"
              onClick={() => setIsCommitModalOpen(true)}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-teal-500/40 text-teal-300 text-xs font-bold flex items-center gap-1.5 transition"
              title="Commit và đồng bộ dữ liệu lên hệ thống Git / Cloud Database"
            >
              <GitCommit className="w-4 h-4" />
              <span>Commit Hệ thống (v{state.version})</span>
            </button>

            {/* Nút Thêm bữa ăn nhanh */}
            {role !== 'VIEWER' && (
              <button
                type="button"
                onClick={() => {
                  setEditingMeal(null);
                  setIsMealModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Thêm bữa ăn</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs (6 menu chính theo Mục 7.1 PRD) */}
        <div className="bg-slate-950/60 border-t border-slate-800/80">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {(
              [
                {
                  id: 'DASHBOARD',
                  label: '1. Tổng quan tháng',
                  icon: LayoutDashboard,
                },
                {
                  id: 'MEALS',
                  label: `2. Bữa ăn (${filteredMeals.length})`,
                  icon: Utensils,
                },
                {
                  id: 'MEMBERS_STATS',
                  label: '3. Thống kê thành viên',
                  icon: Users,
                },
                {
                  id: 'REIMBURSEMENTS',
                  label: '4. Hoàn ứng & Công nợ',
                  icon: Wallet,
                },
                {
                  id: 'EXPORTS',
                  label: '5. Báo cáo & Xuất file',
                  icon: FileSpreadsheet,
                },
                {
                  id: 'ADMIN',
                  label: '6. Quản trị & Audit',
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
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2.5 text-xs font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition ${
                    active
                      ? 'border-teal-400 text-teal-300 bg-slate-900/60'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* =====================================================================
          GLOBAL FILTER BAR (F07: Bộ lọc đa chiều bắt buộc)
         ===================================================================== */}
      {activeTab !== 'ADMIN' && (
        <section className="bg-white border-b border-slate-200 shadow-2xs">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2.5">
            {/* Bộ chọn Tháng/Năm (UTC+7) */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      month: shiftMonth(
                        f.month === 'ALL' ? '2026-10' : f.month,
                        -1
                      ),
                    }))
                  }
                  className="p-1.5 rounded-lg hover:bg-white text-slate-700 transition"
                  title="Tháng trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="px-2.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-teal-600" />
                  <input
                    type="month"
                    value={filters.month === 'ALL' ? '2026-10' : filters.month}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        month: e.target.value || '2026-10',
                      }))
                    }
                    className="bg-transparent text-xs font-extrabold text-slate-900 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      month: shiftMonth(
                        f.month === 'ALL' ? '2026-10' : f.month,
                        1
                      ),
                    }))
                  }
                  className="p-1.5 rounded-lg hover:bg-white text-slate-700 transition"
                  title="Tháng sau"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      month: f.month === 'ALL' ? '2026-10' : 'ALL',
                    }))
                  }
                  className={`ml-1 px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                    filters.month === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  Tất cả kỳ
                </button>
              </div>

              {/* Bộ lọc Chương trình */}
              <select
                value={filters.programId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, programId: e.target.value }))
                }
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800"
              >
                <option value="ALL">Chương trình: Tất cả (Gộp)</option>
                {state.programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.shortName}
                  </option>
                ))}
              </select>

              {/* Bộ lọc Nhân sự */}
              <select
                value={filters.memberId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, memberId: e.target.value }))
                }
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800"
              >
                <option value="ALL">Nhân sự: Tất cả ({state.members.length})</option>
                {state.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} {m.title ? `(${m.title})` : ''}
                  </option>
                ))}
              </select>

              {/* Phạm vi trạng thái hồ sơ (F07: Mặc định Đã gửi + Đã duyệt) */}
              <select
                value={filters.mealStatusScope}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    mealStatusScope: e.target.value as FilterState['mealStatusScope'],
                  }))
                }
                className="px-3 py-2 rounded-xl border border-teal-200 bg-teal-50/70 text-xs font-bold text-teal-900"
              >
                <option value="OPERATIONAL">
                  Nguồn: Đã gửi + Đã duyệt (Mặc định)
                </option>
                <option value="APPROVED_ONLY">Chỉ bữa Đã duyệt (APPROVED)</option>
                <option value="SUBMITTED">Chỉ bữa Chờ duyệt (SUBMITTED)</option>
                <option value="DRAFT">Chỉ bản Nháp (DRAFT)</option>
                <option value="REJECTED">Bữa bị trả lại (REJECTED)</option>
                <option value="ALL">Mọi trạng thái (Kể cả Nháp/Hủy)</option>
              </select>

              {/* Lọc tình trạng hoàn ứng */}
              <select
                value={filters.reimbursementFilter}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    reimbursementFilter:
                      e.target.value as FilterState['reimbursementFilter'],
                  }))
                }
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
              >
                <option value="ALL">Hoàn ứng: Tất cả</option>
                <option value="NOT_CLAIMED">Chưa đưa vào đợt</option>
                <option value="CLAIMED">Đang đề nghị hoàn</option>
                <option value="PARTIALLY_REIMBURSED">Đã hoàn 1 phần</option>
                <option value="REIMBURSED">Đã hoàn đủ</option>
              </select>

              {/* Lọc hóa đơn */}
              <select
                value={filters.invoiceFilter}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    invoiceFilter: e.target.value as FilterState['invoiceFilter'],
                  }))
                }
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
              >
                <option value="ALL">Hóa đơn: Tất cả</option>
                <option value="HAS_INVOICE">Có hóa đơn VAT</option>
                <option value="NO_INVOICE">Không có hóa đơn</option>
              </select>
            </div>

            {/* Nút Xuất nhanh Excel & PDF */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  exportMonthlyExcel(state, filters, currentUserName, role)
                }
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Xuất Excel (4 Sheet)</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  openReimbursementPdfPrintWindow(state, {
                    filters,
                    includeAttachmentImages: true,
                    exporterName: currentUserName,
                    role,
                  })
                }
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Xuất PDF</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          MAIN CONTENT CONTAINER
         ===================================================================== */}
      <main className="max-w-7xl mx-auto w-full px-3 sm:px-6 py-5 flex-1">
        {/* ===================================================================
            TAB 1: TỔNG QUAN THÁNG (DASHBOARD - Mục 7.2, F08, F09)
           =================================================================== */}
        {activeTab === 'DASHBOARD' && (
          <div className="space-y-6">
            {/* Banner thông tin nguồn dữ liệu mặc định (F07) */}
            <div className="px-4 py-2.5 rounded-xl bg-teal-950 text-teal-100 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 font-bold border border-teal-400/30">
                  Múi giờ chuẩn: Asia/Ho_Chi_Minh (UTC+7)
                </span>
                <span>
                  Nguồn dữ liệu đang hiển thị:{' '}
                  <strong>
                    {filters.mealStatusScope === 'OPERATIONAL'
                      ? 'Bữa ăn Đã gửi (SUBMITTED) + Đã duyệt (APPROVED)'
                      : filters.mealStatusScope}
                  </strong>{' '}
                  • Kỳ: <strong>{filters.month === 'ALL' ? 'Toàn thời gian' : `Tháng ${filters.month}`}</strong>
                </span>
              </div>
              <div className="text-[11px] text-teal-300">
                Tổng thực chi nhóm, phân bổ cá nhân và hoàn ứng được tách bạch chống tính trùng (Mục 6.2 PRD)
              </div>
            </div>

            {/* 8 KPI Cards (Mục 7.2 & F09) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Card 1: Tổng chi phí thực chi của nhóm */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    1. Tổng chi phí nhóm
                  </span>
                  <span className="p-2 rounded-xl bg-teal-50 text-teal-600">
                    <Wallet className="w-4 h-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1.5">
                  {formatVnd(monthlyReport.totalGroupCostVnd)}
                </div>
                <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
                  <span>Trưa: {formatVnd(monthlyReport.lunchCostVnd)}</span>
                  <span>Tối T5: {formatVnd(monthlyReport.dinnerCostVnd)}</span>
                </div>
              </div>

              {/* Card 2: Số bữa ăn & Bình quân/bữa */}
              <div
                onClick={() => setActiveTab('MEALS')}
                className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs cursor-pointer hover:border-teal-400 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    2. Số bữa ăn thực tế
                  </span>
                  <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
                    <Utensils className="w-4 h-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1.5">
                  {monthlyReport.totalMeals} bữa
                </div>
                <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
                  <span>
                    Trưa: {monthlyReport.lunchMeals} • Tối: {monthlyReport.dinnerMeals}
                  </span>
                  <span className="font-semibold text-slate-700">
                    BQ: {formatVnd(monthlyReport.avgCostPerMealVnd)}/bữa
                  </span>
                </div>
              </div>

              {/* Card 3: Tổng lượt tham gia & Bình quân/lượt */}
              <div
                onClick={() => setActiveTab('MEMBERS_STATS')}
                className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs cursor-pointer hover:border-teal-400 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    3. Tổng lượt tham gia
                  </span>
                  <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                    <Users className="w-4 h-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1.5">
                  {monthlyReport.totalAttendanceVisits} lượt
                </div>
                <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
                  <span>{monthlyReport.uniqueAttendeesCount} người duy nhất</span>
                  <span className="font-semibold text-indigo-700">
                    BQ: {formatVnd(monthlyReport.avgCostPerVisitVnd)}/lượt
                  </span>
                </div>
              </div>

              {/* Card 4: Chi phí có / không có hóa đơn */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    4. Hóa đơn chứng từ
                  </span>
                  <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
                    <Receipt className="w-4 h-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1.5">
                  {formatVnd(monthlyReport.costWithoutInvoiceVnd)}
                </div>
                <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
                  <span>{monthlyReport.mealsWithoutInvoiceCount} bữa không HĐ VAT</span>
                  <span className="text-emerald-700 font-semibold">
                    Có HĐ: {formatVnd(monthlyReport.costWithInvoiceVnd)}
                  </span>
                </div>
              </div>

              {/* Card 5: Đã ứng của Doãn Thế Cường */}
              <div
                onClick={() => setActiveTab('REIMBURSEMENTS')}
                className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs cursor-pointer hover:border-teal-400 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    5. Tiền anh Cường đã ứng
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    Theo kỳ phát sinh
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1.5">
                  {formatVnd(monthlyReport.payerTotalAdvancedVnd)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Đủ ĐK hoàn (Đã duyệt):{' '}
                  <strong className="text-slate-800">
                    {formatVnd(monthlyReport.payerApprovedEligibleVnd)}
                  </strong>
                </div>
              </div>

              {/* Card 6: Đang đề nghị hoàn */}
              <div
                onClick={() => setActiveTab('REIMBURSEMENTS')}
                className="bg-white rounded-2xl p-4 border border-amber-200/80 shadow-2xs cursor-pointer hover:border-amber-400 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                    6. Đang đề nghị hoàn
                  </span>
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-2xl font-black text-amber-700 mt-1.5">
                  {formatVnd(monthlyReport.payerClaimedPendingVnd)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Đã lập đợt bảng kê, chờ công ty chuyển khoản
                </div>
              </div>

              {/* Card 7: Đã hoàn xác nhận */}
              <div
                onClick={() => setActiveTab('REIMBURSEMENTS')}
                className="bg-white rounded-2xl p-4 border border-emerald-200/80 shadow-2xs cursor-pointer hover:border-emerald-400 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    7. Công ty đã hoàn
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-black text-emerald-700 mt-1.5">
                  {formatVnd(monthlyReport.payerReimbursedForPeriodMealsVnd)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Dòng tiền chuyển trong tháng:{' '}
                  <strong>{formatVnd(monthlyReport.payerReimbursedInPeriodVnd)}</strong>
                </div>
              </div>

              {/* Card 8: Còn phải hoàn (Dư nợ) */}
              <div
                onClick={() => setActiveTab('REIMBURSEMENTS')}
                className="bg-rose-50/60 rounded-2xl p-4 border border-rose-200 shadow-2xs cursor-pointer hover:border-rose-400 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">
                    8. Công ty còn phải hoàn
                  </span>
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                </div>
                <div className="text-2xl font-black text-rose-700 mt-1.5">
                  {formatVnd(monthlyReport.payerRemainingBalanceVnd)}
                </div>
                <div className="text-xs text-rose-700 mt-1">
                  = Đủ điều kiện hoàn − Đã hoàn xác nhận
                </div>
              </div>
            </div>

            {/* Biểu đồ trực quan: Chi phí theo ngày & So sánh Ăn trưa vs Ăn tối */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Biểu đồ 1: Chi phí theo ngày diễn ra bữa ăn */}
              <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-teal-600" />
                      Biểu đồ Chi phí theo Ngày diễn ra bữa ăn trong kỳ
                    </h3>
                    <p className="text-xs text-slate-500">
                      Tách màu giữa Ăn trưa (Leadership Lunch) và Ăn tối thứ Năm (Game Strategy Dinner)
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-teal-600 inline-block" /> Ăn trưa
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-indigo-600 inline-block" /> Ăn tối T5
                    </span>
                  </div>
                </div>

                {dailyChartData.length === 0 ? (
                  <div className="h-44 flex items-center justify-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                    Không có bữa ăn nào trong bộ lọc hiện tại.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {dailyChartData.map((d) => {
                      const totalDay = d.lunchVnd + d.dinnerVnd;
                      const maxRef = Math.max(
                        ...dailyChartData.map((x) => x.lunchVnd + x.dinnerVnd),
                        1
                      );
                      const lunchPct = Math.round((d.lunchVnd / maxRef) * 100);
                      const dinnerPct = Math.round((d.dinnerVnd / maxRef) * 100);
                      return (
                        <div key={d.date} className="grid grid-cols-12 items-center gap-2 text-xs">
                          <div className="col-span-3 sm:col-span-2 font-semibold text-slate-700">
                            {formatDateVN(d.date)}
                          </div>
                          <div className="col-span-6 sm:col-span-7 bg-slate-100 rounded-lg h-6 flex overflow-hidden p-0.5">
                            {d.lunchVnd > 0 && (
                              <div
                                style={{ width: `${Math.max(lunchPct, 6)}%` }}
                                className="bg-teal-600 h-full rounded-l-md transition-all"
                                title={`Ăn trưa: ${formatVnd(d.lunchVnd)}`}
                              />
                            )}
                            {d.dinnerVnd > 0 && (
                              <div
                                style={{ width: `${Math.max(dinnerPct, 6)}%` }}
                                className="bg-indigo-600 h-full rounded-r-md transition-all"
                                title={`Ăn tối: ${formatVnd(d.dinnerVnd)}`}
                              />
                            )}
                          </div>
                          <div className="col-span-3 text-right font-bold text-slate-900">
                            {formatVnd(totalDay)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Biểu đồ 2: Cơ cấu Ăn trưa vs Ăn tối & Kiểm tra cân đối (Mục 13.1) */}
              <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-2">
                    So sánh 2 Chương trình trong kỳ
                  </h3>
                  <div className="space-y-2.5">
                    <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200">
                      <div className="flex justify-between text-xs font-bold text-teal-900">
                        <span>Leadership Lunch (Ăn trưa)</span>
                        <span>{monthlyReport.lunchMeals} bữa</span>
                      </div>
                      <div className="text-lg font-extrabold text-teal-700 mt-0.5">
                        {formatVnd(monthlyReport.lunchCostVnd)}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200">
                      <div className="flex justify-between text-xs font-bold text-indigo-900">
                        <span>Game Strategy Dinner (Tối T5)</span>
                        <span>{monthlyReport.dinnerMeals} bữa</span>
                      </div>
                      <div className="text-lg font-extrabold text-indigo-700 mt-0.5">
                        {formatVnd(monthlyReport.dinnerCostVnd)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bộ kiểm tra cân đối mỗi tháng (Mục 13.1) */}
                <div className="pt-3 border-t border-slate-200">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                    Kiểm tra cân đối tự động (Mục 13.1 PRD)
                  </div>
                  <div className="space-y-1.5">
                    {monthlyReport.balanceChecks.map((chk) => (
                      <div
                        key={chk.id}
                        className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200"
                        title={chk.detail}
                      >
                        <span className="text-slate-700 truncate pr-2">{chk.label}</span>
                        {chk.passed ? (
                          <span className="text-emerald-700 font-bold shrink-0">✓ Khớp</span>
                        ) : (
                          <span className="text-rose-700 font-bold shrink-0">! Lệch</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Bảng Thống kê Nhân sự tóm tắt ngay trên Dashboard (Mục 7.2) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Thống kê Tham gia & Chi phí Phân bổ theo Nhân sự (Bấm vào từng người để xem chi tiết bữa ăn)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tỷ lệ tham gia = Số buổi tham gia / Số buổi thực tế diễn ra trong thời gian thành viên có hiệu lực.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('MEMBERS_STATS')}
                  className="text-xs font-bold text-teal-700 hover:underline"
                >
                  Mở trang phân tích nhân sự đầy đủ →
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                      <th className="py-2.5 px-3">Họ và tên</th>
                      <th className="py-2.5 px-3">Chức danh</th>
                      <th className="py-2.5 px-3 text-center">Ăn trưa</th>
                      <th className="py-2.5 px-3 text-center">Ăn tối</th>
                      <th className="py-2.5 px-3 text-center">Tổng lượt</th>
                      <th className="py-2.5 px-3 text-center">Đủ ĐK (Mẫu số)</th>
                      <th className="py-2.5 px-3 text-center">Tỷ lệ tham gia</th>
                      <th className="py-2.5 px-3 text-right">Chi phí phân bổ</th>
                      <th className="py-2.5 px-3 text-right">BQ / lượt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {monthlyReport.memberRows.map((row) => (
                      <tr
                        key={row.member.id}
                        onClick={() => setDrilldownMemberRow(row)}
                        className="hover:bg-teal-50/50 cursor-pointer transition"
                      >
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {row.member.fullName}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {row.member.title || (
                            <span className="italic text-slate-400">Chưa cung cấp</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-medium">
                          {row.lunchAttended}
                        </td>
                        <td className="py-2.5 px-3 text-center font-medium">
                          {row.dinnerAttended}
                        </td>
                        <td className="py-2.5 px-3 text-center font-extrabold text-slate-900">
                          {row.totalAttended} lượt
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-600">
                          {row.eligibleSessions} buổi
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {row.attendanceRatePct !== null ? (
                            <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold">
                              {row.totalAttended}/{row.eligibleSessions} — {row.attendanceRatePct}%
                            </span>
                          ) : (
                            <span className="text-slate-400 font-bold">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-indigo-700">
                          {formatVnd(row.allocatedCostVnd)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">
                          {formatVnd(row.avgCostPerVisitVnd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bảng Bữa ăn gần nhất trên Dashboard (Mục 7.2) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Bữa ăn trong kỳ ({filteredMeals.length} bữa)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Bấm vào một bữa ăn để xem chi tiết điểm danh, phân bổ từng người, ảnh chứng từ hoặc phê duyệt.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('MEALS')}
                  className="text-xs font-bold text-teal-700 hover:underline"
                >
                  Quản lý toàn bộ bữa ăn →
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                      <th className="py-2.5 px-3">Mã / Ngày giờ (UTC+7)</th>
                      <th className="py-2.5 px-3">Chương trình</th>
                      <th className="py-2.5 px-3">Địa điểm / Quán</th>
                      <th className="py-2.5 px-3">Người tham gia</th>
                      <th className="py-2.5 px-3 text-right">Tổng tiền</th>
                      <th className="py-2.5 px-3 text-center">Chứng từ</th>
                      <th className="py-2.5 px-3 text-center">Trạng thái</th>
                      <th className="py-2.5 px-3 text-center">Hoàn ứng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredMeals.map((meal) => {
                      const prog = state.programs.find((p) => p.id === meal.programId);
                      const attendees = state.attendance.filter(
                        (a) => a.mealId === meal.id && a.attended
                      );
                      const atts = state.attachments.filter((a) => a.mealId === meal.id);
                      const rInfo = reimbMap[meal.id];
                      return (
                        <tr
                          key={meal.id}
                          onClick={() => {
                            setEditingMeal(meal);
                            setIsMealModalOpen(true);
                          }}
                          className="hover:bg-slate-50 cursor-pointer transition"
                        >
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{meal.code}</div>
                            <div className="text-[11px] text-slate-500">
                              {formatDateTimeVN(meal.occurredAt)}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                prog?.code === 'LEADERSHIP_LUNCH'
                                  ? 'bg-teal-50 text-teal-800'
                                  : 'bg-indigo-50 text-indigo-800'
                              }`}
                            >
                              {prog?.shortName || meal.programId}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{meal.venue}</div>
                            {meal.note && (
                              <div className="text-[11px] text-slate-500 truncate max-w-xs">
                                {meal.note}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-700">
                            {attendees.length} người
                          </td>
                          <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">
                            {formatVnd(meal.totalPaidVnd)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                              {atts.length} file
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {renderStatusBadge(meal.status)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {renderReimbBadge(rInfo?.status || 'NOT_ELIGIBLE')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 2: QUẢN LÝ BỮA ĂN & TRA CỨU LỊCH SỬ CHI TIẾT (F03, F04, F05, F10)
           =================================================================== */}
        {activeTab === 'MEALS' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Danh sách Bữa ăn & Tra cứu Lịch sử Chi tiết ({filteredMeals.length} bữa)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Tìm kiếm theo tên quán, mã bữa, ghi chú, số tiền hoặc lọc khoảng ngày cụ thể.
                  </p>
                </div>

                {role !== 'VIEWER' && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMeal(null);
                      setIsMealModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 self-start"
                  >
                    <Plus className="w-4 h-4" />
                    Thêm bữa ăn mới
                  </button>
                )}
              </div>

              {/* Thanh tìm kiếm chi tiết (F10) */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 mb-4">
                <div className="sm:col-span-6 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Tìm tên quán, mã bữa (VD: B-202610-001), nội dung ghi chú, số tiền..."
                    value={filters.venueQuery}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, venueQuery: e.target.value }))
                    }
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
                <div className="sm:col-span-3 flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                    Từ ngày:
                  </span>
                  <input
                    type="date"
                    value={filters.dateFrom || ''}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, dateFrom: e.target.value }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
                <div className="sm:col-span-3 flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                    Đến ngày:
                  </span>
                  <input
                    type="date"
                    value={filters.dateTo || ''}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, dateTo: e.target.value }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
              </div>

              {filteredMeals.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                  Không tìm thấy bữa ăn nào khớp với bộ lọc hiện tại.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredMeals.map((meal) => {
                    const prog = state.programs.find((p) => p.id === meal.programId);
                    const payer = state.members.find(
                      (m) => m.id === meal.payerMemberId
                    );
                    const attendeeMembers = state.attendance
                      .filter((a) => a.mealId === meal.id && a.attended)
                      .map((a) =>
                        state.members.find((m) => m.id === a.memberId)
                      )
                      .filter(Boolean) as Member[];
                    const atts = state.attachments.filter(
                      (a) => a.mealId === meal.id
                    );
                    const rInfo = reimbMap[meal.id];

                    return (
                      <div
                        key={meal.id}
                        className="p-4 rounded-2xl border border-slate-200 hover:border-teal-400 bg-white transition shadow-2xs"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-white text-xs font-extrabold">
                                {meal.code}
                              </span>
                              <span
                                className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                                  prog?.code === 'LEADERSHIP_LUNCH'
                                    ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                    : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                                }`}
                              >
                                {prog?.shortName}
                              </span>
                              {renderStatusBadge(meal.status)}
                              {renderReimbBadge(rInfo?.status || 'NOT_ELIGIBLE')}
                              <span className="text-xs text-slate-500">
                                🕒 {formatDateTimeVN(meal.occurredAt)} (UTC+7)
                              </span>
                            </div>

                            <div className="text-base font-bold text-slate-900 pt-0.5">
                              {meal.venue}
                            </div>

                            {meal.note && (
                              <div className="text-xs text-slate-600">{meal.note}</div>
                            )}

                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <span className="text-[11px] font-bold text-slate-500">
                                Có mặt ({attendeeMembers.length}):
                              </span>
                              {attendeeMembers.map((m) => (
                                <span
                                  key={m.id}
                                  className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium"
                                >
                                  {m.fullName}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-2 shrink-0 border-t lg:border-t-0 pt-2.5 lg:pt-0 border-slate-100">
                            <div className="text-right">
                              <div className="text-lg font-black text-teal-700">
                                {formatVnd(meal.totalPaidVnd)}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Ứng bởi: <strong>{payer?.fullName}</strong> •{' '}
                                {atts.length} chứng từ
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {(role === 'ADMIN' || role === 'FINANCE') &&
                                meal.status === 'SUBMITTED' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleApproveOrRejectMeal(meal.id, 'APPROVED')
                                    }
                                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Duyệt ngay
                                  </button>
                                )}

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMeal(meal);
                                  setIsMealModalOpen(true);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Xem / Sửa
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 3: THỐNG KÊ THÀNH VIÊN (Mục 7.3 & F08)
           =================================================================== */}
        {activeTab === 'MEMBERS_STATS' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Bảng Xếp hạng Tần suất Tham gia, Tỷ lệ & Chi phí Phân bổ Cá nhân (F08)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Bấm vào bất kỳ nhân sự nào để mở <strong>Hồ sơ thống kê tháng</strong> và danh sách các bữa ăn cụ thể của người đó.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {filters.programId !== 'ALL' && (
                    <label className="inline-flex items-center gap-1.5 text-xs bg-slate-100 px-3 py-1.5 rounded-xl cursor-pointer">
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

                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
                    {(
                      [
                        { id: 'VISITS', label: 'Theo số lượt' },
                        { id: 'RATE', label: 'Theo tỷ lệ %' },
                        { id: 'COST', label: 'Theo chi phí' },
                        { id: 'NAME', label: 'Theo tên' },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setMemberSortBy(s.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
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
                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                      <th className="py-3 px-3 text-center w-12">Hạng</th>
                      <th className="py-3 px-3">Nhân sự</th>
                      <th className="py-3 px-3">Chức danh</th>
                      <th className="py-3 px-3 text-center">Số buổi Trưa</th>
                      <th className="py-3 px-3 text-center">Số buổi Tối</th>
                      <th className="py-3 px-3 text-center">Tần suất tháng</th>
                      <th className="py-3 px-3 text-center">
                        Tỷ lệ tham gia (Tham dự / Đủ ĐK)
                      </th>
                      <th className="py-3 px-3 text-right">Chi phí phân bổ</th>
                      <th className="py-3 px-3 text-right">Chi phí TB / lượt</th>
                      <th className="py-3 px-3 text-center">Drill-down</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedMemberRows.map((row, idx) => (
                      <tr
                        key={row.member.id}
                        onClick={() => setDrilldownMemberRow(row)}
                        className="hover:bg-teal-50/60 cursor-pointer transition"
                      >
                        <td className="py-3 px-3 text-center font-bold text-slate-500">
                          #{idx + 1}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-900">
                          {row.member.fullName}
                        </td>
                        <td className="py-3 px-3 text-slate-500">
                          {row.member.title || (
                            <span className="italic text-slate-400">
                              Chưa cung cấp
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-teal-700">
                          {row.lunchAttended}
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-indigo-700">
                          {row.dinnerAttended}
                        </td>
                        <td className="py-3 px-3 text-center font-extrabold text-slate-900">
                          {row.totalAttended} lần / tháng
                        </td>
                        <td className="py-3 px-3 text-center">
                          {row.attendanceRatePct !== null ? (
                            <div className="inline-flex items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold">
                                {row.totalAttended}/{row.eligibleSessions} buổi —{' '}
                                {row.attendanceRatePct}%
                              </span>
                            </div>
                          ) : (
                            <span
                              className="text-slate-400 font-bold"
                              title="Chưa có buổi đủ điều kiện (mẫu số = 0)"
                            >
                              —
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-extrabold text-indigo-700">
                          {formatVnd(row.allocatedCostVnd)}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-600">
                          {formatVnd(row.avgCostPerVisitVnd)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-teal-600 hover:text-white text-slate-700 font-semibold transition"
                          >
                            Xem bữa ăn
                          </button>
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
            TAB 4: QUẢN LÝ HOÀN ỨNG & ĐỐI SOÁT CÔNG NỢ (F11)
           =================================================================== */}
        {activeTab === 'REIMBURSEMENTS' && (
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
        )}

        {/* ===================================================================
            TAB 5: BÁO CÁO & XUẤT FILE (F12: Excel 4 Sheet, PDF A4, ZIP Chứng từ)
           =================================================================== */}
        {activeTab === 'EXPORTS' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
              <h2 className="text-lg font-bold text-slate-900">
                Trung tâm Xuất Báo cáo Kế toán, Bảng kê Hoàn ứng & Lưu trữ Chứng từ (F12)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Tất cả file xuất đều tự động đính kèm thời điểm xuất, bộ lọc áp dụng, người xuất, phiên bản dữ liệu <code>v{state.version}</code> và quy tắc chống cộng trùng.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
                {/* Box 1: Excel 4 sheets */}
                <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/40 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center mb-3">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">
                      1. Xuất Bảng kê Excel (.xlsx) chuẩn 4 Sheet (AC-16)
                    </h3>
                    <ul className="text-xs text-slate-600 space-y-1 mt-2 list-disc list-inside">
                      <li>
                        <code>Tong_quan_thang</code>: KPI & Bộ kiểm tra cân đối
                      </li>
                      <li>
                        <code>Danh_sach_bua_an</code>: Chi tiết từng bữa & chứng từ
                      </li>
                      <li>
                        <code>Thong_ke_nhan_su</code>: Lượt, tỷ lệ & phân bổ cá nhân
                      </li>
                      <li>
                        <code>Hoan_ung</code>: Đợt hoàn, giao dịch & dư nợ
                      </li>
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      exportMonthlyExcel(state, filters, currentUserName, role)
                    }
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    Tải xuống Excel (.xlsx)
                  </button>
                </div>

                {/* Box 2: PDF Bảng kê trình ký */}
                <div className="p-5 rounded-2xl border border-blue-200 bg-blue-50/40 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center mb-3">
                      <Printer className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">
                      2. Xuất PDF Bảng kê Hoàn ứng & Phụ lục Chứng từ (AC-17)
                    </h3>
                    <p className="text-xs text-slate-600 mt-2">
                      Định dạng trang in A4 gồm bảng tổng hợp theo kỳ, danh sách các khoản ứng của anh Doãn Thế Cường, chữ ký Người đề nghị / Kế toán / CEO và phụ lục ảnh chứng từ.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() =>
                        openReimbursementPdfPrintWindow(state, {
                          filters,
                          includeAttachmentImages: true,
                          exporterName: currentUserName,
                          role,
                        })
                      }
                      className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs"
                    >
                      <Printer className="w-4 h-4" />
                      In / Lưu PDF (Kèm ảnh chứng từ)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openReimbursementPdfPrintWindow(state, {
                          filters,
                          includeAttachmentImages: false,
                          exporterName: currentUserName,
                          role,
                        })
                      }
                      className="w-full py-2 px-4 rounded-xl bg-white border border-blue-300 text-blue-800 text-xs font-semibold hover:bg-blue-50"
                    >
                      In / Lưu PDF (Chỉ bảng kê tóm tắt)
                    </button>
                  </div>
                </div>

                {/* Box 3: ZIP Chứng từ */}
                <div className="p-5 rounded-2xl border border-indigo-200 bg-indigo-50/40 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center mb-3">
                      <Archive className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">
                      3. Xuất Gói ZIP Ảnh Chứng từ & Manifest CSV/JSON
                    </h3>
                    <p className="text-xs text-slate-600 mt-2">
                      Đóng gói toàn bộ file ảnh thanh toán và hóa đơn trong kỳ, đặt tên theo mã bữa ăn (<code>B-202610-001_PAYMENT_PROOF...</code>) kèm file <code>manifest.csv</code> để kế toán đối chiếu.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      exportAttachmentsZip(state, {
                        filters,
                        exporterName: currentUserName,
                        role,
                      })
                    }
                    className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs"
                  >
                    <Archive className="w-4 h-4" />
                    Tải xuống Gói ZIP Chứng từ
                  </button>
                </div>
              </div>

              {/* Sao lưu / Khôi phục JSON toàn hệ thống */}
              <div className="mt-6 pt-5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Sao lưu & Di chuyển Dữ liệu Toàn hệ thống (JSON Snapshot)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Tải xuống toàn bộ cơ sở dữ liệu hiện tại hoặc khôi phục từ file JSON đã xuất.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(state, null, 2)], {
                        type: 'application/json',
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `horus_meals_backup_v${state.version}.json`;
                      a.click();
                    }}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Xuất JSON Backup
                  </button>
                  {role !== 'VIEWER' && (
                    <label className="px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800 cursor-pointer flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" /> Nhập JSON Backup
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
            TAB 6: QUẢN TRỊ NHÂN SỰ, CHƯƠNG TRÌNH & AUDIT LOG (F01, F02, Mục 14)
           =================================================================== */}
        {activeTab === 'ADMIN' && (
          <AdminSection
            state={state}
            role={role}
            currentUserName={currentUserName}
            onUpdateState={(updater, summary) => {
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
              const seed = createInitialSeedState();
              seed.version = state.version + 1;
              persistStateToServer(
                seed,
                'Khôi phục bộ dữ liệu mẫu tháng 10/2026 chuẩn PRD'
              );
            }}
            onClearTransactionsOnly={() => {
              const clean = createCleanProductionState(state);
              persistStateToServer(
                clean,
                'Làm sạch giao dịch mẫu, giữ nguyên 8 thành viên BOD và 2 chương trình'
              );
            }}
          />
        )}
      </main>

      {/* Modals */}
      <MealModal
        isOpen={isMealModalOpen}
        onClose={() => setIsMealModalOpen(false)}
        state={state}
        role={role}
        currentUserName={currentUserName}
        editingMeal={editingMeal}
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
          setState(updatedState);
          setSyncStatus(`Đã Commit v${updatedState.version} lên Hệ thống`);
        }}
      />
    </div>
  );
}
