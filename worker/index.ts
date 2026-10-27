import { createInitialSeedState } from '../src/lib/seed-data';
import { AppState, RoleKey, SystemCommit } from '../src/lib/types';

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<{ results?: T[]; success: boolean }>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface Fetcher {
  fetch(request: Request | string): Promise<Response>;
}

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

function sanitizeStateForRole(state: AppState, role: RoleKey): AppState {
  if (role === 'VIEWER' && !state.settings?.viewerCanSeeAttachments) {
    return {
      ...state,
      attachments: (state.attachments || []).map((att) => ({
        ...att,
        dataUrl: '',
      })),
    };
  }
  return state;
}

async function loadStateFromD1(db: D1Database): Promise<{ state: AppState; source: string }> {
  const row = await db
    .prepare(`SELECT state_json FROM horus_app_state WHERE id = 'main'`)
    .first<{ state_json: string }>();

  if (row && row.state_json) {
    return {
      state: JSON.parse(row.state_json) as AppState,
      source: 'CLOUDFLARE_D1_APAC',
    };
  }

  // Khởi tạo seed state lần đầu vào D1 Cloud
  const seed = createInitialSeedState();
  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO horus_app_state (id, state_json, version, last_commit_message, updated_by, updated_at)
       VALUES ('main', ?1, ?2, ?3, ?4, ?5)`
    )
    .bind(JSON.stringify(seed), seed.version, 'Initial Seed PRD v1.0', 'System', nowIso)
    .run();

  return {
    state: seed,
    source: 'CLOUDFLARE_D1_APAC',
  };
}

async function saveStateToD1(
  db: D1Database,
  state: AppState,
  commitMessage: string,
  updatedBy: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  state.lastUpdatedAt = nowIso;
  await db
    .prepare(
      `INSERT INTO horus_app_state (id, state_json, version, last_commit_message, updated_by, updated_at)
       VALUES ('main', ?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(id) DO UPDATE SET
         state_json = excluded.state_json,
         version = excluded.version,
         last_commit_message = excluded.last_commit_message,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`
    )
    .bind(JSON.stringify(state), state.version, commitMessage, updatedBy, nowIso)
    .run();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 1. /api/state (GET & PUT)
    if (pathname === '/api/state') {
      try {
        if (request.method === 'GET') {
          const role = ((url.searchParams.get('role') || 'ADMIN').toUpperCase() as RoleKey);
          const { state, source } = await loadStateFromD1(env.DB);
          return jsonResponse({
            state: sanitizeStateForRole(state, role),
            source,
            cloudConfig: {
              cloudflareD1Enabled: true,
            },
          });
        }

        if (request.method === 'PUT') {
          const body = (await request.json()) as {
            state?: AppState;
            role?: string;
            commitMessage?: string;
          };
          const incomingState = body.state;
          const role = ((body.role || 'ADMIN').toUpperCase() as RoleKey);

          if (!incomingState || !Array.isArray(incomingState.programs)) {
            return jsonResponse({ error: 'Dữ liệu không hợp lệ.' }, 400);
          }

          if (role === 'VIEWER') {
            return jsonResponse(
              { error: 'Vai trò Viewer chỉ có quyền xem, không được ghi dữ liệu.' },
              403
            );
          }

          const { state: currentServerState } = await loadStateFromD1(env.DB);
          const serverAttMap = new Map(
            (currentServerState.attachments || []).map((a) => [a.id, a.dataUrl])
          );
          incomingState.attachments = (incomingState.attachments || []).map((att) => ({
            ...att,
            dataUrl: att.dataUrl || serverAttMap.get(att.id) || '',
          }));

          await saveStateToD1(
            env.DB,
            incomingState,
            body.commitMessage || 'Auto save state',
            role
          );

          return jsonResponse({
            state: sanitizeStateForRole(incomingState, role),
            savedTargets: ['CLOUDFLARE_D1_APAC'],
            warnings: [],
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: msg }, 500);
      }
    }

    // 2. /api/commit (POST)
    if (pathname === '/api/commit' && request.method === 'POST') {
      try {
        const body = (await request.json()) as {
          state?: AppState;
          message?: string;
          authorName?: string;
          authorRole?: string;
        };
        const authorRole = ((body.authorRole || 'ADMIN').toUpperCase() as RoleKey);
        if (authorRole === 'VIEWER') {
          return jsonResponse(
            { error: 'Vai trò Viewer không có quyền commit dữ liệu lên hệ thống.' },
            403
          );
        }

        const { state: serverState } = await loadStateFromD1(env.DB);
        const stateToCommit: AppState = body.state ? { ...body.state } : { ...serverState };

        const serverAttMap = new Map(
          (serverState.attachments || []).map((a) => [a.id, a.dataUrl])
        );
        stateToCommit.attachments = (stateToCommit.attachments || []).map((att) => ({
          ...att,
          dataUrl: att.dataUrl || serverAttMap.get(att.id) || '',
        }));

        const nextVersion = (stateToCommit.version || 1) + 1;
        stateToCommit.version = nextVersion;

        const commitId = `commit-${Date.now()}`;
        const nowIso = new Date().toISOString();
        const message =
          body.message?.trim() ||
          `Commit và đồng bộ dữ liệu Horus Leadership Meals (v${nextVersion})`;
        const authorName = body.authorName || 'Doãn Thế Cường';

        const savedTargets = ['CLOUDFLARE_D1_APAC'];

        const newCommitEntry: SystemCommit = {
          id: commitId,
          version: nextVersion,
          message,
          authorName,
          authorRole,
          storageTargets: savedTargets,
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
            summary: `[v${nextVersion}] Commit lên hệ thống Cloud D1: "${message}"`,
            createdAt: nowIso,
          },
          ...(stateToCommit.auditLogs || []),
        ];

        await saveStateToD1(env.DB, stateToCommit, message, authorName);
        await env.DB.prepare(
          `INSERT INTO horus_commits_log (id, version, message, author_name, author_role, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
        )
          .bind(commitId, nextVersion, message, authorName, authorRole, nowIso)
          .run();

        return jsonResponse({
          success: true,
          commit: newCommitEntry,
          savedTargets,
          warnings: [],
          state: stateToCommit,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: msg }, 500);
      }
    }

    // 3. /api/attachments/:id (GET) - AC-18 RBAC check
    if (pathname.startsWith('/api/attachments/') && request.method === 'GET') {
      try {
        const id = pathname.replace('/api/attachments/', '').trim();
        const role = ((url.searchParams.get('role') || 'VIEWER').toUpperCase() as RoleKey);
        const { state } = await loadStateFromD1(env.DB);

        if (role === 'VIEWER' && !state.settings?.viewerCanSeeAttachments) {
          return jsonResponse(
            {
              error:
                'AC-18: Tài khoản Viewer chưa được cấp quyền xem/tải ảnh thanh toán và hóa đơn.',
            },
            403
          );
        }

        const attachment = (state.attachments || []).find((a) => a.id === id);
        if (!attachment) {
          return jsonResponse({ error: 'Không tìm thấy chứng từ.' }, 404);
        }

        return jsonResponse({ attachment });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: msg }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
