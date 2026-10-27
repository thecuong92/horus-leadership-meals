'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Plus,
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

  // Danh sách các quán gần đây để gợi ý nhanh (F03 / 7.4)
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
      // Tạo mới: Mặc định KHÔNG tự động đánh dấu tất cả thành viên (Mục 4.1 & 7.4 PRD)
      setProgramId(state.programs[0]?.id || 'prog-lunch');
      setOccurredAtInput('2026-10-27T12:15');
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
  }, [isOpen, editingMeal, state]);

  const allMembers = useMemo(
    () => [...state.members.filter((m) => m.isActive), ...tempGuests],
    [state.members, tempGuests]
  );

  const occurredIso = useMemo(() => {
    if (!occurredAtInput) return new Date().toISOString();
    return `${occurredAtInput}:00+07:00`;
  }, [occurredAtInput]);

  const mealDateVN = useMemo(() => getMealDateVN(occurredIso), [occurredIso]);

  // Phân nhóm thành viên thuộc chương trình tại ngày diễn ra bữa ăn vs Thành viên khác / Khách mời
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

  // Tính toán phân bổ hiện tại
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
    // MANUAL
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

  // Phát hiện bữa ăn có khả năng ghi trùng (F03)
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
    setSelectedAttendeeIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const handleAddQuickGuest = () => {
    const name = newGuestName.trim();
    if (!name) return;
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
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleAddDemoPaymentProof = () => {
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
    const cleanVenue = venue.trim();
    const cleanTotal = Math.round(totalPaidVnd);

    if (!cleanVenue) {
      setErrorMessage('Vui lòng nhập tên địa điểm / quán ăn.');
      return;
    }

    if (targetStatus === 'SUBMITTED') {
      if (cleanTotal <= 0) {
        setErrorMessage('Tổng số tiền thanh toán phải lớn hơn 0 VND khi gửi hồ sơ.');
        return;
      }
      if (selectedAttendeeIds.length === 0) {
        setErrorMessage(
          'F06: Phải đánh dấu ít nhất 1 người tham gia thực tế trước khi gửi hồ sơ.'
        );
        return;
      }
      const paymentProofCount = attachments.filter((a) => a.type === 'PAYMENT_PROOF').length;
      if (paymentProofCount === 0) {
        setErrorMessage(
          'AC-07: Bắt buộc đính kèm tối thiểu 1 ảnh chứng từ thanh toán khi gửi hồ sơ (Bạn vẫn có thể bấm Lưu nháp nếu chưa có ảnh).'
        );
        return;
      }
      if (allocationSumVnd !== cleanTotal) {
        setErrorMessage(
          `F06: Tổng tiền phân bổ (${formatVnd(allocationSumVnd)}) phải bằng chính xác tổng tiền thực thanh toán (${formatVnd(cleanTotal)}). Chênh lệch: ${formatVnd(allocationDiffVnd)}.`
        );
        return;
      }
    }

    const mealId = editingMeal?.id || `meal-${Date.now()}`;
    const monthPart = mealDateVN.slice(0, 7).replace('-', '');
    const seqNum = String(state.meals.length + 1).padStart(3, '0');
    const code = editingMeal?.code || `B-${monthPart}-${seqNum}`;

    // AC-19: Nếu bữa ăn đã APPROVED mà người dùng sửa tiền / người tham gia / chứng từ thì tự động chuyển về SUBMITTED để duyệt lại
    let finalStatus: MealStatus = targetStatus;
    let reapprovalNote = '';
    if (editingMeal && editingMeal.status === 'APPROVED' && targetStatus === 'SUBMITTED') {
      finalStatus = 'SUBMITTED';
      reapprovalNote = ' (Đã cập nhật sau khi duyệt -> Chuyển về chờ Finance duyệt lại theo AC-19)';
    }

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
      hasInvoice: hasInvoice || attachments.some((a) => a.type === 'INVOICE'),
      note: note.trim(),
      createdBy: editingMeal?.createdBy || currentUserName,
      createdAt: editingMeal?.createdAt || nowIso,
      updatedBy: currentUserName,
      updatedAt: nowIso,
    };

    const finalAllocations = computedAllocations.map((al) => ({
      ...al,
      mealId,
    }));

    const finalAttachments = attachments.map((att) => ({
      ...att,
      mealId,
    }));

    onSaveMeal({
      meal: mealObj,
      attendeeIds: selectedAttendeeIds,
      allocations: finalAllocations,
      attachments: finalAttachments,
      newGuests: tempGuests,
      auditAction: editingMeal ? 'UPDATE_MEAL' : 'CREATE_MEAL',
      auditSummary: `${editingMeal ? 'Cập nhật' : 'Tạo mới'} bữa ăn ${code} (${cleanVenue}) — ${formatVnd(cleanTotal)} — ${selectedAttendeeIds.length} người tham gia — Trạng thái: ${finalStatus}${reapprovalNote}`,
    });

    onClose();
  };

  const paymentProofsCount = attachments.filter((a) => a.type === 'PAYMENT_PROOF').length;
  const invoicesCount = attachments.filter((a) => a.type === 'INVOICE').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                {editingMeal ? `Mã bữa: ${editingMeal.code}` : 'Ghi nhận bữa ăn mới'}
              </span>
              {editingMeal && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-700 text-slate-200">
                  Trạng thái: {editingMeal.status}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold mt-1">
              {editingMeal
                ? `Chi tiết & Chỉnh sửa bữa ăn — ${editingMeal.venue}`
                : 'Thêm bữa ăn & Điểm danh thực tế (Mobile-First)'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
              <div>{errorMessage}</div>
            </div>
          )}

          {editingMeal?.status === 'REJECTED' && editingMeal.rejectionReason && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm">
              <strong>Lý do Finance trả lại hồ sơ:</strong> {editingMeal.rejectionReason}
            </div>
          )}

          {/* Cảnh báo trùng bữa ăn (F03) */}
          {duplicateMeals.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <strong>Cảnh báo nghi ngờ ghi trùng (F03):</strong> Đã có bữa ăn{' '}
                {duplicateMeals.map((m) => `${m.code} (${m.venue} - ${formatVnd(m.totalPaidVnd)})`).join(', ')}{' '}
                cùng chương trình và cùng ngày {mealDateVN}. Hệ thống chỉ cảnh báo và không tự khóa nếu thực tế có 2 bữa.
              </div>
            </div>
          )}

          {/* Bước 1: Chương trình, Ngày giờ, Địa điểm */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                1. Chương trình bữa ăn *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {state.programs
                  .filter((p) => p.active || p.id === programId)
                  .map((prog) => {
                    const active = prog.id === programId;
                    return (
                      <button
                        key={prog.id}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setProgramId(prog.id)}
                        className={`text-left p-3.5 rounded-xl border transition flex items-start justify-between ${
                          active
                            ? 'border-teal-600 bg-teal-50/70 ring-2 ring-teal-500/20'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{prog.shortName}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {prog.scheduleDesc} • {prog.policyNote}
                          </div>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            active ? 'bg-teal-600 text-white' : 'border border-slate-300'
                          }`}
                        >
                          {active && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                2. Ngày & Giờ thực tế diễn ra (UTC+7) *
              </label>
              <input
                type="datetime-local"
                disabled={isReadOnly}
                value={occurredAtInput}
                onChange={(e) => setOccurredAtInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Ngày tính báo cáo tháng (Asia/Ho_Chi_Minh): <strong>{mealDateVN}</strong>
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                3. Địa điểm / Quán ăn *
              </label>
              <input
                type="text"
                disabled={isReadOnly}
                placeholder="VD: Cơm Niêu Sài Gòn, Phở Hòa Pasteur..."
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {recentVenues.length > 0 && !isReadOnly && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className="text-[11px] text-slate-400 self-center">Gợi ý gần đây:</span>
                  {recentVenues.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVenue(v)}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bước 2: Điểm danh người có mặt thực tế (F04) */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  4. Điểm danh những người có mặt thực tế ({selectedAttendeeIds.length} người đang chọn)
                </h3>
                <p className="text-xs text-slate-500">
                  Mặc định gợi ý danh sách thành viên đủ điều kiện tại ngày {mealDateVN},{' '}
                  <strong className="text-slate-700">không tự động đánh dấu tất cả</strong>.
                </p>
              </div>
              {!isReadOnly && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedAttendeeIds(eligibleProgramMembers.map((m) => m.id))
                    }
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 font-medium border border-teal-200"
                  >
                    Chọn tất cả Đủ ĐK ({eligibleProgramMembers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAttendeeIds([])}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-white text-slate-600 hover:bg-slate-100 font-medium border border-slate-200"
                  >
                    Bỏ chọn hết
                  </button>
                </div>
              )}
            </div>

            {/* Tìm kiếm & Thêm khách mời nhanh */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-3">
              <div className="sm:col-span-5 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm kiếm tên thành viên..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              {!isReadOnly && (
                <div className="sm:col-span-7 flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Tên khách mời / người tham gia đột xuất..."
                    value={newGuestName}
                    onChange={(e) => setNewGuestName(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Vai trò (VD: Khách mời)"
                    value={newGuestTitle}
                    onChange={(e) => setNewGuestTitle(e.target.value)}
                    className="w-32 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs hidden sm:block"
                  />
                  <button
                    type="button"
                    onClick={handleAddQuickGuest}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 flex items-center gap-1 shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Thêm khách
                  </button>
                </div>
              )}
            </div>

            {/* Danh sách thành viên thuộc chương trình */}
            <div className="mb-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-teal-800 mb-1.5">
                Thành viên đủ điều kiện của chương trình ngày {mealDateVN} ({eligibleProgramMembers.length})
              </div>
              {eligibleProgramMembers.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-2">
                  Chưa có thành viên nào được cấu hình hiệu lực cho chương trình này vào ngày {mealDateVN}. Bạn có thể chọn ở danh sách bên dưới hoặc cấu hình trong mục Quản trị.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {eligibleProgramMembers.map((m) => {
                    const checked = selectedAttendeeIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => toggleAttendee(m.id)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition ${
                          checked
                            ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                            : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="text-xs font-bold truncate">{m.fullName}</div>
                          <div
                            className={`text-[11px] truncate ${
                              checked ? 'text-teal-100' : 'text-slate-500'
                            }`}
                          >
                            {m.title || 'Thành viên (Chưa điền chức danh)'}
                          </div>
                        </div>
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-white text-teal-700'
                              : 'border border-slate-300 bg-slate-50'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Thành viên ngoài chương trình / Khách mời */}
            {otherMembers.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Nhân sự khác / Khách mời / Chưa tới ngày hiệu lực ({otherMembers.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {otherMembers.map((m) => {
                    const checked = selectedAttendeeIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => toggleAttendee(m.id)}
                        className={`flex items-center justify-between p-2 rounded-xl border text-left transition ${
                          checked
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="text-xs font-semibold truncate">
                            {m.fullName}{' '}
                            {m.memberType === 'GUEST' && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                                Khách
                              </span>
                            )}
                          </div>
                          <div
                            className={`text-[10px] truncate ${
                              checked ? 'text-indigo-100' : 'text-slate-400'
                            }`}
                          >
                            {m.title || 'Chưa thuộc chương trình tại ngày này'}
                          </div>
                        </div>
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                            checked ? 'bg-white text-indigo-700' : 'border border-slate-300'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Bước 3: Số tiền, Người thanh toán, Phương thức */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                5. Tổng số tiền đã thanh toán (VND) *
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                disabled={isReadOnly}
                value={totalPaidVnd || ''}
                placeholder="VD: 900000"
                onChange={(e) => setTotalPaidVnd(Math.max(0, Math.round(Number(e.target.value))))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-bold text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-slate-500">
                  Hiển thị: <strong>{formatVnd(totalPaidVnd)}</strong>
                </span>
                {!isReadOnly && (
                  <div className="flex gap-1">
                    {[600000, 900000, 1200000, 1800000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTotalPaidVnd(preset)}
                        className="text-[10px] px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600"
                      >
                        {preset / 1000}k
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                6. Người thực tế ứng tiền thanh toán *
              </label>
              <select
                disabled={isReadOnly}
                value={payerMemberId}
                onChange={(e) => setPayerMemberId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 bg-white"
              >
                {allMembers
                  .filter((m) => m.memberType === 'EMPLOYEE')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName} {m.isDefaultPayer ? '(Mặc định)' : ''}
                    </option>
                  ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Khoản hoàn ứng sẽ ghi nhận cho người thanh toán này.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                7. Phương thức & Hóa đơn
              </label>
              <select
                disabled={isReadOnly}
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(
                    e.target.value as 'BANK_TRANSFER' | 'CASH' | 'CARD' | 'E_WALLET'
                  )
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white mb-2"
              >
                <option value="BANK_TRANSFER">Chuyển khoản ngân hàng / QR</option>
                <option value="CARD">Thẻ ngân hàng (POS)</option>
                <option value="CASH">Tiền mặt</option>
                <option value="E_WALLET">Ví điện tử</option>
              </select>
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isReadOnly}
                  checked={hasInvoice}
                  onChange={(e) => setHasInvoice(e.target.checked)}
                  className="rounded text-teal-600"
                />
                Có hóa đơn tài chính (VAT)
              </label>
            </div>
          </div>

          {/* Bước 4: Phân bổ chi phí cho từng nhân sự (F06) */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  8. Phân bổ chi phí cho người tham gia (F06 — Số nguyên đồng VND)
                </h3>
                <p className="text-xs text-slate-500">
                  Chỉ dùng để phân tích chi phí theo nhân sự; không làm tăng số tiền công ty phải hoàn.
                </p>
              </div>
              <div className="flex gap-1.5">
                {(
                  [
                    { key: 'EQUAL', label: 'Chia đều (Mặc định)' },
                    { key: 'MANUAL', label: 'Nhập thủ công' },
                    { key: 'WEIGHTED', label: 'Theo tỷ trọng' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => {
                      setAllocationMethod(mode.key);
                      if (mode.key === 'MANUAL') {
                        const initMap: Record<string, number> = {};
                        for (const al of computedAllocations) {
                          initMap[al.memberId] = al.amountVnd;
                        }
                        setManualAmounts(initMap);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      allocationMethod === mode.key
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {selectedAttendeeIds.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-3 text-center bg-slate-50 rounded-xl">
                Hãy đánh dấu ít nhất 1 người tham gia ở mục 4 để hệ thống tự động tính phân bổ.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 mb-3">
                  {computedAllocations.map((al) => {
                    const memberObj = allMembers.find((m) => m.id === al.memberId);
                    return (
                      <div
                        key={al.memberId}
                        className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">
                            {memberObj?.fullName || al.memberId}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {memberObj?.memberType === 'GUEST' ? 'Khách mời' : memberObj?.title || 'Thành viên'}
                          </div>
                        </div>

                        {allocationMethod === 'EQUAL' && (
                          <div className="text-xs font-bold text-teal-700 shrink-0">
                            {formatVnd(al.amountVnd)}
                          </div>
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
                            className="w-28 px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-bold text-right"
                          />
                        )}

                        {allocationMethod === 'WEIGHTED' && (
                          <div className="flex items-center gap-1.5 shrink-0">
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
                              className="w-14 px-1.5 py-1 rounded border border-slate-300 bg-white text-xs text-center"
                              title="Hệ số tỷ trọng"
                            />
                            <span className="text-xs font-bold text-teal-700">
                              {formatVnd(al.amountVnd)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Hộp đối soát Tổng thanh toán = Tổng phân bổ */}
                <div
                  className={`p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
                    allocationDiffVnd === 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {allocationDiffVnd === 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    )}
                    <span>
                      Đối soát phân bổ: Tổng tiền thực chi ({formatVnd(totalPaidVnd)}) = Tổng phân bổ (
                      {formatVnd(allocationSumVnd)})
                    </span>
                  </div>
                  <div>
                    {allocationDiffVnd === 0 ? (
                      <span className="font-bold text-emerald-700">✓ Khớp chính xác 100%</span>
                    ) : (
                      <span className="font-bold text-red-700">
                        Lệch: {formatVnd(allocationDiffVnd)} (Cần điều chỉnh cho khớp)
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Bước 5: Ảnh chứng từ thanh toán & Hóa đơn (F05, AC-07, AC-08, AC-18) */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  9. Ảnh chứng từ thanh toán (Bắt buộc ≥1 khi gửi) & Hóa đơn (Tùy chọn)
                </h3>
                <p className="text-xs text-slate-500">
                  Đã đính kèm: <strong>{paymentProofsCount} ảnh thanh toán</strong> •{' '}
                  <strong>{invoicesCount} hóa đơn</strong>
                </p>
              </div>

              {!isReadOnly && (
                <div className="flex flex-wrap gap-2">
                  <label className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow-xs">
                    <Camera className="w-3.5 h-3.5" />
                    <span>+ Ảnh thanh toán / Chụp bill</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      capture="environment"
                      multiple
                      onChange={(e) => handleFileUpload(e, 'PAYMENT_PROOF')}
                      className="hidden"
                    />
                  </label>

                  <label className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow-xs">
                    <Upload className="w-3.5 h-3.5" />
                    <span>+ Ảnh/PDF Hóa đơn VAT</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      multiple
                      onChange={(e) => handleFileUpload(e, 'INVOICE')}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleAddDemoPaymentProof}
                    className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-medium"
                  >
                    + Tạo nhanh mẫu UNC
                  </button>
                </div>
              )}
            </div>

            {!canSeeAttachments ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <strong>AC-18 (Bảo mật chứng từ):</strong> Vai trò Viewer hiện chưa được cấp quyền xem/tải ảnh thanh toán và hóa đơn. Admin có thể bật quyền này trong mục Quản trị nếu cần.
              </div>
            ) : attachments.length === 0 ? (
              <div className="p-6 rounded-xl border-2 border-dashed border-slate-300 text-center text-xs text-slate-500">
                Chưa có ảnh chứng từ nào. Bạn vẫn có thể <strong>Lưu nháp</strong>, hoặc bấm nút tải ảnh lên để <strong>Gửi hồ sơ</strong>.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2 shadow-2xs"
                  >
                    <div
                      onClick={() => setPreviewAttachment(att)}
                      className="flex items-center gap-2.5 min-w-0 cursor-pointer group"
                    >
                      {att.dataUrl && att.mimeType.startsWith('image/') ? (
                        <img
                          src={att.dataUrl}
                          alt={att.filename}
                          className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 group-hover:opacity-80"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          <FileText className="w-6 h-6 text-slate-500" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <span
                          className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            att.type === 'PAYMENT_PROOF'
                              ? 'bg-teal-100 text-teal-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {att.type === 'PAYMENT_PROOF' ? 'Chứng từ TT' : 'Hóa đơn VAT'}
                        </span>
                        <div className="text-xs font-semibold text-slate-800 truncate mt-0.5 group-hover:text-teal-600">
                          {att.filename}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {formatDateTimeVN(att.uploadedAt)}
                        </div>
                      </div>
                    </div>

                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() =>
                          setAttachments((prev) => prev.filter((x) => x.id !== att.id))
                        }
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                        title="Xóa chứng từ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              10. Ghi chú nội dung buổi ăn / trao đổi
            </label>
            <textarea
              rows={2}
              disabled={isReadOnly}
              placeholder="Ghi chú chủ đề thảo luận, khách mời hoặc lưu ý thanh toán..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Khu vực Finance Duyệt / Trả lại hồ sơ ngay trong Modal nếu đang mở bữa ăn đã gửi */}
          {editingMeal &&
            (role === 'ADMIN' || role === 'FINANCE') &&
            onApproveOrRejectMeal && (
              <div className="border-t border-slate-200 pt-4">
                <div className="p-4 rounded-2xl bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-teal-300">
                      Kiểm soát & Phê duyệt của Finance / Admin
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5">
                      Trạng thái hiện tại: <strong>{editingMeal.status}</strong>. Duyệt để đưa vào diện đủ điều kiện hoàn ứng.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {editingMeal.status !== 'APPROVED' && (
                      <button
                        type="button"
                        onClick={() => {
                          onApproveOrRejectMeal(editingMeal.id, 'APPROVED');
                          onClose();
                        }}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Duyệt hồ sơ (APPROVE)
                      </button>
                    )}
                    <input
                      type="text"
                      placeholder="Lý do trả lại (nếu từ chối)..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onApproveOrRejectMeal(
                          editingMeal.id,
                          'REJECTED',
                          rejectReason || 'Cần bổ sung/kiểm tra lại chứng từ'
                        );
                        onClose();
                      }}
                      className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <XCircle className="w-4 h-4" />
                      Trả lại (REJECT)
                    </button>
                    {editingMeal.status !== 'VOIDED' && (
                      <button
                        type="button"
                        onClick={() => {
                          onApproveOrRejectMeal(editingMeal.id, 'VOIDED', 'Hủy bản ghi');
                          onClose();
                        }}
                        className="px-2.5 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold"
                      >
                        Hủy bữa (VOID)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="text-xs text-slate-600">
            Người有 mặt: <strong>{selectedAttendeeIds.length}</strong> • Tổng tiền:{' '}
            <strong className="text-teal-700">{formatVnd(totalPaidVnd)}</strong> • Chứng từ TT:{' '}
            <strong>{paymentProofsCount}</strong>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
            >
              Đóng
            </button>
            {!isReadOnly && (
              <>
                <button
                  type="button"
                  onClick={() => handleSubmitForm('DRAFT')}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold"
                >
                  Lưu nháp (DRAFT)
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmitForm('SUBMITTED')}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {editingMeal ? 'Lưu & Gửi hồ sơ' : 'Gửi ghi nhận hoàn ứng'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox xem ảnh chứng từ gốc */}
      {previewAttachment && (
        <div
          onClick={() => setPreviewAttachment(null)}
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div>
                <div className="text-sm font-bold text-slate-900">
                  {previewAttachment.filename}
                </div>
                <div className="text-xs text-slate-500">
                  Loại: {previewAttachment.type} • Tải lên bởi {previewAttachment.uploadedBy} lúc{' '}
                  {formatDateTimeVN(previewAttachment.uploadedAt)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {previewAttachment.dataUrl && (
                  <a
                    href={previewAttachment.dataUrl}
                    download={previewAttachment.filename}
                    className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-bold"
                  >
                    Tải xuống
                  </a>
                )}
                <button
                  onClick={() => setPreviewAttachment(null)}
                  className="p-1.5 rounded-lg bg-slate-100 text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex justify-center bg-slate-100 rounded-xl p-3 max-h-[75vh] overflow-auto">
              {previewAttachment.dataUrl ? (
                <img
                  src={previewAttachment.dataUrl}
                  alt={previewAttachment.filename}
                  className="max-h-[68vh] object-contain rounded"
                />
              ) : (
                <div className="py-12 text-slate-500 text-sm flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" /> Không có dữ liệu hiển thị.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
