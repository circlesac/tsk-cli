import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

interface AcliConfig {
  site: string;
  cloud_id: string;
  email: string;
}

interface AcliToken {
  access_token: string;
}

export interface JiraAuth {
  site: string;
  cloudId: string;
  email: string;
  token: string;
  authType: "api_token" | "oauth";
}

function getAcliConfig(): AcliConfig {
  const configPath = join(homedir(), ".config", "acli", "global_auth_config.yaml");
  const content = readFileSync(configPath, "utf-8");

  const site = content.match(/site:\s*(.+)/)?.[1]?.trim();
  const cloudId = content.match(/cloud_id:\s*(.+)/)?.[1]?.trim();
  const email = content.match(/email:\s*(.+)/)?.[1]?.trim();

  if (!site || !cloudId || !email) {
    throw new Error("acli not configured. Run: acli jira auth login --token");
  }

  return { site, cloud_id: cloudId, email };
}

function getAcliToken(): { token: string; authType: "api_token" | "oauth" } {
  try {
    const raw = execSync('security find-generic-password -l "acli" -w', {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    const b64Data = raw.replace("go-keyring-base64:", "");
    const decoded = Buffer.from(b64Data, "base64");

    // OAuth token: gzip compressed JSON with access_token field
    // API token: plain base64 (not gzip compressed)
    try {
      const decompressed = gunzipSync(decoded);
      const data: AcliToken = JSON.parse(decompressed.toString());
      return { token: data.access_token, authType: "oauth" };
    } catch {
      return { token: decoded.toString(), authType: "api_token" };
    }
  } catch {
    throw new Error("Failed to read acli token from Keychain. Run: acli jira auth login --token");
  }
}

export function getJiraAuth(): JiraAuth {
  const config = getAcliConfig();
  const { token, authType } = getAcliToken();

  return {
    site: config.site,
    cloudId: config.cloud_id,
    email: config.email,
    token,
    authType,
  };
}
