# CLAUDE.md — profit-hawk/paperclip

Authoritative orientation for Claude sessions working in **this** repository.
For general engineering rules (dev setup, DB workflow, PR checklist, UI/API
conventions) see `AGENTS.md` — that file is **upstream's** generic guide and
applies here too. **This file owns everything fork- and deploy-specific.**

> ⚠️ `AGENTS.md` §11 ("Fork-Specific: HenkDz/paperclip") is inherited from
> upstream and describes an *unrelated* contributor's fork (Hermes
> externalization, port 3101). It is **not** about us — ignore it and trust
> this file for fork/deploy details.

---

## 1. What this repo is

`profit-hawk/paperclip` is a **fork of [`paperclipai/paperclip`](https://github.com/paperclipai/paperclip)**
(the open-source Paperclip agent-orchestration platform). We track upstream
closely and keep only a few local patches. The fork is **deployed to a
Hostinger VPS** and served at **https://paperclip.profithawk.io**.

The deployed app is a **Docker image built from this repo's `master`** — there
is no npm/version pin to bump. "Updating to the latest version of paperclip"
means **merging the latest upstream release** into `master` (see §4).

## 2. Branch model

| Branch        | Role |
|---------------|------|
| `master`      | Main line. **Source of the production image.** Every push builds & pushes a Docker image (see §3). PRs land here. |
| `production`  | **Deploy/infra only.** Holds `docker-compose.production.yml`, `deploy/Caddyfile`, `deploy/env.production.example`, and `NOTES.md` (VPS ops runbook). Pushing here triggers a redeploy. These files do **not** exist on `master`. |
| `claude/*`    | Agent work branches. Branch from `master`, PR back into `master`. |

`NOTES.md` (on the `production` branch) is the **VPS operations runbook** —
read it before doing anything on the box (permissions, config.json fields,
rollback, adapter auth).

## 3. CI/CD pipeline

```
push to master ──▶ .github/workflows/docker.yml ("Docker")
                    builds multi-arch image from Dockerfile (COPY . . + pnpm build)
                    pushes ghcr.io/profit-hawk/paperclip:{latest, sha-<sha>, <semver on v* tags>}
                          │
                          ▼ (workflow_run: Docker completed on master)
                   .github/workflows/deploy.yml ("Deploy to VPS")
                    SSH (appleboy/ssh-action) → VPS /opt/paperclip
                    docker compose -f docker-compose.production.yml pull && up -d
```

`deploy.yml` runs on: (a) `workflow_run` after **Docker** finishes on `master`,
(b) push to `production` touching `docker-compose.production.yml` / `deploy/**`
/ `deploy.yml`, or (c) manual `workflow_dispatch` from the Actions tab.
Required secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.

`latest` is the default-branch (`master`) tag, so the VPS's default `IMAGE_TAG=latest`
tracks `master`.

## 4. Updating to the latest upstream paperclip (fork sync)

Upstream versions are **CalVer** `vYYYY.MDD.PATCH` (e.g. `v2026.529.0`). The
in-repo `package.json` "version" deliberately stays `0.3.1` on master/tags —
upstream stamps the real CalVer at npm-publish time, so **do not hand-bump it**.

Find the latest released version, then merge its **tag** (prefer the released
tag over `upstream/master`, which carries unreleased work):

```bash
# one-time
git remote add upstream https://github.com/paperclipai/paperclip.git

# latest released version number:
npm view paperclipai version            # e.g. 2026.529.0

LATEST=v2026.529.0
git fetch --no-tags upstream tag "$LATEST"
git switch -c claude/sync-$LATEST master   # work branch
git merge --no-ff "$LATEST"                # then open a PR into master
```

Notes:
- DB migrations (`packages/db/src/migrations/`) are **additive** and run
  automatically on startup — no manual migration step.
- Merges have been **conflict-free** historically because our patches (§5) sit
  in files upstream doesn't touch. If `pnpm install` adds an empty
  `packages/<x>: {}` importer to `pnpm-lock.yaml`, that's incidental churn —
  revert it (`git checkout -- pnpm-lock.yaml`) to match upstream's lockfile.
- Validate the way the image builds: `pnpm install --frozen-lockfile` then
  `pnpm --filter @paperclipai/ui build && pnpm --filter @paperclipai/plugin-sdk build && pnpm --filter @paperclipai/server build`
  (must produce `server/dist/index.js`). The PR CI (`pr.yml`) is the full gate.

## 5. Fork-specific patches (must survive every upstream sync)

These are the **only** divergences from upstream on `master`:

1. **`.github/workflows/deploy.yml`** — the Hostinger deploy job. Not in upstream.
2. **`server/src/services/github-fetch.ts`** (+ `server/src/__tests__/github-fetch.test.ts`)
   — `ghFetch()` injects `GITHUB_TOKEN` / `GH_TOKEN` as a Bearer header, but
   **only for trusted hosts** (`api.github.com`, `raw.githubusercontent.com`,
   plus any in the `GITHUB_ENTERPRISE_HOSTS` env var). Lets the server read
   private repos without leaking the token to arbitrary hosts.

`.github/workflows/docker.yml` is **upstream's** file — it already targets our
registry automatically via `ghcr.io/${{ github.repository }}`, so it needs no
fork patch.

## 6. Production runtime (the VPS)

- **Host:** Hostinger VPS, app lives at `/opt/paperclip`. Image:
  `ghcr.io/profit-hawk/paperclip:${IMAGE_TAG:-latest}` (set `IMAGE_TAG` in
  `/opt/paperclip/.env`; **roll back** by setting a `sha-XXXXXXX` tag).
- **Reverse proxy:** host **Caddy** terminates TLS for
  `paperclip.profithawk.io` (auto Let's Encrypt) and proxies to the container
  on `127.0.0.1:3100`. Container exposes only localhost.
- **Database:** external **Render Postgres**. `DATABASE_URL` **must** end with
  `?sslmode=require`.
- **Auth/exposure:** `PAPERCLIP_DEPLOYMENT_MODE=authenticated`,
  `PAPERCLIP_DEPLOYMENT_EXPOSURE=public`, `BETTER_AUTH_SECRET` required.
- **Permission gotcha (CRITICAL):** the server runs as UID 1000 (`node`).
  `docker exec` defaults to root and creates root-owned files in `/paperclip`
  that node can't read (adapter probes / runs then fail). After ANY in-container
  work, run:
  `docker exec paperclip find /paperclip -not -name '.bash_history' -exec chown 1000:1000 {} \;`
- **Adapter auth** (Codex, Claude Code) uses **subscription** credentials under
  `/paperclip` (not API keys). See `NOTES.md` on the `production` branch.

## 7. Local dev quickstart

Monorepo: pnpm workspaces (`server`, `ui`, `cli`, `packages/*`). Node ≥ 20,
pnpm 9.15.4 (via corepack).

```bash
pnpm install
pnpm dev          # server (watch) — auto-provisions embedded Postgres for dev
pnpm dev:ui       # UI dev server
pnpm typecheck    # pnpm -r typecheck
pnpm test         # vitest
pnpm db:generate  # after schema changes (see AGENTS.md §6)
pnpm db:migrate
```

See `AGENTS.md` for the full engineering rules, DB-change workflow, and PR
requirements.
