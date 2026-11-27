# WebRadio – Phase INFRA 1.1: Docker-, Linux- und Hosting-Portabilitätsvalidierung

**Datum:** 2026-11-21
**Repository:** F:\Dev\webradio-website
**Branch:** `feature/analytics-vercel-schedules` (HEAD `a3b757f`, Arbeitsstand mit DA 2.0 / SEC 1.1 / SEC 1.2 / INFRA 1.0, nicht committet)
**Status:** **BLOCKED** (siehe §13) – alle durchführbaren Prüfungen sind gelaufen, ein kritischer Portabilitätsfehler verhindert den Self-Hosting-Betrieb

---

## 0. Kurzfassung

Docker war diesmal nutzbar: CLI 29.9.3, Compose v5.7.0, Kontext `desktop-linux`, Engine nach Start von Docker Desktop verfügbar. Damit konnten alle Windows-Prüfungen, ein echter Image-Build, ein Compose-Stack mit PostgreSQL 18.7, Migrationen in isolierter Testdatenbank, Health Checks, Container-Logs, Ressourcenmessung und Backup/Restore durchgeführt werden.

Der bisherige Bericht war aus zwei Gründen falsch: Docker ist installiert (nur an einem Nicht-Standard-Pfad und ohne laufenden Daemon), und es gibt echte, reproduzierbare Fehler in `Dockerfile`, `compose.yaml`, `.dockerignore` und – entscheidend – in der Laufzeit-Datenbankkonfiguration.

**Der wichtigste Befund:** Die Anwendung akzeptiert im Production-Runtime **ausschließlich** `pooled.db.prisma.io` als Datenbank-Host. Ein selbst gehostetes PostgreSQL – auch im Container, auch über Loopback – wird mit `DatabaseConfigError` abgelehnt. Self-Hosting ist damit unabhängig von Docker derzeit nicht lauffähig.

---

## 1. Tatsächlich verwendete Testumgebung

| Komponente | Wert |
| --- | --- |
| Host | Windows, Git Bash (MSYS) |
| Node / npm | v26.8.2 / 12.0.2 |
| Docker CLI | 29.9.3 (`C:\Users\DFark\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe`, im PATH vorhanden) |
| Docker Compose | v5.7.0 |
| Docker Engine | 29.9.3 (Linux-Container, WSL2-Backend, Distro `docker-desktop`) |
| Docker-Kontext | `desktop-linux` |
| Datenbank | PostgreSQL 18.7 (Alpine) im Container, isolierte Test-DBs `webradio_infra11`, `webradio_infra11_test`, `webradio_restore` |
| Native PostgreSQL-Installation | nicht vorhanden (`psql`/`pg_isready` fehlen, kein Dienst) |
| Echte Linux-Umgebung | **nicht vorhanden** |

Die Engine war zu Beginn **nicht** erreichbar (`docker info` → `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`). Docker Desktop wurde über den absoluten Pfad gestartet; danach `docker info` → 29.9.3. Es wurden keine Installationen, Windows-Einstellungen oder WSL-Distributionen verändert.

Alle Docker-Tests liefen in einer **isolierten Arbeitskopie** `F:\Dev\webradio-infra11-isolated` (Quellbaum ohne `.git`, `node_modules`, `.next`, `.vercel`). Das Repository selbst wurde nicht verändert; siehe §12.

---

## 2. Umgebungsprüfung (verbindlich)

| Prüfung | Ergebnis | Status |
| --- | --- | --- |
| `docker --version` | 29.9.3, build 5457199 | PASS |
| `docker compose version` | v5.7.0 | PASS |
| `docker context ls` | `desktop-linux *` aktiv | PASS |
| `docker info` (vor Start) | Pipe nicht vorhanden | FAIL → behoben |
| `docker info` (nach Start) | Engine 29.9.3 erreichbar | PASS |
| Docker Desktop Prozess | nicht gestartet, `com.docker.service` nicht installiert | FAIL → behoben |
| Docker Desktop Installationspfad | `C:\Users\DFark\AppData\Local\Programs\DockerDesktop\` (nicht `C:\Program Files\Docker`) | INFO |
| WSL2-Distro `docker-desktop` | vorhanden, war `Stopped`, nach Start `Running` | PASS |

Die Engine ließ sich ohne Neuinstallation allein durch Starten von `Docker Desktop.exe` aktivieren. Der bisherige Bericht („Docker nicht installiert, WSL nicht vorhanden") ist damit widerlegt.

---

## 3. Windows-Testergebnisse (nativ)

| Test | Befehl | Ergebnis | Status |
| --- | --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | Exit 0 | PASS |
| ESLint (Quellcode) | `npx eslint src` | Exit 0 | PASS |
| ESLint (gesamtes Repo) | `npx eslint .` | 13 Errors, 2408 Warnings | **FAIL** |
| Jest Unit | `npm test` | 63 Suiten / 590 Tests grün | PASS |
| Next.js Production Build | `npm run build` | Exit 0, alle Routen gebaut | PASS |
| Prisma Contract | `npx prisma contract emit` | `contract.json` + `contract.d.ts` aktuell | PASS |
| Prisma Schema/DB-Verify | `npm run db:verify` | „Database marker and schema match contract" | PASS |
| Integrationstests | `npm run test:integration` | 7 Suiten / 126 Tests grün | PASS |
| Health-Skript | `scripts/health-check.mjs` | nicht ausgeführt (würde ESLint-Fehler erben) | NOT RUN |
| `git diff --check` | – | keine Whitespace-Fehler | PASS |

### 3.1 ESLint: 13 Errors stammen ausschließlich aus Build-Artefakten

```
F:\Dev\webradio-website\.vercel\output\static\_next\static\chunks\*.js
  error  Unexpected aliasing of 'this' to local variable  @typescript-eslint/no-this-alias
```

Ursache: `eslint.config.mjs` ignoriert `.next`, `out`, `build`, `.local-db`, `.agents`, `.claude`, `prisma/contract.*` – aber **nicht `.vercel/`**. Nach einem `vercel build` schlägt `npm run lint` (= `eslint`) lokal fehl, während derselbe Befehl in CI grün ist, weil dort kein `.vercel/` existiert.

**Auswirkung:** Kein Hosting-Bezug, aber ein reproduzierbarer Fehlalarm; die Health-Prüfung `health:full` würde daran scheitern.
**Lösung:** `.vercel/**` in `globalIgnores` ergänzen (eine Zeile).

### 3.2 Kein natives PostgreSQL

`psql` und `pg_isready` sind nicht im PATH, es läuft kein PostgreSQL-Dienst. Alle Datenbanktests wurden deshalb gegen den PostgreSQL-Container gefahren (gültig, da echtes PostgreSQL 18.7, aber ohne native Windows-Installation). Die native Windows-DB-Prüfung ist **NOT RUN**.

---

## 4. Prisma- und PostgreSQL-Ergebnisse

### 4.1 Migrationen in frischer, isolierter Testdatenbank

```
docker run postgres:18-alpine  →  DB webradio_infra11
npm run db:migrate             →  12 Migrationen angewendet (20261024T1700 … 20261114T2227)
npm run db:verify              →  ✔ Database marker and schema match contract
                                  storageHash 80e32e10d066867f39c44f1dd61537a5d28a2b6e1076b8a375c34cba034c89df
information_schema.tables      →  44 Tabellen
```

| Test | Status |
| --- | --- |
| Migrationen von Null in isolierter DB | PASS |
| Contract/DB-Abgleich (`db:verify`) | PASS |
| Integrationstests gegen Container-PostgreSQL | PASS (126 Tests) |
| Persistenz über Container-Neustart (Volume) | PASS (nach Volume-Fix, §6.2) |
| Native Windows-DB | NOT RUN (keine Installation) |

### 4.2 Laufzeit-Datenbankwächter blockiert Self-Hosting (kritisch)

`src/lib/db-connection.ts` erlaubt in `NODE_ENV=production` für `DATABASE_URL_POOLED` nur `pooled.db.prisma.io`; Loopback ist ausschließlich außerhalb von Production zulässig. Im Compose-Stack meldet die App deshalb bei jeder Anfrage:

```
⨯ Error [DatabaseConfigError]: DATABASE_URL_POOLED has an unexpected hostname: postgres
  Expected: pooled.db.prisma.io (production) or a loopback host (local development).
```

HTTP-Antwort: `/` → 500, `/api/health` → 500.

Der Wächter ist **nicht konfigurierbar** (kein Env-Allowlist, keine Ausnahme für private Netze). Damit gilt: ein selbst gehostetes PostgreSQL ist mit diesem Stand nicht verwendbar – unabhängig von Docker, Systemd oder Caddy. Das betrifft auch `DIRECT_URL` (`db.prisma.io` oder Loopback).

Für die restliche Stack-Validierung wurde in der isolierten Kopie ausschließlich zu Testzwecken `extra_hosts` mit `pooled.db.prisma.io:host-gateway` gesetzt. Das ist **kein** unterstützter Deployment-Weg, sondern der Nachweis, dass der Stack darüber hinaus funktioniert.

---

## 5. Docker-Build

### 5.1 Ist-Zustand: Build schlägt fehl

```
docker build -t webradio-infra11:asis .
→ ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1
→ [cause]: Error: NEXTAUTH_SECRET must be set in production.
→ Error: Failed to collect page data for /api/account/sessions
```

Ursache: `next build` läuft mit `NODE_ENV=production`, die Auth-Konfiguration verlangt `NEXTAUTH_SECRET` schon beim Sammeln der Page-Daten. Das `.env` wird per `.dockerignore` korrekt ausgeschlossen – der Dockerfile liefert aber keinen Ersatz.

**Der Build erreicht dadurch nicht einmal die dritte Stage.** Unabhängig davon ist ein zweiter Fehler vorhanden, der danach zugeschlagen hätte:

```
COPY --from=builder /app/.next/standalone ./
→ .next/standalone existiert nicht
```

`next.config.ts` setzt kein `output: "standalone"`. Ohne diese Option erzeugt `next build` kein Standalone-Bundle; der `COPY` schlägt fehl.

### 5.2 Weitere Befunde

| Befund | Bewertung |
| --- | --- |
| Build-Kontext **3,0 GB** | Ursache: `.local-db/` (lokales PostgreSQL-Datenverzeichnis, 3,0 GB) fehlt in `.dockerignore` – jeder Build lädt es hoch; Datenreste können so in den Build-Kontext gelangen |
| `RUN npx prisma generate` | Prisma 8 kennt diesen Schritt nicht mehr (Contract wird in `prebuild` emittiert); Reihenfolge Build → generate wäre ohnehin falsch |
| Stage `deps` (`npm ci --only=production`) | wird nirgends verwendet, `--only` ist zudem veraltet |
| `COPY --from=builder /app/node_modules ./node_modules` | macht das Image unnötig groß |
| `test` health check im Dockerfile | nicht vorhanden |
| Image-Größe | **4,22 GB** (im Wesentlichen `node_modules`) |

### 5.3 Korrigierte Variante (isoliert verifiziert)

In `F:\Dev\webradio-infra11-isolated` wurden fünf sichere Änderungen vorgenommen:

1. `next.config.ts`: `output: "standalone"` ergänzt.
2. `Dockerfile` Builder-Stage: `ARG NEXTAUTH_SECRET` + `ARG NEXTAUTH_URL` mit Build-Platzhaltern (nur Builder, nicht Runner) und Entfernen von `npx prisma generate`.
3. `.dockerignore`: `.local-db`, `.agents`, `.claude`, `.cursor`, `.devin`, `.tmp-*`, `*.tsbuildinfo`, `AGENTS.md` ergänzt.
4. `Dockerfile` Runner: `COPY --chown=nextjs:nodejs` und `mkdir -p /app/.next/cache`, damit ISR-Cache-Schreibzugriff funktioniert.
5. `compose.yaml`: `version:` entfernt, `POSTGRES_PASSWORD` mit `:?`-Guard, Host-Port konfigurierbar, Postgres-Volume auf `/var/lib/postgresql`, App-Healthcheck, `depends_on: condition: service_healthy`.

Ergebnis:

```
docker build → BUILD_EXIT=0  (Builder-Stage 135 s)
Warnung: SecretsUsedInArgOrEnv (ARG/ENV NEXTAUTH_SECRET) – bewusst, Platzhalter
```

---

## 6. Docker-Compose und Container

### 6.1 Compose-Validierung

| Test | Ergebnis | Status |
| --- | --- | --- |
| `docker compose config` | Exit 0, 64 Zeilen aufgelöst | PASS |
| Mehrdeutige Compose-Dateien | `compose.yaml` **und** `docker-compose.yml` vorhanden | **WARNING** |
| `version: '3.8'` | „the attribute `version` is obsolete" | **WARNING** |
| `POSTGRES_PASSWORD` ohne Pflichtprüfung | leerer Wert → Container startet mit leerem Passwort | **FAIL** (behoben) |
| Postgres-Port | `5432:5432` auf allen Interfaces | **FAIL** (behoben: `127.0.0.1`, konfigurierbar) |

Die beiden Compose-Dateien haben unterschiedliche Zwecke (Entwicklungs-Postgres mit Port 5433 vs. Produktions-Stack) und überschneiden sich, was Docker Compose nur mit Warnung auflöst – es gewinnt immer `compose.yaml`.

### 6.2 Fehler beim Start des Postgres-Containers

**a) Host-Port 5432 nicht bindbar**

```
Error response from daemon: ports are not available:
exposing port TCP 127.0.0.1:5432 -> 127.0.0.1:0:
listen tcp4 127.0.0.1:5432: bind: An attempt was made to access a socket
in a way forbidden by its access permissions.
```

Auf diesem Windows-Host liegt 5432 in einem reservierten Portbereich; zusätzlich lauscht dort bereits ein fremder PostgreSQL (Passwort-Authentifizierung schlug fehl). Ein fest verdrahteter Host-Port ist für Selbst-Hosting zu unflexibel → Port über `POSTGRES_PORT` konfigurierbar gemacht und mit 55433 validiert.

**b) PostgreSQL 18 und das Volume**

```
there appears to be PostgreSQL data in: /var/lib/postgresql/data (unused mount/volume)
```

Das offizielle `postgres:18`-Image erwartet den Mount auf **`/var/lib/postgresql`** (Daten landen in `18/docker`). Mit `/var/lib/postgresql/data` startet der Container in einer Restart-Schleife. Behoben durch Anpassung des Volumes.

### 6.3 Anwendung im Container

| Test | Ergebnis | Status |
| --- | --- | --- |
| Container-Start | `Up`, Health `healthy` | PASS |
| Healthcheck (`/api/health`) | 200 in ~0,01–0,12 s | PASS |
| Startseite `/` | 200 | PASS |
| `/releases` | 200 | PASS |
| `/auth/login`, `/auth/register` | 200 | PASS |
| `/admin` ohne Session | 307 → `/auth/login?callbackUrl=%2Fadmin` | PASS |
| `POST /api/schedules/analytics` ohne Vercel-Header | 400 | PASS (siehe §7) |
| Non-Root-Benutzer | `uid=1001(nextjs)` | PASS |
| Neustart (`compose restart`) | Health 200 nach ~3 s, `RestartCount=0` | PASS |
| Schreibzugriff `.next/cache` | **EACCES** vor Fix, nach `--chown` fehlerfrei | FAIL → behoben |

Log-Auszug vor dem Fix:

```
Failed to update prerender cache for 42f943ac… Error: EACCES: permission denied,
mkdir '/app/.next/cache'
```

Ursache: `COPY` läuft als root, `USER nextjs` darf danach nicht in `.next` schreiben. Ohne Fix funktionieren ISR-/Prerender-Aktualisierungen im Betrieb nicht.

### 6.4 Ressourcenverbrauch (Leerlauf, nach Health-Check)

| Container | CPU | RAM |
| --- | --- | --- |
| webradio (Next.js standalone) | ~0,0–0,5 % | 280–300 MiB |
| postgres:18-alpine | ~0,0–0,2 % | 54–74 MiB |
| **Image-Größe webradio** | – | **4,22 GB** |

Die 4,22 GB stammen fast vollständig aus dem kopierten `node_modules` des Builders; das Standalone-Bundle selbst braucht nur einen Bruchteil. Für einen kleinen Server (20 GB Disk) ist das unnötig teuer.

### 6.5 Backup und Restore

```
INSERT restore_probe ('infra11-backup-test')
pg_dump -Fc → 257 KB
createdb webradio_restore ; pg_restore
→ 45 Tabellen (44 + Probe), Markerzeile 'infra11-backup-test' vorhanden
```

| Test | Status |
| --- | --- |
| Backup mit Testdaten (`pg_dump -Fc`) | PASS |
| Restore in frische DB (`pg_restore`) | PASS |
| Datenintegrität des Markers | PASS |
| Restore über Container-Neustart | PASS (Volume-Persistenz) |

Hinweis: `docker exec … -f /tmp/…` scheitert in Git Bash an der MSYS-Pfadübersetzung; `MSYS_NO_PATHCONV=1` ist nötig. Betriebsrelevant für Backup-Skripte auf Windows.

---

## 7. Schedules, Cron und systemd

| Test | Ergebnis | Status |
| --- | --- | --- |
| Vercel-Schedules in `vercel.json` | 5 Schedules, gemeinsame private Function | PASS (bereits in PR #3/#5) |
| Endpoint im Container erreichbar | 405 für GET, 400 für POST ohne Vercel-Header | PASS |
| Aufruf durch Linux-Cron / systemd | **nicht möglich** | FAIL (Architektur) |
| Cron-Beispiel aus altem Bericht | `curl … /api/schedules/analytics` → 400 | **WARNING** |

`src/app/api/schedules/analytics/route.ts` verwendet `handleSchedule` aus `@vercel/schedules`. Der Handler validiert die Vercel-Schedule-Header und antwortet außerhalb von Vercel mit **400**. Der im alten Bericht dokumentierte Cron-Aufruf (`curl -X POST … -H "Authorization: Bearer $CRON_SECRET"`) funktioniert daher **nicht**; `CRON_SECRET` wird von dieser Route gar nicht geprüft.

**Konsequenz:** Für einen selbst gehosteten Betrieb braucht es einen portablen Trigger (eigene Route mit Secret-Prüfung, oder ein Skript, das die Job-Funktionen direkt aufruft). Das ist eine Implementierungsaufgabe, keine Konfigurationsfrage.

Echte Linux-Validierung (cron, systemd-Timer, Caddy) ist **NOT RUN** – es gibt keine Linux-Umgebung. Container allein belegen keinen Serverbetrieb.

---

## 8. Caddy und Reverse Proxy

| Test | Status |
| --- | --- |
| Caddyfile vorhanden | **UNAVAILABLE** (keine Datei im Repo) |
| `caddy validate` | NOT RUN |
| HTTPS/ACME | NOT RUN |
| Header-Weiterleitung (`X-Forwarded-*`, `TRUST_PROXY`) | NOT RUN – `TRUST_PROXY` existiert in `.env.example`, Zusammenspiel mit dem Proxy ungetestet |

Ungeprüft bleibt insbesondere, ob die App hinter einem Proxy korrekte Client-IPs und `NEXTAUTH_URL`-Origins sieht. `NEXTAUTH_URL` muss auf den HTTPS-Origin zeigen (der Build verlangt das bereits, §5.1).

---

## 9. Aufgetretene Fehler (Übersicht)

| # | Fehler | Auswirkung | Status |
| --- | --- | --- | --- |
| 1 | Docker-Daemon nicht gestartet | keine Docker-Tests möglich | behoben (Desktop gestartet) |
| 2 | `NEXTAUTH_SECRET` fehlt beim Build | Image-Build bricht ab | behoben (Build-ARG, isoliert) |
| 3 | `NEXTAUTH_URL` fehlt beim Build | Image-Build bricht ab | behoben (Build-ARG, isoliert) |
| 4 | kein `output: "standalone"` | `COPY .next/standalone` schlägt fehl | behoben (isoliert) |
| 5 | `.local-db` im Build-Kontext (3,0 GB) | langsame Builds, Datenreste im Kontext | behoben (isoliert) |
| 6 | `compose.yaml` + `docker-compose.yml` | mehrdeutige Konfiguration | offen (WARNING) |
| 7 | veraltetes `version:` | Warnung | behoben (isoliert) |
| 8 | `POSTGRES_PASSWORD` ohne Pflichtprüfung | Start mit leerem Passwort möglich | behoben (isoliert) |
| 9 | Postgres-Port 5432 nicht bindbar | Stack startet nicht | behoben (konfigurierbar) |
| 10 | PG-18-Volume-Pfad falsch | Restart-Schleife | behoben (isoliert) |
| 11 | `DATABASE_URL_POOLED`-Guard | **App im Self-Hosting nicht lauffähig** | **offen (kritisch)** |
| 12 | `EACCES` auf `.next/cache` | ISR-Cache-Schreiben scheitert | behoben (isoliert) |
| 13 | Image 4,22 GB | hoher Speicher-/Transferbedarf | offen (Empfehlung) |
| 14 | ESLint lintet `.vercel/` | `npm run lint` lokal rot | offen (eine Zeile) |
| 15 | Schedule-Endpoint Vercel-only | Cron/systemd nicht nutzbar | offen (Architektur) |

---

## 10. Nicht durchführbare Tests

| Test | Grund | Status |
| --- | --- | --- |
| Native Windows-PostgreSQL | nicht installiert | NOT RUN |
| systemd-Unit / Timer | keine Linux-Umgebung | NOT RUN |
| cron-Job | keine Linux-Umgebung + Endpoint Vercel-only | NOT RUN |
| Caddy-Konfiguration / HTTPS | keine Caddyfile, keine Linux-Umgebung | NOT RUN |
| Echter Linux-Serverbetrieb | keine VM/kein Server | NOT RUN |
| Vollständiger Login-Flow mit echter GitHub-App | nur Dummy-Credentials | NOT RUN |
| ARM64-Build | nicht angefordert | NOT RUN |

---

## 11. Verbleibende Risiken

1. **Kritisch:** Ohne Anpassung des Datenbankwächters ist kein Self-Hosting möglich; die aktuelle Architektur bindet den Betrieb an Prisma Postgres (`pooled.db.prisma.io`).
2. **Kritisch für den Migrationsplan:** Schedules sind Vercel-spezifisch; ein Umzug auf einen Linux-Server deaktiviert die Analytics-Jobs vollständig, bis ein portabler Trigger existiert.
3. **Hoch:** Build benötigt Produktions-Secrets (`NEXTAUTH_SECRET`, `NEXTAUTH_URL`) zur Build-Zeit. Reproduzierbare, secret-freie Builds sind damit nicht möglich; Secrets dürfen nicht in Image-Schichten landen.
4. **Mittel:** 4,22 GB Image und 3 GB Build-Kontext sind für kleine Server und CI unpraktisch.
5. **Mittel:** `.local-db` im Build-Kontext kann Datenreste in Build-Caches tragen.
6. **Mittel:** Zwei konkurrierende Compose-Dateien erzeugen Fehlkonfigurationen (falsche Ports, falsche Volumes).
7. **Niedrig:** ESLint prüft Build-Artefakte; Health-Skript meldet dadurch falsche Fehler.
8. **Offen:** Proxy-Verhalten (`TRUST_PROXY`, Client-IPs, Cookies hinter Caddy) ist ungetestet.

---

## 12. Repository-Schutz (eingehalten)

- Keine Commits, keine Pushes, keine Branches zusammengeführt, keine Deployments.
- Keine produktiven Datenbanken oder Zugangsdaten verwendet; alle DBs waren neu angelegte Test-Container-Datenbanken.
- Keine Datei im Repository zurückgesetzt oder verworfen. Die einzigen Schreibzugriffe im Repo waren: `prisma contract emit` (regeneriert `prisma/contract.json`/`contract.d.ts`, die bereits vor der Phase als geändert markiert waren), temporäre Logdateien `.tmp-*.log` (entfernt) und dieser Bericht plus der Migrationsleitfaden.
- Alle Korrekturen an `Dockerfile`, `compose.yaml`, `next.config.ts` und `.dockerignore` liegen **ausschließlich** in der isolierten Kopie `F:\Dev\webradio-infra11-isolated`.
- Bestehende Worktrees wurden nicht angetastet.
- Test-Container (`webradio-infra11-pg`, Compose-Stack) und das dafür angelegte Volume wurden nach der Messung entfernt.

---

## 13. Abschlussstatus

**BLOCKED**

Begründung: Die Phase kann nicht als „COMPLETED WITH LIMITATIONS" abgeschlossen werden, weil ein durchführbarer Test **fehlgeschlagen** ist, der den Zweck der Phase direkt betrifft: die Anwendung startet im Container, liefert aber ohne den Datenbank-Workaround auf jeder Route HTTP 500, weil der Laufzeit-Wächter nur `pooled.db.prisma.io` akzeptiert. Ein Self-Hosting-Betrieb ist damit nicht möglich, und die Schedules sind an Vercel gebunden.

Alles andere ist validiert: Build (nach Fixes), Compose, PostgreSQL 18, Migrationen, `db:verify`, Integrationstests, Health Checks, Routen, Security-Redirects, Neustart, Backup/Restore, Ressourcen. Linux-spezifische Tests bleiben NOT RUN.

### Was die Phase entblockt

1. **Datenbank-Host freigeben** (kritisch): konfigurierbare Allowlist in `src/lib/db-connection.ts` (z. B. `DATABASE_URL_POOLED` zusätzlich für private/compose-Hosts per Env-Freigabe), inklusive Tests, die die bisherige Schutzfunktion nicht aufweichen.
2. **Portablen Schedule-Trigger** bereitstellen (kritisch): eigene Route bzw. Skript mit Secret-Prüfung, unabhängig von `@vercel/schedules`.
3. **Dockerfile/Compose-Fixes übernehmen**: die fünf Änderungen aus §5.3/§6 sind klein und unkritisch.
4. **Build-Entkopplung**: Build ohne Produktions-Secrets ermöglichen (z. B. Platzhalter im Code für die Build-Phase, wie es `resolveRuntimeDatabaseUrl` bereits tut).
5. **Linux-Testumgebung** (Ubuntu-VM oder Testserver) für systemd, cron und Caddy.

---

## 14. Empfehlungen (priorisiert)

1. Datenbankwächter konfigurierbar machen – ohne das ist jede weitere Hosting-Arbeit wirkungslos.
2. Portablen Scheduler-Trigger implementieren (Voraussetzung für Analytics außerhalb von Vercel).
3. Dockerfile-Fixes aus der isolierten Kopie übernehmen (standalone, Build-ARGs, `--chown`, `.dockerignore`).
4. Compose konsolidieren: eine Datei, PG-18-Volume, Pflicht-Guard für `POSTGRES_PASSWORD`, Loopback-Bindung, konfigurierbarer Port.
5. Image verkleinern (kein `node_modules`-Copy, Standalone-Abhängigkeiten genügen).
6. `.vercel/**` in ESLint-Ignores aufnehmen.
7. Linux-Validierung auf einer Ubuntu-22.04/24.04-VM nachholen: systemd-Unit, Timer statt Cron, Caddy + `TRUST_PROXY`, Backup-Cronjob, Restore-Probe.

---

## 15. Nachtrag INFRA 1.2 (2026-11-21): Blocker behoben

Dieser Bericht bleibt als Ist-Stand-Dokumentation vom 2026-11-21 stehen. Beide
dort beschriebenen Portabilitätsblocker sind in Phase INFRA 1.2 behoben und im
Container verifiziert (Details: `docs/PHASE_INFRA1.2_HOSTING_PORTABILITY_REPORT.md`).

| Befund aus INFRA 1.1 | Behebung |
| --- | --- |
| §4.2 / §13 Blocker A: `DATABASE_URL_POOLED` akzeptiert nur `pooled.db.prisma.io` | `DATABASE_PROVIDER=self-hosted` erlaubt Loopback, einteilige Dienstnamen und eine explizite `DATABASE_ALLOWED_HOSTS`-Liste; Prisma-Modus bleibt unverändert streng |
| §7 Blocker B: `/api/schedules/analytics` ist Vercel-only, `CRON_SECRET` ungeprüft | gemeinsame Job-Logik in `src/lib/analytics/schedule-execution.ts` + `POST /api/cron/analytics` mit `CRON_SECRET` (401/403, 405, 409, 503, 500) |
| §5.1 Blocker C: Build ohne `NEXTAUTH_SECRET`/`NEXTAUTH_URL` | Build-Zeit-Platzhalter im Builder-Stage (unverändert übernommen) |
| §3.1 ESLint-Errors aus `.vercel/output` | `.vercel/**` in `globalIgnores` → `eslint .` 0 Errors |
| §5.2 / §6.2 Dockerfile, Compose, `.dockerignore`, PG18-Volume | geprüfte INFRA-1.1-Korrekturen übernommen (siehe INFRA-1.2-Bericht §6) |

Der Validierungs-Workaround `extra_hosts: pooled.db.prisma.io:host-gateway` wurde
bewusst **nicht** ins Repository übernommen.

Weiterhin NOT RUN: echte Linux-Ausführung (systemd, cron, Caddy/HTTPS,
`TRUST_PROXY`). Die INFRA-1.1-Ergebnisse aus Windows/Docker sind kein
Linux-Produktivtest.
