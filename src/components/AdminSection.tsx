'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  History,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Trash2,
  Users,
} from 'lucide-react';
import { formatDateTimeVN, validateMembershipOverlap } from '@/lib/calculations';
import {
  AppState,
  Member,
  MemberType,
  Program,
  ProgramMembership,
  RoleKey,
  SystemSettings,
} from '@/lib/types';

interface AdminSectionProps {
  state: AppState;
  role: RoleKey;
  currentUserName: string;
  onUpdateState: (updater: (prev: AppState) => AppState, summary: string) => void;
  onResetToSampleData: () => void;
  onClearTransactionsOnly: () => void;
}

export default function AdminSection({
  state,
  role,
  currentUserName,
  onUpdateState,
  onResetToSampleData,
  onClearTransactionsOnly,
}: AdminSectionProps) {
  const isAdmin = role === 'ADMIN';

  // Form thêm nhân sự / khách mời
  const [newFullName, setNewFullName] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newType, setNewType] = useState<MemberType>('EMPLOYEE');
  const [joinProgramId, setJoinProgramId] = useState<string>('prog-lunch');
  const [joinStartDate, setJoinStartDate] = useState<string>('2026-10-27');

  // Form thêm lịch sử tư cách thành viên (Program Membership)
  const [pmProgramId, setPmProgramId] = useState<string>('prog-dinner');
  const [pmMemberId, setPmMemberId] = useState<string>(state.members[0]?.id || 'mem-01');
  const [pmStartDate, setPmStartDate] = useState<string>('2026-10-01');
  const [pmEndDate, setPmEndDate] = useState<string>('');
  const [adminError, setAdminError] = useState<string>('');
  const [adminSuccess, setAdminSuccess] = useState<string>('');

  const handleAddMember = () => {
    setAdminError('');
    setAdminSuccess('');
    if (!newFullName.trim()) {
      setAdminError('Vui lòng nhập họ và tên nhân sự / khách mời.');
      return;
    }

    const memberId = `mem-${Date.now()}`;
    const newMember: Member = {
      id: memberId,
      fullName: newFullName.trim(),
      title: newTitle.trim(),
      email: newEmail.trim() || undefined,
      memberType: newType,
      isActive: true,
    };

    onUpdateState(
      (prev) => {
        const nextMemberships = [...prev.programMemberships];
        if (joinProgramId !== 'NONE' && newType === 'EMPLOYEE') {
          nextMemberships.push({
            id: `pm-${Date.now()}`,
            programId: joinProgramId,
            memberId,
            startDate: joinStartDate || '2026-10-01',
            endDate: null,
          });
        }
        return {
          ...prev,
          members: [...prev.members, newMember],
          programMemberships: nextMemberships,
        };
      },
      `Thêm thành viên mới "${newMember.fullName}" (${newMember.title || 'Chưa cung cấp chức danh'})`
    );

    setNewFullName('');
    setNewTitle('');
    setNewEmail('');
    setAdminSuccess(`Đã thêm "${newMember.fullName}" thành công.`);
  };

  const handleUpdateMemberTitle = (memberId: string, updatedTitle: string) => {
    onUpdateState(
      (prev) => ({
        ...prev,
        members: prev.members.map((m) =>
          m.id === memberId ? { ...m, title: updatedTitle } : m
        ),
      }),
      `Cập nhật chức danh của thành viên ID ${memberId} thành "${updatedTitle}"`
    );
  };

  const handleAddMembership = () => {
    setAdminError('');
    setAdminSuccess('');
    const candidate = {
      programId: pmProgramId,
      memberId: pmMemberId,
      startDate: pmStartDate,
      endDate: pmEndDate.trim() ? pmEndDate.trim() : null,
    };

    const check = validateMembershipOverlap(candidate, state.programMemberships);
    if (!check.valid) {
      setAdminError(check.error || 'Khoảng thời gian không hợp lệ.');
      return;
    }

    const mem = state.members.find((m) => m.id === pmMemberId);
    const prog = state.programs.find((p) => p.id === pmProgramId);

    onUpdateState(
      (prev) => ({
        ...prev,
        programMemberships: [
          ...prev.programMemberships,
          {
            id: `pm-${Date.now()}`,
            ...candidate,
          },
        ],
      }),
      `Thêm tư cách thành viên cho ${mem?.fullName} vào chương trình ${prog?.shortName} (Hiệu lực: ${candidate.startDate} → ${candidate.endDate || 'Hiện tại'})`
    );

    setAdminSuccess('Đã thêm lịch sử tư cách thành viên thành công.');
  };

  const handleUpdateMembershipEndDate = (pmId: string, endDate: string | null) => {
    setAdminError('');
    const existing = state.programMemberships.find((x) => x.id === pmId);
    if (!existing) return;

    const check = validateMembershipOverlap(
      { ...existing, endDate },
      state.programMemberships
    );
    if (!check.valid) {
      setAdminError(check.error || 'Ngày kết thúc không hợp lệ.');
      return;
    }

    onUpdateState(
      (prev) => ({
        ...prev,
        programMemberships: prev.programMemberships.map((pm) =>
          pm.id === pmId ? { ...pm, endDate } : pm
        ),
      }),
      `Cập nhật ngày kết thúc tư cách thành viên (${pmId}) thành ${endDate || 'Đang hoạt động'}`
    );
  };

  const handleDeleteMembership = (pmId: string) => {
    onUpdateState(
      (prev) => ({
        ...prev,
        programMemberships: prev.programMemberships.filter((pm) => pm.id !== pmId),
      }),
      `Xóa bản ghi tư cách thành viên ${pmId}`
    );
  };

  const handleUpdateSettings = (patch: Partial<SystemSettings>, desc: string) => {
    onUpdateState(
      (prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          ...patch,
        },
      }),
      `Cập nhật cấu hình hệ thống: ${desc}`
    );
  };

  const handleUpdateProgramPolicy = (progId: string, pct: number, note: string) => {
    onUpdateState(
      (prev) => ({
        ...prev,
        programs: prev.programs.map((p) =>
          p.id === progId ? { ...p, reimbursementPolicyPct: pct, policyNote: note } : p
        ),
      }),
      `Cập nhật chính sách hoàn ứng chương trình ${progId}: ${pct}%`
    );
  };

  return (
    <div className="space-y-6">
      {!isAdmin && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          Bạn đang ở vai trò <strong>{role}</strong>. Hãy chuyển sang vai trò <strong>ADMIN</strong> ở góc trên bên phải để chỉnh sửa cấu hình thành viên, chương trình và phân quyền.
        </div>
      )}

      {adminError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{adminError}</span>
        </div>
      )}

      {adminSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{adminSuccess}</span>
        </div>
      )}

      {/* 1. Cấu hình quy tắc nghiệp vụ & phân quyền (Mục 14 PRD) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-5 h-5 text-teal-600" />
          <h2 className="text-base font-bold text-slate-900">
            1. Cấu hình Quy tắc Nghiệp vụ & Phân quyền (Giải quyết các mục Cần xác nhận ở Mục 14 PRD)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-start justify-between gap-3 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Yêu cầu Finance duyệt trước khi đưa vào Đợt hoàn ứng
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Khi bật: Chỉ bữa ăn trạng thái <code>APPROVED</code> mới được lập đợt hoàn ứng. Khi tắt: Bữa ăn <code>SUBMITTED</code> có thể lập đợt hoàn ứng ngay.
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!isAdmin}
              checked={state.settings.requireFinanceApproval}
              onChange={(e) =>
                handleUpdateSettings(
                  { requireFinanceApproval: e.target.checked },
                  `Yêu cầu Finance duyệt = ${e.target.checked}`
                )
              }
              className="mt-1 rounded text-teal-600 w-4 h-4"
            />
          </label>

          <label className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-start justify-between gap-3 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Hiển thị Khách mời trong bảng xếp hạng KPI nhân sự cá nhân
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Mặc định tắt: Chi phí của khách mời vẫn tính vào tổng chi phí nhóm & tổng lượt, nhưng tách khỏi bảng xếp hạng KPI nhân sự nội bộ (F02 & F06).
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!isAdmin}
              checked={state.settings.includeGuestsInMemberKPI}
              onChange={(e) =>
                handleUpdateSettings(
                  { includeGuestsInMemberKPI: e.target.checked },
                  `Hiển thị khách mời trong KPI cá nhân = ${e.target.checked}`
                )
              }
              className="mt-1 rounded text-teal-600 w-4 h-4"
            />
          </label>

          <label className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-start justify-between gap-3 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Cho phép vai trò Viewer xem & tải ảnh chứng từ thanh toán / hóa đơn (AC-18)
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Mặc định tắt theo Mục 3 & AC-18: Quyền xem ảnh thanh toán và hóa đơn phải cấp riêng. Khi tắt, Viewer bị chặn cả trên giao diện lẫn API.
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!isAdmin}
              checked={state.settings.viewerCanSeeAttachments}
              onChange={(e) =>
                handleUpdateSettings(
                  { viewerCanSeeAttachments: e.target.checked },
                  `Cho phép Viewer xem chứng từ = ${e.target.checked}`
                )
              }
              className="mt-1 rounded text-teal-600 w-4 h-4"
            />
          </label>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Người thanh toán / ứng tiền mặc định
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Tự động điền sẵn khi tạo bữa ăn mới và lọc báo cáo hoàn ứng.
              </div>
            </div>
            <select
              disabled={!isAdmin}
              value={state.settings.defaultPayerMemberId}
              onChange={(e) =>
                handleUpdateSettings(
                  { defaultPayerMemberId: e.target.value },
                  `Đổi người ứng mặc định sang ${e.target.value}`
                )
              }
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
            >
              {state.members
                .filter((m) => m.memberType === 'EMPLOYEE')
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. Quản lý 2 chương trình (F01) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-teal-600" />
          <h2 className="text-base font-bold text-slate-900">
            2. Quản lý Chương trình & Chính sách Hoàn ứng (F01)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.programs.map((prog) => (
            <div
              key={prog.id}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold px-2.5 py-0.5 rounded bg-slate-900 text-white">
                  {prog.code}
                </span>
                <span className="text-xs font-semibold text-emerald-700">
                  Đang hoạt động
                </span>
              </div>
              <div className="text-sm font-bold text-slate-900">{prog.name}</div>
              <div className="text-xs text-slate-600">{prog.description}</div>
              <div className="text-xs text-slate-500">Lịch dự kiến: {prog.scheduleDesc}</div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">
                  Tỷ lệ công ty hoàn ứng (%):
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={!isAdmin}
                    value={prog.reimbursementPolicyPct}
                    onChange={(e) => {
                      const pct = Math.min(100, Math.max(0, Number(e.target.value)));
                      handleUpdateProgramPolicy(
                        prog.id,
                        pct,
                        `Công ty chi trả ${pct}%`
                      );
                    }}
                    className="w-20 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-bold text-right"
                  />
                  <span className="text-xs font-bold">%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Quản lý danh bạ nhân sự & khách mời (F02) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-teal-600" />
          <h2 className="text-base font-bold text-slate-900">
            3. Danh bạ Thành viên BOD, Nhân sự & Khách mời ({state.members.length} người)
          </h2>
        </div>

        {/* Form thêm nhân sự mới */}
        {isAdmin && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 mb-4 grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                Họ và tên *
              </label>
              <input
                type="text"
                placeholder="VD: Nguyễn Văn A"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                Chức danh (Tùy chọn)
              </label>
              <input
                type="text"
                placeholder="VD: Director / Để trống"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                Loại
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as MemberType)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              >
                <option value="EMPLOYEE">Nhân sự nội bộ</option>
                <option value="GUEST">Khách mời</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                Gán vào chương trình
              </label>
              <select
                value={joinProgramId}
                onChange={(e) => setJoinProgramId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              >
                {state.programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.shortName}
                  </option>
                ))}
                <option value="NONE">Chưa gán cố định</option>
              </select>
            </div>
            <div>
              <button
                type="button"
                onClick={handleAddMember}
                className="w-full px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm người
              </button>
            </div>
          </div>
        )}

        <div className="border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                <th className="py-2.5 px-3">STT</th>
                <th className="py-2.5 px-3">Họ và tên</th>
                <th className="py-2.5 px-3">Chức danh (Có thể chỉnh sửa trực tiếp)</th>
                <th className="py-2.5 px-3">Loại</th>
                <th className="py-2.5 px-3">Chương trình đang tham gia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {state.members.map((m, idx) => {
                const mProgs = state.programMemberships.filter((pm) => pm.memberId === m.id);
                return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {m.fullName}
                      {m.isDefaultPayer && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-800">
                          Người ứng mặc định
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        disabled={!isAdmin}
                        placeholder="(Chưa cung cấp chức danh - Nhập để cập nhật)"
                        value={m.title}
                        onChange={(e) => handleUpdateMemberTitle(m.id, e.target.value)}
                        className="w-full max-w-xs px-2.5 py-1 rounded border border-slate-200 bg-white text-xs text-slate-800 focus:border-teal-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          m.memberType === 'EMPLOYEE'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {m.memberType === 'EMPLOYEE' ? 'Nhân sự' : 'Khách mời'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {mProgs.map((pm) => {
                          const prog = state.programs.find((p) => p.id === pm.programId);
                          return (
                            <span
                              key={pm.id}
                              className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]"
                            >
                              {prog?.code === 'LEADERSHIP_LUNCH' ? 'Ăn trưa' : 'Ăn tối T5'} (từ{' '}
                              {pm.startDate})
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Lịch sử tư cách thành viên theo chương trình (F02, AC-04, AC-20) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-5 h-5 text-teal-600" />
          <h2 className="text-base font-bold text-slate-900">
            4. Cấu hình Thành viên & Thời gian Hiệu lực theo Chương trình (Leadership Lunch & Ban Chiến lược Game)
          </h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Dùng để tính chính xác <strong>Số buổi đủ điều kiện (mẫu số tỷ lệ tham gia)</strong> khi thành viên gia nhập hoặc ngừng tham gia giữa tháng (AC-04, AC-20) mà không làm sai lệch lịch sử các tháng cũ.
        </p>

        {isAdmin && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 mb-4 grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-end">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                Chương trình
              </label>
              <select
                value={pmProgramId}
                onChange={(e) => setPmProgramId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
              >
                {state.programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.shortName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                Nhân sự
              </label>
              <select
                value={pmMemberId}
                onChange={(e) => setPmMemberId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
              >
                {state.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                Ngày bắt đầu hiệu lực *
              </label>
              <input
                type="date"
                value={pmStartDate}
                onChange={(e) => setPmStartDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                Ngày kết thúc (Bỏ trống = Đang hiệu lực)
              </label>
              <input
                type="date"
                value={pmEndDate}
                onChange={(e) => setPmEndDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
            <div>
              <button
                type="button"
                onClick={handleAddMembership}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Gán vào chương trình
              </button>
            </div>
          </div>
        )}

        <div className="border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                <th className="py-2.5 px-3">Chương trình</th>
                <th className="py-2.5 px-3">Họ và tên thành viên</th>
                <th className="py-2.5 px-3">Ngày bắt đầu (start_date)</th>
                <th className="py-2.5 px-3">Ngày kết thúc (end_date)</th>
                <th className="py-2.5 px-3 text-center">Xóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {state.programMemberships.map((pm) => {
                const prog = state.programs.find((p) => p.id === pm.programId);
                const mem = state.members.find((m) => m.id === pm.memberId);
                return (
                  <tr key={pm.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-semibold text-slate-800">
                      {prog?.shortName || pm.programId}
                    </td>
                    <td className="py-2 px-3 font-bold text-slate-900">
                      {mem?.fullName || pm.memberId}
                    </td>
                    <td className="py-2 px-3 text-slate-700">{pm.startDate}</td>
                    <td className="py-2 px-3">
                      <input
                        type="date"
                        disabled={!isAdmin}
                        value={pm.endDate || ''}
                        onChange={(e) =>
                          handleUpdateMembershipEndDate(
                            pm.id,
                            e.target.value ? e.target.value : null
                          )
                        }
                        className="px-2 py-1 rounded border border-slate-200 text-xs bg-white"
                      />
                      {!pm.endDate && (
                        <span className="ml-2 text-[11px] text-emerald-700 font-medium">
                          Đang hiệu lực
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteMembership(pm.id)}
                          className="p-1 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Công cụ Khởi tạo / Làm sạch Dữ liệu & Nhật ký Kiểm toán (Audit Logs) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-teal-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                5. Nhật ký Chỉnh sửa & Kiểm toán Nội bộ (Audit Logs — {state.auditLogs.length} bản ghi)
              </h2>
              <p className="text-xs text-slate-500">
                Lưu vết mọi thao tác tạo/sửa bữa ăn, điểm danh, phân bổ, duyệt và xác nhận hoàn ứng.
              </p>
            </div>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onClearTransactionsOnly}
                className="px-3 py-1.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-semibold"
              >
                Làm sạch về 0đ (Giữ 8 thành viên BOD)
              </button>
              <button
                type="button"
                onClick={onResetToSampleData}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Nạp thử dữ liệu mẫu (Demo)
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {state.auditLogs.map((log) => (
            <div
              key={log.id}
              className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-white font-bold text-[10px]">
                    {log.action}
                  </span>
                  <span className="font-bold text-slate-800">
                    {log.actorName} ({log.actorRole})
                  </span>
                  <span className="text-slate-400">• Đối tượng: {log.entityType}</span>
                </div>
                <div className="text-slate-700 mt-1">{log.summary}</div>
              </div>
              <div className="text-[11px] text-slate-500 shrink-0">
                {formatDateTimeVN(log.createdAt)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
