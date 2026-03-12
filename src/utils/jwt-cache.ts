// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

import fs from "fs";
import path from "path";
import os from "os";

const CACHE_DIR = path.join(os.homedir(), ".config", "dipcoin", "jwt");

/** Safety margin: treat token as expired 60s before actual expiry */
const EXPIRY_MARGIN_S = 60;

interface CacheEntry {
  token: string;
  exp: number;
}

function getCachePath(address: string): string {
  return path.join(CACHE_DIR, `${address}.json`);
}

function parseJwtExp(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Load a cached JWT for the given wallet address.
 * Returns the token string if valid and not expired, otherwise null.
 */
export function loadCachedJwt(address: string): string | null {
  try {
    const filePath = getCachePath(address);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const entry: CacheEntry = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);
    if (entry.exp - EXPIRY_MARGIN_S > now) {
      return entry.token;
    }
    // Expired, clean up
    fs.unlinkSync(filePath);
    return null;
  } catch {
    return null;
  }
}

/**
 * Save a JWT to the local cache.
 */
export function saveCachedJwt(address: string, token: string): void {
  try {
    const exp = parseJwtExp(token);
    if (!exp) return;
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const entry: CacheEntry = { token, exp };
    fs.writeFileSync(getCachePath(address), JSON.stringify(entry), { mode: 0o600 });
  } catch {
    // Non-fatal: cache write failure is acceptable
  }
}

/**
 * Remove cached JWT for the given address.
 */
export function clearCachedJwt(address: string): void {
  try {
    const filePath = getCachePath(address);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}
