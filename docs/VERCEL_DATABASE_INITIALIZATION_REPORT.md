# Vercel Database Initialization & Connection Report

**Datum:** 2026-10-25
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
2. **Leere Datenbank (unverändert offen):** Der Vercel-Build führt keine
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
| `DIRECT_URL` | Prisma CLI (`prisma.config.ts`): `db migrate`, `db verify`, `migration status`, `contract emit` | `db.prisma.io` | **zwingend** |
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

---

## 3. Geänderte Dateien

| Datei | Änderung |
|---|---|
| `src/lib/db-connection.ts` | **neu**: zentrale, abhängigkeitsfreie Auflösung + Host-Validierung für Runtime und CLI, `DatabaseConfigError` |
| `src/lib/db.ts` | benutzt den Resolver, exportiert `databaseConnectionSource`; Dokumentation zur Lazy-Verbindung |
| `prisma.config.ts` | CLI-Verbindung über den Resolver (`DIRECT_URL`), keine Fallback-Kette mehr im Config-File |
| `src/lib/__tests__/db-connection.test.ts` | **neu**: 24 Unit-Tests für fehlende Variablen, falsche Hosts, Pooled/Direct, Loopback-Fallbacks, Secret-Sicherheit |
| `.env.example` | Datenbankabschnitt dokumentiert den Vertrag, die Fallback-Grenzen und den CLI-Bedarf von `DIRECT_URL` |
| `docs/env.example` | Kurzübersicht der Variablen angepasst |
| `docs/DEPLOYMENT.md` | Build-/Runtime-Abschnitt, Variablentabelle, Migrationsbefehle auf `DIRECT_URL` umgestellt |
| `.github/workflows/ci.yml` | `DIRECT_URL` in allen Jobs mit Prisma-CLI-Aufrufen; Build-Job prüft den Production-Pfad mit Mock-Pooled-Host ohne Verbindung |
| `scripts/bootstrap-admin.mts`, `scripts/system-admin-bootstrap.mts` | akzeptieren `DATABASE_URL_POOLED` (oder Loopback-`DATABASE_URL`), Meldungen angepasst |

Keine Schema-, Contract- oder Migrationsänderung. `prisma/contract.json` und
`prisma/contract.d.ts` wurden durch `prisma contract emit` neu erzeugt und sind
inhaltlich unverändert (identische Hashes).

---

## 4. Verifikation (lokal, echte Ergebnisse)

| Prüfung | Ergebnis |
|---|---|
| `npx tsc --noEmit` | **bestanden** (Exit 0) |
| `npm run lint` | **bestanden** (Exit 0, keine Warnungen) |
| `npm test` | **bestanden** — 21 Suites, 203 Tests (inkl. 24 neuer Verbindungstests) |
| `npm run test:integration` (`TEST_DATABASE_URL` = lokale `_test`-DB) | **bestanden** — 3 Suites, 82 Tests |
| `npm run db:verify` (`DIRECT_URL` = lokale `_test`-DB) | **bestanden** — Marker und Schema stimmen mit dem Contract überein |
| `npm run build` (ohne `DATABASE_URL_POOLED`, keine erreichbare DB) | **bestanden** (Exit 0); Prerendering öffnet keine Verbindung |
| Production-Runtime ohne `DATABASE_URL_POOLED` (`node`-Import von `src/lib/db.ts`) | **erwarteter Abbruch** mit `DATABASE_URL_POOLED is required at runtime in production` |
| Production-Runtime mit Mock-Pooled-Host | Modul lädt, `databaseConnectionSource = DATABASE_URL_POOLED`, keine Verbindung |
| `next start` in Production ohne `DATABASE_URL_POOLED`, `GET /` | **HTTP 500** und im Serverlog genau die klare Meldung; keine URL/Zugangsdaten im Log |
| `NODE_ENV=production npx prisma contract emit` ohne geprüfte `DIRECT_URL` | **erwarteter Abbruch** (`CLI.CONFIG_UNREADABLE`: `DIRECT_URL must be set for Prisma CLI operations`) |

Anmerkungen:

- Die lokale Testdatenbank lag auf `127.0.0.1:5434/webradio_phase51_test`; es
  wurde ausschließlich diese verwendet. `db:verify` maskiert die URL
  (`postgresql://****:****@…`).
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

> Wichtig: `DIRECT_URL` wird bereits beim Build benötigt, weil `prisma.config.ts`
> für `prebuild` (`prisma contract emit`) geladen wird. Fehlt sie, bricht der
> Build mit einer klaren Meldung ab — es wird keine Verbindung aufgebaut.

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

1. Neu deployen (Build benötigt `DATABASE_URL_POOLED` + `DIRECT_URL`).
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
- **Risiko:** Wird `DIRECT_URL` in Vercel vergessen, schlägt der Build bewusst
  fehl (statt still eine falsche Verbindung zu nutzen). Das ist gewollt, muss
  aber beim ersten Deployment eingeplant werden.
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
