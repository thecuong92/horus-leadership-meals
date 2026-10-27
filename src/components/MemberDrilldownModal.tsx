'use client';

import React from 'react';
import { Calendar, CheckCircle2, Eye, User, X, XCircle } from 'lucide-react';
import { formatDateTimeVN, formatVnd } from '@/lib/calculations';
import { AppState, MealSession, MemberReportRow } from '@/lib/types';

interface MemberDrilldownModalProps {
  row: MemberReportRow | null;
  state: AppState;
  monthLabel: string;
  onClose: () => void;
  onInspectMeal: (meal: MealSession) => void;
}

export default function MemberDrilldownModal({
  row,
  state,
  monthLabel,
  onClose,
  onInspectMeal,
}: MemberDrilldownModalProps) {
  if (!row) return null;

  const { member } = row;
  const memberships = state.programMemberships.filter((pm) => pm.memberId === member.id);

  // Tập hợp tất cả bữa ăn liên quan (đã tham gia hoặc đủ điều kiện trong kỳ)
  const relevantMealIds = Array.from(
    new Set([...row.attendedMealIds, ...row.eligibleMealIds])
  );
  const relevantMeals = state.meals
    .filter((m) => relevantMealIds.includes(m.id))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 font-bold text-lg">
              {member.fullName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">{member.fullName}</h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {member.title || 'Chưa cung cấp chức danh'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Hồ sơ thống kê tham gia & chi phí phân bổ • Kỳ: {monthLabel}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* KPIs cá nhân */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-bold uppercase text-slate-500">Tổng lượt tham gia</div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {row.totalAttended} buổi
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Trưa: {row.lunchAttended} • Tối: {row.dinnerAttended}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-teal-50/70 border border-teal-200">
              <div className="text-[11px] font-bold uppercase text-teal-800">Tỷ lệ tham gia</div>
              <div className="text-xl font-bold text-teal-700 mt-1">
                {row.attendanceRatePct !== null ? `${row.attendanceRatePct}%` : '—'}
              </div>
              <div className="text-[11px] text-teal-700 mt-0.5">
                {row.eligibleSessions > 0
                  ? `${row.totalAttended}/${row.eligibleSessions} buổi đủ điều kiện`
                  : 'Chưa có buổi đủ điều kiện'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200">
              <div className="text-[11px] font-bold uppercase text-indigo-800">
                Tổng chi phí phân bổ
              </div>
              <div className="text-xl font-bold text-indigo-700 mt-1">
                {formatVnd(row.allocatedCostVnd)}
              </div>
              <div className="text-[11px] text-indigo-600 mt-0.5">
                Phân bổ nội bộ (không tự trả)
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-bold uppercase text-slate-500">
                Bình quân / lượt dự
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {formatVnd(row.avgCostPerVisitVnd)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Tần suất: {row.totalAttended} lần / kỳ
              </div>
            </div>
          </div>

          {/* Lịch sử tư cách thành viên (Program Memberships) */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
              <User className="w-4 h-4 text-teal-600" />
              Lịch sử tư cách thành viên theo chương trình (Dùng tính mẫu số buổi đủ điều kiện)
            </div>
            {memberships.length === 0 ? (
              <div className="text-xs text-slate-500 italic">
                Chưa thuộc cố định chương trình nào (Khách mời hoặc nhân sự tham gia theo lời mời từng buổi).
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {memberships.map((pm) => {
                  const prog = state.programs.find((p) => p.id === pm.programId);
                  return (
                    <div
                      key={pm.id}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs flex items-center gap-2"
                    >
                      <span className="font-bold text-slate-800">
                        {prog?.shortName || pm.programId}
                      </span>
                      <span className="text-slate-500">
                        Hiệu lực: <strong>{pm.startDate}</strong> →{' '}
                        <strong>{pm.endDate || 'Hiện tại'}</strong>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bảng danh sách bữa ăn cụ thể */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2.5 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-teal-600" />
              Danh sách các bữa ăn liên quan trong kỳ ({relevantMeals.length} bữa)
            </h3>

            {relevantMeals.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                Không có bữa ăn nào trong phạm vi bộ lọc hiện tại.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                      <th className="py-2.5 px-3">Mã bữa / Ngày giờ</th>
                      <th className="py-2.5 px-3">Chương trình</th>
                      <th className="py-2.5 px-3">Địa điểm</th>
                      <th className="py-2.5 px-3 text-center">Trạng thái dự</th>
                      <th className="py-2.5 px-3 text-right">Tổng bữa</th>
                      <th className="py-2.5 px-3 text-right">Phân bổ cá nhân</th>
                      <th className="py-2.5 px-3 text-center">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {relevantMeals.map((meal) => {
                      const prog = state.programs.find((p) => p.id === meal.programId);
                      const attended = row.attendedMealIds.includes(meal.id);
                      const alloc = state.allocations.find(
                        (al) => al.mealId === meal.id && al.memberId === member.id
                      );
                      return (
                        <tr key={meal.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{meal.code}</div>
                            <div className="text-[11px] text-slate-500">
                              {formatDateTimeVN(meal.occurredAt)}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {prog?.shortName || meal.programId}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">{meal.venue}</td>
                          <td className="py-2.5 px-3 text-center">
                            {attended ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                                <CheckCircle2 className="w-3 h-3" /> Có mặt
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium text-[11px]">
                                <XCircle className="w-3 h-3" /> Vắng mặt (Đủ ĐK)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600">
                            {formatVnd(meal.totalPaidVnd)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-indigo-700">
                            {attended ? formatVnd(alloc?.amountVnd || 0) : '0đ'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => {
                                onClose();
                                onInspectMeal(meal);
                              }}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 inline-flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
          >
            Đóng hồ sơ
          </button>
        </div>
      </div>
    </div>
  );
}
