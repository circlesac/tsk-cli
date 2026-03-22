import type { JiraAuth } from "./auth.js";

interface Attachment {
  id: string;
  filename: string;
  content: string;
  size: number;
  mimeType: string;
}

export function authHeaders(auth: JiraAuth): Record<string, string> {
  if (auth.authType === "api_token") {
    return { Authorization: `Basic ${Buffer.from(`${auth.email}:${auth.token}`).toString("base64")}` };
  }
  return { Authorization: `Bearer ${auth.token}` };
}

export async function getAttachments(auth: JiraAuth, issueKey: string): Promise<Attachment[]> {
  const url = `https://${auth.site}/rest/api/3/issue/${issueKey}?fields=attachment`;
  const res = await fetch(url, { headers: authHeaders(auth) });

  if (!res.ok) {
    throw new Error(`Failed to fetch issue ${issueKey}: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.fields?.attachment ?? [];
}

export async function downloadAttachment(auth: JiraAuth, contentUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(contentUrl, {
    headers: authHeaders(auth),
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Failed to download: ${res.status} ${res.statusText}`);
  }

  return res.arrayBuffer();
}

export async function findUserByEmail(auth: JiraAuth, email: string): Promise<{ accountId: string; displayName: string } | null> {
  const url = `https://${auth.site}/rest/api/3/user/search?query=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: authHeaders(auth) });

  if (!res.ok) return null;

  const users = await res.json();
  if (users.length > 0) {
    return { accountId: users[0].accountId, displayName: users[0].displayName };
  }
  return null;
}
