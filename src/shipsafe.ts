import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

export interface ShipSafeState {
  installed: boolean;
  score?: string;
  status?: string;
  findingsCount?: number;
  critical?: number;
  high?: number;
  autoFixable?: number;
  timestamp?: string;
}

/**
 * Detect if ShipSafe is installed and read last scan results.
 * Returns null if ShipSafe is not installed — the line should not render.
 * Fast: only reads a cached JSON file, never runs a scan.
 */
export function getShipSafeState(cwd?: string): ShipSafeState | null {
  // Check if shipsafe CLI is installed
  try {
    execFileSync('which', ['shipsafe'], { timeout: 500, stdio: 'pipe' });
  } catch {
    return null; // Not installed — don't show the line
  }

  if (!cwd) return { installed: true };

  // Read the scan cache
  try {
    const cachePath = path.join(cwd, '.shipsafe', 'last-scan.json');
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const data = JSON.parse(raw);

    return {
      installed: true,
      score: data.score,
      status: data.status,
      findingsCount: data.findings_count,
      critical: data.critical,
      high: data.high,
      autoFixable: data.auto_fixable,
      timestamp: data.timestamp,
    };
  } catch {
    // Cache doesn't exist — ShipSafe installed but hasn't scanned this project
    return { installed: true };
  }
}
