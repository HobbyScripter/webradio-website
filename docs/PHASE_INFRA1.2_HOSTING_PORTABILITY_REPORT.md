# WebRadio – Phase INFRA 1.2: Hosting-Portabilität

**Datum:** 2026-11-21
**Repository:** `F:\Dev\webradio-website`
**Branch:** `feature/analytics-vercel-schedules` (HEAD `a3b757f`, unverändert)
**Status:** **COMPLETED WITH LIMITATIONS**

Beide Portabilitätsblocker aus INFRA 1.1 sind behoben und im Container verifiziert. Die Einschränkung betrifft ausschließlich die fehlende echte Linux-Umgebung: systemd-Timer, `cron`, Caddy/HTTPS und `TRUST_PROXY` konnten auf diesem Windows-Host nicht ausgeführt werden (siehe §11).

Keine Commits, keine Pushes, keine Merges, keine Deployments, keine produktiven Datenbanken, keine Secrets aus Produktion.

---

## 0. Kurzfassung

| Blocker aus INFRA 1.1 | Zustand nach INFRA 1.2 | Nachweis |
| --- | --- | --- |
| **A** Datenbankwächter akzeptiert nur `pooled.db.prisma.io` | behoben durch expliziten `DATABASE_PROVIDER` mit eigenem, weiterhin geprüftem Host-Regelwerk | Container mit `DATABASE_PROVIDER=self-hosted` und Host `webradio-infra12-pg`: alle Seiten 200, Migrationen und Integrationstests grün |
| **B** `/api/schedules/analytics` ist Vercel-only, `CRON_SECRET` ungeprüft | behoben durch gemeinsame Job-Logik plus `POST /api/cron/analytics` mit `CRON_SECRET`-Prüfung | Container: GET 405, ohne Secret 401, falsches Secret 401, korrektes Secret → echter Lauf 200, unbekannter Name 400, ohne konfiguriertes Secret 503 |
| **C** Produktionsbuild braucht `NEXTAUTH_SECRET`/`NEXTAUTH_URL` | Build-Zeit-Platzhalter im Builder-Stage (INFRA-1.1-Korrektur übernommen) | `docker build` Exit 0, Platzhalter erreicht die Laufzeit nicht |

Zusätzlich: `.next/standalone` wird jetzt erzeugt (`output: "standalone"`), ESLint ist repo-weit fehlerfrei (`.vercel/**` ignoriert), `.local-db` ist aus dem Build-Kontext ausgeschlossen, und der PG18-Volume-Pfad ist korrigiert.

---

## 1. Bestandsaufnahme (Phase 1)

Vor jeder Änderung festgehalten:

- Branch: `feature/analytics-vercel-schedules`, HEAD `a3b757f`
- **16 modifizierte Dateien** (DA 2.0, SEC 1.1/1.2, INFRA 1.0): u. a. `package.json`, `package-lock.json`, `prisma/contract.json`, `prisma/contract.d.ts`, `src/lib/analytics/queries.ts`, `src/lib/download-analytics-service.ts`, `src/lib/__tests__/download-analytics.test.ts`, `tsconfig.json`, Analytics-/Admin-Seiten und -Tests sowie `docs/ANALYTICS*.md`
- **23 unversionierte Pfade**: `Dockerfile`, `compose.yaml`, `.dockerignore`, `docs/*` (13 Berichte), `e2e/`, `playwright.config.ts`, `scripts/health-check.mjs`, `scripts/worktree-integration-check.mjs`, `src/app/api/__tests__/analytics-security.test.ts`, `src/lib/__tests__/channel-classification.test.ts`, `src/lib/analytics/channel.ts`
- Bestehende Worktrees: Hauptbaum, `webradio-website-sec-upgrade`, zwei temporäre Worktrees unter `%TEMP%\opencode`, einer im Kilo-Worktree-Pool. **Keiner wurde angefasst.**
- Die isolierte INFRA-1.1-Kopie `F:\Dev\webradio-infra11-isolated` wurde gelesen, nicht verändert; es wurden **einzelne, geprüfte** Änderungen übernommen (§6), keine Komplettübernahme.

Arbeitsweise: alle Änderungen im Hauptbaum, aber ohne `git add`, ohne Commit. `git status` enthält nach der Phase dieselben bereits vorhandenen Änderungen plus die neuen INFRA-1.2-Dateien; nichts wurde zurückgesetzt.

---

## 2. Datenbankarchitektur: vorher / nachher

### Vorher

`src/lib/db-connection.ts` prüfte hart:

- Runtime in `NODE_ENV=production`: `DATABASE_URL_POOLED` **muss** `pooled.db.prisma.io` sein, Loopback ist verboten.
- CLI: `DIRECT_URL` **muss** `db.prisma.io` sein.
- Jeder andere Host → `DatabaseConfigError`, HTTP 500 auf allen Routen.

Ein selbst gehostetes PostgreSQL – auch im selben Compose-Netz unter `postgres` – war damit unmöglich.

### Nachher

`DATABASE_PROVIDER` wählt das Regelwerk:

| `DATABASE_PROVIDER` | Runtime-Variable | CLI-Variable | Erlaubte Hosts |
| --- | --- | --- | --- |
| `prisma` (**Default**, unverändert) | `DATABASE_URL_POOLED` (`pooled.db.prisma.io`), Loopback nur außerhalb Production | `DIRECT_URL` (`db.prisma.io`), Loopback nur außerhalb Production | exakt wie bisher |
| `self-hosted` | `DATABASE_URL_POOLED`, dann `DATABASE_URL` | `DIRECT_URL`, dann `DATABASE_URL` | Loopback + einteilige Dienstnamen (`postgres`, `webradio-db`) + explizite `DATABASE_ALLOWED_HOSTS` |

Wichtige Eigenschaften:

- **Default bleibt `prisma`.** Eine fehlende Variable lockert nichts; bestehende Vercel-Deployments verhalten sich identisch.
- **Unbekannte Werte** (z. B. `DATABASE_PROVIDER=postgres`) sind ein harter Fehler. Der Wert wird nicht geloggt, damit ein versehentlich eingetragener Connection-String nicht im Log landet.
- **Kein Allow-Any-Schalter.** Im Self-hosted-Modus sind nur Loopback und einteilige Namen ohne weitere Konfiguration erlaubt; FQDN, private/public IPs und IPv6-Literale müssen in `DATABASE_ALLOWED_HOSTS` stehen. `pooled.db.prisma.io` fällt darunter und wird ohne Allowlist abgelehnt.
- **Weitere Validierung bleibt:** Schema muss `postgresql:`/`postgres:` sein, URL muss eine Datenbank nennen, Benutzername ist immer Pflicht, Passwort in einer Production-Runtime Pflicht. Ungültige Ports/URLs werden weiterhin abgelehnt.
- **Secret-Hygiene:** Fehlermeldungen nennen nur Variable und Hostname, nie URL, Benutzer oder Passwort (durch Tests abgesichert).
- `prisma.config.ts` bleibt nicht-werfend; ein unbekannter Provider wird dort als `invalid` mit secret-freiem Grund gemeldet, damit `next build`/`contract emit` offline weiterlaufen.

---

## 3. Schedule-Architektur: vorher / nachher

### Vorher

- `/api/schedules/analytics` exportierte ausschließlich `POST = handleSchedule(...)`. Außerhalb von Vercel antwortete die Route mit **400**; `CRON_SECRET` wurde dort nie geprüft.
- Die Job-Logik (`runAnalyticsSchedule`, `runAnalyticsSync`) war zwar schon Vercel-frei, aber der einzige Aufrufer war der Vercel-Wrapper.

### Nachher

```
Vercel Schedules ──► POST /api/schedules/analytics ─┐
                                                    ├─► executeAnalyticsSchedule()  (shared)
Linux cron ───────► POST /api/cron/analytics ───────┘        │
                                                             └─► runAnalyticsSchedule() → runAnalyticsSync/Retention
```

- **`src/lib/analytics/schedule-execution.ts`** (neu): `executeAnalyticsSchedule(name, { executionId, scheduledAt, source })`, `buildScheduleLogLine`, `listAnalyticsScheduleNames`, `beginScheduleRun`. Keine `@vercel/*`-Imports, keine Request-Objekte, kein Runtime-Kontext. Ergebnis: `{ ok, errorCode, executionId, result }` statt Exception – jeder Transport entscheidet selbst über die Fehlerabbildung.
- **Vercel-Route** (`src/app/api/schedules/analytics/route.ts`): unverändert privat (`schedule/v1beta`-Trigger in `vercel.json`), nutzt jetzt die gemeinsame Funktion und wirft bei `ok: false` weiterhin, damit die Ausführung nicht grün wird. Log-Format und Schedule-Namen sind identisch.
- **Portabler Endpunkt** (`src/app/api/cron/analytics/route.ts`, neu):
  - nur `POST`; `GET` liefert explizit 405 mit `Allow: POST`
  - `Authorization: Bearer $CRON_SECRET`, Vergleich über SHA-256 + `timingSafeEqual` (`src/lib/cron-auth.ts`), also konstantzeitig und längenneutral
  - fehlendes `CRON_SECRET` → **503** `CRON_DISABLED` (fail closed, kein Lauf)
  - fehlendes/falsches Secret → **401**; Nicht-Bearer-Schema → 401
  - `?schedule=<name>` oder JSON-Body `{ "schedule": "..." }`; ohne Angabe laufen alle vier Schedules sequenziell
  - unbekannter Name → **400** mit Liste der gültigen Namen; kaputtes JSON → 400
  - Job-Fehler → **500** `JOB_FAILED`; nur Sperren (`LOCKED`/`ALREADY_RUNNING`) → **409**
  - Antworten sind `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`; Secret und Verbindungsdaten erscheinen weder in Antwort noch Log
- **Doppelte Ausführungen:** prozesslokal verhindert `beginScheduleRun` einen zweiten Lauf desselben Schedules (409). Prozessübergreifend bleiben die vorhandenen dauerhaften `AnalyticsSyncRun`-Sperren je Quelle (5-Minuten-Fenster) wirksam; ein zweiter Lauf wird als `LOCKED` übersprungen und als 409 gemeldet.
- **Bewusst nicht eingeführt:** keine neue Auth-Abhängigkeit, keine zusätzliche Rate-Limit-Abhängigkeit (der Endpunkt ist secret-gated und antwortet vor jeder Arbeit mit 401; ein IP-Limit würde ohne `TRUST_PROXY` auf einem spoofbaren Header beruhen), keine neue Tabelle.

---

## 4. Sicherheitsmaßnahmen (Überblick)

| Maßnahme | Umsetzung |
| --- | --- |
| Kein Host-Allow-All | Self-hosted: Loopback/einteilige Namen, sonst explizite Allowlist |
| Provider-Tippfehler | harter Fehler, Wert wird nicht ausgegeben |
| Secret-Vergleich | SHA-256-Digest + `timingSafeEqual`, keine Längen-/Timing-Leaks |
| Fail closed ohne Secret | 503 statt offenem Endpunkt |
| Keine Secrets in Logs/Fehlern | Fehlermeldungen nur Variable + Hostname; Tests prüfen `not.toMatch(...)` auf Passwörter |
| Keine Ausführung ohne Auth | 401 vor jeder Arbeit; Unit- und Container-Test |
| CSRF/Methoden | nur POST; GET explizit 405 |
| Container | Non-Root `uid=1001(nextjs)`, `.next/cache` gehört dem Runtime-User |
| DB-Port | `127.0.0.1:${POSTGRES_PORT}` – nie im Netz exponiert |
| Pflichtpasswörter | Compose bricht ohne `POSTGRES_PASSWORD`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` ab |

---

## 5. Geänderte Dateien

**Anwendung**

| Datei | Änderung |
| --- | --- |
| `src/lib/db-connection.ts` | `DATABASE_PROVIDER` (`prisma`/`self-hosted`), Host-Regelwerk, Allowlist, zusätzliche URL-Validierung, unveränderte Prisma-Regeln |
| `src/lib/db.ts` | Docstring auf beide Modi aktualisiert (kein Codeverhalten) |
| `prisma.config.ts` | Docstring ergänzt (Self-hosted-CLI-Pfad) |
| `src/lib/cron-auth.ts` | **neu**: `CRON_SECRET`-Bearer-Prüfung, konstantzeitiger Vergleich |
| `src/lib/analytics/schedule-execution.ts` | **neu**: gemeinsame Ausführung, Log-Zeile, Prozess-Sperre |
| `src/app/api/schedules/analytics/route.ts` | nutzt die gemeinsame Ausführung, Verhalten (200/Throw) unverändert |
| `src/app/api/cron/analytics/route.ts` | **neu**: portabler, secret-geschützter Cron-Endpunkt |
| `next.config.ts` | `output: "standalone"` |
| `eslint.config.mjs` | `.vercel/**` ignoriert |

**Betrieb**

| Datei | Änderung |
| --- | --- |
| `Dockerfile` | Build-Zeit-ARGs für `NEXTAUTH_*`, kein `prisma generate`, `--chown`, `.next/cache`-Ownership (aus INFRA 1.1 übernommen und geprüft) |
| `compose.yaml` | `version:` entfernt, Pflicht-Variablen, PG18-Volume, Loopback-Port, Healthcheck + `depends_on`, `APP_DATABASE_URL` statt `DATABASE_URL`, kein `extra_hosts` |
| `.dockerignore` | `.local-db`, Agent-/Cursor-Verzeichnisse, `*.tsbuildinfo`, `.tmp-*`, `AGENTS.md` |
| `docker-compose.yml` | PG18-Volume-Pfad korrigiert, Kommentar aktualisiert |

**Tests**

| Datei | Inhalt |
| --- | --- |
| `src/lib/__tests__/db-connection.test.ts` | +Provider-Default/-Fehler, Self-hosted Runtime+CLI, `postgres`, Loopback, nicht erlaubte/erlaubte Hosts, fehlende DB/Benutzer/Passwort, Protokolle, Platzhalter, Credential-Leaks, Allowlist-Parsing |
| `src/lib/__tests__/cron-auth.test.ts` | **neu**: Secret-Lesen, Bearer-Parsing, konstantzeitiger Vergleich, fehlende/falsche/korrekte Secrets |
| `src/lib/__tests__/schedule-execution.test.ts` | **neu**: Log-Format, Exklusivität, Erfolg/Fehler/Exception, Execution-IDs |
| `src/app/api/__tests__/cron-analytics-route.test.ts` | **neu**: Auth-Matrix, Methoden, Schedule-Auswahl, Body, Fehlerabbildung, parallele Requests, kein Secret-Leak |
| `src/lib/__tests__/prisma-cli-contract.test.ts` | neue Env-Variablen aus dem Kindprozess entfernt (Testisolation) |

---

## 6. Übernommene INFRA-1.1-Korrekturen (einzeln geprüft)

| # | Änderung | Ursache | Bewertung | Ergebnis |
| --- | --- | --- | --- | --- |
| 1 | `ARG NEXTAUTH_SECRET`/`ARG NEXTAUTH_URL` im Builder | `next build` bricht in `NODE_ENV=production` ohne die Variablen ab | Platzhalter nur im Builder-Stage, nicht im Runner; Laufzeit liest echte Werte | Docker-Build Exit 0; Warnung `SecretsUsedInArgOrEnv` bleibt (bewusst, dokumentiert) |
| 2 | `output: "standalone"` | `.next/standalone` fehlte, Runner-Copy unmöglich | von Next dokumentiert; für Vercel neutral | `.next/standalone` vorhanden; Container startet |
| 3 | `.local-db` in `.dockerignore` | Build-Kontext 3,0 GB | keine Sicherheitsauswirkung; nur Größe | Kontext deutlich kleiner, Build 4m36 |
| 4 | PG18-Volume `/var/lib/postgresql` | `postgres:18` nutzt `PGDATA=/var/lib/postgresql/18/docker`; Mount auf `.../data` liegt daneben | Daten wären außerhalb des Volumes gelandet | Startup ohne „unused mount"-Warnung, Daten im Volume |
| 5 | `--chown` + `mkdir .next/cache` | `EACCES` beim Schreiben des ISR-Caches als `nextjs` | minimal nötig für Non-Root-Betrieb | keine `EACCES`-Meldung, Health/Seiten 200 |
| 6 | `POSTGRES_PASSWORD:?` | Compose startete mit leerem Passwort | verhindert versehentlich ungeschützte DB | `docker compose config` bricht ohne Variable ab |
| 7 | `version:` entfernt | veraltetes Attribut, Warnung | rein kosmetisch/Compose-konform | keine Warnung mehr |
| 8 | Zwei Compose-Dateien | `docker-compose.yml` (nur Dev-DB) und `compose.yaml` (Stack) konkurrierten | Rollen jetzt klar getrennt und dokumentiert; nichts gelöscht | beide `config`-valide |
| 9 | Konfigurierbarer DB-Port | Port 5432 war auf dem Host belegt | `127.0.0.1:${POSTGRES_PORT:-5432}` | Testlauf auf 55433 möglich |
| 10 | ESLint ignoriert `.vercel/**` | 13 `no-this-alias`-Errors aus Build-Artefakten | keine Regel abgeschwächt, nur generierter Output ausgeschlossen | `eslint .` 0 Errors |

Abweichung zur isolierten Kopie: `extra_hosts: pooled.db.prisma.io:host-gateway` wurde **nicht** übernommen. Das war ein Validierungs-Workaround für Blocker A und ist mit `DATABASE_PROVIDER=self-hosted` überflüssig; es hätte die Hostprüfung im Betrieb verbogen.

---

## 7. Testergebnisse (tatsächlich ausgeführt)

### 7.1 Nativ (Windows, Git Bash)

| # | Test | Ergebnis |
| --- | --- | --- |
| 1 | TypeScript `tsc --noEmit` | **PASS** (Exit 0) |
| 2 | ESLint `eslint .` | **PASS** (0 Errors, 7 Warnings; 1 Warning in `src`, 6 in Skripten/Docs) |
| 3 | Jest Unit/UI | **PASS** – 66 Suiten, 643 Tests (vorher 63/590) |
| 4 | Prisma Contract Emit | **PASS** (`storageHash 80e32e10…`) |
| 5 | Schema-Validierung | **PASS** – Prisma 8 kennt kein `prisma validate`; `prisma contract print` („Contract printed as Prisma 8 PSL") und `contract emit` sind die Entsprechung |
| 12 | Next.js Production Build | **PASS**, `.next/standalone` erzeugt |

### 7.2 PostgreSQL 18 im Container

| # | Test | Ergebnis |
| --- | --- | --- |
| 8 | Compose-Validierung (`compose.yaml`, `docker-compose.yml`) | **PASS** |
| 9 | PostgreSQL 18.7 Testcontainer | **PASS** (`PostgreSQL 18.7 on x86_64-pc-linux-musl`) |
| 10 | Frische DB + alle 15 Migrationen aus `migrations/app/` | **PASS** (Exit 0, DB `webradio_infra12`) |
| 10 | Prisma Schema Verification | **PASS** (`Database marker and schema match contract`, 44 Tabellen) |
| 11 | Integrationstests | **PASS** – 7 Suiten, 126 Tests gegen `webradio_infra12_test` |

Die Migrationen liefen bewusst über den **neuen** CLI-Pfad (`DATABASE_PROVIDER=self-hosted`, nur `DATABASE_URL`), nicht über die Prisma-Hosts.

### 7.3 Docker-Image und Container

| # | Test | Ergebnis |
| --- | --- | --- |
| 6 | Docker Image Build | **PASS** (4m36s auf diesem Host) |
| 12 | Containerstart | **PASS** (`webradio-infra12:latest`, Net `webradio-infra12-net`) |
| 13 | `/api/health` | **200** |
| 14 | Öffentliche Seiten (`/`, `/releases`) | **200 / 200** |
| 15 | Login/Registrierung (`/auth/login`, `/auth/register`) | **200 / 200** |
| 16 | Admin-Schutz (`/admin`) | **307** → `/auth/login?callbackUrl=%2Fadmin` |
| 20 | Neustart + Health | **PASS** (`docker restart`, danach Health 200, `/` 200) |
| 20 | Non-Root | **PASS** (`uid=1001(nextjs)`) |
| 19 | Backup/Restore | **PASS** – `pg_dump -Fc`, Restore in `webradio_restore`: 45 Tabellen, Markerzeile `infra12-restore-ok` vorhanden |
| – | Secret-Leak in Logs | **0** Treffer für `CRON_SECRET` und DB-Passwort |

### 7.4 Cron-Abnahmetests (gegen den laufenden Container)

| Test | Erwartung | Ergebnis |
| --- | --- | --- |
| `GET /api/cron/analytics` | 405 | **405** (Header `Allow: POST`) |
| POST ohne Secret | abgewiesen | **401** |
| POST mit falschem Secret | 401/403 | **401** |
| POST mit korrektem Secret, `?schedule=analytics-retention` | erfolgreicher Lauf | **200** `{"ok":true,...}` – echter Retention-Lauf gegen PostgreSQL |
| POST mit korrektem Secret, `analytics-traffic` | kontrollierter Fehler ohne GitHub-Credentials | **500** `JOB_FAILED`, strukturiertes Error-Log, keine Details im Body |
| POST unbekannter Schedule | 400 | **400** `INVALID_SCHEDULE` |
| Container ohne `CRON_SECRET` | sicherer Abbruch | **503** `CRON_DISABLED` |
| Zwei parallele Requests | keine unkontrollierte Doppelverarbeitung | Unit-Test: zweiter Request **409** `ALREADY_RUNNING`; zusätzlich DB-Sperren je Quelle |
| Job-interner Fehler | kontrollierte Antwort + Logs | **500** mit `{ schedule, executionId, ok:false, errorCode }`, Log `level: "error"` |

### 7.5 Prisma-Modus bleibt streng (Negativtest im Container)

Container mit `DATABASE_PROVIDER=prisma` und `DATABASE_URL_POOLED=postgresql://…@webradio-infra12-pg:5432/…`:

- `/api/health` und `/releases` → **500**
- Log: `unexpected hostname: webradio-infra12-pg`

Damit ist belegt, dass die bisherigen Sicherheitsregeln nicht gelockert wurden — sie greifen nur im explizit gewählten `self-hosted`-Modus nicht mehr.

---

## 8. Vercel-Kompatibilität

| Prüfpunkt | Ergebnis |
| --- | --- |
| `next build` | **PASS** |
| `vercel.json` | unverändert (vier Schedules, `schedule/v1beta`-Trigger, `installCommand`) |
| Schedule-Integration | Route exportiert weiterhin `POST = handleSchedule(...)`; `analytics-schedule-sdk.test.ts` prüft das echte SDK (200 / Throw / 400) – **PASS** |
| Schedule-Namen | unverändert (`analytics-traffic`, `-repo-stats`, `-releases`, `-retention`) |
| NextAuth | unverändert; Build benötigt weiterhin `NEXTAUTH_SECRET`/`NEXTAUTH_URL` |
| Prisma Postgres | Default-Modus `prisma` unverändert; bestehende Env-Variablen bleiben gültig |
| GitHub-API/Analytics/Releases/Downloads | nicht angefasst; 643 Unit- und 126 Integrationstests grün |
| Umgebungsvariablen | keine neuen Pflichtvariablen für Vercel (`DATABASE_PROVIDER` ist optional und defaultet auf `prisma`) |
| Deployment | **nicht durchgeführt** (nicht beauftragt) |

---

## 9. Docker-Kompatibilität

- Image: Node 24 Alpine, Multi-Stage, Standalone-Output, Non-Root.
- `compose.yaml` ist der vollständige Stack (App + PostgreSQL 18), `docker-compose.yml` bleibt die Dev-Datenbank.
- Compose liest die `.env` des Projekts. Deshalb wird die App-URL über `APP_DATABASE_URL` gesetzt: die Entwicklungs-`DATABASE_URL` (`127.0.0.1:5433`) kann so nicht versehentlich im Container landen.
- Pflichtvariablen: `POSTGRES_PASSWORD`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`. Optional: `CRON_SECRET` (aktiviert den Cron-Endpunkt), `APP_DATABASE_URL` (externe DB), `APP_DATABASE_ALLOWED_HOSTS`, `POSTGRES_PORT`.
- DB-Port nur auf `127.0.0.1`; App-Port `3000`.

---

## 10. Verbleibende Einschränkungen

1. **Keine echte Linux-Umgebung.** systemd-Timer, `cron`, Caddy/HTTPS, `TRUST_PROXY=1` hinter Reverse Proxy und Logrotation wurden **nicht** ausgeführt (Status: NOT RUN). Die Windows-/Docker-Ergebnisse sind kein Linux-Produktivtest.
2. **Vercel Schedules nicht auf Vercel ausgeführt** (kein Deployment beauftragt). Abgesichert durch Unit- und SDK-Tests sowie den unveränderten Wrapper.
3. **Image-Größe** wurde in dieser Phase nicht erneut gemessen (INFRA 1.1: 4,22 GB). Der Runner kopiert weiterhin `node_modules`; eine Verkleinerung ist nicht Teil dieser Phase.
4. **Build-Warnung** `SecretsUsedInArgOrEnv` bleibt bestehen: sie bezieht sich auf die bewusst gesetzten Build-Zeit-Platzhalter.
5. **Parallele Läufe** werden pro Prozess sofort (409) und prozessübergreifend über die DB-Sperren (5-Minuten-Fenster je Quelle) verhindert. Ein harter globaler Mutex über alle vier Schedules existiert nicht.
6. **Self-hosted-Allowlist** erlaubt einteilige Hostnamen ohne Konfiguration. Wer einen öffentlichen FQDN nutzen will, muss ihn explizit in `DATABASE_ALLOWED_HOSTS` eintragen — das ist Absicht, aber Betriebswissen.
7. **Aufräumen:** Validierungs-Container, Netzwerk, Image und Testdatenbanken wurden entfernt; die isolierte INFRA-1.1-Kopie bleibt unverändert liegen.

---

## 11. Voraussetzungen für einen echten Linux-Serverbetrieb

1. Ubuntu 22.04/24.04 LTS oder Debian 12, Node.js 24, PostgreSQL 18 **oder** Docker + Compose.
2. Env: `DATABASE_PROVIDER=self-hosted`, `DATABASE_URL` (bzw. `DATABASE_URL_POOLED`), `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (HTTPS-Origin), optional `DATABASE_ALLOWED_HOSTS`, `CRON_SECRET`.
3. Migrationen **vor** dem App-Start: `npm run db:migrate && npm run db:verify` (bzw. im Container mit derselben `DATABASE_URL`).
4. Reverse Proxy mit HTTPS (Caddy/Nginx), `TRUST_PROXY=1` nur setzen, wenn der Proxy `X-Forwarded-For` überschreibt.
5. Scheduler: `POST /api/cron/analytics?schedule=<name>` per cron/systemd-Timer, Secret aus einer `600`-Datei; Fehlerbehandlung siehe `docs/HOSTING_MIGRATION_GUIDE.md` §7b.
6. Betrieb: Backup-Cron (`pg_dump -Fc`), Logrotation, Healthcheck auf `/api/health`.
7. Offen zu verifizieren: systemd-Timer, Caddy-Zertifikate, Verhalten hinter Proxy (Rate-Limit-IP), Restart-Policy im Dauerbetrieb.

---

## 12. Abschlusskriterien

| Kriterium | Status |
| --- | --- |
| 1. Prisma Postgres funktioniert weiter | **erfüllt** (Default unverändert; Negativtest Container) |
| 2. Self-hosted PostgreSQL im Production-Modus funktioniert | **erfüllt** (Container, Migrationen, Integrationstests) |
| 3. Portabler Cron-Endpunkt authentifiziert korrekt | **erfüllt** (Unit + Container) |
| 4. Gemeinsame Job-Logik unabhängig von Vercel ausführbar | **erfüllt** (`schedule-execution.ts`, echter Retention-Lauf im Container) |
| 5. Vercel Schedules funktionieren weiter | **erfüllt** (Wrapper unverändert, SDK-Tests grün; kein Deployment) |
| 6. Docker-Build und Containerbetrieb erfolgreich | **erfüllt** |
| 7. Unit- und Integrationstests erfolgreich | **erfüllt** (643 + 126) |
| 8. Keine kritischen Sicherheitsprobleme offen | **erfüllt** (Hostprüfung erhalten, Secret-Vergleich konstantzeitig, fail closed, keine Secrets in Logs) |

**Gesamtstatus: COMPLETED WITH LIMITATIONS** — die Einschränkung ist die fehlende Linux-Ausführung aus §10.1, nicht ein offener Portabilitätsblocker.
