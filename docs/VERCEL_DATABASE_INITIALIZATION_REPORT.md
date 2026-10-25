# Vercel Database Initialization & Connection Report

**Datum:** 2026-10-25 (Nachtrag: Build-/`DIRECT_URL`-Trennung, §2.4)
**Status:** Verbindungsvertrag implementiert und lokal verifiziert. Keine Migration,
kein Deployment, keine Änderung einer Produktionsdatenbank.
**Production URL:** https://webradio-website.vercel.app

---

## 1. Zusammenfassung

Zwei getrennte Probleme, zwei getrennte Antworten:

1. **Verbindungskonfiguration (in diesem Schritt umgesetzt):** Der Anwendungscode
   benutzt jetzt ausschließlich `DATABASE_URL_POOLED` (`pooled.db.prisma.io`),
   die Prisma-CLI ausschließlich `DIRECT_URL` (`db.prisma.io`). In Production
   gibt es **keinen** stillen Fallback; fehlende oder falsch gehostete Werte
   brechen mit einer verständlichen, secretsicheren Meldung ab. Lokale
   Loopback-Datenbanken bleiben über einen dokumentierten, auf
   Nicht-Production beschränkten Fallback nutzbar.
2. **Build ohne Datenbankvariablen (in diesem Schritt korrigiert):**
   `prisma.config.ts` löste `DIRECT_URL` beim Laden der Datei auf. Die Prisma-CLI
   wertet die Konfiguration jedoch für **jedes** Kommando aus und validiert die
   `orm`-Sektion sofort — auch für das offline laufende `prisma contract emit`
   im `prebuild`. Ein Vercel-Build ohne `DIRECT_URL` brach deshalb mit
   `CLI.CONFIG_UNREADABLE: … DIRECT_URL must be set for Prisma CLI operations.`
   ab. Die Konfiguration übergibt `db.connection` jetzt nur noch, wenn sie eine
   gültige Verbindung auflösen kann; DB-Kommandos prüfen streng über
   `scripts/prisma-db.mts` (§2.4).
3. **Leere Datenbank (unverändert offen):** Der Vercel-Build führt keine
   Migrationen aus (`vercel.json` enthält keinen Migrationsbefehl, keinen Hook,
   keinen Cron). Eine frische Prisma-Postgres-Datenbank bleibt daher leer; alle
   Schreibpfade (Registrierung, Rate-Limiter, Katalog) schlagen fehl. Die
   Migrationen müssen weiterhin **manuell und kontrolliert** mit `DIRECT_URL`
   der Zielumgebung angewendet werden (§6, §7).

---

## 2. Verbindungsvertrag

### 2.1 Variablen und Zuständigkeiten

| Variable | Verbraucher | Erlaubter Host | Production |
|---|---|---|---|
| `DATABASE_URL_POOLED` | Anwendung/Serverless (`src/lib/db.ts`) | `pooled.db.prisma.io` | **zwingend** |
| `DIRECT_URL` | Prisma CLI-DB-Kommandos (`db migrate`, `db verify`, `db schema`, `migration status`, `studio`); **nicht** für `contract emit`/Build | `db.prisma.io` | **zwingend für Migrationen**, nicht für den Build |
| `DATABASE_URL` | lokaler Fallback für `next dev`, lokale CLI-Aufrufe, Integrationstests | nur Loopback (`localhost`, `127.0.0.1`, `::1`) | **nicht verwendet** |
| `TEST_DATABASE_URL` | `npm run test:integration` | nur Loopback, DB-Name endet auf `_test` | **nicht auf Vercel** |

Die Auflösung liegt zentral in [`src/lib/db-connection.ts`](../src/lib/db-connection.ts)
und wird von beiden Seiten benutzt — kein zweiter, abweichender Satz Regeln.

### 2.2 Regeln

- **Production-Runtime** ist `NODE_ENV=production` **ohne**
  `NEXT_PHASE=phase-production-build` (Next.js setzt diese Phase selbst,
  `node_modules/next/dist/build/index.js`).
- `DATABASE_URL_POOLED` fehlt oder ist leer → `DatabaseConfigError`
  („DATABASE_URL_POOLED is required at runtime in production“). Kein Fallback
  auf `DATABASE_URL` oder `DIRECT_URL` — auch dann nicht, wenn dort eine
  Pooled-URL steht.
- `DATABASE_URL_POOLED` zeigt auf `db.prisma.io` → Fehler (Direktverbindung ist
  CLI-only). Anderer Host → Fehler mit Nennung des Hostnamens.
- Loopback-Host in `DATABASE_URL_POOLED` oder `DIRECT_URL` → nur außerhalb der
  Production-Runtime erlaubt.
- `DIRECT_URL` zeigt auf `pooled.db.prisma.io` → Fehler (Migrationen benötigen
  die Direktverbindung).
- `prisma.config.ts` bricht beim Laden **nie** ab: `probeCliDatabaseUrl()` liefert
  `resolved` (gültige Verbindung wird als `db.connection` übergeben),
  `unconfigured` (kein `db`-Feld, keine Ausgabe) oder `invalid` (eine gesetzte,
  aber unbrauchbare `DIRECT_URL` → eine Warnzeile ohne Zugangsdaten, kein
  Build-Abbruch).
- Weder `DATABASE_URL_POOLED` noch `DATABASE_URL` gesetzt und keine
  Production-Runtime (Build, Unit-Tests, frischer Checkout) → Loopback-Platzhalter.
  Der Prisma-8-Client (`@prisma/orm-postgres` 8.0.0-rc.20, `runtime.d.mts`)
  legt seinen Pool erst bei der ersten Query an; Import und Prerendering öffnen
  daher **keine** Verbindung.
- Fehlermeldungen nennen Variablenname und Hostname, nie die
  Verbindungszeichenfolge, den Benutzer oder das Passwort.

### 2.3 Prisma 8 RC — geprüfte API

- `postgres({ contract, url, poolOptions })` aus `@prisma/orm-postgres/runtime`
  (installiert: 8.0.0-rc.20) ist laut Typdefinition **lazy**:
  „The static query surfaces are available at once; the pool is created on the
  first query or `connect()`.“
- `defineConfig()` aus `@prisma/orm-postgres/config` akzeptiert genau **eine**
  `db.connection`-Zeichenfolge; ein `directUrl`-Feld existiert in Prisma 8 RC
  nicht mehr. Deshalb kommt die CLI-Verbindung aus `DIRECT_URL`, während die
  Runtime ein eigener Client mit eigener URL ist.
- `prisma` CLI installiert: 8.0.0-rc.27 (Contract-Emit und `db verify` geprüft).

### 2.4 Build vs. DB-Kommandos (Fix 2026-10-25)

**Ursache des Vercel-Fehlers.** Der Fehler stammte nicht von der Datenbank,
sondern vom Config-Loader:

1. `prebuild` = `prisma contract emit` (laut `--help` ausdrücklich
   „Offline — does not consult the database“).
2. Die CLI lädt `prisma.config.ts` trotzdem für dieses Kommando und validiert
   die `orm`-Sektion sofort.
3. Die erste Fassung rief `resolveCliDatabaseUrl()` auf **Modul-Ebene** auf und
   warf in Production ohne `DIRECT_URL` → `CLI.CONFIG_UNREADABLE`.

Ein Lazy-`get` für `db.connection` hilft **nicht**: `@prisma/orm-framework`
liest den Wert beim Validieren der Sektion, ein Getter wird also ausgewertet
(`CLI.CONFIG_FIELD_INVALID`). Ein `--config`-Flag ignoriert die CLI ebenfalls
zugunsten der Projektkonfiguration.

**Kleinste sichere Lösung.** `db` ist im Prisma-8-Typ optional und nur
DB-Kommandos lesen `db.connection`:

- `prisma.config.ts` fragt `probeCliDatabaseUrl()` (nicht werfend) und übergibt
  `db.connection` nur bei Erfolg. Build und `contract emit` brauchen damit
  **keine** Datenbankvariable; eine falsche `DIRECT_URL` erzeugt nur eine
  Warnzeile.
- `scripts/prisma-db.mts` löst für jedes DB-Kommando streng auf
  (`resolveCliDatabaseUrl()`) und bricht mit der präzisen, secretsicheren
  Meldung ab, **bevor** die CLI startet. Alle `db:*`-/`prisma:db:*`-Scripts
  laufen über diesen Wrapper.
- `prebuild`/`build` enthalten weiterhin keinen Migrationsbefehl; ein Test
  bewacht diese Zusicherung.

---

## 3. Geänderte Dateien

| Datei | Änderung |
|---|---|
| `src/lib/db-connection.ts` | **neu**: zentrale, abhängigkeitsfreie Auflösung + Host-Validierung für Runtime und CLI, `DatabaseConfigError` |
| `src/lib/db.ts` | benutzt den Resolver, exportiert `databaseConnectionSource`; Dokumentation zur Lazy-Verbindung |
| `prisma.config.ts` | CLI-Verbindung über den Resolver; `db.connection` wird nur bei erfolgreicher Auflösung übergeben, kein Abbruch beim Laden mehr (§2.4) |
| `scripts/prisma-db.mts` | **neu**: Wrapper für alle DB-Kommandos — strenge `DIRECT_URL`-Prüfung vor dem CLI-Start, Exit-Code wird weitergereicht |
| `package.json` | `db:*` und `prisma:db:*` laufen über den Wrapper; `prebuild` bleibt `prisma contract emit` |
| `src/lib/__tests__/db-connection.test.ts` | **neu**: Unit-Tests für fehlende Variablen, falsche Hosts, Pooled/Direct, Loopback-Fallbacks, Probe-Semantik, Secret-Sicherheit |
| `src/lib/__tests__/prisma-cli-contract.test.ts` | **neu**: lädt `prisma.config.ts` in einem Kindprozess ohne `DIRECT_URL` (Production), mit Loopback-/Direct-URL und mit falscher URL; prüft außerdem, dass `prebuild`/`build` nie migrieren |
| `.env.example` | Datenbankabschnitt dokumentiert den Vertrag, die Fallback-Grenzen und dass `DIRECT_URL` nur DB-Kommandos betrifft |
| `docs/env.example` | Kurzübersicht der Variablen angepasst |
| `docs/DEPLOYMENT.md` | Build-/Runtime-Abschnitt, Variablentabelle, Migrationsbefehle auf den neuen Vertrag umgestellt |
| `README.md` | Hinweis: DB-Kommandos brauchen `DIRECT_URL`, Build/`contract emit` nicht |
| `.github/workflows/ci.yml` | `DIRECT_URL` nur noch im Integration-Job; Lint/Type-Check/Unit/Build emittieren den Contract **ohne** Datenbankvariablen (Regression-Guard) |
| `scripts/bootstrap-admin.mts`, `scripts/system-admin-bootstrap.mts` | akzeptieren `DATABASE_URL_POOLED` (oder Loopback-`DATABASE_URL`), Meldungen angepasst |

Keine Schema-, Contract- oder Migrationsänderung. `prisma/contract.json` und
`prisma/contract.d.ts` wurden durch `prisma contract emit` neu erzeugt und sind
inhaltlich unverändert (identische Hashes).

---

## 4. Verifikation (lokal, echte Ergebnisse)

| Prüfung | Ergebnis |
|---|---|
| `npx tsc --noEmit` / `npm run type-check` | **bestanden** (Exit 0) |
| `npm run lint` | **bestanden** (Exit 0, keine Warnungen) |
| `npm test` | **bestanden** — 22 Suites, 215 Tests (inkl. Verbindungs- und Config-Contract-Tests) |
| `npm run test:integration` (`TEST_DATABASE_URL` = lokale `_test`-DB) | **bestanden** — 3 Suites, 82 Tests |
| `npm run db:migrate` (`DIRECT_URL` = frische lokale `_test`-DB) | **bestanden** — 5 Migrationen angewendet, Wrapper meldet `→ Prisma CLI connection: DIRECT_URL (127.0.0.1)` |
| `npm run db:verify` (`DIRECT_URL` = dieselbe `_test`-DB) | **bestanden** — „Database marker and schema match contract“ |
| `npm run db:status` | **bestanden** — alle 5 Migrationen `applied`, „Up to date“ |
| `npm run build` **ohne** `DIRECT_URL`, `DATABASE_URL` und `DATABASE_URL_POOLED` | **bestanden** (Exit 0) — der zuvor fehlschlagende Vercel-Fall; Prerendering öffnet keine Verbindung |
| `npm run build` mit falscher `DIRECT_URL` (Pooled-Host) in Production | **bestanden** (Exit 0), genau eine Warnzeile `Prisma CLI database connection ignored: DIRECT_URL points to pooled.db.prisma.io.` — keine Zugangsdaten im Log |
| `env -u DIRECT_URL npx prisma contract emit` (Production) | **bestanden** — `✔ Emitted contract.json and contract.d.ts`, keine Warnung |
| `env -u DIRECT_URL … npx prisma db verify` (direkt, ohne Wrapper) | Prisma-eigener Abbruch `CONFIG.DB_CONNECTION_REQUIRED` (dokumentiert; die npm-Scripts liefern die präzisere Meldung) |
| `NODE_ENV=production npm run db:verify` ohne `DIRECT_URL` | **erwarteter Abbruch** durch den Wrapper: `DIRECT_URL must be set for Prisma CLI operations` (Exit 1, CLI wird nicht gestartet) |
| `NODE_ENV=production DIRECT_URL=<pooled> npm run db:verify` | **erwarteter Abbruch** durch den Wrapper: `DIRECT_URL points to pooled.db.prisma.io` |
| `node scripts/prisma-db.mts` ohne Argumente | **erwarteter Abbruch** mit Nutzungshinweis (Exit 1) |
| Production-Runtime ohne `DATABASE_URL_POOLED` (`node`-Import von `src/lib/db.ts`) | **erwarteter Abbruch** mit `DATABASE_URL_POOLED is required at runtime in production` |
| Production-Runtime mit Mock-Pooled-Host | Modul lädt, `databaseConnectionSource = DATABASE_URL_POOLED`, keine Verbindung |
| `next start` in Production ohne `DATABASE_URL_POOLED`, `GET /` | **HTTP 500** und im Serverlog genau die klare Meldung; keine URL/Zugangsdaten im Log |

Anmerkungen:

- Für den Fix wurde eine frische, wegwerfbare Testdatenbank
  `127.0.0.1:5434/webradio_directurl_test` angelegt und migriert; keine
  Entwicklungs- oder Produktionsdatenbank war beteiligt. `db:verify` maskiert die
  URL (`postgresql://****@…`).
- Der Build wurde zweimal geprüft: ohne `DATABASE_URL_POOLED` (Platzhalter) und
  mit einer erreichbaren Loopback-`DATABASE_URL_POOLED` auf die Testdatenbank.
  Beide Läufe enden mit Exit 0. Die Logzeilen `[api:admin:*] … unexpected
  failure` bzw. `[api:developer:status] …` stammen aus Route-Handlern, die
  während der statischen Generierung ohne Session laufen; sie stehen bereits in
  älteren Build-Logs und brechen den Build nicht ab. Mit erreichbarer Datenbank
  verschwindet zusätzlich die DB-bezogene Zeile von `[api.news]` — der Build
  selbst benötigt also keine Verbindung.
- Unit-Tests liefern weiterhin die bestehenden React-`act()`-Warnungen aus
  Next.js-Interna; sie sind vorbestehend und nicht Teil dieser Änderung.
- Nicht ausgeführt: Migration gegen eine echte Prisma-Postgres-Instanz,
  Vercel-Deployment, SYSTEM_ADMIN-Bootstrap.

---

## 5. Datenbankzustand (unverändert)

### 5.1 Schema

Erwartete Tabellen (aus `prisma/contract.prisma`): `User`, `Session`, `AuthToken`,
`RateLimitBucket`, `DeveloperProfile`, `Plugin`, `PluginVersion`,
`PluginScreenshot`, `PluginTag`, `Theme`, `ThemeVersion`, `ThemeScreenshot`,
`ThemeTag`, `PublicationReview`, `Release`, `Changelog`, `News`, `RoadmapItem`,
`AuditLog`, `GitHubToken`.

Migrationen in `migrations/app/`:

1. `20261024T1407_init_schema`
2. `20261024T1651_phase45_auth_security`
3. `20261024T1700_phase45_product_scope_v2`
4. `20261024T1815_system_admin_role`
5. `20261024T2104_catalog_draft_and_changes_requested`

### 5.2 Vercel-Build

`vercel.json` setzt nur `installCommand` und `framework`; der Build ist
`npm ci` → `npm run build` (`prebuild` = `prisma contract emit`). Es gibt keinen
Migrationsschritt und keinen Cron. Das ist bewusst so: Migrationen bleiben ein
kontrollierter, manueller Schritt (§7).

Der Build benötigt seit dem Fix **keine** Datenbankvariable: `contract emit`
liest nur den Contract-Quelltext, `prisma.config.ts` übergibt ohne
auflösbare Verbindung kein `db`-Feld, und `src/lib/db.ts` nutzt während der
Build-Phase einen Loopback-Platzhalter (Pool wird erst bei der ersten Query
angelegt). `DIRECT_URL` wird erst beim Migrieren gebraucht.

---

## 6. Manuelle Schritte in Vercel

Diese Schritte kann nur der Betreiber im Vercel-Dashboard bzw. am Terminal mit
den echten Zugangsdaten ausführen. **Keine Werte in Chat, Logs oder Repository.**

### 6.1 Umgebungsvariablen (Settings → Environment Variables)

1. `DATABASE_URL_POOLED` anlegen/prüfen — Pooled-Connection-String aus
   Vercel → Storage → Prisma Postgres (Host muss `pooled.db.prisma.io` sein).
   Gilt für **Production und Preview**, jeweils mit eigener Datenbank.
2. `DIRECT_URL` anlegen/prüfen — Direct-Connection-String derselben Datenbank
   (Host `db.prisma.io`). Ebenfalls Production **und** Preview.
3. `NEXTAUTH_SECRET` je Umgebung, `NEXTAUTH_URL` = exakte Origin
   (Production HTTPS, Preview eigene Preview-Origin).
4. Falls eine ältere `DATABASE_URL` in Vercel existiert: sie wird vom
   Anwendungscode nicht mehr gelesen. Entfernen, damit kein veralteter Wert
   Verwirrung stiftet (der Runtime-Resolver ignoriert sie in Production
   ohnehin).
5. Nach Änderungen **neu deployen** — laufende Deployments übernehmen neue
   Variablen nicht.

> Wichtig: `DIRECT_URL` wird **nicht** für den Build benötigt. Fehlt sie, baut
> Vercel erfolgreich; erst `npm run db:migrate`/`db:verify` bricht dann mit einer
> klaren Meldung ab. Eine gesetzte, aber falsche `DIRECT_URL` (z. B. der
> Pooled-Host) erzeugt im Build-Log nur eine Warnzeile und verhindert die
> Migration.

### 6.2 Schema initialisieren (einmalig, kontrolliert)

```bash
# Direct-Connection der Zielumgebung bewusst setzen; niemals aus der lokalen .env übernehmen
export DIRECT_URL="postgresql://…@db.prisma.io:5432/…?sslmode=require"

npm run prisma:contract:emit
npm run db:status        # Ausgangszustand prüfen
npm run db:migrate       # wendet die 5 Migrationen an
npm run db:verify        # Marker + Schema gegen den Contract
```

Vorher: Backup/Snapshot, Review der erzeugten `ops.json` auf `destructive`
Operationen. Bei destruktiven Operationen abbrechen und additiv planen.

`db:status`, `db:migrate` und `db:verify` laufen über `scripts/prisma-db.mts`:
Der Wrapper löst die Verbindung mit `resolveCliDatabaseUrl()` auf (nur
`db.prisma.io` oder lokal Loopback) und bricht bei fehlender/falscher
`DIRECT_URL` ab, bevor die CLI startet. Die URL selbst wird nie ausgegeben.

### 6.3 SYSTEM_ADMIN (nach erfolgreicher Migration)

```bash
# Runtime-Client braucht DATABASE_URL_POOLED, die CLI DIRECT_URL
export DATABASE_URL_POOLED="postgresql://…@pooled.db.prisma.io:5432/…?sslmode=require"
export DIRECT_URL="postgresql://…@db.prisma.io:5432/…?sslmode=require"

export SYSTEM_ADMIN_BOOTSTRAP_CONFIRM="BOOTSTRAP_SYSTEM_ADMIN"
export SYSTEM_ADMIN_EMAIL="operator@example.com"
export SYSTEM_ADMIN_PASSWORD="<generiert, mindestens 16 Zeichen>"
export SYSTEM_ADMIN_NAME="Operator"
npm run system-admin:bootstrap
```

Danach die Bootstrap-Variablen aus Shell und `.env` entfernen. `SYSTEM_ADMIN`
ist über keinen HTTP-Weg vergebbar.

### 6.4 Deployment und Smoke-Test

1. Neu deployen (der Build braucht keine Datenbankvariable; die Runtime braucht
   `DATABASE_URL_POOLED`).
2. Registrierung mit einer Wegwerf-Adresse testen (Rate-Limiter und
   `User`-Tabelle werden dabei berührt).
3. `GET /api/health` bzw. eine öffentliche Seite prüfen; Serverlog auf
   `DatabaseConfigError` kontrollieren.
4. Bei HTTP 500 mit `DATABASE_URL_POOLED is required…`: Variable fehlt in der
   jeweiligen Umgebung oder das Deployment ist älter als die Änderung.

---

## 7. Schema-Updates (wiederkehrend)

1. Contract ändern (`prisma/contract.prisma`).
2. `npm run prisma:contract:emit`.
3. Commit/Push (kein automatisches Migrieren).
4. Lokal mit Production-`DIRECT_URL`: `npm run db:migrate` → `npm run db:verify`.
5. Neu deployen.

Preview bleibt bewusst ohne automatische Migrationen; für Preview-Tests eine
eigene, kontrolliert migrierte Preview-Datenbank verwenden.

---

## 8. Offene Punkte und Risiken

- **Offen (unverändert):** Die Production-Datenbank ist ohne Migrationslauf
  leer; alle Schreibpfade schlagen fehl, bis §6.2 ausgeführt wurde.
- **Offen:** Kein Connection-Pool-Limit (`poolOptions` bietet in Prisma 8 RC nur
  Timeouts). Bei vielen gleichzeitigen Instanzen die Pooler-Grenzen des
  Anbieters prüfen.
- **Risiko:** Wird `DIRECT_URL` vergessen oder falsch gesetzt, fällt das nicht
  mehr beim Build auf, sondern erst beim Migrieren (`npm run db:migrate` bricht
  mit klarer Meldung ab). Vor jedem Schema-Schritt `db:status` prüfen.
- **Bewusst:** Wird `npx prisma db …` an den npm-Scripts vorbei aufgerufen,
  liefert Prisma bei fehlender Verbindung `CONFIG.DB_CONNECTION_REQUIRED`
  statt der projektspezifischen Meldung. Die dokumentierten Wege sind die
  npm-Scripts.
- **Risiko:** Vercel-Preview und -Production müssen getrennte Datenbanken und
  getrennte `NEXTAUTH_URL`-Werte verwenden; sonst zeigen Cookies und
  Reset-Links auf die falsche Umgebung.
- **Nicht geprüft:** Verhalten gegen eine echte Prisma-Postgres-Pooled-Instanz
  (keine Zugangsdaten vorhanden); die Host-/Schema-Validierung wurde nur gegen
  die installierte API und Mock-Werte geprüft.
- **Nicht geändert:** `src/lib/env.ts` (ungenutzt) verlangt weiterhin
  `DATABASE_URL`; es wird von keinem Codepfad importiert. Bei einer künftigen
  Nutzung muss es auf den neuen Vertrag umgestellt werden.

---

**Ende des Berichts**
