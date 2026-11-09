import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { parse } from "yaml";

interface AcliConfig {
  site: string;
  cloud_id: string;
  email: string;
  profileId: string;
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
  const configPath = join(homedir(), ".config", "acli", "jira_config.yaml");
  try {
    const config: unknown = parse(readFileSync(configPath, "utf-8"));
    if (isRecord(config) && typeof config.current_profile === "string" && Array.isArray(config.profiles)) {
      // acli identifies a profile by cloud_id:account_id, including accounts on the same site.
      const profiles = config.profiles.filter((profile: unknown) =>
        isRecord(profile) && `${profile.cloud_id}:${profile.account_id}` === config.current_profile,
      );
      const profile: unknown = profiles[0];
      if (profiles.length === 1 && isRecord(profile) &&
        typeof profile.site === "string" && profile.site.trim() &&
        typeof profile.cloud_id === "string" && profile.cloud_id.trim() &&
        typeof profile.account_id === "string" && profile.account_id.trim() &&
        typeof profile.email === "string" && profile.email.trim()) {
        return { site: profile.site.trim(), cloud_id: profile.cloud_id.trim(), email: profile.email.trim(), profileId: config.current_profile };
      }
    }
  } catch {
    // YAML errors can contain config excerpts with account identities; do not echo them.
  }
  throw new Error("acli active profile not configured. Run: acli jira auth status or acli jira auth login --token");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getAcliToken(profileId: string): { token: string; authType: "api_token" | "oauth" } {
  try {
    const raw = execFileSync("security", ["find-generic-password", "-s", "acli", "-a", `jira:${profileId}`, "-w"], {
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
  const { token, authType } = getAcliToken(config.profileId);

  return {
    site: config.site,
    cloudId: config.cloud_id,
    email: config.email,
    token,
    authType,
  };
}
