import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getJiraAuth } from "../../../src/platforms/jira/auth.js";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn(), execSync: vi.fn() }));
vi.mock("node:fs", () => ({ readFileSync: vi.fn() }));

const config = `version: 1
current_profile: "cloud-example:account-active"
profiles:
    - site: example.atlassian.net
      cloud_id: cloud-example
      account_id: account-other
      email: other@example.com
      auth_type: api_token
    - site: example.atlassian.net
      cloud_id: cloud-example
      account_id: account-active
      email: alice@example.com
      auth_type: api_token
`;

function keyringValue(token: string | Buffer): string {
  return `go-keyring-base64:${Buffer.from(token).toString("base64")}\n`;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readFileSync).mockReturnValue(config);
  vi.mocked(execFileSync).mockReturnValue(keyringValue("example-active-token"));
  // The old unscoped lookup can return another account's token.
  vi.mocked(execSync).mockReturnValue(keyringValue("example-other-token"));
});

afterEach(() => vi.unstubAllGlobals());

describe("acli Jira authentication", () => {
  it("pairs the active profile email with its exact Keychain account", () => {
    expect(getJiraAuth()).toEqual({
      site: "example.atlassian.net",
      cloudId: "cloud-example",
      email: "alice@example.com",
      token: "example-active-token",
      authType: "api_token",
    });
    expect(execFileSync).toHaveBeenCalledWith(
      "security",
      ["find-generic-password", "-s", "acli", "-a", "jira:cloud-example:account-active", "-w"],
      expect.objectContaining({ encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }),
    );
    expect(execSync).not.toHaveBeenCalled();
  });

  it("follows profile switches across sites and never caches the prior identity", () => {
    getJiraAuth();
    vi.mocked(readFileSync).mockReturnValue(config
      .replace('current_profile: "cloud-example:account-active"', 'current_profile: "cloud-other:account-other"')
      .replace("site: example.atlassian.net", "site: other-example.atlassian.net")
      .replace("cloud_id: cloud-example", "cloud_id: cloud-other"));
    vi.mocked(execFileSync).mockReturnValue(keyringValue("example-switched-token"));
    expect(getJiraAuth()).toMatchObject({
      site: "other-example.atlassian.net", cloudId: "cloud-other",
      email: "other@example.com", token: "example-switched-token",
    });
    expect(vi.mocked(execFileSync).mock.calls[1]?.[1]).toContain("jira:cloud-other:account-other");
  });

  it("preserves whitespace normalization for quoted site and email values", () => {
    vi.mocked(readFileSync).mockReturnValue(config
      .replaceAll("site: example.atlassian.net", 'site: " example.atlassian.net "')
      .replace("email: alice@example.com", 'email: " alice@example.com "'));
    expect(getJiraAuth()).toMatchObject({ site: "example.atlassian.net", email: "alice@example.com" });
  });

  it.each([
    config.replace('"cloud-example:account-active"', '"missing:profile"'),
    config.replace('current_profile: "cloud-example:account-active"\n', ""),
    config.replace("      email: alice@example.com\n", ""),
    config.replace("profiles:", "profiles: invalid\nignored:"),
    config + "    - site: duplicate-example.atlassian.net\n      cloud_id: cloud-example\n      account_id: account-active\n      email: duplicate@example.com\n",
    "current_profile: [invalid YAML",
  ])("rejects invalid or incomplete active configuration before reading a token", (content) => {
    vi.mocked(readFileSync).mockReturnValue(content);
    expect(() => getJiraAuth()).toThrow(/acli.*config/i);
    expect(execFileSync).not.toHaveBeenCalled();
    expect(execSync).not.toHaveBeenCalled();
  });

  it("reports a missing active token without falling back or disclosing subprocess output", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("example-sensitive-keychain-output");
    });
    expect(() => getJiraAuth()).toThrow("Failed to read acli token from Keychain");
    expect(() => getJiraAuth()).not.toThrow("example-sensitive-keychain-output");
    expect(execSync).not.toHaveBeenCalled();
  });

  it("preserves compressed OAuth token support", () => {
    vi.mocked(execFileSync).mockReturnValue(keyringValue(gzipSync(JSON.stringify({ access_token: "example-oauth-token" }))));
    expect(getJiraAuth()).toMatchObject({ token: "example-oauth-token", authType: "oauth" });
  });
});
