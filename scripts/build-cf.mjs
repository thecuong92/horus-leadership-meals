import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const root = process.cwd();
const apiDir = path.join(root, 'src', 'app', 'api');
const backupDir = path.join(root, 'src', '_api_backup');

try {
  if (fs.existsSync(apiDir)) {
    fs.renameSync(apiDir, backupDir);
  }
  console.log('Building Next.js static assets into ./out for Cloudflare Workers...');
  execSync('npx next build', {
    stdio: 'inherit',
    env: { ...process.env, CF_EXPORT: '1' },
  });
} finally {
  if (fs.existsSync(backupDir)) {
    fs.renameSync(backupDir, apiDir);
  }
}
