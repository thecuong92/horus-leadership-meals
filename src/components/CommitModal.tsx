'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Database,
  GitCommit,
  Github,
  History,
  Loader2,
  Send,
  X,
} from 'lucide-react';
import { formatDateTimeVN } from '@/lib/calculations';
import { AppState, RoleKey } from '@/lib/types';

interface CommitModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  role: RoleKey;
  currentUserName: string;
  onCommitted: (updatedState: AppState) => void;
}

export default function CommitModal({
  isOpen,
  onClose,
  state,
  role,
  currentUserName,
  onCommitted,
}: CommitModalProps) {
  const [commitMessage, setCommitMessage] = useState<string>(
    `Cập nhật dữ liệu bữa ăn & đối soát hoàn ứng Horus (v${(state.version || 1) + 1})`
  );
  const [supabaseUrl, setSupabaseUrl] = useState<string>(state.settings.supabaseUrl || '');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState<string>(
    state.settings.supabaseAnonKey || ''
  );
  const [githubRepo, setGithubRepo] = useState<string>(state.settings.githubRepo || '');
  const [githubToken, setGithubToken] = useState<string>(state.settings.githubToken || '');
  const [showCloudConfig, setShowCloudConfig] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [resultBanner, setResultBanner] = useState<{
    success: boolean;
    text: string;
    targets?: string[];
    warnings?: string[];
  } | null>(null);

  if (!isOpen) return null;

  const handleRunCommit = async () => {
    setIsSubmitting(true);
    setResultBanner(null);

    try {
      const updatedState: AppState = {
        ...state,
        settings: {
          ...state.settings,
          supabaseUrl: supabaseUrl.trim() || undefined,
          supabaseAnonKey: supabaseAnonKey.trim() || undefined,
          githubRepo: githubRepo.trim() || undefined,
          githubToken: githubToken.trim() || undefined,
        },
      };

      const res = await fetch('/api/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: updatedState,
          message: commitMessage.trim() || `Commit dữ liệu v${(state.version || 1) + 1}`,
          authorName: currentUserName,
          authorRole: role,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResultBanner({
          success: false,
          text: data.error || 'Có lỗi xảy ra khi commit dữ liệu lên hệ thống.',
        });
      } else {
        onCommitted(data.state);
        setCommitMessage(
          `Cập nhật dữ liệu bữa ăn & đối soát hoàn ứng Horus (v${(data.state.version || 1) + 1})`
        );
        setResultBanner({
          success: true,
          text: `Đã commit thành công phiên bản v${data.state.version}${
            data.gitCommitHash ? ` (Git hash: ${data.gitCommitHash})` : ''
          }!`,
          targets: data.savedTargets,
          warnings: data.warnings,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResultBanner({
        success: false,
        text: `Lỗi kết nối API: ${msg}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-500/30">
              <GitCommit className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                Commit & Đồng bộ Dữ liệu lên Hệ thống (Phiên bản hiện tại: v{state.version})
              </h2>
              <p className="text-xs text-slate-400">
                Lưu trữ bền vững lên Server Database, Git Repository, Supabase Cloud hoặc GitHub API
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
          {resultBanner && (
            <div
              className={`p-4 rounded-xl border text-xs space-y-1.5 ${
                resultBanner.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{resultBanner.text}</span>
              </div>
              {resultBanner.targets && resultBanner.targets.length > 0 && (
                <div>
                  Đích lưu trữ đã ghi nhận:{' '}
                  {resultBanner.targets.map((t) => (
                    <span
                      key={t}
                      className="inline-block px-2 py-0.5 rounded bg-emerald-200/70 text-emerald-900 font-bold mr-1"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {resultBanner.warnings && resultBanner.warnings.length > 0 && (
                <div className="text-[11px] text-amber-800 pt-1">
                  Lưu ý phụ: {resultBanner.warnings.join(' | ')}
                </div>
              )}
            </div>
          )}

          {/* Form nhập Commit Message */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Nội dung Commit (Commit Message) *
            </label>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="VD: Ghi nhận bữa ăn trưa 27/10 và lập đợt hoàn ứng tháng 10..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-900"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCloudConfig((v) => !v)}
                className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1"
              >
                <Cloud className="w-4 h-4" />
                {showCloudConfig
                  ? 'Ẩn cấu hình kết nối Cloud (Supabase / GitHub)'
                  : 'Cấu hình kết nối Supabase / GitHub Cloud (Tùy chọn)'}
              </button>

              <button
                type="button"
                disabled={isSubmitting || role === 'VIEWER'}
                onClick={handleRunCommit}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Commit dữ liệu lên Hệ thống ngay</span>
              </button>
            </div>
          </div>

          {/* Cấu hình kết nối Cloud trực tiếp */}
          {showCloudConfig && (
            <div className="p-4 rounded-2xl border border-teal-200 bg-teal-50/40 space-y-4">
              <div className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-teal-700" />
                Kết nối Cloud Database khi chạy Public trên Vercel / Render
              </div>
              <p className="text-[11px] text-slate-600">
                Bạn có thể cấu hình qua biến môi trường (<code>SUPABASE_URL</code>,{' '}
                <code>SUPABASE_SERVICE_ROLE_KEY</code> hoặc <code>GITHUB_REPO</code>,{' '}
                <code>GITHUB_TOKEN</code>) trên Vercel, hoặc điền trực tiếp tại đây:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Supabase Project URL
                  </label>
                  <input
                    type="text"
                    placeholder="https://xxxx.supabase.co"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Supabase Anon / Service Key
                  </label>
                  <input
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI..."
                    value={supabaseAnonKey}
                    onChange={(e) => setSupabaseAnonKey(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Github className="w-3.5 h-3.5" /> GitHub Repo (owner/repo)
                  </label>
                  <input
                    type="text"
                    placeholder="VD: thecuong92/horus-leadership-meals"
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    GitHub Personal Access Token (Quyền repo/contents)
                  </label>
                  <input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxx"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
              </div>
              <div className="text-[11px] text-slate-500">
                * Với Supabase: Chạy file <code>supabase_schema.sql</code> trong thư mục dự án để tạo bảng <code>horus_app_state</code>. Với GitHub API: Không cần tạo database riêng, mỗi lần bấm Commit hệ thống sẽ tự commit file <code>data/horus_db.json</code> thẳng lên nhánh GitHub của bạn!
              </div>
            </div>
          )}

          {/* Lịch sử các phiên bản Commit */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2.5 flex items-center gap-1.5">
              <History className="w-4 h-4 text-teal-600" />
              Lịch sử Phiên bản đã Commit lên Hệ thống ({(state.commits || []).length} phiên bản)
            </h3>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {(state.commits || []).map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-teal-700 text-white font-bold text-[10px]">
                        v{c.version}
                      </span>
                      {c.gitCommitHash && (
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-[10px]">
                          git:{c.gitCommitHash}
                        </span>
                      )}
                      <span className="font-bold text-slate-800">{c.message}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Người thực hiện: {c.authorName} ({c.authorRole}) • Lưu tại:{' '}
                      {(c.storageTargets || []).join(', ')}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 shrink-0">
                    {formatDateTimeVN(c.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
