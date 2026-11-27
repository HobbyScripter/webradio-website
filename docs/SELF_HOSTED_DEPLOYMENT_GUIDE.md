# WebRadio Website – Self-Hosted Deployment Guide

Betriebshandbuch für den selbst verwalteten Linux-Betrieb. Es beschreibt die
zwei zulässigen Betriebsformen, ihre Installation, Prüfung, Aktualisierung und
Fehlerbehebung. Die Ergebnisse der Validierung stehen in
[`PHASE_INFRA1.4_PRODUCTION_READINESS_REPORT.md`](./PHASE_INFRA1.4_PRODUCTION_READINESS_REPORT.md),
Sicherheitsfragen in [`SELF_HOSTED_SECURITY_HARDENING.md`](./SELF_HOSTED_SECURITY_HARDENING.md),
Datensicherung in [`DISASTER_RECOVERY_GUIDE.md`](./DISASTER_RECOVERY_GUIDE.md).

Stand: INFRA 1.5 (2026-11-22). Vercel bleibt unverändert unterstützt; siehe
[`HOSTING_PORTABILITY.md`](./HOSTING_PORTABILITY.md). Die Nachweise dieser
Phase stehen in
[`PHASE_INFRA1.5_PRODUCTION_DEPLOYMENT_PREPARATION_REPORT.md`](./PHASE_INFRA1.5_PRODUCTION_DEPLOYMENT_PREPARATION_REPORT.md).

## 1. Zwei Betriebsformen – genau eine pro Host

| | **Variante A: nativ** | **Variante B: Docker Compose** |
|---|---|---|
| Anwendung | Next.js Standalone, systemd-Unit | Container `webradio` (Image `webradio-website`) |
| PostgreSQL | Host-Cluster (`postgresql.service`) | Container `postgres` (Volume `postgres-data`) |
| Reverse Proxy | Caddy als systemd-Unit | Container `caddy` |
| Ports am Host | 443/80 durch Caddy, 3010 nur loopback | 443/80 (Test: 8443/8080) durch Caddy |
| Secrets | `/etc/webradio/*.env` (0600) | `deploy/env.production` (0600) |
| DB-Migrationen | `npm run db:migrate` (Host) | einmaliger `tools`-Container |
| Backup | `BACKUP_MODE=native` | `BACKUP_MODE=docker` |
| Empfohlen für | kleinsten Root-Server, minimale Angriffsfläche | reproduzierbare Deployments, einfacher Rollback |
| Validiert | INFRA 1.3 (native VM) | INFRA 1.4 (Compose, linux/amd64) |

**Nie beide Formen auf einem Host betreiben.** Beide wollen Port 80/443 und
eine Datenbank gleichen Namens; zwei Listener oder zwei Anwendungen auf einer
Datenbank führen zu doppelten Cron-Läufen, widersprüchlichen Migrationen und
nicht nachvollziehbaren Fehlern. Für einen Wechsel gilt Abschnitt 9.

`docker-compose.yml` im Repository startet **nur** eine Entwicklungsdatenbank
(127.0.0.1:5433). Es ist kein zweiter Produktions-Stack; `compose.yaml` hat als
Compose-Datei Vorrang, wenn beide im selben Verzeichnis liegen.

## 2. Voraussetzungen

### Server

| Ressource | Minimum | Empfohlen | Begründung (gemessen) |
|---|---|---|---|
| vCPU | 1 | 2 | App 0,29 CPU bei 60 parallelen Anfragen (Burst) |
| RAM | 1 GB | 2 GB | App 131 MiB idle / 239 MiB unter Last, PostgreSQL 32–42 MiB, Caddy 16–25 MiB |
| Disk | 10 GB | 20 GB | Image 360 MB + Werkzeug-Image, DB klein, 14 Backups à 250 KB |
| OS | Debian 12/13, Ubuntu 24.04/26.04 | Ubuntu 26.04 LTS | validiert: Ubuntu 26.04.1, Node 24.22.3, PostgreSQL 18.6 |

### Software

```bash
# Variante A (nativ)
sudo apt update && sudo apt install -y ca-certificates curl openssl postgresql-18
# Node.js 24 (nodesource oder offizielles Tarball), Caddy 2.11 als Binary
node --version   # >= 24.11.0

# Variante B (Compose)
docker --version && docker compose version   # Engine >= 27, Compose >= 2.30
```

### Repository und Umgebung

```bash
sudo useradd --system --home /opt/webradio --shell /usr/sbin/nologin webradio
sudo git clone <repo> /opt/webradio          # oder rsync aus dem Build
sudo chown -R webradio:webradio /opt/webradio
```

Die Anwendung braucht `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `CRON_SECRET` und eine
`DATABASE_URL`. `TRUST_PROXY=1` ist hinter Caddy Pflicht, sonst werden
Client-IPs und `X-Forwarded-Proto` ignoriert.

### Host vorbereiten und prüfen

Seit INFRA 1.5 gibt es zwei Skripte, die die manuellen Schritte ersetzen:

```bash
# 1. Dry-Run (Standard): zeigt nur, was geändert würde
sudo bash deploy/install/install-production.sh --mode compose \
  --env-file deploy/env.production

# 2. Ausführen: Verzeichnisse, Benutzer (nativ), Env-Dateien, Schlüssel
sudo bash deploy/install/install-production.sh --mode compose \
  --env-file deploy/env.production --apply

# 3. Voraussetzungen prüfen (jederzeit wiederholbar, rein lesend)
bash deploy/install/preflight.sh --mode compose --env-file deploy/env.production
```

`install-production.sh` ist idempotent: vorhandene Env-Dateien und der
Backup-Schlüssel werden nie überschrieben, Secrets nie ausgegeben. Es legt
`/etc/webradio` (0700), `/var/backups/webradio` (0700) und
`/var/log/webradio` (0750) an und generiert `POSTGRES_PASSWORD`,
`NEXTAUTH_SECRET`, `CRON_SECRET` sowie `/etc/webradio/backup.key` (0600).
Domain, `NEXTAUTH_URL`, `ACME_EMAIL` und der DB-Benutzer bleiben bewusst
manuell. `preflight.sh` prüft OS, Docker-/Compose-Version, Env-Datei
(Rechte, Platzhalter, Secret-Längen), Verzeichnisse, Ports 80/443,
Ressourcen und ob bereits eine andere Betriebsform läuft; Exit 1 bei FAIL,
`--json` für Automatisierung.

## 3. Variante B – Docker Compose (primärer Weg)

### 3.1 Produktionsumgebung anlegen

```bash
cd /opt/webradio
sudo bash deploy/install/install-production.sh --mode compose \
  --env-file deploy/env.production --apply
# Danach SITE_ADDRESS, NEXTAUTH_URL, NEXT_PUBLIC_SITE_URL, ACME_EMAIL,
# POSTGRES_USER/DB setzen. Passwörter und Secrets wurden bereits erzeugt.
```

`WEBRADIO_STACK_ENV=production` ist ein Pflichtmarker: Ohne
`--env-file deploy/env.production` bricht Compose sofort ab, statt still die
Entwicklungs-`.env` (127.0.0.1:5433, Loopback-Secrets) zu verwenden. Der
Schlüssel wird nie in ein Image gebacken – `docker inspect` des Images enthält
keine Secrets (geprüft).

### 3.2 Bauen und starten

```bash
docker compose --env-file deploy/env.production build
docker compose --env-file deploy/env.production up -d
docker compose --env-file deploy/env.production ps
```

Erwartet: `postgres` und `webradio` werden `healthy`, danach startet `caddy`
(`depends_on: service_healthy`). Kaltbuild auf 16 vCPU: **6 min 8 s**;
Runtime-Image **360 MB**. Der Build braucht keine Secrets, nur die
Platzhalter-`ARG`s im Builder-Stage.

Nur Caddy veröffentlicht Ports. `webradio` (3000) und `postgres` (5432) sind
ausschließlich im internen Netz `backend` erreichbar (`internal: true`); die
Anwendung hängt zusätzlich in `egress` für GitHub-/SMTP-Zugriffe.

### 3.3 Migrationen und Schema-Prüfung

```bash
docker compose --env-file deploy/env.production run --rm tools \
  node scripts/prisma-db.mts db migrate
docker compose --env-file deploy/env.production run --rm tools \
  node scripts/prisma-db.mts db verify --strict
```

Das `tools`-Image (`webradio-website:infra1.4-tools`, Builder-Stage) enthält
den Quellbaum und die Prisma-CLI. Es ist **kein** Laufzeitbestandteil, sondern
ein Einmal-Container; es belegt ~5,5 GB und darf nach Migrationen mit
`docker image prune` bzw. gezielt entfernt werden (jederzeit neu baubar).

### 3.4 Smoke-Test

```bash
curl -fsS https://<domain>/api/health        # Liveness: {"status":"ok",...}
curl -fsS https://<domain>/api/ready         # Readiness: SELECT 1, 200/503
curl -sS -o /dev/null -w '%{http_code}\n' https://<domain>/plugins
curl -sS -o /dev/null -w '%{http_code}\n' https://<domain>/admin   # 307 -> Login
```

Im Testhost mit interner CA: `curl --cacert /pfad/root.crt` oder `-k`
(nur Test). Ports dort: `CADDY_HTTP_PORT=8080`, `CADDY_HTTPS_PORT=8443`,
`CADDYFILE=./deploy/Caddyfile.internal`.

### 3.5 Cron ohne Vercel

Die Analytics-Läufe startet `webradio-cron.timer` täglich um 03:15 über
`webradio-cron.service`. Der Runner (`/usr/local/sbin/webradio-cron-run`) ruft
die Schedules **sequenziell** auf, schreibt eine Zeile pro Lauf nach
`/var/log/webradio/cron.log` (Zeit, Schedule, HTTP-Status, kein Secret) und
beendet die Unit bei einem echten Fehler mit Exit 1 – dann greift
`OnFailure=webradio-alert@%n.service`.

```ini
# /etc/webradio/cron.env (0600, vom Installer erzeugt)
CRON_SECRET=<generiert>
SITE_ADDRESS=https://<domain>
CRON_LOG=/var/log/webradio/cron.log
# Nur die Schedules eintragen, deren Integrationen konfiguriert sind:
CRON_SCHEDULES=analytics-traffic analytics-repo-stats analytics-releases analytics-retention
# CA_FILE=/etc/ssl/certs/ca.pem   # nur bei privater CA
```

Ohne GitHub-App liefern `analytics-traffic`/`analytics-repo-stats` korrekt
`500 JOB_FAILED (NOT_CONFIGURED)`. Entweder die GitHub-Integration
konfigurieren oder diese Schedules aus `CRON_SCHEDULES` entfernen; sonst
schließt die Unit jeden Tag mit Fehler und alarmiert.

Antwortverhalten (validiert): `GET` → 405, fehlendes/falsches Secret → 401,
unbekannter Schedule → 400, gültig → 200, paralleler Lauf → 409
(`ALREADY_RUNNING`).

### 3.6 Backups, Monitoring, Neustart

```bash
# Backup (verschlüsselt), Konfigurationsarchiv und Offsite – Details im
# Disaster-Recovery-Guide
sudo BACKUP_MODE=docker BACKUP_DIR=/var/backups/webradio \
  BACKUP_KEY_FILE=/etc/webradio/backup.key \
  COMPOSE_FILE=/opt/webradio/compose.yaml \
  COMPOSE_ENV_FILE=/opt/webradio/deploy/env.production \
  PGUSER=webradio PGDATABASE=webradio PGPASSWORD='...' \
  bash deploy/backup/pg-backup.sh
sudo REPO_DIR=/opt/webradio bash deploy/backup/config-backup.sh
sudo bash deploy/backup/offsite-sync.sh          # Ziel in /etc/webradio/offsite.env

# Monitoring (Container-, Caddy-, CPU-, Backup- und Zertifikatsprüfung)
MODE=docker HEALTH_URL=https://<domain>/api/health CA_FILE=/etc/ssl/certs/ca.pem \
  CHECK_CONTAINERS="webradio postgres caddy" \
  bash deploy/monitoring/health-report.sh
```

Das Monitoring prüft Liveness (`app_http`) und Readiness (`app_ready`, `SELECT 1`)
separat; `READINESS_URL` wird automatisch aus `HEALTH_URL` abgeleitet
(`/api/health` → `/api/ready`). Nur bei abweichendem Host/Pfad explizit setzen.
Geht `HEALTH_URL` über Caddy, liefert Caddy bei fehlgeschlagener Readiness 503
für alle Pfade – auch für `/api/health`. Für eine reine Prozess-Liveness die
Loopback-Adresse der Anwendung verwenden.

`restart: unless-stopped` ist für alle drei Services gesetzt und wurde auf
Engine-Ebene belegt (Testcontainer: 5 Neustarts nach `exit 1`).
`docker compose down && up -d` erhält die Volumes (44 Tabellen unverändert).
**Wichtig:** `docker stop`/`docker kill` gelten als manueller Stopp und lösen
die Restart-Policy nicht aus – nach Wartungsarbeiten immer `up -d`.

## 4. Variante A – nativ (systemd + Host-PostgreSQL + Caddy)

Ausführlich validiert in INFRA 1.3
([`PHASE_INFRA1.3_NATIVE_LINUX_VALIDATION_REPORT.md`](./PHASE_INFRA1.3_NATIVE_LINUX_VALIDATION_REPORT.md)).
Kurzfassung:

1. PostgreSQL 18 installieren, Rolle und Datenbank anlegen (getrennte Rollen
   für App, Backup und Monitoring – siehe Security-Guide).
2. Anwendung als `webradio`-User nach `/opt/webradio`, `npm ci`, `npm run build`,
   `npm run db:migrate`, `npm run db:verify -- --strict`.
3. Anwendungs-Unit installieren (Vorlage unten), `EnvironmentFile` mit 0600.
4. Caddy-Binary und -Unit über den Installer einrichten (Abschnitt 5).

Die App-Unit liegt seit INFRA 1.5 als Datei vor:
`deploy/systemd/webradio-app.service` (installiert als
`/etc/systemd/system/webradio-app.service`). Sie startet mit
`/usr/bin/env node .next/standalone/server.js`, sodass sowohl
`/usr/bin/node` (Distribution) als auch `/usr/local/bin/node` (Tarball)
funktionieren, und setzt `Restart=always`, `StartLimitBurst=5`, `OnFailure`
sowie eine Sandbox (`ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`,
`PrivateDevices`, `ProtectClock/Hostname`, `RestrictSUIDSGID`,
`ReadWritePaths` nur `.next/cache`).

`app.env` (0640, `webradio:webradio`, Vorlage `deploy/env.native.example`)
enthält `NODE_ENV=production`, `PORT=3010`, `HOSTNAME=127.0.0.1`,
`DATABASE_PROVIDER=self-hosted`, `DATABASE_URL`, `NEXTAUTH_SECRET`,
`NEXTAUTH_URL`, `TRUST_PROXY=1`, `CRON_SECRET`.

## 5. Caddy und HTTPS

### 5.1 Varianten

| Datei | Zweck | Zertifikat |
|---|---|---|
| `deploy/Caddyfile` | Compose, echte Domain | ACME/Let's Encrypt (automatisch) |
| `deploy/Caddyfile.internal` | Compose, Testhost | interne CA (`tls internal`) |
| `deploy/caddy/Caddyfile.native` | systemd, echte Domain | ACME, Logrotation nach `/var/log/caddy` |
| `deploy/caddy/Caddyfile.native-test` | systemd, Testhost | interne CA, 8443 |

Alle Varianten setzen HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, entfernen
den `Server`-Header und proxyen auf `/api/ready` mit aktiver
Readiness-Prüfung (Datenbank-`SELECT 1`); `/api/health` bleibt der
Liveness-Endpoint für Docker und Vercel. `X-Real-IP` wird gesetzt; die
Anwendung wertet Header nur mit `TRUST_PROXY=1` aus.

### 5.2 Installation als Systemdienst

```bash
sudo REPO=/opt/webradio bash deploy/systemd/install-native-ops.sh
```

Der Installer ist idempotent, unterstützt `--dry-run` und
`--mode auto|compose|native`, überschreibt bestehende Konfiguration nur mit
`--force` und

* validiert zuerst alle Quelldateien und `bash -n` der Skripte,
* installiert Caddy-Binary, Systemuser `caddy`, `/var/lib/caddy`, `/var/log/caddy`
  (nur native Form),
* legt `/etc/caddy/Caddyfile` und `/etc/caddy/caddy.env` (0600) an,
* installiert sieben Wartungsskripte sowie 13 Units/Timer (App, Backup,
  Config-Backup, Offsite, Cron, Health, Restore-Drill, Alert, Caddy),
* führt `systemd-analyze verify` **vor** dem Aktivieren aus,
* aktiviert Dienste/Timer **nur** bei vollständiger Konfiguration (keine
  `CHANGE_ME`-Aktivzeilen, `PGDATABASE` vorhanden, Cron/Offsite konfiguriert),
* erzeugt `/etc/webradio/backup.key` (0600) – **sofort in einen Passwortmanager
  kopieren**, ohne diesen Schlüssel sind alle Backups unlesbar.

Timer (alle mit `Persistent=true`, wo sinnvoll): Backup 02:15, Offsite 02:45,
Cron 03:15, Health alle 5 Minuten, Restore-Drill sonntags 05:30.

### 5.4 Echter Domainbetrieb – exakte Schritte

Diese Schritte sind **freigabepflichtig** und in INFRA 1.5 nicht ausgeführt:

1. A/AAAA-Record auf die Server-IP setzen (TTL vorher senken).
2. Firewall: eingehend nur 22, 80/tcp, 443/tcp und 443/udp öffnen.
3. `SITE_ADDRESS=https://<domain>` und `ACME_EMAIL=<ops@domain>` in
   `/etc/caddy/caddy.env` bzw. `deploy/env.production` setzen.
4. `sudo -u caddy /usr/local/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`.
5. `sudo systemctl reload caddy` bzw. `docker compose ... up -d caddy`.
6. Zertifikat prüfen: `openssl s_client -connect <domain>:443 -servername <domain>`
   und `curl -fsS https://<domain>/api/health` sowie
   `curl -fsS https://<domain>/api/ready`.
7. `SITE_URL=https://<domain>` im Monitoring setzen.
8. Optional CAA-Record, wenn die CA-Autorisierung eingeschränkt werden soll.

Caddy erneuert ACME-Zertifikate selbst bei etwa einem Drittel der Restlaufzeit;
bei einem Umzug die Caddy-Daten mitnehmen, um Rate-Limits zu vermeiden.

Nach der Installation:

```bash
sudo systemctl status caddy.service
sudo systemctl list-timers 'webradio-*'
sudo journalctl -u caddy.service -n 50 --no-pager
```

Für die echte Domain müssen DNS-A-Record und Firewall (80/443) freigegeben sein
– **das ist eine freigabepflichtige Änderung**, siehe Abschnitt 10.

### 5.3 Zertifikate

ACME-Zertifikate erneuert Caddy selbst (Renewal bei ~1/3 Restlaufzeit); die
Dateien liegen im Caddy-Datenverzeichnis und müssen mitgesichert werden, sonst
entsteht nach einem Umzug kurzzeitig ein Rate-Limit-Risiko bei Let's Encrypt.
Die interne CA des Testhosts stellt 12-Stunden-Zertifikate aus und erneuert sie
automatisch; das Monitoring wertet sie deshalb nicht als Ablaufwarnung.

## 6. Aktualisierung und Rollback (Compose)

```bash
cd /opt/webradio
git fetch && git checkout <tag>            # Freigabe erforderlich
docker compose --env-file deploy/env.production build webradio
docker compose --env-file deploy/env.production run --rm tools \
  node scripts/prisma-db.mts db migrate    # nur vorwärts, siehe unten
docker compose --env-file deploy/env.production up -d
docker compose --env-file deploy/env.production ps
curl -fsS https://<domain>/api/health   # Liveness
curl -fsS https://<domain>/api/ready    # Readiness inkl. Datenbank
```

Rollback: vorheriges Image-Tag bauen/pullen und `up -d` mit diesem Tag. Prisma-
Migrationen sind additiv; ein Rollback der Anwendung ohne DB-Rollback ist nur
zulässig, wenn die Migration keine Spalten entfernt hat (`db migrate` protokolliert
die Schritte). Im Zweifel Backup zurückspielen (Disaster-Recovery-Guide).

Aufräumen:

```bash
docker image prune -f          # alte Layer
docker builder prune -f        # Build-Cache
docker compose --env-file deploy/env.production logs --tail=100
```

Logrotation ist im Stack gesetzt (`json-file`, `max-size=10m`, `max-file=3` je
Service). Caddy loggt zusätzlich nach stdout; bei Variante A nach
`/var/log/caddy/access.log` mit `roll_size 10MiB`, `roll_keep 5`.

## 7. Betrieb und Diagnose

| Aufgabe | Compose | Nativ |
|---|---|---|
| Status | `docker compose ... ps` | `systemctl status webradio caddy postgresql` |
| Logs | `docker compose ... logs -f webradio` | `journalctl -u webradio -f` |
| DB-Shell | `... exec postgres psql -U webradio -d webradio` | `sudo -u postgres psql webradio` |
| Schema | `... run --rm tools node scripts/prisma-db.mts db verify --strict` | `npm run db:verify -- --strict` |
| Health (Liveness) | `curl -fsS https://<domain>/api/health` | `curl -fsS http://127.0.0.1:3010/api/health` |
| Readiness (DB) | `curl -fsS https://<domain>/api/ready` | `curl -fsS http://127.0.0.1:3010/api/ready` |
| Backup + Config | Timer `webradio-backup.timer` | dito |
| Offsite | Timer `webradio-offsite.timer` | dito |
| Analytics | Timer `webradio-cron.timer` | dito |
| Monitoring | `webradio-health.timer` (5 min) | dito |

Typische Fehler:

| Symptom | Ursache | Lösung |
|---|---|---|
| Compose bricht mit `WEBRADIO_STACK_ENV` ab | `--env-file` vergessen | `--env-file deploy/env.production` |
| `502`/`503` von Caddy | App startet noch oder DB fehlt | `ps`, `logs webradio`, `pg_isready` |
| `EACCES` auf `.next/cache` | Verzeichnis nicht dem Runtime-User gehörend | `chown -R 1001:1001` bzw. Image neu bauen |
| Login-Redirect auf falschen Host | `NEXTAUTH_URL` falsch/ohne Port | exakt die öffentliche Origin eintragen |
| Health `000` im Monitoring | HTTPS-URL ohne CA/`-k` | `CA_FILE` setzen oder `HEALTH_INSECURE=1` (nur Test) |
| Analytics-Cron 401 | `CRON_SECRET` fehlt/abweichend | Secret in App und Cron-Env angleichen |

## 8. Ressourcenbudget (gemessen, INFRA 1.4)

| Komponente | Idle (INFRA 1.5) | Unter Last (INFRA 1.4) | Limit |
|---|---|---|---|
| `webradio` | 93,7 MiB | 239 MiB (60 parallele Requests) | 768 MiB / 2 CPU |
| `postgres` | 30,1 MiB | 41,8 MiB | 512 MiB / 1 CPU, `shm_size` 256 MB |
| `caddy` | 16,5 MiB | 24,3 MiB | 128 MiB / 0,5 CPU |
| Summe | ~140 MiB | ~305 MiB | – |

Die Limits sind aus diesen Messwerten abgeleitet (2–3× Kopffreiheit) und keine
willkürlichen Zahlen. PostgreSQL ist mit `shared_buffers=256MB`,
`effective_cache_size=768MB`, `max_connections=50`, `work_mem=4MB` dimensioniert
– passend zu einem Pool mit wenigen Verbindungen auf einem 2-GB-Host.
Latenz über Caddy auf dem Windows-Testhost: 119 ms/Request sequenziell
(50 Requests: 5,97 s), auf der Linux-VM 35 ms (1,77 s); der Unterschied ist
Docker-Desktop-NAT, nicht die Anwendung.

## 9. Wechsel zwischen den Betriebsformen

1. Backup in der alten Form erstellen **und Drill ausführen**.
2. Alte Form stoppen und deaktivieren (`systemctl disable --now webradio caddy`
   bzw. `docker compose ... down`), Ports freigeben.
3. Neue Form installieren, Datenbank aus dem Backup zurückspielen
   (Disaster-Recovery-Guide, Abschnitt „Restore in eine neue Umgebung“).
4. `db verify --strict`, Smoke-Test, Cron-Probe, Monitoring-Probe.
5. Erst danach die alte Umgebung löschen.

## 10. Freigabepflichtige Schritte

Ohne ausdrückliche Freigabe **nicht** ausführen:

* DNS-Einträge ändern (A/AAAA, CAA),
* Firewall/nftables/ufw-Regeln für 80/443 öffnen,
* ACME-Zertifikate für eine echte Domain anfordern,
* Migrationen gegen die Produktionsdatenbank,
* `sudo`-Installation der Units auf einem Produktionshost,
* ein externes Offsite-Ziel (SSH/S3) einrichten oder Daten dorthin übertragen,
* Deployments, Commits, Pushes, Merges oder Releases.

## 11. Referenzen

* [`PHASE_INFRA1.3_NATIVE_LINUX_VALIDATION_REPORT.md`](./PHASE_INFRA1.3_NATIVE_LINUX_VALIDATION_REPORT.md) – native Referenzmessung
* [`PHASE_INFRA1.4_PRODUCTION_READINESS_REPORT.md`](./PHASE_INFRA1.4_PRODUCTION_READINESS_REPORT.md) – Prüfmatrix
* [`DISASTER_RECOVERY_GUIDE.md`](./DISASTER_RECOVERY_GUIDE.md) – Backup/Restore
* [`SELF_HOSTED_SECURITY_HARDENING.md`](./SELF_HOSTED_SECURITY_HARDENING.md) – Härtung und Restrisiken
* [`HOSTING_MIGRATION_GUIDE.md`](./HOSTING_MIGRATION_GUIDE.md) – Migration von Vercel
* [`HOSTING_PORTABILITY.md`](./HOSTING_PORTABILITY.md) – Portabilität, Vercel-Kompatibilität
