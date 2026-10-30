import { DEFAULT_RECIPIENT_MAPPINGS } from '../src/lib/bill-ocr';
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

async function ensureAttachmentsTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS horus_attachments_data (
        id TEXT PRIMARY KEY,
        meal_id TEXT,
        data_url TEXT,
        updated_at TEXT
      )`
    )
    .run();
}

async function loadStateFromD1(
  db: D1Database,
  hydrateAttachments = true
): Promise<{ state: AppState; source: string }> {
  await ensureAttachmentsTable(db);

  const row = await db
    .prepare(`SELECT state_json FROM horus_app_state WHERE id = 'main'`)
    .first<{ state_json: string }>();

  if (row && row.state_json) {
    const parsed = JSON.parse(row.state_json) as AppState;
    if (!parsed.recipientMappings || parsed.recipientMappings.length === 0) {
      parsed.recipientMappings = DEFAULT_RECIPIENT_MAPPINGS;
    }

    if (hydrateAttachments && parsed.attachments && parsed.attachments.length > 0) {
      const attRows = await db
        .prepare(`SELECT id, data_url FROM horus_attachments_data`)
        .all<{ id: string; data_url: string }>();
      const attMap = new Map(
        (attRows.results || []).map((r) => [r.id, r.data_url])
      );
      parsed.attachments = parsed.attachments.map((att) => ({
        ...att,
        dataUrl: attMap.get(att.id) || att.dataUrl || '',
      }));
    }

    return {
      state: parsed,
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
  await ensureAttachmentsTable(db);
  const nowIso = new Date().toISOString();
  state.lastUpdatedAt = nowIso;

  // 1. Lưu các ảnh có dataUrl sang bảng riêng horus_attachments_data để giải phóng CPU cho state_json
  for (const att of state.attachments || []) {
    if (att.dataUrl && att.dataUrl.length > 20) {
      await db
        .prepare(
          `INSERT INTO horus_attachments_data (id, meal_id, data_url, updated_at)
           VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(id) DO UPDATE SET
             meal_id = excluded.meal_id,
             data_url = excluded.data_url,
             updated_at = excluded.updated_at`
        )
        .bind(att.id, att.mealId, att.dataUrl, nowIso)
        .run();
    }
  }

  // 2. Tạo bản state gọn nhẹ (tách dataUrl khỏi chuỗi JSON chính trong horus_app_state)
  const lightweightState: AppState = {
    ...state,
    attachments: (state.attachments || []).map((att) => ({
      ...att,
      dataUrl: '',
    })),
  };

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
    .bind(
      JSON.stringify(lightweightState),
      state.version,
      commitMessage,
      updatedBy,
      nowIso
    )
    .run();
}

function mergeById<T extends { id: string }>(
  serverArr: T[] = [],
  clientArr: T[] = [],
  compareUpdated?: (a: T, b: T) => T
): T[] {
  const map = new Map<string, T>();
  for (const item of serverArr) {
    map.set(item.id, item);
  }
  for (const item of clientArr) {
    const existing = map.get(item.id);
    if (existing && compareUpdated) {
      map.set(item.id, compareUpdated(existing, item));
    } else {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

function mergeMultiDeviceStates(
  server: AppState,
  client: AppState,
  forceReplace = false
): AppState {
  if (forceReplace) {
    return {
      ...client,
      version: Math.max(server.version || 1, client.version || 1) + 1,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  // Merge Meals (ưu tiên bản ghi có updatedAt mới hơn)
  const mergedMeals = mergeById(server.meals, client.meals, (sMeal, cMeal) => {
    const sTime = new Date(sMeal.updatedAt || sMeal.createdAt || 0).getTime();
    const cTime = new Date(cMeal.updatedAt || cMeal.createdAt || 0).getTime();
    return cTime >= sTime ? cMeal : sMeal;
  });

  // Với Attendance & Allocations: nếu mealId có mặt trong client.meals và vừa được cập nhật ở client, lấy theo client; nếu mealId chỉ có trên server, giữ nguyên của server
  const clientMealTimeMap = new Map(
    (client.meals || []).map((m) => [
      m.id,
      new Date(m.updatedAt || m.createdAt || 0).getTime(),
    ])
  );
  const serverMealTimeMap = new Map(
    (server.meals || []).map((m) => [
      m.id,
      new Date(m.updatedAt || m.createdAt || 0).getTime(),
    ])
  );

  const mealUsesClientChildren = (mealId: string): boolean => {
    const cT = clientMealTimeMap.get(mealId);
    const sT = serverMealTimeMap.get(mealId);
    if (cT === undefined) return false;
    if (sT === undefined) return true;
    return cT >= sT;
  };

  const mergedAttendance = [
    ...(server.attendance || []).filter((a) => !mealUsesClientChildren(a.mealId)),
    ...(client.attendance || []).filter((a) => mealUsesClientChildren(a.mealId)),
  ];

  const mergedAllocations = [
    ...(server.allocations || []).filter((al) => !mealUsesClientChildren(al.mealId)),
    ...(client.allocations || []).filter((al) => mealUsesClientChildren(al.mealId)),
  ];

  // Merge Attachments (bảo toàn dataUrl)
  const serverAttMap = new Map((server.attachments || []).map((a) => [a.id, a]));
  const clientAttMap = new Map((client.attachments || []).map((a) => [a.id, a]));
  const allAttIds = new Set([...serverAttMap.keys(), ...clientAttMap.keys()]);
  const mergedAttachments = Array.from(allAttIds)
    .map((id) => {
      const sAtt = serverAttMap.get(id);
      const cAtt = clientAttMap.get(id);
      if (cAtt && sAtt) {
        return {
          ...cAtt,
          dataUrl: cAtt.dataUrl || sAtt.dataUrl || '',
        };
      }
      return (cAtt || sAtt)!;
    })
    .filter(Boolean);

  return {
    ...client,
    version: Math.max(server.version || 1, client.version || 1) + 1,
    lastUpdatedAt: new Date().toISOString(),
    programs: mergeById(server.programs, client.programs),
    members: mergeById(server.members, client.members),
    programMemberships: mergeById(server.programMemberships, client.programMemberships),
    meals: mergedMeals,
    attendance: mergedAttendance,
    allocations: mergedAllocations,
    attachments: mergedAttachments,
    reimbursementBatches: mergeById(
      server.reimbursementBatches,
      client.reimbursementBatches
    ),
    reimbursementItems: mergeById(server.reimbursementItems, client.reimbursementItems),
    reimbursementPayments: mergeById(
      server.reimbursementPayments,
      client.reimbursementPayments
    ),
    recipientMappings: mergeById(
      server.recipientMappings || DEFAULT_RECIPIENT_MAPPINGS,
      client.recipientMappings || DEFAULT_RECIPIENT_MAPPINGS
    ),
    auditLogs: mergeById(server.auditLogs, client.auditLogs).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    commits: mergeById(server.commits, client.commits).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
  };
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
          const { state, source } = await loadStateFromD1(env.DB, true);
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
            forceReplace?: boolean;
            skipLoad?: boolean;
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

          let mergedState: AppState;
          if (body.skipLoad && body.forceReplace) {
            mergedState = {
              ...incomingState,
              recipientMappings:
                incomingState.recipientMappings && incomingState.recipientMappings.length > 0
                  ? incomingState.recipientMappings
                  : DEFAULT_RECIPIENT_MAPPINGS,
              lastUpdatedAt: new Date().toISOString(),
            };
          } else {
            const { state: currentServerState } = await loadStateFromD1(env.DB, false);
            mergedState = mergeMultiDeviceStates(
              currentServerState,
              incomingState,
              Boolean(body.forceReplace)
            );
          }

          await saveStateToD1(
            env.DB,
            mergedState,
            body.commitMessage || 'Auto save state (Multi-device sync)',
            role
          );

          const { state: fullHydratedState } = await loadStateFromD1(env.DB, true);
          return jsonResponse({
            state: sanitizeStateForRole(fullHydratedState, role),
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

        const { state: serverState } = await loadStateFromD1(env.DB, false);
        const stateToCommit: AppState = body.state
          ? mergeMultiDeviceStates(serverState, body.state, false)
          : { ...serverState, version: (serverState.version || 1) + 1 };

        const nextVersion = stateToCommit.version;
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

        const { state: fullHydratedState } = await loadStateFromD1(env.DB, true);
        return jsonResponse({
          success: true,
          commit: newCommitEntry,
          savedTargets,
          warnings: [],
          state: fullHydratedState,
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
