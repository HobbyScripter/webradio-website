# PHASE INFRA 1.4 – Production Readiness & Self-Hosted Operations

**Status:** abgeschlossen mit offenen, freigabepflichtigen Punkten
**Datum:** 2026-11-21
**Basis:** Branch `feature/analytics-vercel-schedules`, HEAD `a3b757f` (keine Commits erstellt)
**Referenz:** [`PHASE_INFRA1.3_NATIVE_LINUX_VALIDATION_REPORT.md`](./PHASE_INFRA1.3_NATIVE_LINUX_VALIDATION_REPORT.md)

## 1. Auftrag

Das Projekt sollte für einen produktiven, selbst verwalteten Linux-Root-Server
vorbereitet werden: Betriebsarchitektur (Compose als Alternative zum validierten
systemd-Betrieb), Caddy/HTTPS als Dienst, Backup/Disaster Recovery, Monitoring,
Ressourcenoptimierung, Sicherheitsprüfung, vollständige Tests und vier neue
Dokumente. Vercel-Unterstützung muss unverändert erhalten bleiben.

## 2. Umgebung

| Komponente | Wert |
|---|---|
| Arbeitshost | Windows, Docker Desktop, Engine 29.9.3, Compose v5.7.0, 16 vCPU / 16 GB |
| Container-Plattform | `linux/amd64` |
| Test-VM (nativ, INFRA 1.3) | Ubuntu 26.04.1 LTS, Node 24.22.3, PostgreSQL 18.6, Caddy 2.11 |
| Anwendung | Next.js 16.4.6, Prisma 8.0.0-rc.27, 14 Migrationen, 44 Tabellen |
| Testdatenbanken | `webradio_infra14_test` (Compose), `webradio_test` (Integrationstests), `webradio_infra13_test` (VM) |

## 3. Ergebnis auf einen Blick

| Bereich | Bewertung |
|---|---|
| Betriebsarchitektur / Compose | **PASS** |
| Caddy / HTTPS (Testhost, interne CA) | **PASS** |
| Caddy als Systemdienst / ACME | **WARNING** (Konfiguration validiert, Root-Installation und echte Domain offen) |
| Backup / Restore / Drill | **PASS** |
| Monitoring / Healthchecks | **PASS** (nativ 11/11) / **WARNING** (Windows-Artefakte im Docker-Modus) |
| Ressourcenoptimierung | **PASS** |
| Sicherheit / Härtung | **PASS** mit dokumentierten Restrisiken |
| Regressionstests | **PASS** (643) |
| Integrationstests | **PASS** (126) |
| Next.js Production Build | **PASS** |
| Prisma Contract Emit/Print | **PASS** |
| Docker Build | **PASS** (360 MB) |
| Docker Start / Healthchecks / Neustart | **PASS** |
| Migrationen auf isolierter DB | **PASS** |
| Cron-Ausführung | **PASS** |
| Fehler- und Recovery-Tests | **PASS** |
| Vercel-Kompatibilität | **PASS** (Code/Config unverändert, Routen geprüft) |
| Root-Lifecycle auf Produktionshost | **NOT RUN** (Freigabe) |
| Echte Domain / DNS / Firewall / ACME | **NOT RUN** (Freigabe) |
| Offsite-Backup | **NOT RUN** (bewusst nicht konfiguriert) |
| Neustart des gesamten Windows-Hosts | **NOT RUN** |

## 4. Umgesetzte Änderungen

Neu (unversioniert im Worktree):

| Datei | Zweck |
|---|---|
| `compose.yaml` | vollständiger Stack: Caddy, App, PostgreSQL, `tools`-Profil |
| `Dockerfile` | Builder-/Runner-Stage, Standalone-Runtime, Healthcheck, OCI-Labels |
| `.dockerignore` | schlanker Build-Kontext |
| `deploy/Caddyfile`, `deploy/Caddyfile.internal` | Compose-Varianten (ACME bzw. interne CA) |
| `deploy/caddy/Caddyfile.native`, `Caddyfile.native-test` | systemd-Varianten |
| `deploy/env.production.example`, `deploy/env.test.example` | Env-Vorlagen mit Pflichtmarker |
| `deploy/backup/pg-backup.sh`, `restore-drill.sh`, `backup.env.example` | verschlüsselte Backups, Rotation, Drill |
| `deploy/monitoring/health-report.sh`, `alert.sh`, `monitoring.env.example` | Monitoring ohne Daemon, Alarm |
| `deploy/systemd/*` (8 Units + Installer) | Caddy-Dienst, Backup-/Drill-/Health-Timer, Alert-Template |
| `docs/SELF_HOSTED_DEPLOYMENT_GUIDE.md` | Betriebshandbuch |
| `docs/DISASTER_RECOVERY_GUIDE.md` | Backup/Restore |
| `docs/SELF_HOSTED_SECURITY_HARDENING.md` | Härtung + Restrisiken |
| `docs/PHASE_INFRA1.4_PRODUCTION_READINESS_REPORT.md` | dieser Bericht |

Angepasst: `.gitignore` (Produktions-/Test-Env ausgeschlossen),
`docs/HOSTING_PORTABILITY.md`, `docs/HOSTING_MIGRATION_GUIDE.md` (Verweise auf
die neue Betriebsform). **Keine** Änderungen an Anwendungslogik, `vercel.json`,
Prisma-Contract oder Vercel-Funktionen.

## 5. Architektur

```
Internet ──80/443──▶ Caddy (edge) ──3000──▶ Next.js (backend)
                                                │
                                                └──5432──▶ PostgreSQL (backend, internal)
                                              
webradio ──(egress)──▶ GitHub/SMTP
```

* Nur Caddy veröffentlicht Ports; App und DB sind nur im internen `backend`-Netz.
* `tools` ist ein Einmal-Container (Builder-Stage) für Migrationen/Prüfungen.
* Native Form: Caddy (systemd) → `127.0.0.1:3010` → systemd-App → Host-PostgreSQL.
* Beide Formen sind getrennt dokumentiert; keine Doppelinstanz zugelassen.

## 6. Prüfmatrix mit Belegen

| # | Prüfung | Ergebnis | Beleg |
|---|---|---|---|
| 1 | TypeScript | **PASS** | `npx tsc --noEmit` → Exit 0 |
| 2 | ESLint | **PASS** | 0 Fehler, 7 Warnungen (unbenutzte Imports, vorbestehend) |
| 3 | Regressionstests | **PASS** | 66 Suiten / 643 Tests, 14,7 s |
| 4 | Integrationstests | **PASS** | 7 Suiten / 126 Tests, 34,2 s gegen isolierte `webradio_test` |
| 5 | Prisma Contract Emit/Print | **PASS** | `prisma contract emit` (Execution-/Profile-Hash), `contract print` (PSL) |
| 6 | Next.js Production Build | **PASS** | `npm run build` Exit 0, Standalone-Ausgabe |
| 7 | Compose-Validierung | **PASS** | `docker compose --env-file deploy/env.test config` ohne Fehler; nur 8080/8443 veröffentlicht |
| 8 | Docker Build | **PASS** | `webradio-website:infra1.4`, 359.778.546 Bytes (360 MB), Kaltbuild 6 min 8 s |
| 9 | Docker Start + Healthchecks | **PASS** | postgres/app `healthy`, Caddy `healthy`; Health-Endpunkt 200 |
| 10 | Migrationen (isoliert) | **PASS** | 14 Migrationen, `db verify --strict` grün, 44 Tabellen |
| 11 | Backup (nativ) | **PASS** | 259.185 B, AES-256, SHA-256, 0600, kein Klartext |
| 12 | Backup (Docker) | **PASS** | 255.246 B über `compose exec postgres` |
| 13 | Rotation | **PASS** | `BACKUP_KEEP=1` → 1 Archiv, älteres rotiert |
| 14 | Restore-Drill | **PASS** | 44 Tabellen, 0 fremde Owner, `db verify --strict` ok, Drill-DB gelöscht |
| 15 | Caddy HTTPS (Testhost) | **PASS** | interne CA, Zertifikat erhalten; `/api/health` 200 |
| 16 | Weiterleitung HTTP→HTTPS | **PASS** | 301 auf `https://localhost:8443/plugins` (Portfix umgesetzt) |
| 17 | Sicherheitsheader | **PASS** | HSTS, nosniff, DENY, Referrer-Policy, Permissions-Policy, kein `Server` |
| 18 | Routen über HTTPS | **PASS** | `/` 200, `/plugins` 200, `/themes` 200, `/releases` 200, `/news` 200, `/auth/login` 200, `/admin` 307 |
| 19 | Cron-Authentifizierung | **PASS** | GET 405, ohne/falsches Secret 401, unbekannter Schedule 400, gültig 200 |
| 20 | Cron-Parallelität | **PASS** | 5 gleichzeitige Läufe → 2× 409 `ALREADY_RUNNING`, 3× 200 |
| 21 | Neustartpersistenz (Stack) | **PASS** | `down` + `up -d`: 44 Tabellen unverändert, Health 200 |
| 22 | Restart-Policy | **PASS** | Testcontainer `unless-stopped`: 5 Neustarts nach `exit 1`; Stack-Policy für alle Services gesetzt |
| 23 | DB-Ausfall | **PASS** | App bleibt `running` (Restarts 0), statische Seiten 200, Monitoring `FAIL postgres`; nach Start sofort 200 |
| 24 | Monitoring (nativ) | **PASS** | 11/11 PASS, valides JSONL, Exit 0 |
| 25 | Monitoring (Docker, Windows) | **WARNING** | App/DB/Backup PASS; Disk 92 % (Windows-Volume) und RAM 0 % (kein `/proc/meminfo`) sind Plattformartefakte |
| 26 | Monitoring erkennt Ausfall | **PASS** | `FAIL postgres` + `FAIL app_http` (HTTPS ohne CA), Exit 1 |
| 27 | systemd-Units | **PASS** | `systemd-analyze verify`: 8/8 ohne Fehler (nach `OnFailure`-Fix) |
| 28 | Skript-Syntax | **PASS** | `bash -n` für 5 Skripte |
| 29 | Caddyfile-Syntax | **PASS** | `caddy fmt` + `caddy validate`: „Valid configuration“ (4 Dateien) |
| 30 | Container-Härtung | **PASS** | uid 1001, `cap_drop ALL`, `no-new-privileges`, tmpfs `/tmp`, init |
| 31 | Netzwerkisolation | **PASS** | App: `backend`+`egress`; DB: nur `backend`; kein Host-Port 3000/5432 |
| 32 | Secrets im Image | **PASS** | `docker inspect`-Env ohne Secret/DB-URL/Passwort |
| 33 | Logrotation | **PASS** | `json-file` 10 MB × 3 je Service |
| 34 | Vercel-Kompatibilität | **PASS** | `vercel.json` unverändert, Schedule-Route vorhanden, Cron-Route getestet |

## 7. Messwerte

| Kennzahl | Wert |
|---|---|
| Runtime-Image | 360 MB (vorher 4,22 GB in INFRA 1.1) |
| `tools`-Image | 5,51 GB (nur Build-/Migrationswerkzeug) |
| Kaltbuild | 6 min 8 s |
| App-RAM | 130,6 MiB idle → 239 MiB unter 60 parallelen Requests |
| PostgreSQL-RAM | 31,8 → 41,8 MiB |
| Caddy-RAM | 16,4 → 24,3 MiB |
| CPU unter Burst | App 29 %, PostgreSQL 0,11 %, Caddy 1,6 % |
| Latenz `/plugins` | 0,11 s (Warm), 119 ms/Request sequenziell (Windows/Docker-NAT) |
| Latenz nativ (VM) | 35 ms/Request (50 Requests: 1,77 s HTTP / 2,02 s HTTPS) |
| Startzeit bis healthy | PostgreSQL ~13 s, App ~7 s, Caddy <1 s |
| Backup-Größe | ~250 KB pro Lauf |

Limits (768 MiB App, 512 MiB DB, 128 MiB Caddy) ergeben 2–3× Kopffreiheit zu den
Messwerten; PostgreSQL-Parameter (`shared_buffers=256MB`, `max_connections=50`)
sind auf einen 2-GB-Host dimensioniert.

## 8. Sicherheit (Kurzfassung)

Umgesetzt: Non-Root-App, `cap_drop ALL`, `no-new-privileges`, internes DB-Netz,
keine veröffentlichten DB-/App-Ports, Caddy-Admin-API aus, Secrets nur in
0600-Dateien, keine Secrets im Image, verschlüsselte Backups, getrennte
Backup-/Monitoring-Konfiguration, Logrotation, Restart-Policies.

**Beim Test gefunden und behoben:** Der Build-Kontext enthielt zunächst die
echten Env-Dateien (`deploy/env.test` lag im Builder-/`tools`-Layer).
`.dockerignore` schließt jetzt `.env`, `.env*.local`, `.env.vercel.production`
sowie `deploy/env.production`, `deploy/env.test` und `deploy/env.*.local` aus;
beide Images wurden neu gebaut und geprüft (`tools`-Image enthält keine
Env-Datei mehr). Der Runner enthielt zu keinem Zeitpunkt Secrets.

Offene Risiken (Details in [`SELF_HOSTED_SECURITY_HARDENING.md`](./SELF_HOSTED_SECURITY_HARDENING.md)):
R1 Root-Installation der Units, R2 keine Offsite-Kopie, R3 RPO 24 h,
R4 DNS/Firewall/ACME ungeprüft, R5 Host-Themen auf Windows getestet,
R6 Caddy-Container als Root, R7 großes `tools`-Image.

## 9. Vercel-Kompatibilität

* `vercel.json` (Schedules, `experimentalTriggers`, `installCommand`) ist
  unverändert; `src/app/api/schedules/analytics/route.ts` existiert weiter.
* Der portable Cron-Endpunkt `/api/cron/analytics` ergänzt, ersetzt aber nichts.
* `next build` läuft unverändert (Vercel nutzt denselben Befehl); die
  Compose-Umgebung nutzt das Standalone-Output, ohne Vercel-Code zu entfernen.
* Kein Vercel-Deployment durchgeführt (nicht freigegeben) – **NOT RUN**.

## 10. Offene Punkte

1. **Root-Installation** der Units/Timer auf dem Zielhost
   (`sudo REPO=/opt/webradio bash deploy/systemd/install-native-ops.sh`) und
   Verifikation von `caddy.service` als Systemdienst.
2. **Echte Domain**: DNS, Firewall 80/443, ACME-Zertifikat – freigabepflichtig.
3. **Host-Neustart** eines echten Linux-Servers inkl. Docker-CE-Autostart.
4. **Offsite-Backup** (verschlüsselt) und Restore-Probe auf fremder Hardware.
5. Root-Lifecycle-Test aus INFRA 1.3 (unverändert offen).
6. `tools`-Image nach Migrationen vom Produktionshost entfernen.

## 11. Reproduktion der wichtigsten Prüfungen

```bash
# Stack
docker compose --env-file deploy/env.test up -d --build
docker compose --env-file deploy/env.test ps
docker compose --env-file deploy/env.test run --rm tools \
  node scripts/prisma-db.mts db migrate
docker compose --env-file deploy/env.test run --rm tools \
  node scripts/prisma-db.mts db verify --strict

# HTTPS + Routen
curl -k -fsS https://localhost:8443/api/health
curl -s -o /dev/null -D - http://localhost:8080/plugins | grep -i location

# Backup + Drill
BACKUP_MODE=docker BACKUP_DIR=.local-db/infra14/backups \
  BACKUP_KEY_FILE=.local-db/infra14/backups/backup.key \
  COMPOSE_FILE=compose.yaml COMPOSE_ENV_FILE=deploy/env.test \
  PGUSER=webradio PGDATABASE=webradio_infra14_test PGPASSWORD=... \
  bash deploy/backup/pg-backup.sh
# ... restore-drill.sh mit denselben Variablen

# Anwendung
npx tsc --noEmit && npx eslint . && npm test && npm run test:integration && npm run build
```

## 12. Fazit

Die Self-Hosted-Betriebsarchitektur ist vollständig umgesetzt und auf
Container-Ebene durchgängig belegt: Compose-Stack, HTTPS über Caddy,
Migrationen, Backup/Restore mit Drill, Monitoring, Neustart- und
Fehlerverhalten sowie Ressourcenverbrauch sind gemessen. Die Anwendung bleibt
Vercel-kompatibel. Für den Produktivgang fehlen ausschließlich freigabepflichtige
Schritte (Root-Installation, DNS/Firewall/ACME, Offsite-Backup) sowie der
Neustarttest auf echter Linux-Hardware.
