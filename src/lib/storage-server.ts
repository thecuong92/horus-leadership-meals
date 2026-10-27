import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createClient } from '@supabase/supabase-js';
import { createInitialSeedState } from './seed-data';
import { AppState } from './types';

const execAsync = promisify(exec);

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE_PATH = path.join(DATA_DIR, 'horus_db.json');

// Bộ nhớ đệm trong RAM phòng trường hợp môi trường serverless read-only filesystem
let memoryCacheState: AppState | null = null;

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {
    // Ignore on read-only serverless fs
  }
}

export function getSupabaseCredentials(state?: AppState | null) {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    state?.settings?.supabaseUrl ||
    '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    state?.settings?.supabaseAnonKey ||
    '';
  return { url: url.trim(), key: key.trim(), enabled: Boolean(url.trim() && key.trim()) };
}

export function getGithubCredentials(state?: AppState | null) {
  const repo = (process.env.GITHUB_REPO || state?.settings?.githubRepo || '').trim();
  const token = (process.env.GITHUB_TOKEN || state?.settings?.githubToken || '').trim();
  return { repo, token, enabled: Boolean(repo && token) };
}

export async function loadAppStateFromServer(): Promise<{
  state: AppState;
  source: string;
}> {
  // 1. Đọc từ file local trước để lấy cấu hình (nếu có)
  let localState: AppState | null = null;
  try {
    ensureDataDir();
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      localState = JSON.parse(raw) as AppState;
      memoryCacheState = localState;
    }
  } catch {
    // Bỏ qua nếu lỗi đọc file
  }

  const baseState = localState || memoryCacheState;

  // 2. Nếu có cấu hình Supabase Cloud, ưu tiên đồng bộ từ Supabase
  const supa = getSupabaseCredentials(baseState);
  if (supa.enabled) {
    try {
      const client = createClient(supa.url, supa.key);
      const { data, error } = await client
        .from('horus_app_state')
        .select('state_json, version')
        .eq('id', 'main')
        .maybeSingle();

      if (!error && data && data.state_json) {
        const cloudState = data.state_json as AppState;
        memoryCacheState = cloudState;
        return { state: cloudState, source: 'SUPABASE_CLOUD' };
      }
    } catch {
      // Fallback sang nguồn tiếp theo
    }
  }

  // 3. Nếu có cấu hình GitHub API, thử đọc từ GitHub repo
  const gh = getGithubCredentials(baseState);
  if (gh.enabled && !localState) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${gh.repo}/contents/data/horus_db.json`,
        {
          headers: {
            Authorization: `Bearer ${gh.token}`,
            Accept: 'application/vnd.github+json',
          },
          cache: 'no-store',
        }
      );
      if (res.ok) {
        const json = await res.json();
        if (json.content) {
          const decoded = Buffer.from(json.content, 'base64').toString('utf-8');
          const ghState = JSON.parse(decoded) as AppState;
          memoryCacheState = ghState;
          return { state: ghState, source: 'GITHUB_CLOUD' };
        }
      }
    } catch {
      // Fallback
    }
  }

  if (localState) {
    return { state: localState, source: 'SERVER_FILE_DB' };
  }

  if (memoryCacheState) {
    return { state: memoryCacheState, source: 'MEMORY_CACHE' };
  }

  // 4. Khởi tạo seed state lần đầu
  const seed = createInitialSeedState();
  memoryCacheState = seed;
  try {
    ensureDataDir();
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(seed, null, 2), 'utf-8');
  } catch {
    // Ignore on read-only serverless fs
  }
  return { state: seed, source: 'INITIAL_SEED' };
}

export async function saveAppStateToServer(
  newState: AppState,
  options?: {
    commitMessage?: string;
    runGitCommit?: boolean;
  }
): Promise<{
  savedTargets: string[];
  gitCommitHash?: string;
  warnings: string[];
}> {
  const savedTargets: string[] = [];
  const warnings: string[] = [];

  newState.lastUpdatedAt = new Date().toISOString();
  memoryCacheState = newState;

  // 1. Lưu xuống file data/horus_db.json trên Server
  try {
    ensureDataDir();
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(newState, null, 2), 'utf-8');
    savedTargets.push('SERVER_DB');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Không thể ghi trực tiếp file cục bộ (môi trường Serverless): ${msg}`);
  }

  // 2. Đồng bộ lên Supabase Cloud (nếu được cấu hình)
  const supa = getSupabaseCredentials(newState);
  if (supa.enabled) {
    try {
      const client = createClient(supa.url, supa.key);
      const { error } = await client.from('horus_app_state').upsert(
        {
          id: 'main',
          state_json: newState,
          version: newState.version,
          last_commit_message: options?.commitMessage || 'Auto sync state',
          updated_by: 'Horus Web App',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
      if (error) {
        warnings.push(`Supabase Cloud: ${error.message}`);
      } else {
        savedTargets.push('SUPABASE_CLOUD');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Lỗi kết nối Supabase: ${msg}`);
    }
  }

  // 3. Commit dữ liệu qua GitHub REST API (nếu có GITHUB_REPO & GITHUB_TOKEN)
  const gh = getGithubCredentials(newState);
  if (gh.enabled) {
    try {
      const apiUrl = `https://api.github.com/repos/${gh.repo}/contents/data/horus_db.json`;
      let sha: string | undefined;
      const getRes = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${gh.token}`,
          Accept: 'application/vnd.github+json',
        },
        cache: 'no-store',
      });
      if (getRes.ok) {
        const existing = await getRes.json();
        sha = existing.sha;
      }

      const contentBase64 = Buffer.from(JSON.stringify(newState, null, 2), 'utf-8').toString(
        'base64'
      );
      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${gh.token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message:
            options?.commitMessage ||
            `chore(data): cập nhật dữ liệu Horus Leadership Meals v${newState.version}`,
          content: contentBase64,
          ...(sha ? { sha } : {}),
        }),
      });
      if (putRes.ok) {
        savedTargets.push('GITHUB_CLOUD_API');
      } else {
        const errBody = await putRes.text();
        warnings.push(`GitHub API: ${putRes.status} ${errBody.slice(0, 120)}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Lỗi GitHub API: ${msg}`);
    }
  }

  // 4. Nếu yêu cầu chạy Git commit trên hệ thống local/server
  let gitCommitHash: string | undefined;
  if (options?.runGitCommit) {
    try {
      const safeMsg = (
        options.commitMessage || `Commit dữ liệu Horus Leadership Meals v${newState.version}`
      ).replace(/"/g, "'");
      await execAsync(`git add data/horus_db.json`, { cwd: process.cwd() });
      const { stdout: statusOut } = await execAsync(`git status --porcelain data/horus_db.json`, {
        cwd: process.cwd(),
      });
      if (statusOut.trim().length > 0) {
        await execAsync(`git commit -m "${safeMsg}"`, { cwd: process.cwd() });
      }
      const { stdout: hashOut } = await execAsync(`git rev-parse --short HEAD`, {
        cwd: process.cwd(),
      });
      gitCommitHash = hashOut.trim();
      savedTargets.push('GIT_REPOSITORY');

      // Nếu đã cấu hình remote origin thì thử push ngầm
      try {
        const { stdout: remotes } = await execAsync(`git remote`, { cwd: process.cwd() });
        if (remotes.trim().length > 0) {
          await execAsync(`git push`, { cwd: process.cwd(), timeout: 8000 });
          savedTargets.push('GIT_REMOTE_PUSH');
        }
      } catch {
        // Không báo lỗi nếu chưa có remote hoặc cần xác thực
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Git local commit: ${msg}`);
    }
  }

  if (savedTargets.length === 0) {
    savedTargets.push('MEMORY_CACHE');
  }

  return { savedTargets, gitCommitHash, warnings };
}
