import { unprocessable } from "../errors.js";

function isGitHubDotCom(hostname: string) {
  const h = hostname.toLowerCase();
  return h === "github.com" || h === "www.github.com";
}

export function gitHubApiBase(hostname: string) {
  return isGitHubDotCom(hostname) ? "https://api.github.com" : `https://${hostname}/api/v3`;
}

export function resolveRawGitHubUrl(hostname: string, owner: string, repo: string, ref: string, filePath: string) {
  const p = filePath.replace(/^\/+/, "");
  return isGitHubDotCom(hostname)
    ? `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${p}`
    : `https://${hostname}/raw/${owner}/${repo}/${ref}/${p}`;
}

const GITHUB_DOT_COM_TOKEN_HOSTS = new Set(["api.github.com", "raw.githubusercontent.com"]);

function isAuthorizedGitHubHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (GITHUB_DOT_COM_TOKEN_HOSTS.has(h)) return true;
  const enterpriseList = process.env.GITHUB_ENTERPRISE_HOSTS;
  if (!enterpriseList) return false;
  return enterpriseList
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)
    .includes(h);
}

export async function ghFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) {
    let hostname: string | null = null;
    try {
      hostname = new URL(url).hostname;
    } catch {
      // Invalid URL — fall through and let fetch surface the error below.
    }
    if (hostname && isAuthorizedGitHubHost(hostname)) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  try {
    return await fetch(url, { ...init, headers });
  } catch {
    throw unprocessable(`Could not connect to ${new URL(url).hostname} — ensure the URL points to a GitHub or GitHub Enterprise instance`);
  }
}
