# Paperclip VPS — Operational Notes

## Permission gotcha (CRITICAL)
Paperclip server runs as UID 1000 (node). Anything you `docker exec` into
runs as root by default and creates root-owned files in /paperclip — which
node can't read. Result: adapter probes fail with "OPENAI_API_KEY not set",
runs fail with EACCES.

After ANY in-container CLI work (codex login, claude login, paperclipai
onboard, manual file edits), run:

    docker exec paperclip find /paperclip -not -name '.bash_history' -exec chown 1000:1000 {} \;

## config.json field names
Path: /paperclip/instances/default/config.json
- server.bind: must be "lan", NOT "all" (CLI rejects "all")
- auth.publicBaseUrl: required when exposure=public (NOT "baseUrl")
- auth.baseUrlMode: "explicit" (not "auto")

## Render Postgres
DATABASE_URL must end with `?sslmode=require`

## Editing inside the container
No nano/vi by default. Install with:
    docker exec paperclip apt-get update && docker exec paperclip apt-get install -y nano

## Image rollback
Change IMAGE_TAG in /opt/paperclip/.env to a sha-XXXXXXX tag.
Available tags: github.com/profit-hawk/paperclip/pkgs/container/paperclip
Then: docker compose -f docker-compose.production.yml up -d

## Adapter auth lives at
- Codex: /paperclip/.codex/auth.json (subscription via `codex login --device-auth`)
- Claude Code: /paperclip/.claude/.credentials.json + /paperclip/.claude.json (subscription via `claude` first-run)

Both use subscription auth (Pro/Max), not API keys, to avoid per-token billing.