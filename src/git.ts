import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { GitState } from './types.ts';

const exec = promisify(execFile);
const GIT_TIMEOUT = 1000;
const GIT_TTL_MS = 5000;

interface GitCache {
  timestamp: number;
  cwd: string;
  state: GitState;
}

function getCachePath(): string {
  return path.join(os.homedir(), '.claude', 'plugins', 'claude-vitals', 'cache', 'git.json');
}

function readGitCache(cwd: string): GitState | null {
  try {
    const raw = fs.readFileSync(getCachePath(), 'utf-8');
    const cache: GitCache = JSON.parse(raw);
    if (cache.cwd === cwd && Date.now() - cache.timestamp < GIT_TTL_MS) {
      return cache.state;
    }
  } catch {}
  return null;
}

function writeGitCache(cwd: string, state: GitState): void {
  try {
    const cachePath = getCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ timestamp: Date.now(), cwd, state }));
  } catch {}
}

export function parseGitStatus(output: string): {
  dirty: boolean; added: number; modified: number; deleted: number; untracked: number;
} {
  let added = 0, modified = 0, deleted = 0, untracked = 0;

  for (const line of output.split('\n')) {
    if (!line || line.length < 2) continue;
    const index = line[0];
    const working = line[1];

    if (line.startsWith('??')) { untracked++; continue; }
    if (index === 'A') added++;
    if (index === 'D' || working === 'D') deleted++;
    if (index === 'M' || working === 'M' || index === 'R' || index === 'C') modified++;
  }

  const dirty = added + modified + deleted + untracked > 0;
  return { dirty, added, modified, deleted, untracked };
}

export function parseAheadBehind(output: string): { ahead: number; behind: number } {
  const trimmed = output.trim();
  if (!trimmed) return { ahead: 0, behind: 0 };
  const parts = trimmed.split('\t');
  // git rev-list --left-right --count @{upstream}...HEAD
  // outputs: <behind>\t<ahead>
  return {
    behind: parseInt(parts[0]) || 0,
    ahead: parseInt(parts[1]) || 0,
  };
}

export async function getGitState(cwd: string): Promise<GitState | null> {
  const cached = readGitCache(cwd);
  if (cached) return cached;

  try {
    const opts = { cwd, timeout: GIT_TIMEOUT };

    const [branchResult, statusResult] = await Promise.all([
      exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts),
      exec('git', ['--no-optional-locks', 'status', '--porcelain'], opts),
    ]);

    const branch = branchResult.stdout.trim();
    const { dirty, added, modified, deleted, untracked } = parseGitStatus(statusResult.stdout);

    let ahead = 0, behind = 0;
    try {
      const abResult = await exec(
        'git', ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], opts
      );
      ({ ahead, behind } = parseAheadBehind(abResult.stdout));
    } catch {}

    const state: GitState = { branch, dirty, added, modified, deleted, untracked, ahead, behind };
    writeGitCache(cwd, state);
    return state;
  } catch {
    return null;
  }
}
