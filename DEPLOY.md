# Hosting frameshotter (hosted mode)

Local use is unchanged — `node index.js` still binds `127.0.0.1` with no auth.
Hosted mode is fully opt-in behind `FRAMESHOTTER_PUBLIC=1` and adds: bind
`0.0.0.0`, a shared password, an SSRF guard, and one-capture-at-a-time
serialization. It **refuses to start** in public mode without a password.

Screenshots are **download-and-forget**: captures land on the container's
ephemeral disk, get served back / zipped to the browser, and vanish on restart.
No storage to configure.

## Environment variables

| Var | Required | What it does |
|---|---|---|
| `FRAMESHOTTER_PUBLIC=1` | yes (set in Dockerfile) | Turns on hosted mode |
| `FRAMESHOTTER_PASSWORD` | **yes** | Shared password (any username works at the Basic-auth prompt) |
| `FRAMESHOTTER_NO_SANDBOX=1` | yes (set in Dockerfile) | `--no-sandbox` for root-in-container Chromium |
| `PORT` | auto | Injected by the host; `startServer` honors it |

## Deploy

The `Dockerfile` is the whole build. Set `FRAMESHOTTER_PASSWORD` as a secret.

**Railway / Render** — point at the repo, they detect the Dockerfile. Add
`FRAMESHOTTER_PASSWORD` in the dashboard. Give it ~1 GB RAM (Chromium on a tall
retina page is hungry).

**Fly.io**

```bash
fly launch --no-deploy            # generates fly.toml from the Dockerfile
fly secrets set FRAMESHOTTER_PASSWORD=your-strong-password
fly deploy
```

In `fly.toml` set `internal_port = 5173` (or let PORT flow) and a VM with
≥1 GB RAM. All three hosts terminate TLS for you, so the password rides https.

## Scope (and what's deliberately left out)

Built for **a few trusted people** sharing one password. Intentionally skipped —
add only if you go fully public:

- per-user accounts / revocation
- rate limiting & per-user quotas
- captcha / abuse handling
- persistent cloud storage (S3/R2) + a gallery that survives restarts

The capture lock is a single global flag — one capture at a time across all
users. If a handful of people genuinely contend, swap it for a small queue.
