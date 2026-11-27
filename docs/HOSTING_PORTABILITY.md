# WebRadio Website – Hosting Portability Guide

This document describes how to run the WebRadio Website on various hosting platforms, independent of Vercel.

## Supported Hosting Platforms

- Vercel (current provider)
- Docker / Docker Compose
- Linux Root Server (Ubuntu LTS, Debian Stable) — validated natively on Ubuntu 26.04 LTS (INFRA 1.3)
- Any Node.js-capable host

## Database Configuration

### Environment Variables

The application uses PostgreSQL with Prisma 8. `DATABASE_PROVIDER` selects the
host-validation rules; it is optional and defaults to `prisma`.

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_PROVIDER` | `prisma` (default) or `self-hosted` | Optional |
| `DATABASE_URL_POOLED` | Runtime connection (Prisma Postgres) / self-hosted runtime URL | Prisma: production · self-hosted: preferred |
| `DIRECT_URL` | CLI operations (migrations) | Prisma: production · self-hosted: optional |
| `DATABASE_URL` | Local development fallback; self-hosted runtime + CLI URL | Development |
| `DATABASE_ALLOWED_HOSTS` | Comma-separated extra hosts for `self-hosted` | Optional |
| `NEXTAUTH_SECRET` | NextAuth.js secret | Always |
| `NEXTAUTH_URL` | Application URL | Production |
| `CRON_SECRET` | Bearer token for `POST /api/cron/analytics` | Optional |

### Mode 1 (default): Prisma Postgres / Vercel

Leave `DATABASE_PROVIDER` unset (or set `prisma`). The rules are unchanged and
strict: `DATABASE_URL_POOLED` must be `pooled.db.prisma.io`, `DIRECT_URL` must be
`db.prisma.io`, loopback is allowed only outside production. A mismatched host
aborts with a message that names the variable and host, never the URL.

### Mode 2: self-hosted PostgreSQL

```bash
DATABASE_PROVIDER=self-hosted
DATABASE_URL="postgresql://webradio:<password>@postgres:5432/webradio"
```

Accepted hosts:

- loopback: `localhost`, `127.0.0.1`, `::1`,
- single-label service names: `postgres`, `webradio-db` (Docker Compose,
  intranet short names),
- anything else (FQDN, private or public IP, IPv6 literal) only when listed in
  `DATABASE_ALLOWED_HOSTS` — there is no blanket allow-any-host switch.

The URL must use `postgresql:`/`postgres:`, name a database and include a user;
a production runtime also requires a password. `DIRECT_URL` is optional in this
mode: runtime and Prisma CLI use `DATABASE_URL_POOLED` (runtime) then
`DATABASE_URL`.

Supported providers: self-hosted PostgreSQL 18, Vercel Postgres, Neon, Supabase,
Railway, AWS RDS. The managed providers need `DATABASE_PROVIDER=self-hosted`
**and** their host in `DATABASE_ALLOWED_HOSTS`; alternatively keep Prisma mode
for Prisma Postgres.

## Background Tasks

All four analytics schedules share one implementation
(`src/lib/analytics/schedule-execution.ts`) and two transports.

### Vercel Schedules (unchanged)

`POST /api/schedules/analytics` (private, `schedule/v1beta` trigger):
- Analytics Traffic Sync (daily 03:15 UTC)
- Analytics Repo Stats Sync (daily 03:45 UTC)
- Analytics Releases Sync (daily 04:15 UTC)
- Analytics Retention (daily 04:45 UTC)

### Portable endpoint (any host)

```bash
curl -fsS -X POST "https://<host>/api/cron/analytics?schedule=analytics-traffic" \
  -H "Authorization: Bearer $CRON_SECRET"
```

- POST only (GET → 405), `CRON_SECRET` required, constant-time comparison,
- no `CRON_SECRET` on the server → 503 and nothing runs,
- wrong/missing secret → 401,
- unknown schedule → 400; job failure → 500; already running/locked → 409,
- without `?schedule=` all four run sequentially,
- duplicate protection: in-process guard (409) plus durable per-source locks in
  `AnalyticsSyncRun`.

Use it from cron, systemd timers, GitHub Actions or any HTTP scheduler. See
`HOSTING_MIGRATION_GUIDE.md` §7b for crontab lines, secret handling and status
codes.

### Verified natively on Linux (INFRA 1.3)

Ubuntu 26.04 LTS without Docker, own PostgreSQL 18.6 and `DATABASE_PROVIDER=self-hosted`:

- 14 migrations from an empty database, `db:verify --strict` green (marker + schema),
- 126 integration tests against that database,
- `pg_dump -Fc` / `pg_restore` with a data marker and a full per-table row comparison,
- the complete cron matrix plus real crontab runs (`CRON_TZ=UTC`),
- Caddy with internal TLS, HTTP/2 and HTTP/3, 8080→8443 redirect and security headers,
- `TRUST_PROXY=1` proven end to end: ten allowed requests, then 429 for the same
  `X-Forwarded-For`, while another IP and requests without the header stayed 200.

Details and the remaining open points (VM reboot persistence, Caddy as a system
service): `docs/PHASE_INFRA1.3_NATIVE_LINUX_VALIDATION_REPORT.md`.

## File Storage

The application does not require persistent file storage for critical data:
- No local file uploads
- No persistent cache files
- All data stored in PostgreSQL

Optional external storage (for future file uploads):
- AWS S3
- Cloudflare R2
- Backblaze B2

## Email Configuration

Email sending via Nodemailer. Configure:
- `EMAIL_SERVER_HOST`
- `EMAIL_SERVER_PORT`
- `EMAIL_SERVER_USER`
- `EMAIL_SERVER_PASSWORD`
- `EMAIL_FROM`

Can use any SMTP provider or local Postfix.

## GitHub Integration

GitHub App and Webhooks work independently of hosting:
- GitHub REST API calls
- Webhook delivery handling
- No Vercel-specific dependencies

## Docker Deployment

### Build Image

```bash
docker build --target runner -t webradio-website:latest .
```

The runtime image is ~360 MB (standalone output, no dev dependencies, non-root).
The `builder` target is a separate, large (~5.5 GB) one-shot image for database
commands; it never runs in production.

### Run with Docker Compose

```bash
cp deploy/env.production.example deploy/env.production
chmod 600 deploy/env.production        # fill in domain + secrets

docker compose --env-file deploy/env.production build
docker compose --env-file deploy/env.production up -d
docker compose --env-file deploy/env.production run --rm tools \
  node scripts/prisma-db.mts db migrate
docker compose --env-file deploy/env.production run --rm tools \
  node scripts/prisma-db.mts db verify --strict
```

`--env-file` is mandatory: `WEBRADIO_STACK_ENV` is only present in the
production/test env file, so a forgotten flag fails immediately instead of
silently reusing the development `.env`. For a host without public DNS use
`deploy/env.test.example` (ports 8080/8443, Caddy internal CA).

Full instructions and verified numbers: `docs/SELF_HOSTED_DEPLOYMENT_GUIDE.md`
and `docs/PHASE_INFRA1.4_PRODUCTION_READINESS_REPORT.md`.

`compose.yaml` is the full stack; `docker-compose.yml` only starts a development
database.

Because Compose also reads the project `.env` used by `next dev`, the stack takes
the application connection from `APP_DATABASE_URL` (optional; defaults to the
`postgres` service). The development `DATABASE_URL` therefore never leaks into
the container. `DATABASE_PROVIDER` defaults to `self-hosted` in the stack;
`APP_DATABASE_ALLOWED_HOSTS` covers external database hosts.

### Docker Compose Services

- `caddy` – edge proxy, the only service publishing ports (80/443; test host
  8080/8443), automatic HTTPS via ACME or an internal CA
- `webradio` – Next.js application (standalone, non-root uid 1001,
  `cap_drop: ALL`, healthcheck, 768 MB / 2 CPU limit)
- `postgres` – PostgreSQL 18, **no published port**, reachable only on the
  internal `backend` network, 512 MB / 1 CPU limit
- `tools` – one-shot profile (`--profile tools`) for migrate/verify/status

### Standalone Docker

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL_POOLED="postgresql://..." \
  -e DIRECT_URL="postgresql://..." \
  -e NEXTAUTH_SECRET="..." \
  webradio-website:latest
```

## Linux Server Deployment

### System Requirements

- Ubuntu 26.04 LTS (verified) or Debian 12/13
- Node.js 24+ (engines: `>=24.11.0`)
- PostgreSQL 18+ (18.6 verified)
- Caddy 2.11 (recommended, verified) or Nginx (alternative)
- 1 vCPU / 1 GB minimum, 2 vCPU / 2 GB recommended (measured: ~180 MiB idle)

### Installation

1. Install Node.js 24:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. Install PostgreSQL 18

3. Clone repository and install dependencies:
   ```bash
   git clone <repo-url>
   cd webradio-website
   npm ci
   ```

4. Configure environment variables

5. Run migrations:
   ```bash
   npm run db:migrate
   ```

6. Build application:
   ```bash
   npm run build
   ```

7. Start with PM2:
   ```bash
   npm install -g pm2
   pm2 start npm --name "webradio" -- start
   pm2 save
   pm2 startup
   ```

### Reverse Proxy (Caddy, recommended)

```bash
sudo REPO=/opt/webradio bash deploy/systemd/install-native-ops.sh
sudo systemctl status caddy.service
```

Before the installer, `deploy/install/preflight.sh` validates the host read-only
and `deploy/install/install-production.sh` creates directories, the app env
(secrets generated, not printed) and the backup key (dry-run by default,
idempotent). The systemd installer copies `deploy/caddy/Caddyfile.native` to
`/etc/caddy/Caddyfile`, creates `/etc/caddy/caddy.env` (0600, `SITE_ADDRESS`,
`ACME_EMAIL`), validates the config and only then enables the unit. Both timers
for encrypted database/config backups and the offsite copy are installed with
the same command. The Caddyfile proxies to
`127.0.0.1:3010`, sets HSTS and the security headers, removes `Server`, and
checks `/api/ready` as upstream health probe (database `SELECT 1`; `/api/health`
remains liveness for Docker/Vercel). Set `PORT=3010` and
`HOSTNAME=127.0.0.1` in the application env so the proxy target matches; for a
test host use `Caddyfile.native-test` (internal CA, port 8443).

### Reverse Proxy (Nginx, alternative)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

With either proxy, `TRUST_PROXY=1` is required in the application environment.

### HTTPS

Caddy obtains and renews certificates automatically (ACME) once DNS points at
the host and ports 80/443 are reachable. With Nginx, use Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

DNS, firewall and real certificate issuance are release-gated changes; see the
deployment guide, section 10.

## Security Considerations

### Secrets Management

Never commit secrets to the repository. Use:
- Environment variables
- Secret managers (HashiCorp Vault, AWS Secrets Manager)
- Docker secrets (Docker Swarm)
- Kubernetes secrets

### Database Security

- Use strong passwords
- Enable SSL/TLS
- Restrict access to local networks
- Regular backups

### Rate Limiting

Application-level rate limiting is implemented for:
- Login attempts
- Registration
- Password reset

### Webhook Security

- HMAC-SHA256 signature verification
- Idempotency via delivery IDs
- Repository binding

## Vercel Compatibility

The application remains fully compatible with Vercel:
- No changes required for Vercel deployment
- Existing CI/CD workflow unchanged
- Vercel-specific configurations preserved in `vercel.json`

## Migration from Vercel

See `HOSTING_MIGRATION_GUIDE.md` for step-by-step migration instructions.

## Troubleshooting

### Database Connection Failed

- Verify `DATABASE_URL_POOLED` is set
- Check PostgreSQL is running
- Verify network connectivity

### Build Fails

- Ensure Node.js 24+ is installed
- Check all dependencies are installed
- Verify Prisma contract emits successfully

### Crashes on Startup

- Check environment variables are set
- Verify database connection
- Check logs for specific errors
