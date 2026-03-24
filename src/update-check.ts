import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const exec = promisify(execFile);

interface UpdateCache {
  checkedAt: number;
  updateAvailable: boolean;
}

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const CHECK_TIMEOUT = 3000; // 3s max for network call

function getCachePath(): string {
  return path.join(os.homedir(), '.claude', 'plugins', 'claude-vitals', 'cache', 'update.json');
}

function readCache(): UpdateCache | null {
  try {
    const raw = fs.readFileSync(getCachePath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(cache: UpdateCache): void {
  try {
    const cachePath = getCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache));
  } catch {}
}

// Find the claude-vitals repo root by looking for .git
function getRepoDir(): string {
  return path.resolve(import.meta.dirname, '..');
}

export async function checkForUpdate(): Promise<boolean> {
  // Check cache first — only hit network once per interval
  const cache = readCache();
  const now = Date.now();
  if (cache && (now - cache.checkedAt) < CHECK_INTERVAL_MS) {
    return cache.updateAvailable;
  }

  // Run check in background — don't block render
  try {
    const repoDir = getRepoDir();
    const opts = { cwd: repoDir, timeout: CHECK_TIMEOUT };

    // Get local HEAD
    const localResult = await exec('git', ['rev-parse', 'HEAD'], opts);
    const localSha = localResult.stdout.trim();

    // Get remote HEAD (lightweight — no download)
    const remoteResult = await exec('git', ['ls-remote', 'origin', 'HEAD'], opts);
    const remoteSha = remoteResult.stdout.split('\t')[0]?.trim();

    const updateAvailable = !!remoteSha && remoteSha !== localSha;
    writeCache({ checkedAt: now, updateAvailable });
    return updateAvailable;
  } catch {
    // Network failure — don't nag, try again next interval
    writeCache({ checkedAt: now, updateAvailable: false });
    return false;
  }
}
