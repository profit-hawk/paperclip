import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ghFetch } from "../services/github-fetch.js";

function getRequestHeaders(callArgs: unknown[]): Headers {
  const init = callArgs[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

describe("ghFetch", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GH_TOKEN", "");
    vi.stubEnv("GITHUB_ENTERPRISE_HOSTS", "");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not send an Authorization header when no token is set", async () => {
    await ghFetch("https://api.github.com/repos/o/r");

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls).toHaveLength(1);
    const headers = getRequestHeaders(calls[0]);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("sends Authorization: Bearer <GITHUB_TOKEN> when GITHUB_TOKEN is set", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_github_token_value");

    await ghFetch("https://api.github.com/repos/o/r");

    const headers = getRequestHeaders(vi.mocked(fetch).mock.calls[0]);
    expect(headers.get("Authorization")).toBe("Bearer ghp_github_token_value");
  });

  it("sends Authorization: Bearer <GH_TOKEN> when only GH_TOKEN is set", async () => {
    vi.stubEnv("GH_TOKEN", "ghp_gh_token_value");

    await ghFetch("https://api.github.com/repos/o/r");

    const headers = getRequestHeaders(vi.mocked(fetch).mock.calls[0]);
    expect(headers.get("Authorization")).toBe("Bearer ghp_gh_token_value");
  });

  it("prefers GITHUB_TOKEN over GH_TOKEN when both are set", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_primary");
    vi.stubEnv("GH_TOKEN", "ghp_fallback");

    await ghFetch("https://api.github.com/repos/o/r");

    const headers = getRequestHeaders(vi.mocked(fetch).mock.calls[0]);
    expect(headers.get("Authorization")).toBe("Bearer ghp_primary");
  });

  it("preserves caller-provided headers alongside the Authorization header", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_primary");

    await ghFetch("https://api.github.com/repos/o/r", {
      headers: {
        Accept: "application/vnd.github+json",
        "X-Custom-Header": "custom-value",
      },
    });

    const headers = getRequestHeaders(vi.mocked(fetch).mock.calls[0]);
    expect(headers.get("Authorization")).toBe("Bearer ghp_primary");
    expect(headers.get("Accept")).toBe("application/vnd.github+json");
    expect(headers.get("X-Custom-Header")).toBe("custom-value");
  });

  it("does not send the env token to non-GitHub hosts", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_primary");

    await ghFetch("https://attacker.example/owner/repo");

    const headers = getRequestHeaders(vi.mocked(fetch).mock.calls[0]);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("attaches the token when fetching from raw.githubusercontent.com", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_primary");

    await ghFetch("https://raw.githubusercontent.com/o/r/main/README.md");

    const headers = getRequestHeaders(vi.mocked(fetch).mock.calls[0]);
    expect(headers.get("Authorization")).toBe("Bearer ghp_primary");
  });

  it("attaches the token for hosts listed in GITHUB_ENTERPRISE_HOSTS", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_primary");
    vi.stubEnv("GITHUB_ENTERPRISE_HOSTS", "github.acme.com, ghe.internal");

    await ghFetch("https://ghe.internal/api/v3/repos/o/r");

    const headers = getRequestHeaders(vi.mocked(fetch).mock.calls[0]);
    expect(headers.get("Authorization")).toBe("Bearer ghp_primary");
  });

  it("does not clobber a caller-provided Authorization header", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_server");

    await ghFetch("https://api.github.com/repos/o/r", {
      headers: {
        Authorization: "Bearer caller_supplied_token",
      },
    });

    const headers = getRequestHeaders(vi.mocked(fetch).mock.calls[0]);
    expect(headers.get("Authorization")).toBe("Bearer caller_supplied_token");
  });
});
