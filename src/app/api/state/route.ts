import { NextRequest, NextResponse } from 'next/server';
import {
  getGithubCredentials,
  getSupabaseCredentials,
  loadAppStateFromServer,
  saveAppStateToServer,
} from '@/lib/storage-server';
import { AppState, RoleKey } from '@/lib/types';

function sanitizeStateForRole(state: AppState, role: RoleKey): AppState {
  // AC-18: Viewer chưa có quyền xem chứng từ -> Không tải được ảnh qua giao diện lẫn đường dẫn API
  if (role === 'VIEWER' && !state.settings.viewerCanSeeAttachments) {
    return {
      ...state,
      attachments: state.attachments.map((att) => ({
        ...att,
        dataUrl: '', // Ẩn nội dung chứng từ khỏi API payload khi Viewer không có quyền
      })),
    };
  }
  return state;
}

export async function GET(req: NextRequest) {
  try {
    const role = ((req.nextUrl.searchParams.get('role') || 'ADMIN').toUpperCase() as RoleKey);
    const { state, source } = await loadAppStateFromServer();
    const supa = getSupabaseCredentials(state);
    const gh = getGithubCredentials(state);

    return NextResponse.json({
      state: sanitizeStateForRole(state, role),
      source,
      cloudConfig: {
        supabaseEnabled: supa.enabled,
        githubEnabled: gh.enabled,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const incomingState = body.state as AppState;
    const role = ((body.role || 'ADMIN').toUpperCase() as RoleKey);
    const commitMessage = body.commitMessage as string | undefined;

    if (!incomingState || !Array.isArray(incomingState.programs)) {
      return NextResponse.json({ error: 'Dữ liệu trạng thái không hợp lệ.' }, { status: 400 });
    }

    if (role === 'VIEWER') {
      return NextResponse.json(
        { error: 'Vai trò Viewer chỉ có quyền xem, không được ghi dữ liệu.' },
        { status: 403 }
      );
    }

    // Nếu trước đó attachments bị ẩn ở phía client, giữ nguyên dataUrl gốc trên server
    const { state: currentServerState } = await loadAppStateFromServer();
    const serverAttMap = new Map(
      currentServerState.attachments.map((a) => [a.id, a.dataUrl])
    );

    incomingState.attachments = incomingState.attachments.map((att) => ({
      ...att,
      dataUrl: att.dataUrl || serverAttMap.get(att.id) || '',
    }));

    const result = await saveAppStateToServer(incomingState, {
      commitMessage,
      runGitCommit: false,
    });

    return NextResponse.json({
      state: sanitizeStateForRole(incomingState, role),
      savedTargets: result.savedTargets,
      warnings: result.warnings,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
