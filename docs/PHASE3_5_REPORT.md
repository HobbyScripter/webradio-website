# WebRadio Website — Phase 3.5: Datenbankintegration & Authentifizierung

**Datum:** 2026-10-24  
**Projekt:** `F:\Dev\webradio-website` (neues Projekt; keine Verbindung zur alten Website)  
**Status:** Migration, echte PostgreSQL-Tests und Authentifizierungsmodell verifiziert; Restrisiken unten

---

## 1. Geprüfte Versionen und Migrationsworkflow

### 1.1 Installierte Versionen (tatsächlich aus `node_modules` gelesen)

| Paket / Komponente | Version |
|---|---|
| Node.js | 26.8.2 |
| npm | 12.0.2 |
| `prisma` (CLI) | 8.0.0-rc.27 |
| `@prisma/orm-postgres` (Runtime) | 8.0.0-rc.20 |
| `next` | 16.4.3 |
| `next-auth` | 4.24.15 |
| `bcryptjs` | 3.0.3 |
| `temporal-polyfill` | 1.0.6 |
| `typescript` | 5.9.3 |
| `zod` | 4.6.7 |
| PostgreSQL | 18.4 (x86_64-windows) |

Die lokal installierte Prisma-Dokumentation (`.agents/skills/prisma-8/`, erzeugt aus
`node_modules/prisma/skills`, `library_version: 8.0.0-rc.20`) wurde vor den Änderungen
gelesen — insbesondere `references/migrations.md`, `migration-model.md`, `queries.md`,
`runtime.md`. Maßgeblich sind die Paketdokumente, nicht Erinnerung an Prisma 6/7.

### 1.2 Ist das Contract-Modell das tatsächlich verwendete Modell?

Ja.

- `prisma/contract.prisma` ist die einzige autoritative Quelle; `prisma.config.ts`
  verweist über `@prisma/orm-postgres/config` darauf.
- `prisma/contract.json` und `prisma/contract.d.ts` werden ausschließlich per
  `prisma contract emit` erzeugt. Ein erneutes Emit war deterministisch:
  `storageHash b0d9463c5ca3151b86d063e4791193bef2a6dfc12294b1b6735f16b6b06adc94`,
  `executionHash c58c8d15…`, `profileHash 3916f444…`.
- Der Client in `src/lib/db.ts` lädt genau diese Artefakte
  (`contractFromJson<Contract>(contractJson)`), es gibt keinen zweiten Client.
- Der Typabgleich ist echt: `Session.expiresAt` ist im Contract `pg/timestamptz` und
  zur Laufzeit `Temporal.Instant`, **nicht** `Date`. Genau dieser Unterschied war ein
  realer Fehler in Phase 3 (siehe § 3.1).

### 1.3 Migrationsbefehl: was Prisma 8 wirklich verlangt

Prisma 8 hat **kein** `prisma migrate deploy`; der Befehl ist verschoben
(`CLI.COMMAND_MOVED`). Der dokumentierte Ablauf ist:

```bash
# Contract-Artefakte erzeugen
npx prisma contract emit

# Migration anwenden (ersetzt migrate deploy / migrate dev)
npx prisma db migrate --db "$DATABASE_URL"

# Nur bei Bedarf (Drift-Diagnose): Marker + Schema prüfen
npx prisma db verify --db "$DATABASE_URL"
```

Weitere relevante Befehle:

- `prisma migration plan --name <slug>` — neues Migrationspaket aus dem Contract-Diff.
  Der Plan startet beim `db`-Ref (`migrations/app/refs/db.json`), sonst bei einer leeren
  DB; über einer nicht-leeren Migrationshistorie verweigert die CLI den Full-Create.
- `prisma migration show <dir>` — Review vor dem Anwenden.
- `prisma migration status` / `migration log` — Historie.
- `prisma db init` — **Baseline einer bereits bestehenden** DB. Für eine leere DB mit
  vorhandenem Migrationspaket nicht nötig.
- `prisma db update` — schneller Dev-Pfad ohne Migrationsdatei; bewusst nicht für
  geteilte/Produktions-Datenbanken.

### 1.4 Reproduzierbarkeit auf einer vollständig leeren Datenbank (verifiziert)

Datenbank `webradio_verify` wurde neu erzeugt und war leer. Dann:

```bash
npx prisma db migrate --db "postgresql://postgres@127.0.0.1:5433/webradio_verify"
# → 75 Operationen, 18 Tabellen, Indizes/FKs, Marker b0d9463c…, Exit 0

npx prisma db verify --db "postgresql://postgres@127.0.0.1:5433/webradio_verify"
# → ✔ Database marker and schema match contract, Exit 0

npx prisma db migrate --db "postgresql://postgres@127.0.0.1:5433/webradio_verify"
# → ✔ Already up to date, Exit 0 (idempotent)
```

**Fehlender `db`-Ref behoben:** Die Migration war zuvor mit `--db <url>` angewendet
worden; `db migrate --db` schreibt den `db`-Ref nicht. Dadurch wäre der nächste
`migration plan` über der nicht-leeren Historie mit `MIGRATION.PLAN_ORIGIN_UNKNOWN`
gescheitert. Der Ref wurde explizit gesetzt:

```bash
npx prisma migration ref set db b0d9463c5ca3151b86d063e4791193bef2a6dfc12294b1b6735f16b6b06adc94
# → migrations/app/refs/db.json { hash: "b0d9463c…", invariants: [] }

npx prisma migration plan --name phase35_verify_noop
# → ✔ No changes detected, from/to b0d9463c…
```

Damit ist der Ablauf für spätere Migrationen:

```bash
# Contract ändern, dann:
npm run prisma:contract:emit
npx prisma migration plan --name <aenderung>
npx prisma migration show migrations/app/<timestamp>_<name>
npx prisma db migrate            # nutzt DATABASE_URL
npm run db:verify                # nur bei Verdacht auf Drift
```

Neu erzeugte Pakete werden **nicht** von Hand geschrieben: `migration.ts` wird vom
Planner gerendert, bei Daten-Transforms werden `placeholder(...)`-Slots ersetzt und
danach `node migrations/app/<dir>/migration.ts` (Self-Emit) ausgeführt.

---

## 2. PostgreSQL-Entwicklungsumgebung

### 2.1 Docker-Prüfung

`docker --version` → `docker: command not found`. Docker ist auf diesem Rechner **nicht
verfügbar**. Deshalb wurde die dokumentierte Alternative genutzt: eine lokale
PostgreSQL-Installation.

### 2.2 Verifiziert genutzte Umgebung

| Eigenschaft | Wert |
|---|---|
| Installation | `D:\Program Files\PostgreSQL\18\bin` (PostgreSQL 18.4) |
| Datenverzeichnis | `F:\Dev\webradio-website\.local-db\data` (via `.gitignore` ausgeschlossen) |
| Bindung | `127.0.0.1:5433` (nur Loopback) |
| Authentifizierung | `trust` für `127.0.0.1/32` und `::1/128` (nur lokal) |
| Start | `pg_ctl -D .local-db/data -l .local-db/postgres.log -o "-p 5433 -h 127.0.0.1" start` |
| Persistenz | Datenverzeichnis bleibt erhalten (kein Wegwerf-Container) |

Datenbanken:

- `webradio_dev` — Entwicklung, Migration angewendet, `db verify` grün.
- `webradio_test` — ausschließlich für Integrationstests, wird von den Tests geleert.
- `webradio_verify` — Provenienz-Nachweis der Migration auf leerer DB (leer).

`.env` (git-ignoriert) enthält `DATABASE_URL` auf `webradio_dev` und
`TEST_DATABASE_URL` auf `webradio_test`. Es sind **keine Zugangsdaten im Repository**;
`.env.example` enthält nur Platzhalter.

### 2.3 Optionaler Docker-Pfad

`docker-compose.yml` ist enthalten (gepinntes `postgres:18.4-alpine`, benanntes Volume,
Port nur auf `127.0.0.1`, Healthcheck, Passwort per Pflicht-Env). **Dieser Pfad wurde
auf diesem Rechner nicht ausgeführt** und ist daher unverifiziert.

---

## 3. Ergebnisse der echten Datenbanktests

### 3.1 Vorher gefundener, echter Fehler

Der bisherige „Integrationstest“ (`db-integration.test.ts`) lag im normalen
`npm test`-Lauf und schlug mit der damaligen Implementierung fehl — 5 von 40 Tests:

```
StructuredError: Codec 'pg/timestamptz-temporal@1' encodes a Temporal.Instant,
but received a Date.
```

Ursache: `auth-service.ts` erzeugte `expiresAt` als JavaScript-`Date`. Der
Prisma-8-Contract verlangt `Temporal.Instant`. Der Phase-3-Bericht („29/29 Tests
bestanden“) beruhte auf rein gemockten Tests und deckte das nicht auf.

Behoben durch:

- `Temporal.Now.instant()` / `Temporal.Instant.compare(...)` in `auth-service.ts`,
- globalen `Temporal`-Typen via `src/types/temporal.d.ts` (TypeScript 5.9 kennt
  Temporal noch nicht in `lib.esnext`),
- Laufzeit-Polyfill in `src/lib/db.ts` (`temporal-polyfill/global`), damit auch
  Node 22 (CI) funktioniert; Node 26 hat `Temporal` nativ.

### 3.2 Teststruktur

- `npm test` — 4 Suiten, **47/47** Unit-Tests, ohne Datenbank.
  Integrationstests sind per `testPathIgnorePatterns` ausgeschlossen.
- `npm run test:integration` — **24/24** Tests gegen echtes PostgreSQL
  (`webradio_test`), kein Mock.
- Guard in `scripts/run-integration-tests.mjs` **und** `ensureTestDatabase()`:
  nur Loopback-Hosts und Datenbanknamen mit Endung `_test`. Ein Fehlgriff auf
  `webradio_dev` oder einen Remote-Host bricht ab, bevor Daten gelöscht werden.
- Die Test-DB wird zu Beginn und am Ende geleert (dokumentiert; nur `_test` erlaubt).

### 3.3 Abgedeckte echte Operationen (alle grün)

| Bereich | Geprüft |
|---|---|
| Registrierung | Insert, Read-back, UUIDv7-Format, Default-Rolle `USER`, bcrypt-Hash (`$2…`) |
| E-Mail | Normalisierung (`USER@…` → `user@…`), Duplikat case-insensitiv, **DB-Unique-Constraint** unabhängig vom Service |
| Passwort | korrekt akzeptiert, falsch abgelehnt, unbekannte E-Mail liefert identischen Fehler (keine Enumeration) |
| Sessions | Erzeugung (43 Zeichen Base64URL = 256 Bit), DB speichert nur SHA-256-Hash, Laden per Token und per ID |
| Ablauf | abgelaufene Session wird abgelehnt **und** die Zeile gelöscht |
| Widerruf | per Token und per ID; doppelter Widerruf ist kein Fehler |
| Kaskade | Löschen des Users entfernt dessen Sessions |
| Rollen | Rolle wird aus DB gelesen; USER/DEVELOPER erhalten `ForbiddenError` bei Rollenänderung |
| Admin-Aktion | ADMIN ändert Rolle; `ADMIN_ROLE_CHANGED` wird mit alt/neu auditiert |
| Selbst-Demotion | letzter/selbst betroffener Admin wird mit `SELF_DEMOTION_FORBIDDEN` blockiert |
| Audit | `USER_REGISTERED`, `USER_LOGIN`, `ADMIN_BOOTSTRAPPED`; keine Hashes/Passwörter in `details` |
| Fehler | DB-/Treiberfehler → generischer 500 ohne SQL, Constraint- oder Hash-Details |
| Bootstrap | echter CLI-Aufruf: legt genau einen ADMIN an, zweiter Lauf wird verweigert, schwaches Passwort/fehlendes Confirm werden verweigert |

---

## 4. Authentifizierungs- und Sessionmodell

### 4.1 Ein Modell, zwei Schichten — klar verknüpft

NextAuth 4 unterstützt **keine** Datenbank-Session-Strategie mit dem
Credentials-Provider. Deshalb bleibt JWT die Transport-Schicht, die Autorität liegt
aber in PostgreSQL:

1. `authorize()` prüft das Passwort (`authenticateUser`) und legt eine DB-Session an.
2. Der NextAuth-JWT (verschlüsselt, HttpOnly) speichert `userId`, `role` (nur Anzeige)
   und `sessionId` — die ID der DB-Zeile.
3. `getServerAuthSession()`/`require*Session()` lesen die `sessionId`, validieren die
   Zeile in PostgreSQL (Existenz, Ablauf, User-Zugehörigkeit) und laden die **aktuelle
   Rolle aus der DB**. Ist die Session weg, ist der Zugriff weg.
4. `events.signOut` löscht die DB-Session.

Eigenschaften:

- **Session-Token:** 32 Bytes aus `crypto.randomBytes`, Base64URL; in der DB steht nur
  der SHA-256-Hash. Das Roh-Token wird nie persistiert und nicht an den Client
  ausgegeben.
- **Ablauf:** 30 Tage in DB und JWT; abgelaufene Zeilen werden bei Validierung gelöscht.
- **Widerruf:** sofort wirksam, unabhängig von der JWT-Restlaufzeit.
- **Rollen:** jede Autorisierung liest die Rolle aus der DB; ein manipuliertes oder
  veraltetes `role`-Claim im JWT hat keine Wirkung (durch Test abgesichert).
- **Cookies:** `httpOnly`, `sameSite=lax`, `path=/`, `secure` + `__Secure-`-Präfix,
  wenn `NEXTAUTH_URL` mit `https://` beginnt. `NEXTAUTH_SECRET` ist in Produktion
  Pflicht (sonst Startabbruch).
- **Keine Token/Passwörter in Logs:** unerwartete Fehler werden nur mit `name`/`code`
  geloggt; API-Antworten sind sanitisiert.
- **CSRF:** `SameSite=Lax` plus Same-Origin-Prüfung (`Origin` gegen Host bzw.
  `NEXTAUTH_URL`) auf den mutierenden Routen (`/api/auth/register`,
  `/api/admin/users/role`).

### 4.2 Next.js 16: Middleware → Proxy

Next.js 16 hat `middleware.ts` zugunsten von `proxy.ts` (Export `proxy`) abgekündigt;
der Node-Runtime-Proxy ist der neue Standard. Die Datei wurde nach `src/proxy.ts`
migriert (der Build weist „ƒ Proxy (Middleware)“ aus).

Der Proxy prüft **nur**, ob ein Session-Cookie vorhanden ist, und leitet sonst auf
`/auth/login` um. Er ist ausdrücklich **keine** Autorisierung: jede Seite, jeder
Route-Handler und jeder Datenzugriff prüft serverseitig gegen die DB.

### 4.3 Serverseitige Prüfungen (konkret)

- `/admin` (Server Component): DB-Session + Rolle `ADMIN` aus der DB; erst danach
  werden Benutzer-/Review-/Audit-Zahlen geladen.
- `/developer`: DB-Session + Rolle `DEVELOPER` oder `ADMIN`; ein normaler `USER`
  erhält eine 403-Ansicht.
- `GET /api/developer/status`: `requireDeveloperSession()` → 401/403/200.
- `GET /api/admin/audit-logs`: `requireAdminSession()`, explizit serialisierte Felder,
  `Temporal.Instant` als ISO-String.
- `POST /api/admin/users/role`: `requireAdminSession()` **und** `changeUserRole()`
  prüft die Rolle des Akteurs erneut in der DB, schreibt Änderung + Audit atomar.

### 4.4 HTTP-End-to-End-Nachweis (ausgeführt, nicht nur Unit-Tests)

Gegen den Produktionsbuild (`next start`, temporärer Port 3100, danach beendet):

| Schritt | Ergebnis |
|---|---|
| Registrierung über `POST /api/auth/register` | `201`, Rolle `USER` |
| Credentials-Login über NextAuth (`csrf` + `callback/credentials`) | `200`, Session-Cookie gesetzt |
| `GET /api/auth/session` | User + Rolle + `sessionId`, **kein** Session-Token |
| `GET /api/developer/status` als USER | `403 FORBIDDEN` |
| `GET /api/admin/audit-logs` als USER | `403 FORBIDDEN` |
| `/admin` als USER | 403-Ansicht (HTTP 200, RSC-Seite) |
| Rolle in DB auf `ADMIN` geändert, **gleiches Cookie** | Admin-API `200`, `/admin` zeigt Konsole |
| Admin ändert Rolle eines zweiten Users per API | `200`, Audit `ADMIN_ROLE_CHANGED` |
| DEVELOPER ruft Admin-Endpunkte auf | `403` (beide) |
| DEVELOPER `/api/developer/status` | `200` |
| Signout, danach **altes** Cookie wiederverwendet | `401`; DB-Sessions des Users: `0` |

Damit ist belegt: Login, Cookie, NextAuth-Session und DB-Session bilden ein Modell;
Widerruf und Rollenänderung wirken sofort.

**Hinweis:** JWTs, die **vor** dieser Änderung ausgestellt wurden, enthalten keine
`sessionId` und gelten jetzt als nicht angemeldet. Bestehende Nutzer müssen sich neu
anmelden.

### 4.5 Administrativer Bootstrap

`npm run admin:bootstrap` (CLI, kein HTTP-Endpunkt):

```bash
ADMIN_BOOTSTRAP_CONFIRM=1 \
BOOTSTRAP_ADMIN_EMAIL="admin@example.com" \
BOOTSTRAP_ADMIN_PASSWORD="<mind. 12 Zeichen>" \
npm run admin:bootstrap
```

Schutzmechanismen:

- explizites `ADMIN_BOOTSTRAP_CONFIRM=1`,
- **verweigert**, sobald ein `ADMIN` in der DB existiert (zweiter Lauf getestet),
- Passwort mindestens 12 Zeichen, kein Default, nicht gleich der E-Mail,
- existiert die E-Mail bereits, wird der bestehende Account zum Admin befördert
  (nur wenn noch kein Admin existiert),
- Nutzer + Audit `ADMIN_BOOTSTRAPPED` in **einer** Transaktion,
- Passwort/Hash/Connection-String werden nie ausgegeben; nach dem Lauf sind die
  Env-Variablen zu entfernen,
- Registrierung setzt immer `USER`; es gibt kein Rollenfeld in der Registrierung.

---

## 5. Abnahmekriterien — Ergebnisse

| Kriterium | Befehl | Ergebnis |
|---|---|---|
| Migration auf leerer PostgreSQL-DB | `prisma db migrate --db …/webradio_verify` | ✅ 75 Operationen, Marker gesetzt |
| Schema/Marker verifiziert | `prisma db verify --db …/webradio_verify` | ✅ Exit 0 |
| Migration idempotent | zweites `db migrate` | ✅ „Already up to date“ |
| Echte DB-Integrationstests | `npm run test:integration` | ✅ 24/24 |
| Unit-Tests | `npm test` | ✅ 47/47 (4 Suiten) |
| Typprüfung | `npm run type-check` | ✅ 0 Fehler |
| Lint | `npm run lint` | ✅ 0 Fehler |
| Produktionsbuild | `npm run build` | ✅ 17 Routen, Proxy erkannt |
| USER/DEVELOPER ohne Admin-Rechte | Integrationstests + HTTP | ✅ 403 / `ForbiddenError` |

Build-Hinweis: Next.js führt beim Prerender die dynamischen Route-Handler kurz aus;
dabei erscheinen zwei sanitisierte Logzeilen (`unexpected failure { name, code }`).
Die Routen bleiben `ƒ (Dynamic)`, es werden keine internen Details ausgegeben.

---

## 6. Offene Risiken und notwendige manuelle Schritte

1. **Prisma 8 ist Release Candidate.** CLI `8.0.0-rc.27` und ORM `8.0.0-rc.20` sind
   unterschiedliche RC-Stände. Vor jedem Upgrade die paketinterne
   Upgrade-Dokumentation lesen, Versionen exakt pinnen und die Migration erneut auf
   einer leeren DB verifizieren.
2. **Docker-Pfad ungeprüft.** `docker-compose.yml` ist vorhanden, wurde hier mangels
   Docker aber nicht gestartet. Verifiziert ist nur die lokale PostgreSQL-Installation.
3. **Kein Rate-Limiting** für Login/Registrierung. Vor öffentlichem Betrieb
   Reverse-Proxy-/WAF-Limits oder einen persistenten Store ergänzen.
4. **Kein Passwort-Reset und keine E-Mail-Verifikation.** `emailVerified` bleibt
   ungenutzt; ein kompromittiertes Konto kann derzeit nur per DB/Admin gesperrt werden
   (eine Sperr-/Deaktivierungsfunktion fehlt).
5. **Session-Cleanup nur opportunistisch.** Abgelaufene Sessions werden beim Zugriff
   gelöscht; es gibt keinen periodischen Sweep. Für Produktion einen Cron/Job
   vorsehen.
6. **`sessionId` ist im Client sichtbar** (`/api/auth/session`). Sie ist kein
   Bearer-Credential (keine API akzeptiert sie), aber wer sie nichtexponieren will,
   kann den Session-Callback um einen eigenen Endpunkt ergänzen.
7. **Produktions-Cookies:** `NEXTAUTH_URL` muss mit `https://` gesetzt sein, sonst
   werden keine `__Secure-`-Cookies ausgeliefert. `NEXTAUTH_SECRET` rotieren loggt
   alle Nutzer aus.
8. **Lokale DB-Authentifizierung ist `trust`** (nur Loopback). In Produktion:
   TLS, starkes Passwort, kein öffentlicher Port, keine `trust`-Regel.
9. **`x-forwarded-for` ist ungeprüft** und damit als Audit-IP spoofbar, wenn kein
   vertrauenswürdiger Proxy davorsteht.
10. **Bootstrap-Race:** Zwei gleichzeitige CLI-Läufe könnten theoretisch beide einen
    Admin anlegen (kein Advisory Lock). Der Bootstrap ist ein manueller,
    einmaliger Operator-Schritt; nicht automatisieren.
11. **Integrationstests löschen Daten** in der `_test`-DB. `TEST_DATABASE_URL` niemals
    auf Dev/Prod zeigen lassen (Guard vorhanden, aber Konfiguration prüfen).
12. **Dev-DB enthält einen realen Test-Account** (`ramonoltmann@outlook.de`) aus einer
    manuellen Browser-Session. Er wurde nicht verändert oder gelöscht. Dessen
    bestehende Sessions sind nach dem Sessionmodell-Wechsel ungültig → neu anmelden.
13. **`docs/env.example` ist veraltet** und dupliziert `.env.example`; im README zeigt
    der Link jetzt auf `.env.example`. Die alte Datei sollte in einer Aufräumphase
    entfernt oder ersetzt werden.
14. **Admin-Seite antwortet mit HTTP 200 + 403-Ansicht** (React-Server-Component),
    während APIs echtes 403 liefern. Es werden keine geschützten Daten geladen.
15. **Kein automatisierter Browser-Test** des NextAuth-Cookie-Flows in CI. Der Flow
    wurde manuell per HTTP verifiziert; für Regressionsschutz wäre Playwright sinnvoll.
16. **Integrationstests laufen noch nicht in CI.** Die GitHub-Actions-Pipeline führt
    derzeit nur Unit-Tests aus. Für Phase 4: PostgreSQL-Service-Container, Migration
    (`prisma db migrate`) und `npm run test:integration` als eigener Job.

---

## 7. Geänderte/neue Dateien (Auszug)

- `src/lib/auth-service.ts` — Temporal-Sessions, gehashte Tokens, Rollenänderung, Audit.
- `src/lib/auth.ts` — JWT↔DB-Verknüpfung, Cookie-Härtung, Signout-Widerruf.
- `src/lib/server-auth.ts` — DB-gestützte Session-/Rollenprüfung.
- `src/proxy.ts` — Next.js-16-Proxy (ersetzt `src/middleware.ts`).
- `src/lib/api-response.ts` — Fehler-Sanitisierung + Same-Origin-Prüfung.
- `src/app/api/admin/users/role/route.ts` — auditierte Rollenänderung (nur ADMIN).
- `src/app/(admin)/admin/page.tsx`, `src/app/(developer)/developer/page.tsx` — DB-Rollen.
- `scripts/bootstrap-admin.mts` — Einmal-Bootstrap.
- `scripts/run-integration-tests.mjs`, `jest.config.integration.mjs` — echte DB-Tests.
- `src/lib/__tests__/db.integration.test.ts` — 24 echte DB-Tests.
- `src/lib/__tests__/server-auth.test.ts`, `api-response.test.ts` — Autorisierungs-Unit-Tests.
- `.env.example`, `docker-compose.yml` — lokale Umgebung (Platzhalter/optional).
- `migrations/app/refs/db.json` — Ref auf den aktuellen Contract-Hash.
