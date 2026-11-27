# PHASE INFRA 1.5 – Production Deployment Preparation

**Status:** abgeschlossen mit freigabepflichtigen Restpunkten (kein Produktivbetrieb aktiviert)
**Datum:** 2026-11-22
**Basis:** Branch `feature/analytics-vercel-schedules`, HEAD `a3b757f`, keine Commits/Pushes/Deployments
**Vorgänger:** [INFRA 1.2](./PHASE_INFRA1.2_HOSTING_PORTABILITY_REPORT.md),
[INFRA 1.3](./PHASE_INFRA1.3_NATIVE_LINUX_VALIDATION_REPORT.md),
[INFRA 1.4](./PHASE_INFRA1.4_PRODUCTION_READINESS_REPORT.md)

| Komponente | Wert |
|---|---|
| Arbeitshost | Windows, Docker Desktop, Engine 29.9.3, Compose 5.7.0, 16 vCPU / 32 GB |
| Linux-Testumgebung | privilegierter systemd-Container, Ubuntu 24.04, systemd 255, Node 24.22.3, Caddy 2.11.9, PostgreSQL 16.15 |
| Compose-Test | Projekt `webradio15`, PostgreSQL 18.6-alpine, Next.js 16.4.6, Prisma 8.0.0-rc.27 |
| Datenbank | 14 Migrationen, 44 Tabellen |
| Testdatenbanken | `webradio_test`, `webradio_infra14_test` (Projekt `webradio15`), native Test-DB `webradio` |

## 0. Ergebnis auf einen Blick

| Arbeitspaket | Ergebnis | Kernnachweis |
|---|---|---|
| A – Reproduzierbare Installation | **PASS** | Dry-Run ohne Schreibzugriff; zweiter `--apply`-Lauf identische Hashes; 32/32 Preflight-Prüfungen |
| B – Systemd und Hostdienste | **PASS** (Container) / **BLOCKED** (echter Root-Host) | 13 Units `systemd-analyze verify` ok, 5 Timer, Neustart, OnFailure, fehlende Env |
| C – Caddy und HTTPS | **PASS** (interne CA) / **NOT TESTED** (ACME) | 4/4 Caddyfiles valide; HTTPS 200, Header, Redirect, Health |
| D – Automatisierte Backups | **PASS** | DB- und Config-Archiv verschlüsselt, SHA-256, Rotation, Drill, Restore-Switch |
| E – Offsite-Konzept | **PASS** (lokale Simulation) / **NOT TESTED** (rsync/Remote) | Kopie, Prüfsummen am Ziel, Rotation, Selbstheilung |
| F – Monitoring | **PASS** | nativ 21 Prüfungen / 0 FAIL; Docker 0 FAIL; Ausfälle erkannt |
| G – Disaster Recovery | **PASS** (isoliert) | App-Crash, DB-Ausfall, Neustart, Restore, korruptes Backup, fehlende Env |
| H – Regression/Kompatibilität | **PASS** | tsc, ESLint, 643 Unit-, 126 Integrationstests, Builds, Vercel unverändert |
| I – Readiness live über Caddy | **PASS** | 200 → 503 → 200, alle proxied Pfade 503, App stabil (§18) |
| Vercel-Preview-Deployment | **NOT TESTED** | keine Freigabe; statische Prüfung PASS (§18.9) |
| Echte Domain / ACME / DNS / Firewall | **BLOCKED** | keine Freigabe, keine Domain |
| Root-Installation auf Zielserver | **BLOCKED** | nur in isolierter Linux-Umgebung ausgeführt |

## 1. Ausgangszustand

INFRA 1.1–1.4 hatten den Compose-Stack, Caddy/HTTPS mit interner CA,
PostgreSQL 18 mit 14 Migrationen/44 Tabellen, Backup/Restore, Monitoring und
die native Betriebsform validiert. Für eine reproduzierbare Produktions­
installation fehlten jedoch:

* ein **read-only Preflight**, der Voraussetzungen, Rechte, Ports und
  konkurrierende Betriebsformen prüft,
* ein **Installationsvorbereiter** mit Dry-Run, der Verzeichnisse, Benutzer,
  Env-Dateien und Schlüssel idempotent anlegt (bisher manuelle Schritte),
* eine **App-Unit als Datei** (die Anleitung enthielt nur ein Snippet),
* **Cron- und Offsite-Units** (Cron lief bisher über `/etc/cron.d`, ohne
  `OnFailure` und ohne Journal-Zuordnung),
* ein **Konfigurationsbackup** (nur die Datenbank wurde gesichert),
* ein **Offsite-Pfad** (bisher ausdrücklich nicht eingerichtet),
* Monitoring für **Container, Caddy, CPU, Backup-Integrität und Dateirechte**,
* ein **vollständiger DR-Test** inklusive korruptem Backup und fehlender
  Umgebungsvariablen.

Die bestehenden Änderungen im Worktree wurden nicht zurückgesetzt, gestasht
oder überschrieben. `vercel.json` und die Vercel-Funktionen blieben unberührt.

## 2. Durchgeführte Änderungen

### Arbeitspaket A – Reproduzierbare Installation

**`deploy/install/preflight.sh` (neu, 481 Zeilen)** – rein lesend:

* Betriebsform `compose|native|auto`, Repository-Layout, OS/Architektur,
  systemd, Zeitsynchronisation,
* Pflichtkommandos und Mindestversionen (Docker ≥ 27, Compose ≥ 2.30,
  Node ≥ 24.11, Caddy, PostgreSQL-Clients),
* Env-Datei: Existenz, Modus (0600/0640), LF, Pflichtschlüssel,
  `CHANGE_ME`, Secret-Längen, HTTPS-Origins, Git-Ignore,
* Verzeichnisse/Rechte, Backup-Schlüssel (0600, ≥ 32 Byte),
* Ports 80/443, laufende Compose-/native Instanz und **Moduskonflikt**,
* RAM/Disk/CPU-Kopfraum, Compose-Rendering, `vercel.json`,
* Text- oder JSON-Ausgabe, Exit 0/1/2 (`--strict`), keine Secret-Ausgabe.

**`deploy/install/install-production.sh` (neu, 282 Zeilen)**:

* **Dry-Run ist Standard**; `--apply` führt aus und verlangt root.
* Legt `/etc/webradio` (0700), `/var/backups/webradio` (0700),
  `/var/log/webradio` (0750) an, im nativen Modus zusätzlich den
  `webradio`-Systembenutzer und `/opt/webradio` (0750).
* Erzeugt Env-Dateien aus Vorlagen (0600/0640), generiert
  `POSTGRES_PASSWORD` (Hex, URL-sicher), `NEXTAUTH_SECRET`, `CRON_SECRET`
  und `/etc/webradio/backup.key` – **ohne Werte zu drucken**.
* Setzt `BACKUP_MODE`, Compose-Pfade, Monitoring-Modus und `cron.env`.
* Ist idempotent: vorhandene Dateien/Schlüssel bleiben unverändert.

**`deploy/env.native.example` (neu)** – vollständige Vorlage der nativen
Laufzeitumgebung (`PORT=3010`, `HOSTNAME=127.0.0.1`, `DATABASE_PROVIDER`,
`TRUST_PROXY=1`, GitHub-Optionen).

Nachweis: Dry-Run erzeugte keine Verzeichnisse; der zweite `--apply`-Lauf
änderte weder `backup.key` noch `app.env` (identische MD5-Summen), alle
Rechte korrekt (700/750/640/600).

### Arbeitspaket B – Systemd und Hostdienste

**`deploy/systemd/webradio-app.service` (neu)** – native Anwendung:

* `After=network-online.target postgresql.service`, `Wants=network-online.target`,
* `Restart=always`, `RestartSec=3`, `StartLimitBurst=5`, `OnFailure`,
* `User=webradio`, `EnvironmentFile=/etc/webradio/app.env`,
* `ExecStart=/usr/bin/env node .next/standalone/server.js` (funktioniert für
  Distributions- und Tarball-Node),
* Sandbox: `NoNewPrivileges`, `PrivateTmp`, `PrivateDevices`,
  `ProtectSystem=strict`, `ProtectHome`, `ProtectKernel*`,
  `ProtectClock`, `ProtectHostname`, `RestrictSUIDSGID`,
  `RestrictAddressFamilies`, `ReadWritePaths` nur `.next/cache`, `UMask=0027`.

**`webradio-cron.service`/`.timer` (neu)** – ersetzt `/etc/cron.d`:
vier Schedules sequenziell über `cron-run.sh`, täglich 03:15,
`OnFailure`, Journal statt anonymer Cron-Mail.

**`webradio-offsite.service`/`.timer` (neu)** – Kopie der verschlüsselten
Archive um 02:45, `OnFailure`, läuft auch ohne konfiguriertes Ziel
(Exit 0, Logeintrag).

**`deploy/systemd/install-native-ops.sh` (überarbeitet)**:

* validiert 24 Quelldateien und `bash -n` **vor** jeder Änderung,
* `--dry-run` und `--mode auto|compose|native`, `--apply` als No-op-Alias,
* installiert 7 Skripte, 13 Units, 3 Env-Vorlagen, Verzeichnisse und Key,
* `systemd-analyze verify` **vor** dem Aktivieren (13/13),
* aktiviert Dienste/Timer nur bei vollständiger Konfiguration
  (keine `CHANGE_ME`-Aktivzeilen, `PGDATABASE` vorhanden, Cron/Offsite
  konfiguriert) – verhindert Alarmfeuer alle fünf Minuten,
* Compose-Modus installiert bewusst **kein** `caddy.service`/App-Unit.

Nachweis: 13/13 Units verifiziert, 5 Timer aktiv, `webradio-backup.service`
erzeugt DB- und Config-Archiv in einem Lauf, `webradio-cron.service` und
`webradio-restore-drill.service` enden mit `Result=success`, OnFailure
schreibt `webradio-alert` ins Journal.

### Arbeitspaket C – Caddy und HTTPS

* Test-/Produktionskonfigurationen bleiben getrennt
  (`Caddyfile`/`Caddyfile.internal` für Compose,
  `Caddyfile.native`/`Caddyfile.native-test` für systemd).
* **Verbesserung:** `health_interval` 30 s → **5 s**, `health_timeout 3 s`,
  `lb_try_duration 10 s`, `lb_try_interval 500 ms`. Nach einem App-Neustart
  war der Upstream dadurch nach **1–3 s** wieder erreichbar statt bis zu 30 s.
* Header, `-Server`, `/api/ready`-Readiness-Check (DB-`SELECT 1`), `X-Real-IP`,
  HTTP→HTTPS mit
  korrektem Port bleiben erhalten.
* 4/4 Caddyfiles mit Caddy 2.11.9 als „Valid configuration“ geprüft.
* Keine ACME-Anfrage, keine DNS-/Firewall-Änderung.

### Arbeitspaket D – Automatisierte Backups

**`deploy/backup/config-backup.sh` (neu, 110 Zeilen)**:

* archiviert 27 versionierte Konfigurationsdateien (Compose, Dockerfile,
  Caddyfiles, Units, Skripte, Dokumente, Contract-Artefakte) und optional
  `/etc/caddy/Caddyfile` sowie installierte Units,
* **bricht ab**, wenn das Archiv nach `.env`, `env.production`, `env.test`,
  `.key`, `.pem` oder `secret` aussieht (Schutz vor Fehlkonfiguration),
* AES-256-CBC/PBKDF2 mit demselben 0600-Schlüssel, SHA-256, Rotation,
  eine Logzeile pro Lauf, kein Klartext.

`webradio-backup.service` führt jetzt **beide** Skripte aus. Ergänzt:
`CONFIG_BACKUP`, `REPO_DIR`, `CONFIG_EXTRA_PATHS` in `backup.env.example`.

Nachweis: DB 255.244 B / Config 235.120 B (Compose), 20.237 B / 237.808 B
(nativ), alle 0600, keine Klartextdatei, `pg_restore -l` lesbar,
Drill 44 Tabellen (Compose) bzw. 41 (native Test-DB), 0 fremde Owner,
`db verify --strict` grün.

### Arbeitspaket E – Offsite-Backup

**`deploy/backup/offsite-sync.sh` (neu, 135 Zeilen)** und
`offsite.env.example`:

| Verfahren | Bewertung | Umsetzung |
|---|---|---|
| Lokales Verzeichnis/zweite Disk/NAS | sicher, einfach, keine Kosten | **implementiert und getestet** |
| `rsync` über SSH | verschlüsselter Transport, keybasiert | implementiert, **nicht ausgeführt** (kein Remote-Host) |
| S3/Restic/Rclone | entkoppelt, versioniert, Kosten/Account nötig | dokumentiert, **nicht implementiert** (keine externen Konten) |

Eigenschaften: kopiert ausschließlich `*.enc` und `*.sha256`, prüft alle
Prüfsummen am Ziel, rotiert nur am Ziel (`OFFSITE_KEEP=7`), löscht nie lokal,
verweigert Ziele innerhalb des Backup-Verzeichnisses, `--dry-run` und
`--require`. Test: 12 Dateien kopiert, 6 Prüfsummen ok, Rotation auf 2,
manipulierte Zieldatei wurde beim nächsten Lauf ersetzt und erneut verifiziert.

### Arbeitspaket F – Monitoring

`health-report.sh` prüft jetzt zusätzlich:

* Docker-Daemon und **Health-Status jedes Containers** (`CHECK_CONTAINERS`),
* Caddy intern (`/healthz` im Container, `caddy.service` nativ),
* **CPU-Auslastung** (1-s-Sample aus `/proc/stat`, `CPU_WARN=85`),
* **SHA-256 des neuesten Backups** (Bitfehler statt nur Alter),
* **Konfigurationsarchiv** und dessen Alter,
* **Dateirechte** von Backup-Key und Env-Dateien (Key zwingend 0600),
* korrekte Behandlung von Nicht-systemd-Hosts und fehlendem `/proc/meminfo`
  (vorher falsches PASS bzw. FAIL auf Windows).

Ergebnis nativ: **21 Prüfungen, 0 FAIL** (JSONL valide). Docker: **17
Prüfungen, 0 FAIL**, 4 WARN (Windows-Disk, fehlendes `/proc/meminfo`,
kein systemd, fehlender Cron-Logpfad) – Plattformartefakte, keine
Produktfehler. Ausfallerkennung: `FAIL postgres` + `FAIL unit:postgresql`
bei gestoppter DB, `FAIL app_http` + `FAIL container:webradio` bei
gestoppter App, `FAIL backup`, wenn kein Archiv existiert.

### Arbeitspaket G – Disaster Recovery

Siehe Abschnitt 10. Keine der Übungen lief gegen produktive Daten; alle
Testdatenbanken wurden eigens angelegt (`webradio_test`,
`webradio_infra14_test` im Projekt `webradio15`, native Test-DB `webradio`).

### Arbeitspaket H – Regression

Alle Prüfungen wurden **neu ausgeführt**, keine Ergebnisse übernommen.
Siehe Abschnitt 11.

## 3. Neue und geänderte Dateien

**Neu:**

| Datei | Zweck |
|---|---|
| `deploy/install/preflight.sh` | read-only Produktions-Preflight |
| `deploy/install/install-production.sh` | idempotenter Installationsvorbereiter, Dry-Run |
| `deploy/env.native.example` | Env-Vorlage der nativen Form |
| `deploy/systemd/webradio-app.service` | native App-Unit |
| `deploy/systemd/webradio-cron.service`/`.timer` | Analytics-Schedules ohne Vercel |
| `deploy/systemd/webradio-offsite.service`/`.timer` | Offsite-Kopie |
| `deploy/monitoring/cron-run.sh` | sequenzieller Cron-Runner, secret-sicheres Logging |
| `deploy/backup/config-backup.sh` | verschlüsseltes Konfigurationsarchiv |
| `deploy/backup/offsite-sync.sh` | Offsite-Kopie (lokal/rsync) |
| `deploy/backup/offsite.env.example` | Offsite-Konfiguration |
| `docs/PHASE_INFRA1.5_PRODUCTION_DEPLOYMENT_PREPARATION_REPORT.md` | dieser Bericht |

**Geändert:**

| Datei | Änderung |
|---|---|
| `deploy/systemd/install-native-ops.sh` | Dry-Run, Modus, neue Units, Verify, Gating |
| `deploy/systemd/webradio-backup.service` | zweiter `ExecStart` für Config-Archiv |
| `deploy/monitoring/health-report.sh` | Container/Caddy/CPU/Integrität/Rechte |
| `deploy/monitoring/monitoring.env.example` | neue Schalter, `MONITOR_UNITS` gequotet |
| `deploy/backup/backup.env.example` | Config-Archiv, `REPO_DIR`, Offsite-Hinweis |
| `deploy/Caddyfile`, `Caddyfile.internal`, `deploy/caddy/*` | Health 5 s, Retry-Fenster |
| `docs/SELF_HOSTED_DEPLOYMENT_GUIDE.md` | Installer, Timer, Cron, Offsite |
| `docs/DISASTER_RECOVERY_GUIDE.md` | Config-Backup, Offsite, DR-Ergebnisse |
| `docs/SELF_HOSTED_SECURITY_HARDENING.md` | neue Kontrollen und Restrisiken |
| `docs/HOSTING_PORTABILITY.md`, `docs/HOSTING_MIGRATION_GUIDE.md` | Verweise auf Installation/Backup |

Unverändert: Anwendungslogik, `vercel.json`, Vercel-Schedules,
Prisma-Contract-Schema, `docker-compose.yml` (Dev-DB), bestehende Backups
und Volumes.

## 4. Technische Architektur

```
Variante B (Compose)
Internet ──80/443──▶ caddy (edge) ──3000──▶ webradio (Next.js standalone)
                                                │
                                                └──5432──▶ postgres (Netz backend, internal)
webradio ──egress──▶ GitHub/SMTP
tools (Profil) ──▶ einmalige Migrationen/Prüfungen

Variante A (nativ)
Internet ──80/443──▶ caddy.service ──127.0.0.1:3010──▶ webradio-app.service
                                                          │
                                                          └──127.0.0.1:5432──▶ postgresql.service
```

* Nur Caddy veröffentlicht Ports; App und DB sind im Compose-Betrieb nicht
  am Host erreichbar (`docker ps` zeigt `3000/tcp`, `5432/tcp` ohne Bindung).
* Die native App bindet ausschließlich an Loopback (`HOSTNAME=127.0.0.1`).
* Genau eine Betriebsform pro Host; der Preflight erkennt Doppelbetrieb.
* `tools` bleibt ein Einmal-Container (Builder-Stage, 5,51 GB) und ist kein
  Laufzeitbestandteil.

## 5. Installationsablauf

```bash
# 1. Repository bereitstellen (Freigabe erforderlich)
sudo install -d -o root -g root -m 0755 /opt/webradio
sudo git clone <repo> /opt/webradio && cd /opt/webradio

# 2. Host vorbereiten – zuerst immer Dry-Run
sudo bash deploy/install/install-production.sh --mode compose \
  --env-file deploy/env.production            # zeigt nur geplante Aktionen
sudo bash deploy/install/install-production.sh --mode compose \
  --env-file deploy/env.production --apply

# 3. Manuelle Werte setzen (nie automatisch generiert)
#    SITE_ADDRESS, NEXTAUTH_URL, NEXT_PUBLIC_SITE_URL, ACME_EMAIL,
#    POSTGRES_USER/DB, ggf. GitHub-Integration

# 4. Voraussetzungen prüfen
bash deploy/install/preflight.sh --mode compose \
  --env-file deploy/env.production

# 5. Caddy/Services/Timer installieren (nativ)
sudo REPO=/opt/webradio bash deploy/systemd/install-native-ops.sh --mode native

# 6. Bauen, starten, migrieren, prüfen
docker compose --env-file deploy/env.production build
docker compose --env-file deploy/env.production up -d
docker compose --env-file deploy/env.production run --rm tools \
  node scripts/prisma-db.mts db migrate
docker compose --env-file deploy/env.production run --rm tools \
  node scripts/prisma-db.mts db verify --strict
```

Eigenschaften: Dry-Run schreibt nichts; `--apply` ist wiederholbar;
vorhandene Env-Dateien und Schlüssel werden nie überschrieben; Secrets werden
weder ausgegeben noch in Logs geschrieben; der Preflight ist jederzeit
gefahrlos erneut ausführbar. Bei fehlenden Pflichtwerten bricht Compose mit
klarer Meldung ab (getestet: `required variable NEXTAUTH_SECRET is missing a
value`).

## 6. Systemd-Konfiguration

| Unit | Typ | Zeit/Start | Härtung |
|---|---|---|---|
| `caddy.service` | notify | Boot, `network-online` | `caddy`-User, nur `CAP_NET_BIND_SERVICE`, `ProtectSystem=strict` |
| `webradio-app.service` | simple | Boot, nach PostgreSQL | `webradio`-User, umfangreiche Sandbox, `Restart=always` |
| `webradio-backup.service` | oneshot | täglich 02:15 ± 5 min | root, `Nice=10`, `IOSchedulingClass=best-effort` |
| `webradio-offsite.service` | oneshot | täglich 02:45 ± 5 min | root, `Nice=15` |
| `webradio-cron.service` | oneshot | täglich 03:15 ± 5 min | root, 1500 s Timeout |
| `webradio-health.service` | oneshot | alle 5 min | root, 120 s Timeout |
| `webradio-restore-drill.service` | oneshot | sonntags 05:30 | root, 1800 s Timeout |
| `webradio-alert@.service` | oneshot | via `OnFailure` | root, Journal + optional Webhook |

* `Persistent=true` bei Backup/Drill/Cron/Offsite holt verpasste Läufe nach.
* `OnFailure=webradio-alert@%n.service` in allen kritischen Units; im Test
  wurde der Alarm bei fehlgeschlagener Health-/Cron-Unit im Journal belegt.
* Startreihenfolge: App wartet auf `network-online` und `postgresql`;
  Caddy wartet nicht hart auf die App, sondern nutzt Healthchecks/Retry.
* Fehlende `app.env` führt zu einem klaren Startfehler („Failed to start“,
  `OnFailure`), nicht zu einem stillen Weiterlaufen.
* `systemd-analyze verify`: **13/13 Units ohne Fehler**.
* Container-Neustart (Boot-Ersatz): `systemd` erreichte `running`, App,
  Caddy und PostgreSQL aktiv, 5 Timer geplant, HTTPS 200.

## 7. Caddy-Konfiguration

| Datei | Einsatz | Zertifikat | Ports |
|---|---|---|---|
| `deploy/Caddyfile` | Compose, Produktion | ACME | 80/443 |
| `deploy/Caddyfile.internal` | Compose, Test | interne CA | 8080/8443 |
| `deploy/caddy/Caddyfile.native` | systemd, Produktion | ACME | 80/443 |
| `deploy/caddy/Caddyfile.native-test` | systemd, Test | interne CA | 8080/8443 |

Gemeinsam: HSTS, `nosniff`, `DENY`, `Referrer-Policy`,
`Permissions-Policy`, `Cross-Origin-Opener-Policy`, kein `Server`-Header,
`encode zstd gzip`, `reverse_proxy` mit `/api/ready` (Readiness inkl. DB),
`X-Real-IP`.
Produktions-HSTS: 1 Jahr inkl. Subdomains; Test: 24 h (bewusst kurz).
`admin off` in allen Varianten.

**Für den echten Domainbetrieb später exakt erforderlich** (freigabepflichtig):

1. A/AAAA-Record der Domain auf die Server-IP setzen (TTL vorab senken).
2. Firewall: eingehend 80/tcp (ACME + Redirect) und 443/tcp/udp öffnen,
   sonst nichts.
3. `SITE_ADDRESS=https://<domain>` und `ACME_EMAIL=<ops@domain>` setzen
   (`/etc/caddy/caddy.env` bzw. `deploy/env.production`).
4. `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`.
5. `systemctl reload caddy` (nativ) bzw. `docker compose up -d caddy`.
6. Zertifikat prüfen: `openssl s_client -connect <domain>:443 -servername <domain>`
   bzw. `curl -fsS https://<domain>/api/health` und
   `curl -fsS https://<domain>/api/ready`.
7. CAA-Record nur setzen, wenn die CA-Autorisierung bewusst eingeschränkt
   werden soll.
8. Monitoring `SITE_URL=https://<domain>` setzen; ACME-Erneuerung liegt bei
   Caddy (ca. ein Drittel der Restlaufzeit).

Nicht ausgeführt: DNS, Firewall, ACME, echte Domain.

## 8. Backup-Konzept

| Bestandteil | Verfahren | Aufbewahrung | Verschlüsselung |
|---|---|---|---|
| Datenbank | `pg_dump -Fc`, `pg_restore -l`-Prüfung | 14 (`BACKUP_KEEP`) | AES-256-CBC/PBKDF2, 0600-Key |
| Konfiguration | `tar.gz` aus Whitelist, Secret-Guard | 14 | dito |
| Prüfsummen | SHA-256 je Archiv | mit Archiv | – |
| Offsite | Kopie der `.enc` + `.sha256` | 7 am Ziel | bleibt verschlüsselt |

Nicht im Archiv (bewusst): echte Env-Dateien, `backup.key`, private Schlüssel,
Caddy-Zertifikatsdaten. Diese gehören in einen Passwortmanager/zwei externe
Kopien; Caddy-Zertifikate sind für einen Umzug nützlich, aber nicht
essenziell (ACME stellt neu aus). Logs sind Diagnose, kein Bestand.

Ablauf: 02:15 DB-Dump → Integritätsprüfung → Verschlüsselung → SHA-256 →
Rotation; direkt danach Config-Archiv; 02:45 Offsite-Kopie mit
Ziel-Verifikation; sonntags 05:30 Restore-Drill in eine Wegwerf-DB.
Jeder Fehler beendet die Unit mit Exit ≠ 0 und löst den Alarm aus.

## 9. Monitoring-Konzept

| Prüfung | Quelle | FAIL-Grenze |
|---|---|---|
| Anwendung (Liveness) | `GET /api/health` (Status 200 + `"status":"ok"`) | nicht 200 |
| Readiness (DB) | `GET /api/ready` (`SELECT 1`, 200 + `"status":"ready"`) | 503/nicht 200 |
| PostgreSQL | `pg_isready` bzw. `compose exec` | nicht bereit |
| Container | Docker-Health/State je Service | nicht `running`/`healthy` |
| Caddy | internes `/healthz` bzw. `caddy.service` | nicht erreichbar/aktiv |
| Disk | `df` auf `/` | ≥ 95 % (WARN ≥ 85 %) |
| RAM | `/proc/meminfo` verfügbar | < 8 % (WARN < 15 %) |
| CPU | `/proc/stat`, 1-s-Sample | ≥ 85 % (WARN) |
| Load | `load1 / vCPU` | > 1,5 × vCPU (WARN) |
| Backup | neuestes `.dump.enc` | fehlt oder > 26 h |
| Backup-Integrität | `sha256sum -c` | Abweichung |
| Config-Backup | neuestes `.tar.gz.enc` | fehlt oder > 48 h |
| Rechte | `stat` auf Key/Env | Key ≠ 0600, Env zu offen |
| Cron | letzte Zeile in `cron.log` | Status ∉ {200, 409} |
| TLS | `openssl s_client` | kein Zertifikat, < 7 Tage |
| systemd | `systemctl --failed` | fehlgeschlagene Units (WARN) |

Kein Daemon, keine SaaS, ein Oneshot-Lauf alle fünf Minuten (Laufzeit ~1 s
plus CPU-Sample). Ausgabe: Text + eine JSON-Zeile in `health.jsonl`,
Exit 1 bei FAIL, optional Webhook. Auf einem 1-GB-Host bleibt der
Verbrauch damit im einstelligen MB-Bereich.

**Nachtrag Readiness:** `/api/health` bleibt ein **Liveness**-Endpoint und
antwortet auch bei ausgefallener Datenbank mit 200 (im Test beobachtet). Die
DB-Verfügbarkeit prüft der separate Endpoint `/api/ready` (`SELECT 1`,
200/503); Caddy nutzt ihn als Upstream-Health, das Monitoring prüft Liveness
und Readiness getrennt. Die Messungen in diesem Bericht wurden noch mit
`/api/health` bzw. `pg_isready` durchgeführt; der Live-Integrationstest mit
Caddy, Anwendung und PostgreSQL steht in §18.

## 10. Disaster-Recovery-Ergebnisse

Isolierte Umgebung: systemd-Container (Ubuntu 24.04, systemd 255,
PostgreSQL 16.15 für die nativen Mechanismen) und Compose-Projekt
`webradio15` (PostgreSQL 18.6, echtes Anwendungsimage). Keine produktiven
Daten, keine Löschung bestehender Volumes/Backups.

| # | Szenario | Ergebnis | Messwert/Beleg |
|---|---|---|---|
| 1 | App-Prozess `SIGKILL` (nativ) | **PASS** | `Restart=always`, neuer PID, `NRestarts=1`, Health 200 |
| 2 | App-Container gestoppt (Compose) | **PASS** | 502 während Ausfall, **3 s** bis 200 nach Start |
| 3 | App-Container restart | **PASS** | **1 s** bis 200 (Health 5 s + Retry) |
| 4 | Caddy restart (nativ) | **PASS** | HTTPS 200, 0 s Unterbrechung im Test |
| 5 | PostgreSQL gestoppt (nativ) | **PASS** | App bleibt `active`; Monitoring `FAIL postgres` + `FAIL unit`; nach Start sofort bereit |
| 6 | PostgreSQL gestoppt (Compose) | **PASS** | App bleibt `running`; `/api/health` 200 (Liveness), `/plugins` 200 (Cache); `pg_isready` FAIL |
| 7 | Container-Neustart (`down`/`up`) | **PASS** | 44 Tabellen unverändert, alle Container `healthy`, Health 200 |
| 8 | Host-/Container-Boot | **PASS** | systemd `running`, App/Caddy/PostgreSQL aktiv, 5 Timer, HTTPS 200 |
| 9 | DB-Restore + Umschalten | **PASS** | 44 Tabellen, 0 fremde Owner, `db verify --strict` vor/nach Switch, Login 200, Admin 307 |
| 10 | Korrupte Backup-Kopie | **PASS** | SHA-256-Mismatch, Exit 1, Original unverändert |
| 11 | Fehlende `NEXTAUTH_SECRET` | **PASS** | Compose bricht mit Exit 1 und klarer Meldung ab |
| 12 | Fehlende `app.env` (nativ) | **PASS** | Unit-Start schlägt fehl, `OnFailure` feuert, nach Wiederherstellung 200 |
| 13 | Fehlendes Backup | **PASS** | Monitoring `FAIL backup`, Health-Unit schlägt fehl und alarmiert |
| 14 | Offsite-Zieldatei manipuliert | **PASS** | nächster Lauf ersetzt sie, Prüfsummen wieder ok |
| 15 | Restore auf fremder Hardware | **NOT TESTED** | kein zweiter Host verfügbar |
| 16 | echter Host-Neustart (Linux/Docker-CE) | **NOT TESTED** | nur Container-Boot geprüft |

Native Test-DB hatte 41 Tabellen (echte App-Schema hat 44); die
Prisma-Markerprüfung wurde deshalb im Compose-Strang mit dem echten Schema
durchgeführt.

## 11. Testergebnisse mit konkreten Zahlen

| # | Prüfung | Ergebnis | Beleg |
|---|---|---|---|
| 1 | TypeScript | **PASS** | `npx tsc --noEmit`, Exit 0 |
| 2 | ESLint | **PASS** | 0 Fehler, 7 Warnungen (vorbestehend) |
| 3 | Unit-Tests | **PASS** | 66 Suiten / 643 Tests, 16,8 s |
| 4 | Integrationstests | **PASS** | 7 Suiten / 126 Tests, 34,7 s, isolierte `webradio_test` |
| 5 | Prisma Contract Emit | **PASS** | Exit 0, `profileHash 3916f444…` |
| 6 | Prisma Contract Print | **PASS** | Exit 0, 1.697 Zeilen PSL |
| 7 | Migrationen | **PASS** | 14 Migrationen auf neuer DB |
| 8 | `db verify --strict` | **PASS** | Test-DB, Compose-DB, Restore-DB |
| 9 | Next.js Production Build | **PASS** | Exit 0, 107 statische Seiten, Standalone |
| 10 | Docker Build | **PASS** | Runner **360 MB**, Tools **5,51 GB**, kalter Build |
| 11 | Compose-Validierung | **PASS** | `docker compose config -q`, Exit 0 |
| 12 | Container-Healthchecks | **PASS** | postgres/webradio/caddy `healthy` |
| 13 | HTTPS + Routen | **PASS** | `/` `/plugins` `/themes` `/releases` `/news` `/auth/login` 200, `/admin` 307 |
| 14 | Header/Redirect | **PASS** | HSTS, nosniff, DENY, Referrer, Permissions, kein `Server`; 301 auf 8443 |
| 15 | Backup DB (Docker) | **PASS** | 255.244 B, AES-256, SHA-256 |
| 16 | Backup Config | **PASS** | 235.120 B, 55 Einträge, keine Secrets |
| 17 | Restore-Drill | **PASS** | 44 Tabellen, 0 fremde Owner, `db verify --strict`, DB gelöscht |
| 18 | Restore + Switch | **PASS** | 44 Tabellen, Health 200, Login 200 |
| 19 | Rotation | **PASS** | `BACKUP_KEEP=3`, ältere Archive entfernt |
| 20 | Offsite (lokal) | **PASS** | 12 Dateien, 6 Prüfsummen, Keep=2, Selbstheilung |
| 21 | Monitoring nativ | **PASS** | 21 Prüfungen, 0 FAIL |
| 22 | Monitoring Docker | **PASS** | 17 Prüfungen, 0 FAIL (4 Plattform-WARN) |
| 23 | systemd Units | **PASS** | `systemd-analyze verify` 13/13 |
| 24 | Skript-Syntax | **PASS** | `bash -n` für 10 Skripte |
| 25 | Caddyfiles | **PASS** | 4/4 „Valid configuration“ |
| 26 | Preflight nativ | **PASS** | 32 PASS, 0 WARN, 0 FAIL |
| 27 | Preflight Windows-Compose | **PASS** | korrekte FAILs für POSIX-Rechte/Hostverzeichnisse, 29 PASS |
| 28 | Installer-Idempotenz | **PASS** | zweiter Lauf: identische MD5 für Key/Env |
| 29 | Cron (Retention) | **PASS** | HTTP 200 über Unit; 401 ohne Secret |
| 30 | Cron (GitHub-Schedules) | **WARNING** | 500 `NOT_CONFIGURED`, ohne GitHub-App erwartet |
| 31 | Secrets in Images | **PASS** | keine Env-Datei im Tools-Image, kein `DATABASE_URL` im Runner |
| 32 | Container-Härtung | **PASS** | uid 1001, `cap_drop ALL`, `no-new-privileges`, tmpfs, 768 MiB/2 CPU |
| 33 | Vercel-Kompatibilität | **PASS** | `vercel.json` unverändert, Schedules/Route vorhanden |
| 34 | Vercel-Deployment | **NOT TESTED** | nicht freigegeben |

## 12. Ressourcenverbrauch

Gemessen mit `docker stats --no-stream` (Compose, echte Anwendung, idle):

| Komponente | RAM | Limit | CPU idle |
|---|---|---|---|
| `webradio` | 93,7 MiB | 768 MiB | 0 % |
| `postgres` | 30,1 MiB | 512 MiB | 0 % |
| `caddy` | 16,5 MiB | 128 MiB | 0 % |
| Summe | ~140 MiB | 1.408 MiB | – |

Native Testinstanz (Stub statt Next.js): App 14,6 MiB, Caddy 19,6 MiB,
PostgreSQL 16 im Container. Der reale App-Verbrauch liegt laut INFRA 1.4
bei 131 MiB idle / 239 MiB unter Last; die Limits (768/512/128 MiB,
2/1/0,5 CPU) bleiben damit 2–3× über dem gemessenen Bedarf.

Empfohlene Hostgröße unverändert: 2 vCPU, 2 GB RAM, 20 GB Disk. Backup
(~250 KB DB + ~235 KB Config pro Tag, 14 Stück) und Logs (10 MB × 3 je
Container) sind vernachlässigbar. Der 5,51-GB-`tools`-Container ist nur
temporär nötig.

## 13. Sicherheitsbewertung

**PASS**

* Secrets nur in 0600-Dateien (bzw. 0640 `app.env` für den Dienstbenutzer),
  keine Ausgabe in Logs/Berichten, kein Secret in Images oder Build-Kontext.
* Zwei unabhängige Schutzmechanismen gegen Secret-Leaks in Backups:
  Whitelist und Post-Archiv-Guard (Abbruch bei `.env`/`.key`/`.pem`).
* Verschlüsselte Backups, SHA-256, Rotation, Key separat.
* Preflight prüft Rechte, Platzhalter, Git-Ignore und Ports.
* Non-root-App, `cap_drop ALL`, `no-new-privileges`, internes DB-Netz,
  keine veröffentlichten DB-/App-Ports, Caddy-Admin-API aus.
* Native App mit `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`,
  `PrivateDevices`, `RestrictAddressFamilies` und Schreibrecht nur auf
  `.next/cache`.
* Backup-/Health-/Cron-Units laufen als root, aber ohne Netz-Listener und
  mit `Nice`/I/O-Drosselung; Fehler erzeugen einen Journal-Alarm.
* `TRUST_PROXY=1` nur hinter Caddy; native App bindet an Loopback.

**WARNING**

* Docker-Build warnt vor `ARG/ENV NEXTAUTH_SECRET`; verwendet werden nur
  Platzhalter, der Runner erbt sie nicht. Ein BuildKit-Secret wäre die
  nächste Härtungsstufe.
* Der Caddy-Container läuft als root (Portbindung); im Test durch
  `no-new-privileges` und read-only Caddyfile gemindert.
* Der `tools`-Container ist groß und enthält den Quellbaum (keine Secrets).
  Er sollte nach Migrationen entfernt werden.
* Offsite ist konzeptionell und lokal getestet, aber nicht extern
  eingerichtet; ein Hostverlust verlöre derzeit die einzige Kopie.
* `/api/health` prüft die Datenbank nicht (Liveness); `/api/ready` prüft sie
  separat und wird von Caddy und Monitoring genutzt.

**BLOCKED**

* Root-Installation auf dem echten Zielserver (Freigabe).
* DNS/Firewall/ACME (Freigabe, Domain).
* Externes Offsite-Ziel (Konto/Ziel, Freigabe).

## 14. Bekannte Einschränkungen

1. **Systemd-Tests liefen in einem privilegierten systemd-Container**
   (Ubuntu 24.04, systemd 255), nicht auf der INFRA-1.3-VM – diese war
   während der Phase nicht erreichbar (SSH-Timeout, kein Hyper-V-Gast).
   Units, Timer, OnFailure und Boot-Verhalten sind damit real geprüft, aber
   nicht auf der Referenz-VM.
2. Die native Backup-/Drill-Mechanik lief gegen **PostgreSQL 16.15** im
   Testcontainer; das echte Schema und `db verify --strict` wurden mit
   **PostgreSQL 18.6** im Compose-Strang geprüft.
3. Der isolierte Testhost nutzt einen **`/etc/hosts`-Eintrag** für die
   interne Domain. Docker regeneriert `/etc/hosts` bei Container-Neustart;
   in Produktion übernimmt DNS diese Aufgabe.
4. Windows-Artefakte: Dateirechte sind dort 0644, `df` meldet das
   Windows-Volume (90 %), `/proc/meminfo` fehlt, Windows-curl (Schannel)
   akzeptiert die interne CA nicht ohne `--insecure`/`--cacert`-Ausnahme.
   Alle sicherheitsrelevanten Rechteprüfungen wurden auf Linux ausgeführt.
5. Die GitHub-abhängigen Analytics-Schedules liefern ohne GitHub-App
   `500 JOB_FAILED (NOT_CONFIGURED)`. Das ist korrektes Verhalten; die
   Schedules müssen zur Konfiguration passen (`CRON_SCHEDULES`).
6. `/api/health` ist ein Liveness-Endpoint; DB-Ausfälle erkennt `/api/ready`
   (Readiness, `SELECT 1`), das Caddy und Monitoring abfragen.
7. Der Offsite-`rsync`-Pfad ist implementiert, aber ohne Remote-Host
   **nicht ausgeführt**.

## 15. Noch offene Punkte für den echten Produktivbetrieb

| # | Punkt | Status | Erforderlich |
|---|---|---|---|
| 1 | Root-Installation auf Zielserver (`install-production.sh --apply`, `install-native-ops.sh`) | **BLOCKED** | sudo-Freigabe |
| 2 | `caddy.service` mit echter Domain, ACME-Zertifikat | **BLOCKED** | DNS + Firewall 80/443 + Freigabe |
| 3 | Echte Secrets setzen (Domain, DB-Passwort, `NEXTAUTH_SECRET`, `CRON_SECRET`) | **BLOCKED** | Freigabe/Passwortmanager |
| 4 | Externes Offsite-Ziel (SSH/S3/Restic) | **BLOCKED** | Ziel + Credentials + Freigabe |
| 5 | Restore auf fremder Hardware | **NOT TESTED** | zweiter Host |
| 6 | Host-Neustart auf echtem Linux/Docker-CE | **NOT TESTED** | Zielserver |
| 7 | Vercel-Deployment | **NOT TESTED** | Freigabe |
| 8 | `tools`-Image nach Migration entfernen | offen | Betriebsroutine |
| 9 | Edge-Rate-Limits/Bot-Schutz | offen | optionale Härtung |
| 10 | BuildKit-Secret statt ARG-Platzhalter | offen | optionale Härtung |

## 16. Reproduktion der wichtigsten Prüfungen

```bash
# Installation (Dry-Run / Apply)
bash deploy/install/install-production.sh --mode compose --env-file deploy/env.production
sudo bash deploy/install/install-production.sh --mode compose \
  --env-file deploy/env.production --apply
bash deploy/install/preflight.sh --mode compose --env-file deploy/env.production

# Systemd (nativ)
sudo REPO=/opt/webradio bash deploy/systemd/install-native-ops.sh --mode native --dry-run
sudo REPO=/opt/webradio bash deploy/systemd/install-native-ops.sh --mode native
systemd-analyze verify /etc/systemd/system/webradio-*.service \
  /etc/systemd/system/webradio-*.timer /etc/systemd/system/caddy.service
systemctl list-timers 'webradio-*'

# Stack
docker compose -p webradio15 --env-file deploy/env.test up -d
docker compose -p webradio15 --env-file deploy/env.test run --rm tools \
  node scripts/prisma-db.mts db migrate
docker compose -p webradio15 --env-file deploy/env.test run --rm tools \
  node scripts/prisma-db.mts db verify --strict

# Backups + Drill + Offsite
set -a; . deploy/env.test; set +a
COMPOSE_PROJECT_NAME=webradio15 BACKUP_MODE=docker BACKUP_DIR=.local-db/infra15/backups \
  BACKUP_KEY_FILE=.local-db/infra15/backups/backup.key COMPOSE_FILE=compose.yaml \
  COMPOSE_ENV_FILE=deploy/env.test PGUSER="$POSTGRES_USER" PGDATABASE="$POSTGRES_DB" \
  PGPASSWORD="$POSTGRES_PASSWORD" bash deploy/backup/pg-backup.sh
REPO_DIR=. CONFIG_BACKUP=1 bash deploy/backup/config-backup.sh
bash deploy/backup/restore-drill.sh
OFFSITE_TARGET=/mnt/offsite bash deploy/backup/offsite-sync.sh --dry-run

# Regression
npx tsc --noEmit && npx eslint . && npm test && npm run test:integration
npx prisma contract emit && npx prisma contract print
npm run build
```

## 17. Fazit

INFRA 1.5 macht die Installation reproduzierbar und nachweisbar: Preflight,
idempotenter Installer mit Dry-Run, vollständige Systemd-Units für App, Cron,
Offsite und Wartung, verschlüsselte DB- **und** Konfigurationsbackups,
Offsite-Pfad, erweitertes Monitoring ohne Daemon sowie ein durchgespielter
Disaster-Recovery-Ablauf. Alle Regressionstests wurden erneut ausgeführt und
sind grün; Vercel bleibt unverändert unterstützt. Ein echter Produktivbetrieb
wurde nicht aktiviert: DNS, Firewall, ACME, Root-Installation auf dem
Zielserver und ein externes Offsite-Ziel bleiben freigabepflichtig und sind
im Bericht als **BLOCKED/NOT TESTED** gekennzeichnet.

## 18. Nachtrag (2026-11-22): Readiness-/Caddy-Integrationstest und Vercel-Prüfung

Dieser Nachtrag schließt die beiden in der Vorversion offenen Punkte:
Caddy-/Readiness-Verhalten war nur per Konfigurationsvalidierung geprüft, und
der Vercel-Pfad war nur statisch bewertet. Alles hier Ausgeführte lief lokal
und isoliert; es gab keine Commits, Pushes, Deployments, DNS-/Firewall-
Änderungen und keine produktiven Daten oder Migrationen.

### 18.1 Testbedingungen

| Komponente | Wert |
|---|---|
| Host | Windows, Docker Desktop, Engine 29.9.3 |
| Anwendung | Next.js 16.4.6, Build `S3rsksAlgvvllcbFKsyp7` (aus diesem Worktree), `next start` auf `0.0.0.0:3000`, Node 26.8.2 |
| Datenbank | Wegwerf-PostgreSQL 18.6-alpine, `webradio_test`, 14 Migrationen, 44 Tabellen, `db verify --strict` grün |
| Caddy | 2.11-alpine, **unverändertes** `deploy/Caddyfile` read-only gemountet |
| Site-Adresse | `SITE_ADDRESS=http://localhost:8088`, `ACME_EMAIL=ops@infra15.test` (kein ACME, weil HTTP-Schema) |
| Upstream-Auflösung | `--add-host webradio:host-gateway`, damit der Compose-Dienstname `webradio:3000` wie im Stack auf die Anwendung zeigt |
| Interner Probe-Port | `http://:8080/healthz` aus dem Caddyfile, auf Host-Port 18080 veröffentlicht |
| App-Env | `DATABASE_PROVIDER=self-hosted`, `DATABASE_URL` (Loopback 5433), `NEXTAUTH_SECRET` (Testwert, nicht protokolliert), `NEXTAUTH_URL=http://localhost:8088`, `TRUST_PROXY=1`, `PORT=3000` |
| Health-Check | `health_uri /api/ready`, `health_interval 5s`, `health_timeout 3s`, `lb_try_duration 10s`, `lb_try_interval 500ms` (unverändert aus dem Caddyfile) |

Bewusste Abweichungen vom Produktivaufbau: **HTTP statt HTTPS** (TLS/Header
wurden in INFRA 1.5 mit interner CA geprüft, ACME bleibt **BLOCKED**) und die
Anwendung lief als **nativer Prozess** statt als Container, aber aus demselben
Build-Output des Standalone-Images. Der Host-Alias `webradio` bildet die
Compose-Namensauflösung nach; die Health-Check- und Proxy-Semantik ist davon
unabhängig.

Zusätzlich liefen zwei **Vergleichsvarianten** auf eigenen Ports, um die
Konfigurationsabhängigkeit zu belegen: 8098 = identischer Readiness-Check
**ohne** `lb_try_duration`, 8099 = `reverse_proxy` **ohne** aktiven
Health-Check.

### 18.2 Szenario 1 – PostgreSQL läuft

Alle Werte über Caddy (`http://localhost:8088`), DB und App gesund:

| Pfad | Status | Zeit | Body/Beleg |
|---|---|---|---|
| `/api/ready` | **200** | 0,010 s | `{"status":"ready","checks":{"database":"ok"}}` |
| `/api/health` | **200** | 0,009 s | `{"status":"ok","version":"0.1.0"}` |
| `/` | **200** | 0,69–1,20 s | HTML (erster Rendervorgang) |
| `/plugins`, `/releases` | **200** | 0,16 / 0,17 s | HTML |
| `/admin` | **307** | 0,007 s | `/auth/login?callbackUrl=%2Fadmin` |
| `/does-not-exist` | **404** | 0,029 s | HTML-Fehlerseite |
| `/healthz` (Port 18080) | **200** | – | `ok` |

Header über Caddy für `/api/ready`: `Cache-Control: no-store`,
`Content-Type: application/json`, `Strict-Transport-Security`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, kein
`Server`-Header. Caddy protokolliert die Anfrage als proxied (`Via: 1.1 Caddy`).
**PASS** – Weiterleitung, Header und Readiness verhalten sich normal.

### 18.3 Szenario 2/3 – PostgreSQL gestoppt: tatsächliches HTTP-Verhalten

DB gestoppt um 11:53:46Z (erste Messreihe) und 12:03:25Z (Wiederholung mit
persistentem Volume), Abfrage alle 2 s:

| Zeitpunkt relativ zum Stopp | `/api/ready` über Caddy | Beobachtung |
|---|---|---|
| +2 s | **503**, 0,011 s, Body `{"status":"not_ready",…}` | Caddy leitet noch weiter; die **Anwendung** antwortet 503 |
| +4 s bis +24 s | **503**, 10,02 s, **leerer** Body | Caddy hat den Upstream als unhealthy markiert und antwortet selbst |

Während der Health-Check-Phase (5 s Intervall, 3 s Timeout) vergehen also
**2–4 s**, bis Caddy umschaltet. Danach im gleichen Ausfall:

| Pfad | Status | Zeit | Body |
|---|---|---|---|
| `/api/ready` | **503** | 10,02 s | leer |
| `/api/health` | **503** | 10,02 s | leer |
| `/` | **503** | 10,02 s | leer |
| `/plugins`, `/releases` | **503** | 10,02 s | leer |
| `/admin` | **503** | 10,02 s | leer (kein 307 mehr) |
| `/does-not-exist` | **503** | 10,02 s | leer (kein 404 mehr) |
| `/healthz` (Port 18080) | **200** | – | `ok` |
| `:3000/api/health` **direkt** | **200** | 0,01 s | `{"status":"ok"}` |
| `:3000/api/ready` **direkt** | **503** | 0,02 s | `{"status":"not_ready","checks":{"database":"unavailable"}}` |

Die 10,02 s sind kein Timeout des Upstreams, sondern `lb_try_duration 10s`:
Caddy wartet die konfigurierte Zeitspanne auf einen wieder gesunden Upstream
und antwortet erst dann. Der Status ist **503** („no healthy upstreams“), nicht
502; der Body ist leer, weil die Antwort vom Load Balancer und nicht von der
Anwendung stammt. **PASS** – Ausfall wird erkannt, alle über den Proxy
laufenden Pfade werden konsistent abgeschirmt.

**Upstream-Prozess selbst nicht verfügbar** (App gestoppt, DB weiterhin
gesund, 12:01:53Z): `:3000` lehnt Verbindungen ab; Caddy antwortet für
`/api/ready` und `/` ebenfalls **503** (10,02 s, leer), die Variante ohne
`lb_try_duration` in 0,003 s. `/healthz` bleibt 200. Auch hier entsteht kein
502, weil der Load Balancer ohne gesunden Upstream antwortet.

### 18.4 Beantwortung der Kernfrage: 503 für alle Pfade?

**Ja – für alle Pfade, die in diesem Site-Block über genau diesen
`reverse_proxy` laufen.** Gemessen sind `/api/ready`, `/api/health`, `/`,
`/plugins`, `/releases`, `/admin` und ein unbekannter Pfad (der sonst 404
liefert) während des Ausfalls einheitlich 503. Damit ist auch die Aussage aus
der Vorversion live bestätigt, dass ein DB-Ausfall über Caddy **auch die
Liveness-URL** mit 503 beantwortet.

**Nein – nicht für Pfade außerhalb dieses Proxys.** `/healthz` wird von einem
eigenen `respond`-Handler im zweiten Site-Block (`http://:8080`) bedient und
blieb durchgehend 200.

Das Verhalten hängt damit an der Konfiguration, konkret an:

| Faktor | Wirkung (gemessen) |
|---|---|
| `health_uri` vorhanden | Nur dann kann Caddy Readiness überhaupt erkennen (8098) |
| `lb_try_duration` | 10 s Wartezeit vor der 503 (Deploy-Caddyfile) vs. **0,003 s** ohne die Direktive (8098) |
| Anzahl Upstreams | Bei einem Upstream führt „unhealthy“ zu 503 für alle Pfade; bei mehreren würde Caddy auf die gesunden ausweichen |
| Handler-Zuordnung | `reverse_proxy`-Pfade 503, `respond`/`redir`/statische Handler unberührt |
| `health_interval`/`timeout` | 5 s/3 s ⇒ Umschaltung nach 2–4 s, in dieser Zeit werden Anfragen noch durchgelassen |
| Site-Matching | Ohne passenden Host liefert der leere Default-Handler **200 mit leerem Body** (siehe 18.7, Messfehler-Falle) |

### 18.5 Variantenvergleich (Konfigurationsabhängigkeit)

DB gestoppt, gleicher Upstream, drei Caddy-Konfigurationen:

| Konfiguration | `/api/ready` | `/api/health` | `/` |
|---|---|---|---|
| 8088 = `deploy/Caddyfile` (Health-Check + `lb_try_duration 10s`) | 503, leer, 10,02 s | 503, leer, 10,02 s | 503, leer, 10,02 s |
| 8098 = Health-Check **ohne** `lb_try_duration` | 503, leer, 0,003 s | 503, leer, 0,003 s | 503, leer, 0,003 s |
| 8099 = **kein** Health-Check | 503, **JSON der App** (0,012 s) | **200** | **200** (HTML) |

Ohne Health-Check schützt Caddy nichts: die Anwendung liefert weiterhin
Liveness 200 und statische Seiten, während `/api/ready` ehrlich 503 meldet.
Das belegt, dass die Abschirmung eine Eigenschaft der Konfiguration ist und
nicht von Caddy „automatisch“ kommt.

### 18.6 Szenario 4 – PostgreSQL wieder gestartet

| Messreihe | Wiederherstellung | Beleg |
|---|---|---|
| Volume-Datenbank (12:04:16Z) | `/api/ready` **200** bei t+2 s (1,51 s Antwortzeit) | 44 Tabellen vor **und** nach dem Neustart |
| Danach alle Pfade | `/api/ready` 200 (0,008 s), `/` 200 (0,065 s), `/plugins` 200 (0,041 s), `/releases` 200 (0,170 s) | keine 503/500 mehr |
| Erste Messreihe (tmpfs, 11:57:34Z) | 200 bei t+2 s (2,01 s) | siehe Einschränkung 18.9.1 |

Caddy nimmt den Upstream nach dem nächsten erfolgreichen Health-Check
automatisch wieder auf; ein Caddy-Neustart oder Eingriff war nicht nötig.
**PASS**.

### 18.7 Szenario 5 – Stabilität der Anwendung

* Der App-Prozess überstand **beide** DB-Ausfallzyklen ohne Absturz und ohne
  Neustart (gleiche PID durchgehend, keine `EADDRINUSE`- oder
  Speicherfehler im Log).
* Direkt (ohne Caddy) blieb `/api/health` während des DB-Ausfalls **200**,
  `/api/ready` **503** – Liveness und Readiness trennen sich also im Betrieb
  wie entworfen.
* Im App-Log erscheinen während des Ausfalls ausschließlich DB-Fehler
  (`SqlConnectionError: connect ECONNREFUSED 127.0.0.1:5433`,
  `SqlQueryError`), keine Prozessabbrüche; nach dem Start der DB erholte sich
  der Pool ohne Neustart.
* Für das Szenario „Upstream nicht verfügbar“ wurde der Prozess **absichtlich**
  gestoppt; Caddy antwortete mit 503 und nahm die neu gestartete Anwendung
  nach dem nächsten Health-Check automatisch wieder auf (`/api/ready` 200 in
  0,008 s).
* **PASS** – die Anwendung bleibt stabil, Caddy ist die Komponente, die den
  Traffic abschirmt.

### 18.8 Monitoring über Caddy (Nebenmessung)

`deploy/monitoring/health-report.sh` mit `HEALTH_URL=http://localhost:8088/api/health`:

| Situation | `app_http` | `app_ready` | Anmerkung |
|---|---|---|---|
| DB + App gesund | **PASS** (200, Body `"status":"ok"`) | **PASS** (200, Body `"status":"ready"`) | erwartetes Verhalten |
| DB gestoppt, über Caddy | **FAIL** (`status=000`, leer) | **FAIL** (`status=000`, leer) | `lb_try_duration 10s` ≥ `curl --max-time 10` ⇒ Abbruch vor der 503 |
| DB gestoppt, direkt `:3000` | **PASS** (200) | **FAIL** (503, `"database":"unavailable"`) | Trennung von Liveness/Readiness sichtbar |

Beide Ausfallvarianten werden als FAIL erkannt (Exit 1), aber über Caddy
lautet das Detail `status=000` statt `503`. Empfehlung: `--max-time` im
Monitoring größer als `lb_try_duration` wählen (z. B. 15 s) **oder**
`lb_try_duration` senken. Bewusst nicht geändert – die Messung sollte den
ausgelieferten Stand prüfen.

Messfehler-Falle, die dabei auffiel: `SITE_ADDRESS=http://localhost:8088`
matched nur den Host `localhost`. Eine Probe gegen `127.0.0.1:8088` trifft
keinen Site-Block und erhält **200 mit leerem Body** (Caddys leerer
Default-Handler). Die Body-Prüfung des Skripts (`"status":"ok"`) hat das
korrekt als FAIL gewertet – eine reine Statuscode-Prüfung hätte einen
falschen PASS ergeben. In Produktion entspricht `SITE_ADDRESS` der echten
Domain; Monitoring muss denselben Host verwenden.

### 18.9 Vercel-Kompatibilität von `/api/ready`

| Prüfpunkt | Ergebnis | Beleg |
|---|---|---|
| Build | **PASS** | `npm run build` Exit 0; Route erscheint als `ƒ /api/ready` (dynamisch) |
| Nicht prerendert | **PASS** | `prerender-manifest.json` enthält keine API-Route; `app-paths-manifest.json` führt `app/api/ready/route.js` |
| Runtime | **PASS** | Standard-Node-Runtime einer App-Route; **kein** `export const runtime`/`dynamic` (mit `cacheComponents` ohnehin unzulässig) |
| Self-Hosting-APIs | **PASS** | Nur `next/server` und `@/lib/db`; kein `fs`, `net`, Docker, systemd, Env-Datei- oder Host-Regel-Zugriff im Handler |
| Raw-SQL-Lane | **PASS** | `db.raw.sql` ist die reguläre Prisma-8-Lane und wird bereits von `src/lib/system-admin.ts` genutzt (auch auf Vercel) |
| Umgebungsvariablen | **PASS** | Keine neuen Variablen; es gelten unverändert `DATABASE_URL_POOLED` (Provider `prisma`), `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, optional `DATABASE_PROVIDER` |
| `/api/health` unverändert | **PASS** | `git diff` für `src/app/api/health/route.ts` leer; Docker-`HEALTHCHECK` und Vercel-Prüfungen nutzen weiterhin diesen Endpoint |
| `vercel.json` unverändert | **PASS** | `git status`/`git diff` leer; Schedules, `installCommand` und `functions` unberührt |
| Antwort-Header | **PASS** | `Cache-Control: no-store` im Handler, damit kein CDN-Caching einer Readiness-Antwort |
| Tatsächlicher Preview-Test | **NOT TESTED** | Vercel CLI 65.2.0 ist angemeldet (`ramonoltmann-3017`), Projekt verlinkt (`nodeVersion 26.x`), aber ohne ausdrückliche Freigabe kein Deployment – siehe 18.10 |

Ergänzend: `.vercel/project.json` nutzt `framework: nextjs` ohne abweichende
Build-/Install-Commands; `package.json` verlangt Node ≥ 24.11.0, das Projekt
ist auf Node 26.x eingestellt. Beide Werte sind unverändert und werden von der
neuen Route nicht berührt.

### 18.10 Regression (erneut ausgeführt)

| Prüfung | Ergebnis |
|---|---|
| `npx tsc --noEmit` | **PASS** (Exit 0) |
| `npx eslint .` | **PASS** (0 Fehler, 7 vorbestehende Warnungen) |
| `npm test` | **PASS** (66 Suiten, 643 Tests) |
| `npm run test:integration` gegen Wegwerf-DB | **PASS** (7 Suiten, 126 Tests) |
| `prisma-db.mts db migrate` + `db verify --strict` | **PASS** (44 Tabellen, Marker/Schema identisch) |
| `npm run build` | **PASS** (Exit 0, `/api/ready` dynamisch) |

### 18.11 Verbleibende Einschränkungen und WARNINGs

1. **Readiness prüft Konnektivität, nicht das Schema.** In der ersten
   Messreihe kam PostgreSQL nach `docker stop`/`start` mit einem tmpfs ohne
   Daten zurück; `/api/ready` meldete 200 (`SELECT 1`), während Seiten
   `relation "public.Theme" does not exist` protokollierten. Für den
   Produktivbetrieb ist das vertretbar (Migrationen sind ein eigener,
   verifizierter Schritt), aber es ist keine Schema-Readiness. Optional ließe
   sich der `SELECT 1` um eine Marker-/Tabellenprüfung erweitern. Die
   Wiederholung mit persistentem Volume (44 Tabellen vor/nach) zeigt, dass der
   Effekt von der Datenhaltung stammt, nicht von der Route.
2. **Monitoring-Detail über Caddy `status=000`** statt 503, weil Probe-Timeout
   und `lb_try_duration` beide 10 s betragen (18.8). FAIL-Erkennung bleibt
   korrekt.
3. **Kompletter Site-Ausfall bei DB-Störung.** Alle proxied Pfade – auch
   statische Seiten und `/api/health` – liefern 503, und zwar erst nach 10 s.
   Das ist die beabsichtigte Abschirmung, kostet aber Latenz und macht die
   Seite für Crawler kurzzeitig nicht erreichbar. Ein kürzeres
   `lb_try_duration` (z. B. 2–3 s) wäre eine reine Komfortentscheidung.
4. **Leerer Default-Handler.** Ein Request mit nicht passendem Host erhält
   200 mit leerem Body; Monitoring/Probes müssen `SITE_HOST` verwenden
   (18.8). Kein Fehler der Anwendung, aber eine realistische Fehlerquelle.
5. **Test über HTTP, nicht HTTPS.** TLS, Header und interner CA-Betrieb waren
   Gegenstand von INFRA 1.5; ACME mit echter Domain bleibt **BLOCKED**. Die
   hier geprüfte Proxy-/Health-Semantik ist davon unabhängig.
6. **Anwendung nativ statt im Container.** Geprüft wurde derselbe
   Build-Output (`next start`), nicht erneut das Runner-Image; Container-Start,
   `HEALTHCHECK` und Härtung wurden in INFRA 1.4/1.5 validiert.
7. **Kein Vercel-Preview-Deployment.** Ohne ausdrückliche Freigabe wurde
   nichts deployt; ein Preview-Lauf würde zusätzlich die noch nicht
   committeten Änderungen dieses Branches veröffentlichen.
8. **Testumgebung vollständig entfernt:** Container, benanntes Volume und
   Testkonfigurationen sind gelöscht; es bleiben keine Listener auf 3000,
   5433, 8088, 8098, 8099 oder 18080 zurück.
