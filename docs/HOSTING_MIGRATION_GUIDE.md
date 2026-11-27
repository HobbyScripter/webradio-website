# WebRadio Website – Hosting Migration Guide

This guide provides step-by-step instructions for migrating from Vercel to a self-hosted Linux server.

## Current status: self-hosting is supported

INFRA 1.1 found two portability blockers; both were resolved and verified on
2026-11-21 (see `docs/PHASE_INFRA1.2_HOSTING_PORTABILITY_REPORT.md`, status
COMPLETED WITH LIMITATIONS because no real Linux host was available):

1. **Database host is configurable.** `src/lib/db-connection.ts` now reads
   `DATABASE_PROVIDER`. The default `prisma` keeps the old strict rules
   (`pooled.db.prisma.io` / `db.prisma.io`). `self-hosted` accepts `postgres`
   and other single-label service names plus an explicit
   `DATABASE_ALLOWED_HOSTS` allowlist — the host check is never switched off.
2. **Schedules are portable.** The job logic lives in
   `src/lib/analytics/schedule-execution.ts`, shared by the Vercel Schedules
   function and the new `POST /api/cron/analytics`, which requires
   `CRON_SECRET` and answers 405 for GET. Vercel keeps working unchanged.
3. **The production build still needs `NEXTAUTH_SECRET` and `NEXTAUTH_URL`.**
   Pass placeholders at build time (the `Dockerfile` does this) and the real
   values at runtime; never bake secrets into an image layer.

INFRA 1.3 then ran the stack natively on Ubuntu 26.04 LTS without Docker:
PostgreSQL 18.6, Node 24.22.3, systemd (dedicated user, sandbox, auto-restart),
journald, cron and Caddy with HTTPS, including `TRUST_PROXY` behind the proxy.
See `docs/PHASE_INFRA1.3_NATIVE_LINUX_VALIDATION_REPORT.md`. Still open there:
VM reboot persistence and Caddy as a system service (it ran as a user process).

INFRA 1.4 added the production operations layer and a second operating form:

* `compose.yaml` – Caddy + Next.js + PostgreSQL 18 in one stack, only Caddy
  publishes ports, database on an internal network, one-shot `tools` container
  for migrations. Verified: 360 MB image, 44 tables, encrypted backup/restore
  drill, monitoring, restart persistence.
* `deploy/systemd/*` – Caddy as a systemd unit, backup/restore-drill/health
  timers and an `OnFailure` alert, installed by
  `sudo REPO=/opt/webradio bash deploy/systemd/install-native-ops.sh`.

INFRA 1.5 made the installation reproducible and completed the operations
layer: `deploy/install/preflight.sh` validates the host read-only,
`deploy/install/install-production.sh` prepares directories, users, env files
and the backup key (dry-run by default, idempotent), and the systemd set now
contains the application unit plus offsite and analytics-cron timers (13 units,
5 timers). Backups cover the database **and** the deployment configuration;
`deploy/backup/offsite-sync.sh` copies only encrypted archives to a second
target. See `docs/PHASE_INFRA1.5_PRODUCTION_DEPLOYMENT_PREPARATION_REPORT.md`.

Choose exactly one form (`docs/SELF_HOSTED_DEPLOYMENT_GUIDE.md`, section 1).
The Nginx/PM2 steps below remain valid as an alternative, but Caddy+systemd is
the verified default. Backup, restore and security procedures:
`docs/DISASTER_RECOVERY_GUIDE.md`, `docs/SELF_HOSTED_SECURITY_HARDENING.md`.

## Prerequisites

### Target Server
- Ubuntu 22.04 LTS or Debian 12 Stable
- 2GB RAM minimum (4GB recommended)
- 20GB disk space
- Root or sudo access

### Required Information
- PostgreSQL connection strings (must satisfy the runtime host rules above)
- NextAuth.js secret (`NEXTAUTH_SECRET`)
- `NEXTAUTH_URL` – must be the HTTPS production origin; the build rejects
  anything else in production mode
- GitHub App credentials
- Email SMTP credentials
- Domain name

### Build-time environment

`npm run build` must see `NEXTAUTH_SECRET` and `NEXTAUTH_URL`. Never put real
secrets into a Docker image: pass placeholders at build time and the real
values at runtime (the application reads them lazily, server-side).

### Database variables for a self-hosted PostgreSQL

```bash
DATABASE_PROVIDER=self-hosted
DATABASE_URL="postgresql://webradio:<password>@postgres:5432/webradio"
# Optional, only for FQDNs / private or public IPs:
DATABASE_ALLOWED_HOSTS="db.internal.example.com,10.0.0.5"
```

Accepted without further configuration are loopback (`localhost`, `127.0.0.1`,
`::1`) and single-label names such as `postgres` or `webradio-db`. Anything else
must be listed; there is no allow-any-host switch. Leave
`DATABASE_URL_POOLED`/`DIRECT_URL` unset for this mode — the runtime and the
Prisma CLI both fall back to `DATABASE_URL`.

For managed Prisma Postgres keep `DATABASE_PROVIDER` unset (or `prisma`) and set
`DATABASE_URL_POOLED` (`pooled.db.prisma.io`) plus `DIRECT_URL` (`db.prisma.io`)
for migrations.

## Step 1: Server Setup

### Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### Install Node.js 24
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
```

### Install PostgreSQL 18
```bash
sudo apt install -y postgresql-18 postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Install Nginx
```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Install PM2
```bash
sudo npm install -g pm2
```

## Step 2: Application Setup

### Clone Repository
```bash
git clone <your-repo-url>
cd webradio-website
```

### Install Dependencies
```bash
npm ci
```

### Configure Environment
```bash
cp .env.example .env
nano .env
```

Set all required variables:
- `DATABASE_URL_POOLED`
- `DIRECT_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- GitHub App credentials
- Email SMTP credentials

### Create Database
```bash
sudo -u postgres psql
CREATE DATABASE webradio;
CREATE USER webradio WITH PASSWORD 'strong-password';
GRANT ALL PRIVILEGES ON DATABASE webradio TO webradio;
\q
```

### Run Migrations
```bash
npm run db:migrate
npm run db:verify
```

### Build Application
```bash
# Build-time only; the real values are provided again when the service starts.
export NEXTAUTH_SECRET=build-time-placeholder
export NEXTAUTH_URL=https://your-domain.com
npm run build
```

For a container image, `next.config.ts` needs `output: "standalone"`; without
it there is no `.next/standalone` to copy and the runner stage fails. The
runtime user must own `.next` (or at least `.next/cache`), otherwise ISR and
prerender cache writes fail with `EACCES`.

## Step 3: PM2 Configuration

### Start Application
```bash
pm2 start npm --name "webradio" -- start
pm2 save
pm2 startup
```

### Check Status
```bash
pm2 status
pm2 logs webradio
```

### Alternative: systemd instead of PM2

Verified on Ubuntu 26.04 (INFRA 1.3): one unit, no process manager, logs in
journald.

```ini
[Unit]
Description=WebRadio Website
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=simple
User=webradio
Group=webradio
WorkingDirectory=/opt/webradio/app
EnvironmentFile=/etc/webradio/webradio.env
ExecStart=/usr/bin/node /opt/webradio/app/server.js
Restart=on-failure
RestartSec=3
TimeoutStopSec=20
KillSignal=SIGTERM
SuccessExitStatus=143
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/webradio/app/.next/cache
UMask=0077
SyslogIdentifier=webradio

[Install]
WantedBy=multi-user.target
```

`SuccessExitStatus=143` is required: Node exits with 143 on `SIGTERM`, and
without it `systemctl stop` leaves the unit in `failed` state. The environment
file belongs to root (`0600`), the service user must own `.next/cache`
(`ReadWritePaths`), otherwise ISR writes fail.

The unit above uses the default port 3000. The INFRA 1.4 reference deployment
sets `PORT=3010` and `HOSTNAME=127.0.0.1` in `/etc/webradio/app.env`; whatever
value you choose, the `proxy_pass` target (Caddy or Nginx) must match it.

## Step 4: Reverse Proxy

### Recommended: Caddy with automatic HTTPS

```bash
# Prepare host directories, app.env, backup key (dry-run first)
sudo bash deploy/install/install-production.sh --mode native
sudo bash deploy/install/install-production.sh --mode native --apply
bash deploy/install/preflight.sh --mode native

sudo REPO=/opt/webradio bash deploy/systemd/install-native-ops.sh --dry-run
sudo REPO=/opt/webradio bash deploy/systemd/install-native-ops.sh
sudo systemctl status caddy.service webradio-app.service
```

Edit `/etc/caddy/caddy.env` (`SITE_ADDRESS`, `ACME_EMAIL`) before running the
installer; it refuses to enable the service while `CHANGE_ME` is present and
verifies that the unit stays active. Alternative for a host without public DNS:
`deploy/caddy/Caddyfile.native-test` (internal CA, port 8443).

### Alternative: Nginx

#### Create Configuration
```bash
sudo nano /etc/nginx/sites-available/webradio
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/webradio /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Step 5: HTTPS with Let's Encrypt

Caddy handles certificates automatically once DNS points at the host and ports
80/443 are open; no extra step is required. The Certbot steps below are for the
Nginx alternative.

### Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Obtain Certificate
```bash
sudo certbot --nginx -d your-domain.com
```

### Auto-Renewal
Certbot automatically configures auto-renewal.

## Step 6: DNS Update

Point your domain's A record to your server's IP address.

## Step 7: Functional Testing

1. Access application via HTTPS
2. Test registration and login
3. Test admin functionality
4. Verify GitHub integration
5. Check analytics sync (if configured)
6. Test download functionality

## Step 7b: Analytics schedules without Vercel

The four schedules are triggered through one endpoint:

```bash
curl -fsS -X POST "https://your-domain.com/api/cron/analytics?schedule=analytics-traffic" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Valid names: `analytics-traffic`, `analytics-repo-stats`, `analytics-releases`,
`analytics-retention`. Without `?schedule=` (or with a JSON body
`{"schedule":"…"}`) all four run sequentially. The endpoint exists only for
POST; anything else is 405.

**Provide the secret.** Use a root-readable file, never the crontab itself:

```bash
sudo install -m 600 -o root -g root /dev/null /etc/webradio/cron.env
sudo sh -c 'printf "CRON_SECRET=%s\n" "$(head -c 32 /dev/urandom | base64 | tr -d \"=+/\")" > /etc/webradio/cron.env'
```

Set the same value as `CRON_SECRET` in the application environment and restart
the app. Without `CRON_SECRET` the endpoint answers **503** and runs nothing.

**Cron entries** (same times as the Vercel schedules in `vercel.json`, UTC):

```cron
# /etc/cron.d/webradio-analytics
SHELL=/bin/sh
15 3 * * * root . /etc/webradio/cron.env && curl -fsS -X POST "https://your-domain.com/api/cron/analytics?schedule=analytics-traffic" -H "Authorization: Bearer $CRON_SECRET" >> /var/log/webradio-cron.log 2>&1
45 3 * * * root . /etc/webradio/cron.env && curl -fsS -X POST "https://your-domain.com/api/cron/analytics?schedule=analytics-repo-stats" -H "Authorization: Bearer $CRON_SECRET" >> /var/log/webradio-cron.log 2>&1
15 4 * * * root . /etc/webradio/cron.env && curl -fsS -X POST "https://your-domain.com/api/cron/analytics?schedule=analytics-releases" -H "Authorization: Bearer $CRON_SECRET" >> /var/log/webradio-cron.log 2>&1
45 4 * * * root . /etc/webradio/cron.env && curl -fsS -X POST "https://your-domain.com/api/cron/analytics?schedule=analytics-retention" -H "Authorization: Bearer $CRON_SECRET" >> /var/log/webradio-cron.log 2>&1
```

A systemd timer works the same way: one `oneshot` service per schedule with
`EnvironmentFile=/etc/webradio/cron.env` and the same `curl` call.

Verified on Ubuntu 26.04 (INFRA 1.3) with a user crontab: 405 for GET, 401 for a
missing or wrong secret, 400 for an unknown name, 200 for a run, 409
`ALREADY_RUNNING` for a parallel run, and real execution every minute during the
test. Put `CRON_TZ=UTC` in the crontab (as above the times are UTC) or convert
them to the server time zone — otherwise the jobs drift by the UTC offset and
across DST changes.

**Status codes** (`curl -f` fails on 4xx/5xx, so cron mail/logs flag it):

| Status | Meaning | Action |
| --- | --- | --- |
| 200 | run finished, `ok: true` | — |
| 400 | unknown schedule name / bad JSON | fix the cron line |
| 401 | missing or wrong `CRON_SECRET` | check `/etc/webradio/cron.env` and the app env |
| 405 | wrong HTTP method | use POST |
| 409 | run already in progress (`ALREADY_RUNNING`/`LOCKED`) | retry later; a parallel run never starts |
| 500 | job failed (`JOB_FAILED`/`EXECUTION_FAILED`) | inspect the app log (`analytics.schedule`) and GitHub credentials |
| 503 | `CRON_SECRET` not configured on the server | configure it, then retry |

The response body lists `schedule`, `executionId`, `ok` and `errorCode` per run;
the application log carries the full `analytics.schedule` line (sources,
httpStatus, retention counts). Parallel executions are prevented twice: an
in-process guard answers 409 immediately and durable per-source locks in
`AnalyticsSyncRun` (5-minute window) stop a second process from syncing.

## Step 8: Monitoring and Backups

Use the tested tooling instead of ad-hoc cron lines: backups are encrypted,
verified and rotated, and failures raise an alert.

### Install the operations units

```bash
sudo REPO=/opt/webradio bash deploy/systemd/install-native-ops.sh
sudo systemctl start webradio-backup.service     # first backup now
sudo systemctl start webradio-health.service     # first health report
sudo systemctl list-timers 'webradio-*'
```

| Timer | Schedule | Purpose |
| --- | --- | --- |
| `webradio-backup.timer` | daily 02:15 | encrypted `pg_dump` **and** configuration archive, 14 kept |
| `webradio-offsite.timer` | daily 02:45 | copy the encrypted archives to `OFFSITE_TARGET` |
| `webradio-cron.timer` | daily 03:15 | analytics schedules without Vercel |
| `webradio-restore-drill.timer` | Sundays 05:30 | restore into a throwaway DB + `db verify --strict` |
| `webradio-health.timer` | every 5 min | app, PostgreSQL, containers, Caddy, disk, RAM, CPU, load, units, backup age/integrity, cron, certificate |

Configuration lives in `/etc/webradio/backup.env`,
`/etc/webradio/monitoring.env`, `/etc/webradio/cron.env` and
`/etc/webradio/offsite.env` (0600). The encryption key
`/etc/webradio/backup.key` (0600) must be copied to a password manager: without
it every backup is unreadable. Secrets never appear in backup archives; the
configuration archive is a whitelist and aborts if it would contain one.

See `docs/DISASTER_RECOVERY_GUIDE.md` for restore procedures and
`docs/SELF_HOSTED_DEPLOYMENT_GUIDE.md` for the full operations guide.

### Logs

```bash
journalctl -u webradio -f          # application (systemd form)
sudo tail -f /var/log/caddy/access.log
```

## Step 9: Rollback to Vercel

If migration fails:

1. Revert DNS to Vercel
2. Deploy latest working version to Vercel
3. Investigate failure logs
4. Fix issues and retry migration

## Troubleshooting

### Application won't start
- Check PM2 logs: `pm2 logs webradio`
- Verify environment variables
- Check database connection

### Nginx 502 Bad Gateway
- Verify application is running: `pm2 status`
- Check port 3000 is listening
- Review Nginx error logs

### Database connection failed
- Verify PostgreSQL is running
- Check connection strings
- Test with `psql` command

## Post-Migration Checklist

- [ ] Application accessible via HTTPS
- [ ] Registration and login working
- [ ] Admin functionality working
- [ ] GitHub integration working
- [ ] Analytics sync configured (if applicable)
- [ ] Database backups configured
- [ ] Monitoring configured
- [ ] SSL certificate auto-renewal working
