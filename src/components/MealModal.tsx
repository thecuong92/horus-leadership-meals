'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Search,
  Trash2,
  Upload,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import {
  allocateEqualVnd,
  allocateWeightedVnd,
  detectDuplicateMeals,
  formatDateTimeVN,
  formatVnd,
  getMealDateVN,
  isMemberEligibleOnDate,
} from '@/lib/calculations';
import {
  playClickSound,
  playSuccessSound,
  playTickSound,
  playWarningSound,
} from '@/lib/sound';
import {
  AllocationMethod,
  AppState,
  AttachmentType,
  MealAttachment,
  MealCostAllocation,
  MealSession,
  MealStatus,
  Member,
  RoleKey,
} from '@/lib/types';

interface MealModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  role: RoleKey;
  currentUserName: string;
  editingMeal: MealSession | null;
  initialPreset?: {
    programId: string;
    dateVN: string;
    timeVN: string;
  } | null;
  onSaveMeal: (payload: {
    meal: MealSession;
    attendeeIds: string[];
    allocations: MealCostAllocation[];
    attachments: MealAttachment[];
    newGuests: Member[];
    auditAction: string;
    auditSummary: string;
  }) => void;
  onApproveOrRejectMeal?: (
    mealId: string,
    decision: 'APPROVED' | 'REJECTED' | 'VOIDED',
    reason?: string
  ) => void;
}

function toLocalDatetimeInputValue(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '2026-10-27T12:15';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '10';
  const d = parts.find((p) => p.type === 'day')?.value ?? '27';
  const h = parts.find((p) => p.type === 'hour')?.value ?? '12';
  const min = parts.find((p) => p.type === 'minute')?.value ?? '15';
  return `${y}-${m}-${d}T${h === '24' ? '00' : h}:${min}`;
}

export default function MealModal({
  isOpen,
  onClose,
  state,
  role,
  currentUserName,
  editingMeal,
  initialPreset,
  onSaveMeal,
  onApproveOrRejectMeal,
}: MealModalProps) {
  const isReadOnly = role === 'VIEWER';
  const canSeeAttachments = role !== 'VIEWER' || state.settings.viewerCanSeeAttachments;

  const [programId, setProgramId] = useState<string>('prog-lunch');
  const [occurredAtInput, setOccurredAtInput] = useState<string>('2026-10-27T12:15');
  const [venue, setVenue] = useState<string>('');
  const [totalPaidVnd, setTotalPaidVnd] = useState<number>(0);
  const [payerMemberId, setPayerMemberId] = useState<string>(state.settings.defaultPayerMemberId);
  const [paymentMethod, setPaymentMethod] = useState<
    'BANK_TRANSFER' | 'CASH' | 'CARD' | 'E_WALLET'
  >('BANK_TRANSFER');
  const [hasInvoice, setHasInvoice] = useState<boolean>(false);
  const [note, setNote] = useState<string>('');
  const [allocationMethod, setAllocationMethod] = useState<AllocationMethod>('EQUAL');

  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<string[]>([]);
  const [manualAmounts, setManualAmounts] = useState<Record<string, number>>({});
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [attachments, setAttachments] = useState<MealAttachment[]>([]);
  const [tempGuests, setTempGuests] = useState<Member[]>([]);

  const [memberSearch, setMemberSearch] = useState<string>('');
  const [newGuestName, setNewGuestName] = useState<string>('');
  const [newGuestTitle, setNewGuestTitle] = useState<string>('Khách mời');
  const [rejectReason, setRejectReason] = useState<string>('');
  const [previewAttachment, setPreviewAttachment] = useState<MealAttachment | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const recentVenues = useMemo(() => {
    const set = new Set<string>();
    for (const m of state.meals) {
      if (m.venue.trim()) set.add(m.venue.trim());
    }
    return Array.from(set).slice(0, 6);
  }, [state.meals]);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage('');
    setTempGuests([]);
    setMemberSearch('');

    if (editingMeal) {
      setProgramId(editingMeal.programId);
      setOccurredAtInput(toLocalDatetimeInputValue(editingMeal.occurredAt));
      setVenue(editingMeal.venue);
      setTotalPaidVnd(editingMeal.totalPaidVnd);
      setPayerMemberId(editingMeal.payerMemberId);
      setPaymentMethod(editingMeal.paymentMethod);
      setHasInvoice(editingMeal.hasInvoice);
      setNote(editingMeal.note || '');
      setAllocationMethod(editingMeal.allocationMethod);
      setRejectReason(editingMeal.rejectionReason || '');

      const attIds = state.attendance
        .filter((a) => a.mealId === editingMeal.id && a.attended)
        .map((a) => a.memberId);
      setSelectedAttendeeIds(Array.from(new Set(attIds)));

      const existingAllocations = state.allocations.filter((al) => al.mealId === editingMeal.id);
      const manMap: Record<string, number> = {};
      const wMap: Record<string, number> = {};
      for (const al of existingAllocations) {
        manMap[al.memberId] = al.amountVnd;
        wMap[al.memberId] = al.weight || 1;
      }
      setManualAmounts(manMap);
      setWeights(wMap);

      const mealAtts = state.attachments.filter((att) => att.mealId === editingMeal.id);
      setAttachments(mealAtts);
    } else {
      setProgramId(initialPreset?.programId || state.programs[0]?.id || 'prog-lunch');
      setOccurredAtInput(
        initialPreset
          ? `${initialPreset.dateVN}T${initialPreset.timeVN}`
          : '2026-10-27T12:15'
      );
      setVenue('');
      setTotalPaidVnd(0);
      setPayerMemberId(state.settings.defaultPayerMemberId || 'mem-02');
      setPaymentMethod('BANK_TRANSFER');
      setHasInvoice(false);
      setNote('');
      setAllocationMethod('EQUAL');
      setSelectedAttendeeIds([]);
      setManualAmounts({});
      setWeights({});
      setAttachments([]);
      setRejectReason('');
    }
  }, [isOpen, editingMeal, initialPreset, state]);

  const allMembers = useMemo(
    () => [...state.members.filter((m) => m.isActive), ...tempGuests],
    [state.members, tempGuests]
  );

  const occurredIso = useMemo(() => {
    if (!occurredAtInput) return new Date().toISOString();
    return `${occurredAtInput}:00+07:00`;
  }, [occurredAtInput]);

  const mealDateVN = useMemo(() => getMealDateVN(occurredIso), [occurredIso]);

  const { eligibleProgramMembers, otherMembers } = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const filtered = allMembers.filter(
      (m) =>
        !q ||
        m.fullName.toLowerCase().includes(q) ||
        (m.title && m.title.toLowerCase().includes(q))
    );

    const eligible: Member[] = [];
    const others: Member[] = [];
    for (const m of filtered) {
      if (isMemberEligibleOnDate(m.id, programId, mealDateVN, state.programMemberships)) {
        eligible.push(m);
      } else {
        others.push(m);
      }
    }
    return { eligibleProgramMembers: eligible, otherMembers: others };
  }, [allMembers, memberSearch, programId, mealDateVN, state.programMemberships]);

  const computedAllocations: MealCostAllocation[] = useMemo(() => {
    const mealId = editingMeal?.id || 'temp-meal';
    const cleanTotal = Math.max(0, Math.round(totalPaidVnd));
    if (selectedAttendeeIds.length === 0) return [];

    if (allocationMethod === 'EQUAL') {
      return allocateEqualVnd(mealId, cleanTotal, selectedAttendeeIds);
    }
    if (allocationMethod === 'WEIGHTED') {
      return allocateWeightedVnd(
        mealId,
        cleanTotal,
        selectedAttendeeIds.map((id) => ({
          memberId: id,
          weight: Number(weights[id]) > 0 ? Number(weights[id]) : 1,
        }))
      );
    }
    return selectedAttendeeIds.map((memberId) => ({
      mealId,
      memberId,
      amountVnd: Math.max(0, Math.round(manualAmounts[memberId] || 0)),
      weight: 1,
      allocationMethod: 'MANUAL',
    }));
  }, [
    editingMeal?.id,
    totalPaidVnd,
    selectedAttendeeIds,
    allocationMethod,
    manualAmounts,
    weights,
  ]);

  const allocationSumVnd = useMemo(
    () => computedAllocations.reduce((s, a) => s + a.amountVnd, 0),
    [computedAllocations]
  );

  const allocationDiffVnd = Math.round(totalPaidVnd) - allocationSumVnd;

  const duplicateMeals = useMemo(
    () =>
      detectDuplicateMeals(
        {
          id: editingMeal?.id,
          programId,
          occurredAt: occurredIso,
          venue,
          totalPaidVnd,
        },
        state.meals
      ),
    [editingMeal?.id, programId, occurredIso, venue, totalPaidVnd, state.meals]
  );

  if (!isOpen) return null;

  const toggleAttendee = (memberId: string) => {
    if (isReadOnly) return;
    setSelectedAttendeeIds((prev) => {
      const exists = prev.includes(memberId);
      playTickSound(!exists);
      return exists ? prev.filter((id) => id !== memberId) : [...prev, memberId];
    });
  };

  const handleAddQuickGuest = () => {
    const name = newGuestName.trim();
    if (!name) return;
    playTickSound(true);
    const guestId = `mem-guest-${Date.now()}`;
    const newGuest: Member = {
      id: guestId,
      fullName: name,
      title: newGuestTitle.trim() || 'Khách mời',
      memberType: 'GUEST',
      isActive: true,
    };
    setTempGuests((prev) => [...prev, newGuest]);
    setSelectedAttendeeIds((prev) => [...prev, guestId]);
    setNewGuestName('');
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    attType: AttachmentType
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        playWarningSound();
        setErrorMessage(`File "${file.name}" vượt quá giới hạn 10MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        const newAtt: MealAttachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          mealId: editingMeal?.id || 'pending',
          type: attType,
          filename: file.name,
          mimeType: file.type || 'image/jpeg',
          sizeBytes: file.size,
          dataUrl,
          uploadedAt: new Date().toISOString(),
          uploadedBy: currentUserName,
        };
        setAttachments((prev) => [...prev, newAtt]);
        if (attType === 'INVOICE') {
          setHasInvoice(true);
        }
        playTickSound(true);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleAddDemoPaymentProof = () => {
    playTickSound(true);
    const cleanAmt = formatVnd(totalPaidVnd || 900000);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600" viewBox="0 0 480 600">
      <rect width="480" height="600" fill="#f8fafc"/>
      <rect x="24" y="24" width="432" height="552" rx="14" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
      <rect x="24" y="24" width="432" height="84" rx="14" fill="#0f766e"/>
      <text x="48" y="64" font-family="sans-serif" font-size="20" font-weight="bold" fill="#ffffff">CHỨNG TỪ THANH TOÁN</text>
      <text x="48" y="90" font-family="sans-serif" font-size="13" fill="#ccfbf1">${venue || 'Quán ăn Horus'}</text>
      <text x="48" y="160" font-family="sans-serif" font-size="13" fill="#64748b">SỐ TIỀN ĐÃ THANH TOÁN</text>
      <text x="48" y="200" font-family="sans-serif" font-size="30" font-weight="bold" fill="#0f766e">${cleanAmt}</text>
      <text x="48" y="260" font-family="sans-serif" font-size="13" fill="#64748b">NGƯỜI ỨNG TIỀN</text>
      <text x="48" y="286" font-family="sans-serif" font-size="16" font-weight="bold" fill="#0f172a">${
        allMembers.find((m) => m.id === payerMemberId)?.fullName || 'Doãn Thế Cường'
      }</text>
      <text x="48" y="346" font-family="sans-serif" font-size="13" fill="#64748b">THỜI GIAN GIAO DỊCH</text>
      <text x="48" y="372" font-family="sans-serif" font-size="15" fill="#1e293b">${formatDateTimeVN(occurredIso)}</text>
      <rect x="48" y="420" width="200" height="32" rx="6" fill="#dcfce7"/>
      <text x="62" y="441" font-family="sans-serif" font-size="13" font-weight="bold" fill="#166534">✓ ĐÃ THANH TOÁN</text>
    </svg>`;
    const newAtt: MealAttachment = {
      id: `att-${Date.now()}`,
      mealId: editingMeal?.id || 'pending',
      type: 'PAYMENT_PROOF',
      filename: `UNC_${mealDateVN.replace(/-/g, '')}.svg`,
      mimeType: 'image/svg+xml',
      sizeBytes: 18400,
      dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
      uploadedAt: new Date().toISOString(),
      uploadedBy: currentUserName,
    };
    setAttachments((prev) => [...prev, newAtt]);
  };

  const handleSubmitForm = (targetStatus: 'DRAFT' | 'SUBMITTED') => {
    setErrorMessage('');
    const defaultVenueName =
      programId === 'prog-dinner' ? 'Ăn tối Thứ 5 BOD' : 'Ăn trưa BOD';
    const cleanVenue = venue.trim() || defaultVenueName;
    const cleanTotal = Math.max(0, Math.round(totalPaidVnd));

    // Nếu chưa tích chọn người ăn, tự động chọn các thành viên mặc định của chương trình
    const finalAttendeeIds =
      selectedAttendeeIds.length > 0
        ? selectedAttendeeIds
        : eligibleProgramMembers.map((m) => m.id);

    // Tính lại phân bổ theo danh sách người ăn thực tế
    const mealId = editingMeal?.id || `meal-${Date.now()}`;
    let activeAllocations = computedAllocations;
    if (selectedAttendeeIds.length === 0 && finalAttendeeIds.length > 0) {
      activeAllocations = allocateEqualVnd(mealId, cleanTotal, finalAttendeeIds);
    }

    if (
      targetStatus === 'SUBMITTED' &&
      allocationMethod === 'MANUAL' &&
      finalAttendeeIds.length > 0 &&
      allocationSumVnd !== cleanTotal
    ) {
      playWarningSound();
      setErrorMessage(
        `Tổng tiền tự nhập từng người (${formatVnd(allocationSumVnd)}) chưa khớp tổng thanh toán (${formatVnd(cleanTotal)}). Chênh lệch: ${formatVnd(allocationDiffVnd)}.`
      );
      return;
    }

    const monthPart = mealDateVN.slice(0, 7).replace('-', '');
    const seqNum = String(state.meals.length + 1).padStart(3, '0');
    const code = editingMeal?.code || `B-${monthPart}-${seqNum}`;

    // Nếu bấm Lưu & Chốt luôn (SUBMITTED): mặc định duyệt luôn (APPROVED) để không cần rườm rà nhiều bước
    let finalStatus: MealStatus =
      targetStatus === 'SUBMITTED' ? 'APPROVED' : 'DRAFT';

    // Tự động coi mọi ảnh đính kèm đầu tiên là ảnh chuyển khoản (PAYMENT_PROOF) nếu chưa có
    const normalizedAttachments = attachments.map((att, idx) => ({
      ...att,
      mealId,
      type:
        idx === 0 && !attachments.some((a) => a.type === 'PAYMENT_PROOF')
          ? ('PAYMENT_PROOF' as AttachmentType)
          : att.type,
    }));

    const nowIso = new Date().toISOString();
    const mealObj: MealSession = {
      id: mealId,
      code,
      programId,
      occurredAt: occurredIso,
      venue: cleanVenue,
      totalPaidVnd: cleanTotal,
      payerMemberId,
      paymentMethod,
      status: finalStatus,
      allocationMethod,
      hasInvoice: hasInvoice || normalizedAttachments.some((a) => a.type === 'INVOICE'),
      note: note.trim(),
      createdBy: editingMeal?.createdBy || currentUserName,
      createdAt: editingMeal?.createdAt || nowIso,
      updatedBy: currentUserName,
      updatedAt: nowIso,
    };

    const finalAllocations = activeAllocations.map((al) => ({
      ...al,
      mealId,
    }));

    playSuccessSound();
    onSaveMeal({
      meal: mealObj,
      attendeeIds: finalAttendeeIds,
      allocations: finalAllocations,
      attachments: normalizedAttachments,
      newGuests: tempGuests,
      auditAction: editingMeal ? 'UPDATE_MEAL' : 'CREATE_MEAL',
      auditSummary: `${editingMeal ? 'Cập nhật' : 'Tạo mới'} bữa ăn ${code} (${cleanVenue}) — ${formatVnd(cleanTotal)} — ${finalAttendeeIds.length} người tham gia — Trạng thái: ${finalStatus}`,
    });

    onClose();
  };

  const paymentProofsCount = attachments.filter((a) => a.type === 'PAYMENT_PROOF').length;
  const invoicesCount = attachments.filter((a) => a.type === 'INVOICE').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-2 sm:p-3 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden animate-scale-in">
        {/* Compact Header */}
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
              {editingMeal ? editingMeal.code : 'Bữa ăn mới'}
            </span>
            <h2 className="text-sm sm:text-base font-bold truncate">
              {editingMeal ? `Chi tiết bữa ăn — ${editingMeal.venue}` : 'Ghi nhận Bữa ăn & Điểm danh'}
            </h2>
          </div>
          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Compact Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2 animate-slide-up">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <div>{errorMessage}</div>
            </div>
          )}

          {duplicateMeals.length > 0 && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <strong>Cảnh báo nghi ngờ trùng (F03):</strong> Đã có bữa{' '}
                {duplicateMeals.map((m) => `${m.code} (${m.venue})`).join(', ')} cùng ngày {mealDateVN}.
              </div>
            </div>
          )}

          {/* Hàng 1: Chương trình + Ngày giờ + Địa điểm trên 1 lưới gọn */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                1. Chương trình *
              </label>
              <select
                disabled={isReadOnly}
                value={programId}
                onChange={(e) => {
                  playClickSound();
                  setProgramId(e.target.value);
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-teal-50/40 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {state.programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.shortName}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4">
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                2. Ngày & Giờ (UTC+7: {mealDateVN}) *
              </label>
              <input
                type="datetime-local"
                disabled={isReadOnly}
                value={occurredAtInput}
                onChange={(e) => setOccurredAtInput(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                3. Địa điểm / Quán ăn *
              </label>
              <input
                type="text"
                disabled={isReadOnly}
                placeholder="VD: Cơm Niêu Sài Gòn..."
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-900"
              />
              {recentVenues.length > 0 && !isReadOnly && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {recentVenues.slice(0, 3).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        playClickSound();
                        setVenue(v);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 truncate max-w-[110px]"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Hàng 2: Điểm danh siêu gọn 4 cột (8 thành viên BOD chỉ chiếm đúng 2 hàng) */}
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/60">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-xs font-bold text-slate-900">
                4. Điểm danh thực tế ({selectedAttendeeIds.length} người có mặt)
                <span className="font-normal text-[11px] text-slate-500 ml-1.5">
                  • Không tự động chọn tất cả (F04)
                </span>
              </div>
              {!isReadOnly && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      playTickSound(true);
                      setSelectedAttendeeIds(eligibleProgramMembers.map((m) => m.id));
                    }}
                    className="text-[11px] px-2 py-1 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 font-semibold border border-teal-200"
                  >
                    Chọn Đủ ĐK ({eligibleProgramMembers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playTickSound(false);
                      setSelectedAttendeeIds([]);
                    }}
                    className="text-[11px] px-2 py-1 rounded-lg bg-white text-slate-600 hover:bg-slate-100 font-medium border border-slate-200"
                  >
                    Bỏ chọn
                  </button>
                </div>
              )}
            </div>

            {/* Lưới 4 cột siêu gọn cho thành viên */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {eligibleProgramMembers.map((m) => {
                const checked = selectedAttendeeIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => toggleAttendee(m.id)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-left transition active:scale-[0.98] ${
                      checked
                        ? 'bg-teal-600 text-white border-teal-600 shadow-2xs'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="min-w-0 pr-1">
                      <div className="text-xs font-bold truncate">{m.fullName}</div>
                      <div
                        className={`text-[10px] truncate ${
                          checked ? 'text-teal-100' : 'text-slate-400'
                        }`}
                      >
                        {m.title || 'Thành viên'}
                      </div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                        checked ? 'bg-white text-teal-700' : 'border border-slate-300'
                      }`}
                    >
                      {checked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Thành viên khác & Thêm khách mời trên 1 dòng nhỏ */}
            <div className="mt-2 pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
              {otherMembers.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">
                    Khác/Khách:
                  </span>
                  {otherMembers.map((m) => {
                    const checked = selectedAttendeeIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => toggleAttendee(m.id)}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition ${
                          checked
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {m.fullName}
                      </button>
                    );
                  })}
                </div>
              )}

              {!isReadOnly && (
                <div className="flex items-center gap-1 ml-auto">
                  <input
                    type="text"
                    placeholder="Tên khách mời..."
                    value={newGuestName}
                    onChange={(e) => setNewGuestName(e.target.value)}
                    className="w-36 px-2 py-1 rounded-lg border border-slate-300 bg-white text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={handleAddQuickGuest}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 text-white text-[11px] font-semibold hover:bg-slate-700 flex items-center gap-1"
                  >
                    <UserPlus className="w-3 h-3" /> + Khách
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Hàng 3: Số tiền, Người ứng, Phương thức */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                5. Tổng tiền thanh toán (VND) *
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                disabled={isReadOnly}
                value={totalPaidVnd || ''}
                placeholder="VD: 900000"
                onChange={(e) => setTotalPaidVnd(Math.max(0, Math.round(Number(e.target.value))))}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-sm font-black text-teal-800"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] font-bold text-teal-700">
                  {formatVnd(totalPaidVnd)}
                </span>
                {!isReadOnly && (
                  <div className="flex gap-1">
                    {[600000, 900000, 1200000, 1500000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          playClickSound();
                          setTotalPaidVnd(preset);
                        }}
                        className="text-[10px] px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 font-medium"
                      >
                        {preset / 1000}k
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                6. Người thực tế ứng tiền *
              </label>
              <select
                disabled={isReadOnly}
                value={payerMemberId}
                onChange={(e) => setPayerMemberId(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white"
              >
                {allMembers
                  .filter((m) => m.memberType === 'EMPLOYEE')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName} {m.isDefaultPayer ? '(Mặc định)' : ''}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                7. Phương thức & Hóa đơn
              </label>
              <div className="flex items-center gap-2">
                <select
                  disabled={isReadOnly}
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(
                      e.target.value as 'BANK_TRANSFER' | 'CASH' | 'CARD' | 'E_WALLET'
                    )
                  }
                  className="flex-1 px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-900 bg-white"
                >
                  <option value="BANK_TRANSFER">Chuyển khoản / QR</option>
                  <option value="CARD">Thẻ POS</option>
                  <option value="CASH">Tiền mặt</option>
                  <option value="E_WALLET">Ví điện tử</option>
                </select>
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={hasInvoice}
                    onChange={(e) => {
                      playTickSound(e.target.checked);
                      setHasInvoice(e.target.checked);
                    }}
                    className="rounded text-teal-600"
                  />
                  HĐ VAT
                </label>
              </div>
            </div>
          </div>

          {/* Hàng 4: Phân bổ chi phí gọn */}
          <div className="border border-slate-200 rounded-xl p-3 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-xs font-bold text-slate-900">
                8. Phân bổ chi phí ({allocationDiffVnd === 0 ? '✓ Khớp 100%' : `Lệch ${formatVnd(allocationDiffVnd)}`})
              </div>
              <div className="flex gap-1">
                {(
                  [
                    { key: 'EQUAL', label: 'Chia đều' },
                    { key: 'MANUAL', label: 'Thủ công' },
                    { key: 'WEIGHTED', label: 'Tỷ trọng' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => {
                      playClickSound();
                      setAllocationMethod(mode.key);
                      if (mode.key === 'MANUAL') {
                        const initMap: Record<string, number> = {};
                        for (const al of computedAllocations) {
                          initMap[al.memberId] = al.amountVnd;
                        }
                        setManualAmounts(initMap);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                      allocationMethod === mode.key
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {selectedAttendeeIds.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {computedAllocations.map((al) => {
                  const memberObj = allMembers.find((m) => m.id === al.memberId);
                  return (
                    <div
                      key={al.memberId}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-1 text-xs"
                    >
                      <span className="font-semibold text-slate-700 truncate">
                        {memberObj?.fullName}
                      </span>
                      {allocationMethod === 'EQUAL' && (
                        <span className="font-bold text-teal-700 shrink-0">
                          {formatVnd(al.amountVnd)}
                        </span>
                      )}
                      {allocationMethod === 'MANUAL' && (
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          disabled={isReadOnly}
                          value={manualAmounts[al.memberId] ?? al.amountVnd}
                          onChange={(e) =>
                            setManualAmounts((prev) => ({
                              ...prev,
                              [al.memberId]: Math.max(0, Math.round(Number(e.target.value))),
                            }))
                          }
                          className="w-20 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[11px] font-bold text-right"
                        />
                      )}
                      {allocationMethod === 'WEIGHTED' && (
                        <input
                          type="number"
                          min={0.1}
                          step={0.5}
                          disabled={isReadOnly}
                          value={weights[al.memberId] ?? 1}
                          onChange={(e) =>
                            setWeights((prev) => ({
                              ...prev,
                              [al.memberId]: Math.max(0.1, Number(e.target.value)),
                            }))
                          }
                          className="w-12 px-1 py-0.5 rounded border border-slate-300 bg-white text-[11px] text-center"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Hàng 5: Chứng từ + Ghi chú gọn trên 1 khung */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-7 border border-slate-200 rounded-xl p-3 bg-slate-50/60">
              <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
                <span className="text-xs font-bold text-slate-900">
                  9. Ảnh chuyển khoản / Hóa đơn ({attachments.length} ảnh)
                </span>
                {!isReadOnly && (
                  <div className="flex flex-wrap gap-1.5">
                    <label className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold cursor-pointer flex items-center gap-1">
                      <Camera className="w-3 h-3" /> + Ảnh Chuyển khoản / Bill
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        onChange={(e) => handleFileUpload(e, 'PAYMENT_PROOF')}
                        className="hidden"
                      />
                    </label>
                    <label className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer flex items-center gap-1">
                      <Upload className="w-3 h-3" /> + HĐ VAT (Nếu có)
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        onChange={(e) => handleFileUpload(e, 'INVOICE')}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>

              {!canSeeAttachments ? (
                <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                  AC-18: Vai trò Viewer bị giới hạn quyền xem ảnh chứng từ.
                </div>
              ) : attachments.length === 0 ? (
                <div className="text-[11px] text-slate-500 py-1.5">
                  Chỉ cần tải ảnh chuyển khoản (hoặc để trống tùy ý) — bấm{' '}
                  <strong className="text-teal-700">Lưu &amp; Chốt luôn</strong> không cần ràng buộc phức tạp.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="px-2 py-1 rounded-lg bg-white border border-slate-200 flex items-center gap-1.5 text-[11px]"
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewAttachment(att)}
                        className="font-semibold text-teal-700 hover:underline truncate max-w-[160px]"
                      >
                        [{att.type === 'PAYMENT_PROOF' ? 'Ảnh CK' : 'HĐ'}] {att.filename}
                      </button>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() =>
                            setAttachments((prev) => prev.filter((x) => x.id !== att.id))
                          }
                          className="text-slate-400 hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="md:col-span-5">
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                10. Ghi chú nhanh
              </label>
              <textarea
                rows={3}
                disabled={isReadOnly}
                placeholder="Chủ đề thảo luận, ghi chú hóa đơn..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-900"
              />
            </div>
          </div>

          {/* Khu vực Finance Duyệt / Trả lại */}
          {editingMeal &&
            (role === 'ADMIN' || role === 'FINANCE') &&
            onApproveOrRejectMeal && (
              <div className="p-3 rounded-xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-teal-300">
                  Phê duyệt Finance ({editingMeal.status}):
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {editingMeal.status !== 'APPROVED' && (
                    <button
                      type="button"
                      onClick={() => {
                        playSuccessSound();
                        onApproveOrRejectMeal(editingMeal.id, 'APPROVED');
                        onClose();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt (APPROVE)
                    </button>
                  )}
                  <input
                    type="text"
                    placeholder="Lý do trả lại..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-white w-36"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      playWarningSound();
                      onApproveOrRejectMeal(
                        editingMeal.id,
                        'REJECTED',
                        rejectReason || 'Cần bổ sung chứng từ'
                      );
                      onClose();
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
                  >
                    Trả lại
                  </button>
                  {editingMeal.status !== 'VOIDED' && (
                    <button
                      type="button"
                      onClick={() => {
                        playWarningSound();
                        onApproveOrRejectMeal(editingMeal.id, 'VOIDED', 'Hủy bản ghi');
                        onClose();
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                    >
                      Hủy bữa
                    </button>
                  )}
                </div>
              </div>
            )}
        </div>

        {/* Compact Footer */}
        <div className="px-4 py-2.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="text-xs text-slate-600">
            Có mặt: <strong>{selectedAttendeeIds.length}</strong> • Tổng:{' '}
            <strong className="text-teal-700">{formatVnd(totalPaidVnd)}</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                playClickSound();
                onClose();
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
            >
              Đóng
            </button>
            {!isReadOnly && (
              <>
                <button
                  type="button"
                  onClick={() => handleSubmitForm('DRAFT')}
                  className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold"
                >
                  Lưu nháp
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmitForm('SUBMITTED')}
                  className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  {editingMeal ? 'Lưu & Chốt luôn' : 'Lưu & Chốt luôn'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {previewAttachment && (
        <div
          onClick={() => setPreviewAttachment(null)}
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-xl w-full p-4 shadow-2xl animate-scale-in"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-3">
              <div className="text-xs font-bold text-slate-900 truncate">
                {previewAttachment.filename}
              </div>
              <button
                onClick={() => setPreviewAttachment(null)}
                className="p-1 rounded-lg bg-slate-100 text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-center bg-slate-100 rounded-xl p-2 max-h-[70vh] overflow-auto">
              {previewAttachment.dataUrl ? (
                <img
                  src={previewAttachment.dataUrl}
                  alt={previewAttachment.filename}
                  className="max-h-[65vh] object-contain rounded"
                />
              ) : (
                <div className="py-10 text-slate-500 text-xs flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Không có dữ liệu hiển thị.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
