'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock,
  CreditCard,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  Plus,
  Printer,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  computeAllMealsReimbursement,
  formatDateTimeVN,
  formatDateVN,
  formatVnd,
  getMealMonthVN,
} from '@/lib/calculations';
import {
  exportAttachmentsZip,
  openReimbursementPdfPrintWindow,
} from '@/lib/exporters';
import {
  AppState,
  FilterState,
  MealSession,
  ReimbursementBatch,
  ReimbursementItem,
  ReimbursementPayment,
  RoleKey,
} from '@/lib/types';

interface ReimbursementSectionProps {
  state: AppState;
  filters: FilterState;
  role: RoleKey;
  currentUserName: string;
  onCreateBatch: (payload: {
    batch: ReimbursementBatch;
    items: ReimbursementItem[];
    auditSummary: string;
  }) => void;
  onRemoveItemFromBatch: (batchId: string, itemId: string, mealCode: string) => void;
  onVoidBatch: (batchId: string, batchCode: string) => void;
  onConfirmPayment: (
    payment: ReimbursementPayment,
    updatedBatchStatus: 'PARTIALLY_PAID' | 'PAID',
    auditSummary: string
  ) => void;
  onInspectMeal: (meal: MealSession) => void;
}

export default function ReimbursementSection({
  state,
  filters,
  role,
  currentUserName,
  onCreateBatch,
  onRemoveItemFromBatch,
  onVoidBatch,
  onConfirmPayment,
  onInspectMeal,
}: ReimbursementSectionProps) {
  const canCreateBatch = role === 'ADMIN' || role === 'PAYER' || role === 'FINANCE';
  const canConfirmPayment = role === 'ADMIN' || role === 'FINANCE';

  const [selectedPayerId, setSelectedPayerId] = useState<string>(
    filters.payerMemberId !== 'ALL'
      ? filters.payerMemberId
      : state.settings.defaultPayerMemberId
  );
  const [selectedMealIds, setSelectedMealIds] = useState<string[]>([]);
  const [batchTitle, setBatchTitle] = useState<string>('');
  const [batchNote, setBatchNote] = useState<string>('');
  const [includeImagesInPdf, setIncludeImagesInPdf] = useState<boolean>(true);

  // State cho Modal xác nhận công ty hoàn tiền
  const [payingBatch, setPayingBatch] = useState<ReimbursementBatch | null>(null);
  const [payAmountVnd, setPayAmountVnd] = useState<number>(0);
  const [payReference, setPayReference] = useState<string>('');
  const [payDateInput, setPayDateInput] = useState<string>('2026-10-27T15:00');
  const [payNote, setPayNote] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const reimbMap = useMemo(() => computeAllMealsReimbursement(state), [state]);

  // Các bữa ăn đủ điều kiện đưa vào đợt hoàn ứng mới (remainingClaimableVnd > 0)
  const claimableMeals = useMemo(() => {
    return state.meals
      .filter((m) => {
        if (m.payerMemberId !== selectedPayerId) return false;
        if (filters.month !== 'ALL' && getMealMonthVN(m.occurredAt) !== filters.month) {
          return false;
        }
        const r = reimbMap[m.id];
        return r && r.remainingClaimableVnd > 0;
      })
      .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  }, [state.meals, selectedPayerId, filters.month, reimbMap]);

  // Tổng hợp số dư của người ứng đang chọn
  const payerSummary = useMemo(() => {
    const payerMeals = state.meals.filter((m) => {
      if (m.payerMemberId !== selectedPayerId) return false;
      if (m.status === 'VOIDED' || m.status === 'DRAFT' || m.status === 'REJECTED') return false;
      if (filters.month !== 'ALL' && getMealMonthVN(m.occurredAt) !== filters.month) return false;
      return true;
    });

    let totalAdvanced = 0;
    let totalApprovedEligible = 0;
    let totalClaimedInBatches = 0;
    let totalReimbursed = 0;

    for (const m of payerMeals) {
      totalAdvanced += m.totalPaidVnd;
      const r = reimbMap[m.id];
      if (r) {
        totalApprovedEligible += r.eligibleAmountVnd;
        totalClaimedInBatches += r.claimedAmountVnd;
        totalReimbursed += r.reimbursedAmountVnd;
      }
    }

    const pendingInBatches = Math.max(0, totalClaimedInBatches - totalReimbursed);
    const remainingUnpaid = Math.max(0, totalApprovedEligible - totalReimbursed);
    const notYetClaimed = Math.max(0, totalApprovedEligible - totalClaimedInBatches);

    return {
      totalAdvanced,
      totalApprovedEligible,
      notYetClaimed,
      pendingInBatches,
      totalReimbursed,
      remainingUnpaid,
    };
  }, [state.meals, selectedPayerId, filters.month, reimbMap]);

  const selectedClaimTotal = useMemo(
    () =>
      selectedMealIds.reduce(
        (sum, id) => sum + (reimbMap[id]?.remainingClaimableVnd || 0),
        0
      ),
    [selectedMealIds, reimbMap]
  );

  const payerMember = state.members.find((m) => m.id === selectedPayerId);

  const handleToggleMealForBatch = (mealId: string) => {
    setSelectedMealIds((prev) =>
      prev.includes(mealId) ? prev.filter((id) => id !== mealId) : [...prev, mealId]
    );
  };

  const handleCreateNewBatch = () => {
    setErrorMsg('');
    if (selectedMealIds.length === 0) {
      setErrorMsg('Vui lòng tích chọn ít nhất 1 bữa ăn đủ điều kiện hoàn để tạo đợt hoàn ứng.');
      return;
    }

    const monthCode = filters.month !== 'ALL' ? filters.month : '2026-10';
    const seq = String(state.reimbursementBatches.length + 1).padStart(3, '0');
    const batchCode = `HU-${monthCode}-${seq}`;
    const batchId = `batch-${Date.now()}`;
    const nowIso = new Date().toISOString();

    const batch: ReimbursementBatch = {
      id: batchId,
      batchCode,
      payerMemberId: selectedPayerId,
      title:
        batchTitle.trim() ||
        `Đề nghị hoàn ứng chi phí bữa ăn Horus (${selectedMealIds.length} bữa - Kỳ ${monthCode})`,
      note: batchNote.trim(),
      status: 'PENDING_PAYMENT',
      submittedAt: nowIso,
      createdBy: currentUserName,
    };

    const items: ReimbursementItem[] = selectedMealIds.map((mealId, idx) => ({
      id: `ri-${Date.now()}-${idx}`,
      batchId,
      mealId,
      claimedAmountVnd: reimbMap[mealId]?.remainingClaimableVnd || 0,
    }));

    const totalClaimed = items.reduce((s, it) => s + it.claimedAmountVnd, 0);

    onCreateBatch({
      batch,
      items,
      auditSummary: `Lập đợt hoàn ứng ${batchCode} cho ${payerMember?.fullName || 'Doãn Thế Cường'} gồm ${items.length} bữa — Tổng đề nghị: ${formatVnd(totalClaimed)} (Trạng thái: Đang đề nghị hoàn, chưa giảm dư nợ cho tới khi có xác nhận chuyển tiền - AC-13).`,
    });

    setSelectedMealIds([]);
    setBatchTitle('');
    setBatchNote('');
  };

  const openPaymentModal = (batch: ReimbursementBatch, remainingVnd: number) => {
    setPayingBatch(batch);
    setPayAmountVnd(remainingVnd);
    setPayReference(`FT${Date.now().toString().slice(-8)} - VCB Horus`);
    setPayDateInput('2026-10-27T15:30');
    setPayNote(`Hoàn ứng đợt ${batch.batchCode}`);
    setErrorMsg('');
  };

  const handleConfirmPaymentSubmit = () => {
    if (!payingBatch) return;
    const cleanAmt = Math.round(payAmountVnd);
    if (cleanAmt <= 0) {
      setErrorMsg('Số tiền thực hoàn phải lớn hơn 0 VND.');
      return;
    }
    if (!payReference.trim()) {
      setErrorMsg('Vui lòng nhập mã giao dịch chuyển khoản / số chứng từ ngân hàng.');
      return;
    }

    const batchItems = state.reimbursementItems.filter((it) => it.batchId === payingBatch.id);
    const claimedTotal = batchItems.reduce((s, it) => s + it.claimedAmountVnd, 0);
    const existingPaid = state.reimbursementPayments
      .filter((p) => p.batchId === payingBatch.id)
      .reduce((s, p) => s + p.amountVnd, 0);
    const remainingForBatch = Math.max(0, claimedTotal - existingPaid);

    if (cleanAmt > remainingForBatch) {
      setErrorMsg(
        `Mục 8.1 & AC-14: Không được hoàn vượt quá số dư còn phải hoàn của đợt (${formatVnd(remainingForBatch)}).`
      );
      return;
    }

    const newTotalPaid = existingPaid + cleanAmt;
    const updatedStatus: 'PARTIALLY_PAID' | 'PAID' =
      newTotalPaid >= claimedTotal ? 'PAID' : 'PARTIALLY_PAID';

    const payment: ReimbursementPayment = {
      id: `pay-${Date.now()}`,
      batchId: payingBatch.id,
      payerMemberId: payingBatch.payerMemberId,
      amountVnd: cleanAmt,
      paidAt: `${payDateInput}:00+07:00`,
      reference: payReference.trim(),
      note: payNote.trim(),
      confirmedBy: currentUserName,
      idempotencyKey: `${payingBatch.id}-${cleanAmt}-${payReference.trim()}`,
      createdAt: new Date().toISOString(),
    };

    onConfirmPayment(
      payment,
      updatedStatus,
      `Xác nhận công ty đã hoàn ứng ${formatVnd(cleanAmt)} cho đợt ${payingBatch.batchCode} (Mã GD: ${payReference.trim()}) — Trạng thái đợt: ${updatedStatus}`
    );

    setPayingBatch(null);
  };

  return (
    <div className="space-y-6">
      {/* Header & chọn người ứng */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200 mb-1.5">
              <Wallet className="w-3.5 h-3.5" />
              Quản lý Hoàn ứng & Đối soát Công nợ (Mục 4.2, 4.3 & F11)
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Theo dõi tiền ứng trước, lập đợt hoàn ứng & xác nhận hoàn tiền
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Nguyên tắc bắt buộc (AC-12, AC-13): Gom khoản phải hoàn theo{' '}
              <strong>người thực tế ứng tiền</strong> (không gom theo chi phí phân bổ cá nhân). Việc lập bảng kê không tự giảm dư nợ cho tới khi Finance xác nhận giao dịch thanh toán thực tế.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs font-bold text-slate-600">Người ứng tiền:</label>
            <select
              value={selectedPayerId}
              onChange={(e) => {
                setSelectedPayerId(e.target.value);
                setSelectedMealIds([]);
              }}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-900"
            >
              {state.members
                .filter((m) => m.memberType === 'EMPLOYEE')
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} {m.isDefaultPayer ? '(Mặc định)' : ''}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* 5 thẻ số dư hoàn ứng của người ứng */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-bold uppercase text-slate-500">
              1. Tổng đã ứng (Kỳ lọc)
            </div>
            <div className="text-lg font-bold text-slate-900 mt-1">
              {formatVnd(payerSummary.totalAdvanced)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Đã gửi + Đã duyệt</div>
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
            <div className="text-[11px] font-bold uppercase text-blue-800">
              2. Đủ ĐK hoàn (Đã duyệt)
            </div>
            <div className="text-lg font-bold text-blue-700 mt-1">
              {formatVnd(payerSummary.totalApprovedEligible)}
            </div>
            <div className="text-[11px] text-blue-600 mt-0.5">
              Chưa lập đợt: {formatVnd(payerSummary.notYetClaimed)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
            <div className="text-[11px] font-bold uppercase text-amber-800">
              3. Đang đề nghị hoàn
            </div>
            <div className="text-lg font-bold text-amber-700 mt-1">
              {formatVnd(payerSummary.pendingInBatches)}
            </div>
            <div className="text-[11px] text-amber-700 mt-0.5">Trong đợt chờ chuyển tiền</div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <div className="text-[11px] font-bold uppercase text-emerald-800">
              4. Công ty đã hoàn
            </div>
            <div className="text-lg font-bold text-emerald-700 mt-1">
              {formatVnd(payerSummary.totalReimbursed)}
            </div>
            <div className="text-[11px] text-emerald-700 mt-0.5">Đã xác nhận UNC</div>
          </div>

          <div className="p-3.5 rounded-xl bg-rose-50/80 border border-rose-200 col-span-2 sm:col-span-1">
            <div className="text-[11px] font-bold uppercase text-rose-800">
              5. Còn phải hoàn (Dư nợ)
            </div>
            <div className="text-lg font-bold text-rose-700 mt-1">
              {formatVnd(payerSummary.remainingUnpaid)}
            </div>
            <div className="text-[11px] text-rose-700 mt-0.5">= Mục (2) trừ Mục (4)</div>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Khu vực 1: Chọn các bữa đã duyệt chưa lập đợt để Tạo đợt hoàn ứng mới */}
      {canCreateBatch && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-teal-600" />
                Bước 1: Chọn bữa ăn đủ điều kiện hoàn để lập Đợt hoàn ứng mới ({claimableMeals.length}{' '}
                bữa khả dụng)
              </h3>
              <p className="text-xs text-slate-500">
                Chỉ hiển thị các bữa đã duyệt (hoặc hợp lệ theo cấu hình) của{' '}
                <strong>{payerMember?.fullName}</strong> còn số dư chưa đưa vào đợt hoàn ứng nào.
              </p>
            </div>
            {claimableMeals.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMealIds(claimableMeals.map((m) => m.id))}
                  className="px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 text-xs font-semibold hover:bg-teal-100"
                >
                  Chọn tất cả ({claimableMeals.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMealIds([])}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200"
                >
                  Bỏ chọn
                </button>
              </div>
            )}
          </div>

          {claimableMeals.length === 0 ? (
            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
              Hiện tại không có bữa ăn nào đã duyệt mà chưa đưa vào đợt hoàn ứng trong kỳ này. (Nếu có bữa ở trạng thái <code>SUBMITTED</code>, hãy duyệt bữa ăn trước).
            </div>
          ) : (
            <>
              <div className="border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                      <th className="py-2.5 px-3 w-10 text-center">Chọn</th>
                      <th className="py-2.5 px-3">Mã bữa / Ngày</th>
                      <th className="py-2.5 px-3">Chương trình</th>
                      <th className="py-2.5 px-3">Địa điểm / Quán</th>
                      <th className="py-2.5 px-3 text-center">Chứng từ</th>
                      <th className="py-2.5 px-3 text-right">Số tiền đề nghị hoàn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {claimableMeals.map((meal) => {
                      const checked = selectedMealIds.includes(meal.id);
                      const prog = state.programs.find((p) => p.id === meal.programId);
                      const atts = state.attachments.filter((a) => a.mealId === meal.id);
                      const r = reimbMap[meal.id];
                      return (
                        <tr
                          key={meal.id}
                          onClick={() => handleToggleMealForBatch(meal.id)}
                          className={`cursor-pointer transition ${
                            checked ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {}}
                              className="rounded text-teal-600"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-slate-900">{meal.code}</span>
                            <div className="text-[11px] text-slate-500">
                              {formatDateTimeVN(meal.occurredAt)}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {prog?.shortName || meal.programId}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">{meal.venue}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                              {atts.length} file
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-teal-700">
                            {formatVnd(r?.remainingClaimableVnd || meal.totalPaidVnd)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-5">
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                    Tiêu đề đợt hoàn ứng
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Đề nghị hoàn ứng đợt 3 tháng 10/2026"
                    value={batchTitle}
                    onChange={(e) => setBatchTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                    Ghi chú gửi Kế toán
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Chuyển khoản vào TK VCB Doãn Thế Cường"
                    value={batchNote}
                    onChange={(e) => setBatchNote(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                  />
                </div>
                <div className="md:col-span-3 flex flex-col items-end">
                  <div className="text-xs text-slate-600 mb-1">
                    Đã chọn <strong>{selectedMealIds.length} bữa</strong>:{' '}
                    <strong className="text-teal-700">{formatVnd(selectedClaimTotal)}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateNewBatch}
                    className="w-full px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    Tạo đợt hoàn ứng
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Khu vực 2: Danh sách các đợt hoàn ứng & lịch sử thanh toán */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Danh sách các Đợt hoàn ứng & Xác nhận chi trả ({state.reimbursementBatches.length} đợt)
            </h3>
            <p className="text-xs text-slate-500">
              Xuất bảng kê PDF trình ký A4, tải ZIP chứng từ theo đợt và xác nhận giao dịch công ty đã hoàn tiền.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer bg-slate-100 px-3 py-1.5 rounded-xl">
            <input
              type="checkbox"
              checked={includeImagesInPdf}
              onChange={(e) => setIncludeImagesInPdf(e.target.checked)}
              className="rounded text-teal-600"
            />
            Đính kèm phụ lục ảnh chứng từ khi in PDF
          </label>
        </div>

        <div className="space-y-4">
          {state.reimbursementBatches.map((batch) => {
            const payer = state.members.find((m) => m.id === batch.payerMemberId);
            const items = state.reimbursementItems.filter((it) => it.batchId === batch.id);
            const claimedTotal = items.reduce((s, it) => s + it.claimedAmountVnd, 0);
            const payments = state.reimbursementPayments.filter((p) => p.batchId === batch.id);
            const paidTotal = payments.reduce((s, p) => s + p.amountVnd, 0);
            const remaining = Math.max(0, claimedTotal - paidTotal);

            const isPaidFull = remaining === 0 && claimedTotal > 0;
            const isPartial = paidTotal > 0 && remaining > 0;

            return (
              <div
                key={batch.id}
                className={`rounded-2xl border p-4 transition ${
                  batch.status === 'VOIDED'
                    ? 'bg-slate-50 border-slate-200 opacity-60'
                    : isPaidFull
                    ? 'bg-emerald-50/30 border-emerald-200'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-lg bg-slate-900 text-white">
                        {batch.batchCode}
                      </span>
                      {batch.status === 'VOIDED' ? (
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-600">
                          Đã hủy
                        </span>
                      ) : isPaidFull ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Đã hoàn ứng đủ (REIMBURSED)
                        </span>
                      ) : isPartial ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                          <Clock className="w-3.5 h-3.5" /> Đã hoàn một phần (PARTIALLY_REIMBURSED)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          <Clock className="w-3.5 h-3.5" /> Đang đề nghị hoàn (CLAIMED — Chờ chuyển tiền)
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        Người thụ hưởng: <strong>{payer?.fullName || batch.payerMemberId}</strong> •
                        Ngày lập: {formatDateTimeVN(batch.submittedAt)}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-900 mt-1">{batch.title}</div>
                    {batch.note && <div className="text-xs text-slate-500">{batch.note}</div>}
                  </div>

                  {/* Các nút thao tác đợt */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        openReimbursementPdfPrintWindow(state, {
                          batch,
                          includeAttachmentImages: includeImagesInPdf,
                          exporterName: currentUserName,
                          role,
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Xuất PDF Bảng kê
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        exportAttachmentsZip(state, {
                          batchId: batch.id,
                          exporterName: currentUserName,
                          role,
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      ZIP Chứng từ
                    </button>

                    {canConfirmPayment && batch.status !== 'VOIDED' && remaining > 0 && (
                      <button
                        type="button"
                        onClick={() => openPaymentModal(batch, remaining)}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        Xác nhận công ty đã hoàn tiền
                      </button>
                    )}

                    {canCreateBatch && batch.status !== 'VOIDED' && paidTotal === 0 && (
                      <button
                        type="button"
                        onClick={() => onVoidBatch(batch.id, batch.batchCode)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600"
                        title="Hủy đợt hoàn ứng chưa thanh toán"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Số liệu tổng đợt & Danh sách bữa ăn trong đợt */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-3">
                  <div className="lg:col-span-8">
                    <div className="text-[11px] font-bold uppercase text-slate-500 mb-1.5">
                      Các bữa ăn trong đợt ({items.length} bữa)
                    </div>
                    <div className="space-y-1.5">
                      {items.map((it) => {
                        const meal = state.meals.find((m) => m.id === it.mealId);
                        if (!meal) return null;
                        return (
                          <div
                            key={it.id}
                            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs"
                          >
                            <div
                              onClick={() => onInspectMeal(meal)}
                              className="cursor-pointer hover:text-teal-700"
                            >
                              <span className="font-bold text-slate-900">{meal.code}</span> •{' '}
                              <span>{formatDateVN(meal.occurredAt)}</span> •{' '}
                              <span className="font-medium">{meal.venue}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">
                                {formatVnd(it.claimedAmountVnd)}
                              </span>
                              {canCreateBatch &&
                                paidTotal === 0 &&
                                batch.status !== 'VOIDED' &&
                                items.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onRemoveItemFromBatch(batch.id, it.id, meal.code)
                                    }
                                    className="text-slate-400 hover:text-red-600"
                                    title="Loại bữa này khỏi đợt chưa thanh toán"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="lg:col-span-4 bg-slate-50 rounded-xl p-3 border border-slate-200 flex flex-col justify-between">
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Tổng đề nghị hoàn:</span>
                        <span className="font-bold text-slate-900">{formatVnd(claimedTotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Đã hoàn xác nhận:</span>
                        <span className="font-bold text-emerald-700">{formatVnd(paidTotal)}</span>
                      </div>
                      <div className="flex justify-between pt-1.5 border-t border-slate-200">
                        <span className="font-semibold text-slate-700">Còn phải hoàn:</span>
                        <span className="font-extrabold text-rose-700">{formatVnd(remaining)}</span>
                      </div>
                    </div>

                    {payments.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200">
                        <div className="text-[10px] font-bold uppercase text-emerald-800 mb-1">
                          Giao dịch thanh toán đã xác nhận:
                        </div>
                        {payments.map((p) => (
                          <div
                            key={p.id}
                            className="text-[11px] bg-white p-2 rounded-lg border border-emerald-200 mb-1"
                          >
                            <div className="font-bold text-emerald-800">
                              ✓ {formatVnd(p.amountVnd)} — {p.reference}
                            </div>
                            <div className="text-slate-500">
                              Ngày: {formatDateTimeVN(p.paidAt)} • Duyệt bởi: {p.confirmedBy}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Xác nhận công ty đã hoàn tiền */}
      {payingBatch && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                Xác nhận chi trả hoàn ứng (AC-14)
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1.5">
                Ghi nhận công ty chuyển tiền — Đợt {payingBatch.batchCode}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Chỉ khi xác nhận giao dịch này, số dư nợ hoàn ứng mới giảm tương ứng. Hỗ trợ hoàn đủ 100% hoặc hoàn một phần.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Số tiền công ty thực chuyển (VND) *
                </label>
                <input
                  type="number"
                  min={1}
                  step={1000}
                  value={payAmountVnd}
                  onChange={(e) => setPayAmountVnd(Math.round(Number(e.target.value)))}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-bold text-emerald-700"
                />
                <div className="text-[11px] text-slate-500 mt-1">
                  Định dạng: <strong>{formatVnd(payAmountVnd)}</strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ngày giờ chuyển khoản (UTC+7) *
                </label>
                <input
                  type="datetime-local"
                  value={payDateInput}
                  onChange={(e) => setPayDateInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mã giao dịch ngân hàng / Số UNC *
                </label>
                <input
                  type="text"
                  placeholder="VD: FT2628910023 - Vietcombank"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Ghi chú</label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayingBatch(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmPaymentSubmit}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                ✓ Xác nhận đã hoàn tiền
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
