export type RoleKey = 'ADMIN' | 'PAYER' | 'FINANCE' | 'VIEWER';

export type MemberType = 'EMPLOYEE' | 'GUEST';

export type MealStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'VOIDED';

export type AllocationMethod = 'EQUAL' | 'MANUAL' | 'WEIGHTED';

export type AttachmentType = 'PAYMENT_PROOF' | 'INVOICE';

export type ReimbursementStatus =
  | 'NOT_ELIGIBLE'
  | 'NOT_CLAIMED'
  | 'CLAIMED'
  | 'PARTIALLY_REIMBURSED'
  | 'REIMBURSED'
  | 'REJECTED_RETURNED';

export type BatchStatus = 'PENDING_PAYMENT' | 'PARTIALLY_PAID' | 'PAID' | 'VOIDED';

export interface Program {
  id: string;
  code: 'LEADERSHIP_LUNCH' | 'GAME_STRATEGY_DINNER' | string;
  name: string;
  shortName: string;
  description: string;
  scheduleDesc: string;
  reimbursementPolicyPct: number; // default 100
  policyNote: string;
  active: boolean;
}

export interface Member {
  id: string;
  fullName: string;
  title: string; // Can be empty string e.g. Trần Việt Phú
  email?: string;
  memberType: MemberType;
  isDefaultPayer?: boolean;
  isActive: boolean;
  note?: string;
}

export interface ProgramMembership {
  id: string;
  programId: string;
  memberId: string;
  startDate: string; // YYYY-MM-DD in Asia/Ho_Chi_Minh
  endDate: string | null; // YYYY-MM-DD or null
}

export interface MealAttendance {
  mealId: string;
  memberId: string;
  attended: boolean;
}

export interface MealCostAllocation {
  mealId: string;
  memberId: string;
  amountVnd: number; // Integer VND
  weight?: number;
  allocationMethod: AllocationMethod;
}

export interface MealAttachment {
  id: string;
  mealId: string;
  type: AttachmentType;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string; // Base64 or signed URL
  uploadedAt: string; // ISO string
  uploadedBy: string;
}

export interface MealSession {
  id: string;
  code: string; // e.g. B-202610-001
  programId: string;
  occurredAt: string; // ISO timestamp (displayed & filtered in UTC+7)
  venue: string;
  totalPaidVnd: number; // Integer VND
  payerMemberId: string; // Default: Doãn Thế Cường
  paymentMethod: 'BANK_TRANSFER' | 'CASH' | 'CARD' | 'E_WALLET';
  status: MealStatus;
  allocationMethod: AllocationMethod;
  hasInvoice: boolean;
  rejectionReason?: string;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ReimbursementItem {
  id: string;
  batchId: string;
  mealId: string;
  claimedAmountVnd: number;
}

export interface ReimbursementPayment {
  id: string;
  batchId: string;
  payerMemberId: string;
  amountVnd: number;
  paidAt: string; // ISO string
  reference: string; // Mã giao dịch UNC / FT
  note: string;
  confirmedBy: string;
  idempotencyKey?: string;
  createdAt: string;
}

export interface ReimbursementBatch {
  id: string;
  batchCode: string; // e.g. HU-2026-10-001
  payerMemberId: string;
  title: string;
  note: string;
  status: BatchStatus;
  submittedAt: string;
  approvedAt?: string;
  createdBy: string;
}

export interface AuditLog {
  id: string;
  actorRole: RoleKey;
  actorName: string;
  entityType: 'MEAL' | 'BATCH' | 'PAYMENT' | 'MEMBER' | 'MEMBERSHIP' | 'PROGRAM' | 'SETTINGS' | 'SYSTEM_COMMIT';
  entityId: string;
  action: string;
  summary: string;
  beforeJson?: string;
  afterJson?: string;
  createdAt: string;
}

export interface SystemCommit {
  id: string;
  version: number;
  message: string;
  authorName: string;
  authorRole: RoleKey;
  storageTargets: string[]; // e.g. ['LOCAL_DB', 'GIT_REPO', 'SUPABASE_CLOUD', 'GITHUB_API']
  gitCommitHash?: string;
  createdAt: string;
}

export interface SystemSettings {
  requireFinanceApproval: boolean; // Mục 14: Có cần Finance duyệt trước khi hoàn?
  includeGuestsInMemberKPI: boolean; // Mục 14: Cần tính khách mời vào thống kê cá nhân không?
  viewerCanSeeAttachments: boolean; // AC-18: Quyền xem ảnh thanh toán/hóa đơn cho Viewer
  viewerCanSeeReimbursements: boolean;
  defaultPayerMemberId: string; // Doãn Thế Cường
  companyName: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  githubRepo?: string; // e.g. "thecuong92/horus-leadership-meals"
  githubToken?: string;
}

export interface RecipientVenueMapping {
  id: string;
  recipientName: string; // VD: "VU THI TUYET ANH", "NGUYEN THI MAI LAN"
  accountKeywords?: string[]; // VD: ["MS00P00000001093528", "2899991980"]
  venueName: string; // VD: "Quán bún dọc mùng"
  defaultProgramId?: string; // VD: "prog-lunch" hoặc "prog-dinner"
  bankName?: string; // VD: "Techcombank", "Sacombank"
  updatedAt: string;
}

export interface AppState {
  version: number;
  lastUpdatedAt: string;
  programs: Program[];
  members: Member[];
  programMemberships: ProgramMembership[];
  meals: MealSession[];
  attendance: MealAttendance[];
  allocations: MealCostAllocation[];
  attachments: MealAttachment[];
  reimbursementBatches: ReimbursementBatch[];
  reimbursementItems: ReimbursementItem[];
  reimbursementPayments: ReimbursementPayment[];
  recipientMappings?: RecipientVenueMapping[];
  auditLogs: AuditLog[];
  commits: SystemCommit[];
  settings: SystemSettings;
}

export interface FilterState {
  month: string; // YYYY-MM e.g. "2026-10"
  programId: string; // 'ALL' or program.id
  memberId: string; // 'ALL' or member.id
  mealStatusScope: 'OPERATIONAL' | 'APPROVED_ONLY' | 'ALL' | MealStatus; // OPERATIONAL = SUBMITTED + APPROVED
  reimbursementFilter: 'ALL' | ReimbursementStatus;
  invoiceFilter: 'ALL' | 'HAS_INVOICE' | 'NO_INVOICE';
  payerMemberId: string; // 'ALL' or member.id
  venueQuery: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface MealReimbursementComputed {
  mealId: string;
  eligibleAmountVnd: number;
  claimedAmountVnd: number;
  reimbursedAmountVnd: number;
  remainingClaimableVnd: number;
  remainingUnpaidVnd: number;
  status: ReimbursementStatus;
  batchCodes: string[];
}

export interface MemberReportRow {
  member: Member;
  programIds: string[];
  lunchAttended: number;
  dinnerAttended: number;
  totalAttended: number;
  eligibleSessions: number;
  eligibleAttendedSessions: number;
  attendanceRatePct: number | null; // null when eligibleSessions === 0 (display '—')
  allocatedCostVnd: number;
  avgCostPerVisitVnd: number;
  attendedMealIds: string[];
  eligibleMealIds: string[];
}

export interface MonthlyBalanceCheck {
  id: string;
  label: string;
  passed: boolean;
  leftValue: number;
  rightValue: number;
  unit: 'VND' | 'VISITS';
  detail: string;
}

export interface MonthlyKPIReport {
  month: string;
  totalMeals: number;
  lunchMeals: number;
  dinnerMeals: number;
  totalGroupCostVnd: number;
  lunchCostVnd: number;
  dinnerCostVnd: number;
  avgCostPerMealVnd: number;
  totalAttendanceVisits: number;
  avgCostPerVisitVnd: number;
  uniqueAttendeesCount: number;
  costWithInvoiceVnd: number;
  costWithoutInvoiceVnd: number;
  mealsWithoutInvoiceCount: number;
  // Payer / Reimbursement KPIs (scoped to selected payer or default Cường)
  payerTotalAdvancedVnd: number; // Tổng tiền đã ứng (SUBMITTED + APPROVED)
  payerApprovedEligibleVnd: number; // Đủ điều kiện hoàn (APPROVED)
  payerClaimedPendingVnd: number; // Đang đề nghị hoàn (chưa chi trả)
  payerReimbursedInPeriodVnd: number; // Tiền công ty thực hoàn trong kỳ (theo paidAt)
  payerReimbursedForPeriodMealsVnd: number; // Tiền đã hoàn cho các bữa ăn của kỳ
  payerRemainingBalanceVnd: number; // Số dư còn phải hoàn (Approved Eligible - Reimbursed)
  memberRows: MemberReportRow[];
  balanceChecks: MonthlyBalanceCheck[];
}
