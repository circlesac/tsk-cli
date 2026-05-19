import { join } from "node:path";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import type { GitHubCookies } from "./types.js";

const CONFIG_DIR = join(homedir(), ".config", "tsk");
const CREDENTIALS_FILE = join(CONFIG_DIR, "github-credentials.json");

export async function storeCookies(creds: GitHubCookies): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CREDENTIALS_FILE, JSON.stringify(creds, null, 2) + "\n");
}

export async function loadCookies(): Promise<GitHubCookies | null> {
  try {
    const content = await readFile(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(content) as GitHubCookies;
  } catch {
    return null;
  }
}

export async function removeCookies(): Promise<boolean> {
  try {
    await unlink(CREDENTIALS_FILE);
    return true;
  } catch {
    return false;
  }
}

export async function requireCookies(): Promise<GitHubCookies> {
  const creds = await loadCookies();
  if (!creds) {
    console.error('Not authenticated. Run: tsk github auth login');
    process.exit(1);
  }
  return creds;
}
