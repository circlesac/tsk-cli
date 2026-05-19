import { Database } from "bun:sqlite";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { copyFileSync, unlinkSync, existsSync } from "node:fs";
import type { GitHubCookies } from "./types.js";

interface BrowserConfig {
  name: string;
  keychainService: string;
  cookiesPath: string;
  bundleIds: string[];
}

const BROWSERS: BrowserConfig[] = [
  {
    name: "Chrome",
    keychainService: "Chrome Safe Storage",
    cookiesPath: join(homedir(), "Library", "Application Support", "Google", "Chrome", "Default", "Cookies"),
    bundleIds: ["com.google.chrome"],
  },
  {
    name: "Comet",
    keychainService: "Comet Safe Storage",
    cookiesPath: join(homedir(), "Library", "Application Support", "Comet", "Default", "Cookies"),
    bundleIds: ["ai.perplexity.comet"],
  },
  {
    name: "Arc",
    keychainService: "Arc Safe Storage",
    cookiesPath: join(homedir(), "Library", "Application Support", "Arc", "User Data", "Default", "Cookies"),
    bundleIds: ["company.thebrowser.browser"],
  },
  {
    name: "Edge",
    keychainService: "Microsoft Edge Safe Storage",
    cookiesPath: join(homedir(), "Library", "Application Support", "Microsoft Edge", "Default", "Cookies"),
    bundleIds: ["com.microsoft.edgemac"],
  },
  {
    name: "Brave",
    keychainService: "Brave Safe Storage",
    cookiesPath: join(homedir(), "Library", "Application Support", "BraveSoftware", "Brave-Browser", "Default", "Cookies"),
    bundleIds: ["com.brave.browser"],
  },
  {
    name: "Chromium",
    keychainService: "Chromium Safe Storage",
    cookiesPath: join(homedir(), "Library", "Application Support", "Chromium", "Default", "Cookies"),
    bundleIds: ["org.chromium.chromium"],
  },
];

function getDefaultBrowserBundleId(): string | null {
  const plistPath = join(
    homedir(),
    "Library",
    "Preferences",
    "com.apple.LaunchServices",
    "com.apple.launchservices.secure.plist",
  );
  if (!existsSync(plistPath)) return null;
  try {
    const json = execSync(`plutil -convert json -o - "${plistPath}"`, { encoding: "utf-8" });
    const data = JSON.parse(json) as {
      LSHandlers?: Array<{ LSHandlerURLScheme?: string; LSHandlerRoleAll?: string }>;
    };
    const handler = data.LSHandlers?.find((h) => h.LSHandlerURLScheme === "https");
    return handler?.LSHandlerRoleAll?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function orderBrowsersByDefault(browsers: BrowserConfig[]): BrowserConfig[] {
  const defaultBundleId = getDefaultBrowserBundleId();
  if (!defaultBundleId) return browsers;
  const match = browsers.find((b) => b.bundleIds.some((id) => id.toLowerCase() === defaultBundleId));
  if (!match) return browsers;
  return [match, ...browsers.filter((b) => b !== match)];
}

function getKeychainKey(browser: BrowserConfig): Buffer {
  try {
    const output = execSync(
      `security find-generic-password -s "${browser.keychainService}" -g 2>&1`,
      { encoding: "utf-8" },
    );
    const match = output.match(/password:\s*"([^"]+)"/);
    if (!match?.[1]) throw new Error("Could not parse keychain password");
    return pbkdf2Sync(match[1], "saltysalt", 1003, 16, "sha1");
  } catch {
    throw new Error(
      `Failed to read ${browser.keychainService} from Keychain. Is ${browser.name} installed?`,
    );
  }
}

function checkGithubCookies(browser: BrowserConfig, key: Buffer): boolean {
  const tmpPath = join(tmpdir(), `tsk-github-check-${Date.now()}.db`);
  try {
    copyFileSync(browser.cookiesPath, tmpPath);
    const db = new Database(tmpPath, { readonly: true });
    const row = db
      .query<{ cnt: number }, []>(
        "SELECT COUNT(*) as cnt FROM cookies WHERE host_key LIKE '%github.com%' AND name = 'user_session'",
      )
      .get();
    db.close();
    return (row?.cnt ?? 0) > 0;
  } catch {
    return false;
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
}

function detectBrowserWithGithubCookies(preferredName?: string): {
  browser: BrowserConfig;
  key: Buffer;
} {
  let candidates = BROWSERS.filter((b) => existsSync(b.cookiesPath));
  if (candidates.length === 0) {
    throw new Error(
      `No supported Chromium browser found. Checked: ${BROWSERS.map((b) => b.name).join(", ")}`,
    );
  }

  if (preferredName) {
    const forced = candidates.find((b) => b.name.toLowerCase() === preferredName.toLowerCase());
    if (!forced) {
      throw new Error(
        `Browser "${preferredName}" not found or not installed. Available: ${candidates.map((b) => b.name).join(", ")}`,
      );
    }
    return { browser: forced, key: getKeychainKey(forced) };
  }

  candidates = orderBrowsersByDefault(candidates);

  for (const browser of candidates) {
    try {
      const key = getKeychainKey(browser);
      if (checkGithubCookies(browser, key)) {
        return { browser, key };
      }
    } catch {}
  }

  throw new Error(
    `No github.com session found in any installed browser (${candidates.map((b) => b.name).join(", ")}). Log in to github.com first.`,
  );
}

function decryptCookie(encrypted: Buffer, key: Buffer): string {
  if (!encrypted || encrypted.length === 0) return "";

  const prefix = encrypted.subarray(0, 3).toString("utf-8");
  if (prefix !== "v10") return encrypted.toString("utf-8");

  const payload = encrypted.subarray(3);
  const iv = Buffer.from(" ".repeat(16), "utf-8");
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(false);

  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  const padByte = decrypted[decrypted.length - 1]!;
  let unpadded: Buffer;
  if (padByte > 0 && padByte <= 16) {
    unpadded = decrypted.subarray(0, decrypted.length - padByte);
  } else {
    unpadded = decrypted;
  }

  // Skip first 32 bytes (nonce/metadata)
  return unpadded.subarray(32).toString("utf-8");
}

export async function extractBrowserCookies(preferredBrowser?: string): Promise<GitHubCookies> {
  const { browser, key } = detectBrowserWithGithubCookies(preferredBrowser);

  const tmpPath = join(tmpdir(), `tsk-github-cookies-${Date.now()}.db`);
  try {
    copyFileSync(browser.cookiesPath, tmpPath);
  } catch {
    throw new Error(
      `Cannot read ${browser.name} cookies. Is ${browser.name} running? Try quitting and retrying.`,
    );
  }

  let cookies: Record<string, string>;
  try {
    const db = new Database(tmpPath, { readonly: true });
    const rows = db
      .query<{ name: string; encrypted_value: Buffer }, []>(
        "SELECT name, encrypted_value FROM cookies WHERE host_key LIKE '%github.com%'",
      )
      .all();
    db.close();

    cookies = {};
    for (const row of rows) {
      cookies[row.name] = decryptCookie(Buffer.from(row.encrypted_value), key);
    }
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }

  const userSession = cookies["user_session"];
  const ghSess = cookies["_gh_sess"];
  const dotcomUser = cookies["dotcom_user"];

  if (!userSession || !ghSess) {
    const missing: string[] = [];
    if (!userSession) missing.push("user_session");
    if (!ghSess) missing.push("_gh_sess");
    throw new Error(
      `Missing GitHub cookies: ${missing.join(", ")}. Log in to https://github.com in ${browser.name} first.`,
    );
  }

  return {
    userSession,
    ghSess,
    dotcomUser: dotcomUser ?? "",
    browser: browser.name,
    storedAt: Math.floor(Date.now() / 1000),
  };
}

export function openLoginPage(): void {
  try {
    execSync(`open "https://github.com/login"`);
  } catch {
    console.error("Could not open browser. Manually visit https://github.com/login");
  }
}

/**
 * Try to obtain a Bearer token for api.github.com.
 *
 * Order:
 *   1. Explicit --gh-token override (caller pass)
 *   2. `gh config get -h github.com oauth_token` (works if user did `gh auth login`)
 *   3. Returns undefined → caller decides whether to error
 *
 * The captured token is stored once in tsk credentials so subsequent
 * tsk commands don't need to shell out to gh.
 */
export function captureGhToken(override?: string): string | undefined {
  if (override && override.trim()) return override.trim();
  try {
    const out = execSync(`gh config get -h github.com oauth_token`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}
