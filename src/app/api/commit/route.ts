import { NextRequest, NextResponse } from 'next/server';
import { loadAppStateFromServer, saveAppStateToServer } from '@/lib/storage-server';
import { AppState, RoleKey, SystemCommit } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const incomingState = body.state as AppState | undefined;
    const message =
      (body.message as string)?.trim() ||
      'Commit và đồng bộ dữ liệu Horus Leadership Meals lên hệ thống';
    const authorName = (body.authorName as string) || 'Doãn Thế Cường';
    const authorRole = ((body.authorRole || 'ADMIN') as RoleKey);

    if (authorRole === 'VIEWER') {
      return NextResponse.json(
        { error: 'Vai trò Viewer không có quyền commit dữ liệu lên hệ thống.' },
        { status: 403 }
      );
    }

    const { state: serverState } = await loadAppStateFromServer();
    const stateToCommit: AppState = incomingState ? { ...incomingState } : { ...serverState };

    // Bảo toàn dataUrl chứng từ nếu bị ẩn
    const serverAttMap = new Map(serverState.attachments.map((a) => [a.id, a.dataUrl]));
    stateToCommit.attachments = stateToCommit.attachments.map((att) => ({
      ...att,
      dataUrl: att.dataUrl || serverAttMap.get(att.id) || '',
    }));

    const nextVersion = (stateToCommit.version || 1) + 1;
    stateToCommit.version = nextVersion;

    const commitId = `commit-${Date.now()}`;
    const nowIso = new Date().toISOString();

    const newCommitEntry: SystemCommit = {
      id: commitId,
      version: nextVersion,
      message,
      authorName,
      authorRole,
      storageTargets: ['SERVER_DB'],
      createdAt: nowIso,
    };

    stateToCommit.commits = [newCommitEntry, ...(stateToCommit.commits || [])];
    stateToCommit.auditLogs = [
      {
        id: `audit-${Date.now()}`,
        actorRole: authorRole,
        actorName: authorName,
        entityType: 'SYSTEM_COMMIT',
        entityId: commitId,
        action: 'COMMIT_SYSTEM_DATA',
        summary: `[v${nextVersion}] Commit lên hệ thống: "${message}"`,
        createdAt: nowIso,
      },
      ...(stateToCommit.auditLogs || []),
    ];

    const saveResult = await saveAppStateToServer(stateToCommit, {
      commitMessage: message,
      runGitCommit: true,
    });

    newCommitEntry.storageTargets = saveResult.savedTargets;
    if (saveResult.gitCommitHash) {
      newCommitEntry.gitCommitHash = saveResult.gitCommitHash;
    }

    // Lưu lại entry đã cập nhật targets
    await saveAppStateToServer(stateToCommit, {
      commitMessage: message,
      runGitCommit: false,
    });

    return NextResponse.json({
      success: true,
      commit: newCommitEntry,
      savedTargets: saveResult.savedTargets,
      gitCommitHash: saveResult.gitCommitHash,
      warnings: saveResult.warnings,
      state: stateToCommit,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
