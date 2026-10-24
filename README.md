# WebRadio Website

Die offizielle Website für das WebRadio-Desktop-Projekt. Sie präsentiert die Anwendung, verwaltet den Website-Katalog für freigegebene Plugins und Themes und zeigt offizielle Releases direkt aus dem GitHub-Repository `YourEliteSystems/WebRadio`.

## Tech Stack

| Technologie | Version | Zweck |
|---|---|---|
| [Next.js](https://nextjs.org) | 16.4.3 | Framework (App Router) |
| [React](https://react.dev) | 19.3.0 | UI-Bibliothek |
| [TypeScript](https://typescriptlang.org) | 5.x | Sprache |
| [Tailwind CSS](https://tailwindcss.com) | 4.x | Styling |
| [Prisma 8](https://www.prisma.io) | 8.0.0-rc | ORM (contract-based) |
| [PostgreSQL](https://www.postgresql.org) | - | Datenbank |
| [NextAuth.js](https://next-auth.js.org) | 4.24.15 | Authentifizierung |
| [Zod](https://zod.dev) | 4.x | Validierung |

## Schnellstart

### Voraussetzungen

- Node.js 22+
- npm
- PostgreSQL 18 (lokal oder per `docker-compose.yml`) — **ausschließlich eine neue,
  getrennte Entwicklungsdatenbank**, niemals die alte Website-Datenbank

### Installation

```bash
# Repository klonen
git clone https://github.com/HobbyScripter/webradio-website.git
cd webradio-website

# Abhängigkeiten installieren
npm install

# Umgebungsvariablen konfigurieren
cp .env.example .env
# → .env bearbeiten: DATABASE_URL, TEST_DATABASE_URL und NEXTAUTH_SECRET eintragen
# → oder: node scripts/generate-env.cjs (erzeugt .env mit generiertem NEXTAUTH_SECRET)
```

### Datenbank einrichten (Prisma 8)

Prisma 8 kennt kein `prisma migrate deploy`. Der dokumentierte Ablauf ist
`contract emit` → `db migrate`:

```bash
# 1. Contract-Artefakte erzeugen (contract.json + contract.d.ts)
npm run prisma:contract:emit

# 2. Migration auf die (leere) Datenbank anwenden
npm run db:migrate

# 3. Marker und Schema gegen den Contract prüfen
npm run db:verify
```

`npm run prisma:db:init` baseline-t eine bereits existierende Datenbank und
ist für eine leere Datenbank mit Migrationspaket **nicht** nötig.

`prisma db migrate` setzt den Live-Marker, aber nicht den `db`-Ref in
`migrations/app/refs/db.json`. Nach einer neu angewendeten Migration lokal
entweder mit `npx prisma db migrate --advance-ref db` arbeiten oder den Ref
explizit auf die neue Spitze setzen, damit der nächste `migration plan` nicht
von einem älteren Stand aus plant.

### Ersten Administrator anlegen

Es gibt bewusst keinen HTTP-Endpunkt dafür. Der CLI-Bootstrap verweigert die
Ausführung, sobald ein ADMIN existiert:

```bash
ADMIN_BOOTSTRAP_CONFIRM=1 \
BOOTSTRAP_ADMIN_EMAIL="admin@example.com" \
BOOTSTRAP_ADMIN_PASSWORD="<mind. 12 Zeichen>" \
npm run admin:bootstrap
```

Danach die drei Variablen wieder entfernen. Weitere Rollenänderungen laufen
über `POST /api/admin/users/role` (nur ADMIN oder SYSTEM_ADMIN, wird auditiert).

### Systemadministrator (`SYSTEM_ADMIN`)

`SYSTEM_ADMIN` ist die höchste reguläre Stufe und schließt alle
ADMIN-Berechtigungen ein. Die Rolle kann **niemals** über HTTP vergeben werden:
Registrierung, `POST /api/admin/users/role` und jede UI akzeptieren nur
`USER`, `DEVELOPER` und `ADMIN`. Nur der folgende CLI-Weg mit
Datenbankzugriff und ausdrücklicher Bestätigung kann sie setzen.

```bash
# Neues Systemadministrator-Konto (nur solange keines existiert)
SYSTEM_ADMIN_BOOTSTRAP_CONFIRM=BOOTSTRAP_SYSTEM_ADMIN \
SYSTEM_ADMIN_EMAIL="operator@example.com" \
SYSTEM_ADMIN_PASSWORD="<mind. 16 Zeichen, selbst erzeugt>" \
npm run system-admin:bootstrap

# Alternativ: ein bereits registriertes und per E-Mail bestätigtes Konto
# befördern. ID und Adresse müssen zum selben Konto gehören.
SYSTEM_ADMIN_BOOTSTRAP_CONFIRM=BOOTSTRAP_SYSTEM_ADMIN \
SYSTEM_ADMIN_TARGET_ID="<user-id>" \
SYSTEM_ADMIN_TARGET_EMAIL="operator@example.com" \
npm run system-admin:bootstrap
```

Der normale Bootstrap verweigert die Ausführung, sobald ein `SYSTEM_ADMIN`
existiert. Für einen Betreiber, der die Kontrolle behalten, aber ein weiteres
Konto freischalten will, gibt es den ausdrücklich bestätigten Recovery-Weg:

```bash
SYSTEM_ADMIN_RECOVERY=1 \
SYSTEM_ADMIN_RECOVERY_CONFIRM=RECOVER_SYSTEM_ADMIN_CONTROL \
SYSTEM_ADMIN_TARGET_ID="<user-id>" \
SYSTEM_ADMIN_TARGET_EMAIL="operator@example.com" \
npm run system-admin:recover
```

Recovery fügt nur einen weiteren Systemadministrator hinzu; es stuft niemanden
herab und löscht kein Konto. Jeder erfolgreiche Vorgang schreibt
`SYSTEM_ADMIN_BOOTSTRAPPED` beziehungsweise `SYSTEM_ADMIN_RECOVERED` ins
Audit-Log. Normale ADMINs können SYSTEM_ADMIN-Konten weder ändern noch
entfernen; der letzte SYSTEM_ADMIN kann nicht herabgestuft werden. Die
Variablen gehören nie in Vercel oder eine laufende Instanz und werden nach dem
Vorgang wieder entfernt. Führe diese Befehle bewusst selbst aus — es werden
keine Zugangsdaten automatisch erzeugt oder eingecheckt.

### Tests

```bash
npm test               # Unit-Tests (datenbanklos)
npm run test:integration  # echte PostgreSQL-Tests (TEST_DATABASE_URL, Name endet auf _test)
```

### Entwicklungsserver starten

```bash
npm run dev
```

Öffne [http://localhost:3000](http://localhost:3000).

## Öffentliche Website (Phase 4)

Die öffentliche Website nutzt Server Components und lädt Kataloge direkt aus
PostgreSQL. Öffentlich sichtbar sind ausschließlich Einträge mit
`isPublished = true` **und** `status = APPROVED`.

| Route | Inhalt |
|---|---|
| `/` | Startseite mit Live-Vorschau von Katalog und GitHub-Releases |
| `/plugins`, `/plugins/[slug]` | Plugin-Katalog und Detailseite |
| `/themes`, `/themes/[slug]` | Theme-Katalog und Detailseite |
| `/releases` | Stabile Releases, Beta- und Alpha-Builds direkt aus GitHub |
| `/docs` | Projektinformationen, Installation, API und Einschränkungen |
| `/news`, `/news/[slug]` | Veröffentlichte und datierte Neuigkeiten |
| `/roadmap` | Roadmap-Einträge aus der Datenbank |

Öffentliche Read-only-API: `GET /api/plugins`, `GET /api/themes` (jeweils `q`,
`sort=newest|name|downloads`, `page`), `GET /api/releases` und `GET /api/news`.
Die Routen liefern keine E-Mail-Adressen, Sessions, Audit-Logs oder Entwürfe.

### GitHub als maßgebliche Release-Quelle

- Offizielle Releases, Release Notes, Kanäle und Download-Artefakte kommen
  ausschließlich aus der GitHub REST API für `YourEliteSystems/WebRadio`.
- Die Website-Datenbank enthält weiterhin ein historisches
  `Release`/`Changelog`-Modell, veröffentlicht aber keine offiziellen
  Releases mehr. Es wird nicht als Downloadquelle verwendet und nicht gelöscht.
- Es werden nur öffentliche Releases ohne `draft` angezeigt. Assets werden auf
  `.exe`, `.AppImage`, `.pkg.tar.zst`, `.deb` und `.dmg` begrenzt; Update-
  Metadaten (`*.yml`, `*.blockmap`, `SHA256SUMS.txt`) sind keine Downloads.
- Download-URLs müssen auf `github.com/YourEliteSystems/WebRadio/releases/download/`
  zeigen. Dateigröße und SHA-256-Digest stammen aus den GitHub-Asset-Daten.
- Erfolgreiche Antworten werden pro Serverinstanz fünf Minuten
  zwischengespeichert. Bei einem Ausfall oder Rate-Limit dient ein höchstens
  24 Stunden alter Bestand als ausdrücklich gekennzeichneter Fallback. Die
  öffentliche API sendet `Cache-Control: no-store`; der Datenstand wird als
  `source.fetchedAt` und `source.stale` ausgegeben.
- Ohne Token gilt das öffentliche GitHub-Rate-Limit. Ein serverseitiger
  `GITHUB_TOKEN` ist optional und wird nie an den Browser ausgeliefert.

Ohne `NEXT_PUBLIC_SITE_URL` werden keine Canonical-URLs, Open-Graph-URLs oder
Sitemap-Einträge erzeugt. Datenschutz und Impressum sind noch nicht
veröffentlicht; die Website verlinkt daher bewusst keine Platzhalterseiten.

Den vollständigen Stand, die Testergebnisse und offenen Punkte dokumentiert
[`docs/PHASE4_REPORT.md`](docs/PHASE4_REPORT.md).

## Konten, Passwort-Reset und E-Mail-Verifizierung (Phase 4.5)

- Registrierung, Login, Passwort-Reset und E-Mail-Bestätigung sind erreichbar
  unter `/auth/register`, `/auth/login`, `/auth/forgot-password`,
  `/auth/reset-password` und `/auth/verify-email`.
- Rate-Limits liegen dauerhaft in PostgreSQL und gelten damit auch über
  mehrere Serverless-Instanzen hinweg. Login und Registrierung antworten bei
  Überschreitung mit HTTP 429.
- Reset- und Verifizierungs-Tokens werden nur als SHA-256-Hash gespeichert,
  sind zeitlich begrenzt und einmalig verwendbar. Ein erfolgreicher
  Passwort-Reset beendet alle bestehenden Sitzungen.
- Ohne SMTP-Konfiguration schreibt Development/Test Nachrichten nach
  `.local-db/outbox/` (git-ignoriert); es werden keine Tokens geloggt.
- Privilegierte Rollen werden nur an Konten mit bestätigter E-Mail-Adresse
  vergeben. Der Admin-Bootstrap markiert sein operatorgesteuertes Konto als
  bestätigt.
- Alle öffentlichen Katalog-APIs und personalisierten Antworten senden
  `Cache-Control: no-store`. Zurückgezogene Einträge verschwinden damit beim
  nächsten Request.
- Unbekannte oder unveröffentlichte Plugin-/Theme-/News-Slugs beantwortet der
  Proxy direkt mit 404 und `no-store` auf Browser-, CDN- und Vercel-Ebene.
  Ein einmaliger 404-Treffer kann eine spätere Veröffentlichung nicht
  überdecken.
- Die Plattform ist strukturell auf das WebRadio-Desktop-Programm begrenzt:
  `Plugin`, `Theme` und `Release` tragen ein `Product`-Enum mit ausschließlich
  `WEBRADIO`; öffentliche Abfragen filtern darauf.

## Verfügbare Befehle

| Befehl | Beschreibung |
|---|---|
| `npm run dev` | Entwicklungsserver starten |
| `npm run build` | Produktionsbuild erzeugen (inkl. `prisma contract emit`) |
| `npm run lint` | ESLint ausführen |
| `npm run lint:fix` | ESLint-Fehler automatisch beheben |
| `npm run type-check` | TypeScript-Typprüfung |
| `npm test` | Unit-Tests ausführen (ohne Datenbank) |
| `npm run test:integration` | Echte PostgreSQL-Integrationstests |
| `npm run test:coverage` | Tests mit Coverage-Report |
| `npm run prisma:contract:emit` | Prisma-Contract-Artefakte generieren |
| `npm run prisma:db:init` | Bestehende Datenbank baselinen (`db init`) |
| `npm run prisma:db:update` | Schema-Änderungen (Entwicklung, ohne Migration) |
| `npm run db:migrate` | Migrationspakete anwenden (`db migrate`) |
| `npm run db:verify` | Marker + Schema gegen Contract prüfen |
| `npm run db:status` | Migrationsstatus der Datenbank |
| `npm run admin:bootstrap` | Einmaliger, auditierter Admin-Bootstrap (CLI) |
| `npm run system-admin:bootstrap` | SYSTEM_ADMIN anlegen oder bestätigtes Konto befördern (CLI) |
| `npm run system-admin:recover` | Ausdrücklich bestätigter Recovery-Weg für SYSTEM_ADMIN (CLI) |

## Projektstruktur

```
webradio-website/
├── prisma/
│   ├── contract.prisma      # Datenbankschema (Prisma 8 Format)
│   ├── contract.json        # Generiert – nicht bearbeiten
│   └── contract.d.ts        # Generiert – nicht bearbeiten
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── (public)/        # Startseite, Kataloge, Releases, Docs, News
│   │   ├── (auth)/          # Login und Registrierung
│   │   ├── (developer)/     # Geschützter Entwicklerbereich
│   │   ├── (admin)/         # Geschützter Adminbereich
│   │   ├── api/             # Auth, Health, öffentliche Kataloge, Admin
│   │   ├── layout.tsx       # Root-Layout und Metadaten
│   │   ├── robots.ts        # Robots-Regeln
│   │   └── sitemap.ts       # Sitemap (nur mit öffentlicher Basis-URL)
│   ├── components/          # UI- und öffentliche Komponenten
│   │   ├── ui/              # Designsystem (Buttons, Badges, States, Icons)
│   │   └── public/          # Header, Footer, Karten, Katalogfilter
│   ├── lib/
│   │   ├── db.ts            # Prisma 8 Datenbank-Singleton
│   │   ├── env.ts           # Umgebungsvariablen-Validierung
│   │   ├── auth.ts          # NextAuth.js Konfiguration (JWT + DB-Session)
│   │   ├── auth-service.ts  # Hashing, Sessions, RBAC, Audit-Log
│   │   ├── server-auth.ts   # Serverseitige Session-/Rollenprüfung
│   │   ├── catalog.ts       # Öffentliche Katalogabfragen (Freigabefilter)
│   │   ├── catalog-query.ts # Suche, Sortierung, Pagination
│   │   ├── github.ts        # Validierte GitHub-Release-/Repository-Daten
│   │   ├── api-response.ts  # Fehler-Sanitisierung + Same-Origin-Schutz
│   │   └── validations.ts   # Zod-Schemata
│   └── proxy.ts             # Next.js-16-Proxy (Cookie-Check + uncachebarer 404)
├── docs/
│   ├── ARCHITECTURE.md      # Architektur-Dokumentation
│   ├── SECURITY.md          # Sicherheitskonzept
│   ├── TESTING.md           # Teststrategie
│   ├── REQUIREMENTS.md      # Anforderungen
│   ├── PHASE1_REPORT.md     # Phase-1-Bericht
│   ├── PHASE2_REPORT.md     # Phase-2-Bericht
│   ├── PHASE3_REPORT.md     # Phase-3-Bericht
│   ├── PHASE3_5_REPORT.md   # Phase-3.5-Bericht (DB-Integration)
│   └── PHASE4_REPORT.md     # Phase-4-Bericht (öffentliche Website)
├── migrations/              # Prisma-8-Migrationspakete + Snapshots
├── scripts/
│   ├── generate-env.cjs     # .env-Generator mit sicherem NEXTAUTH_SECRET
│   ├── bootstrap-admin.mts  # Einmaliger Admin-Bootstrap
│   ├── system-admin-bootstrap.mts # SYSTEM_ADMIN-Bootstrap/Recovery (CLI)
│   └── run-integration-tests.mjs  # Guard für die Test-Datenbank
├── .env.example             # Umgebungsvariablen-Vorlage (nur Platzhalter)
├── docker-compose.yml       # Optionales lokales PostgreSQL (unverifiziert)
├── prisma.config.ts         # Prisma CLI Konfiguration
├── next.config.ts           # Next.js Konfiguration
└── vercel.json              # Vercel-Deployment-Konfiguration
```

## Umgebungsvariablen

Alle Variablen sind in [`.env.example`](.env.example) dokumentiert (nur Platzhalter).

**Pflichtfelder:**

| Variable | Beschreibung |
|---|---|
| `DATABASE_URL` | PostgreSQL Connection String |
| `NEXTAUTH_SECRET` | Session-Signierungsschlüssel (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Anwendungs-URL (z.B. `http://localhost:3000`) |

**Optional:**

| Variable | Beschreibung |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Öffentliche Basis-URL; aktiviert Canonical-URLs, Open Graph und Sitemap |
| `GITHUB_TOKEN` | Optionaler serverseitiger Token für höhere GitHub-API-Limits; niemals `NEXT_PUBLIC_*` |
| `TEST_DATABASE_URL` | Ausschließlich für `npm run test:integration` (Name muss auf `_test` enden) |
| `TRUST_PROXY` | `1` nur hinter einem Proxy, der `x-forwarded-for` überschreibt; sonst bleiben IP-Limits aus |
| `EMAIL_FROM`, `EMAIL_SERVER_*` | SMTP für Reset- und Verifizierungsmails; ohne sie nur lokale Outbox |

**Sicherheitshinweis:** `.env` ist in `.gitignore` eingetragen und darf **niemals** in Git landen.

## CI/CD

GitHub Actions führt bei jedem Push auf `main`/`master`/`develop` und bei Pull
Requests aus (Token nur mit `contents: read`):

- **Lint:** ESLint
- **Type Check:** TypeScript
- **Test:** Jest (Unit-Tests, datenbanklos)
- **Integration (PostgreSQL):** Service-Container `postgres:18.4-alpine`,
  Contract-Emit, `db:migrate`, `db:verify` und `npm run test:integration`
- **Build:** Next.js Produktionsbuild

Der Integration-Job wurde lokal mit derselben Datenbankkette ausgeführt. Ein
realer Lauf auf GitHub Actions (Run `40125408700`, Commit `6e5a5e3`) ist
allerdings in allen fünf Jobs an `npm ci` gescheitert: Der Lockfile war mit
einem neueren npm erzeugt worden und enthielt für npm 10 zwei fehlende
Peer-Pakete. Der Lockfile-Fix ist lokal mit npm 10.9.4 validiert; ein neuer
grüner Lauf steht noch aus. Details stehen im
[Phase-4.7-Bericht](docs/PHASE4_7_REPORT.md).

## Dokumentation

- [Architektur](docs/ARCHITECTURE.md)
- [Sicherheitskonzept](docs/SECURITY.md)
- [Teststrategie](docs/TESTING.md)
- [Anforderungen](docs/REQUIREMENTS.md)
- [Phase 1 Bericht](docs/PHASE1_REPORT.md)
- [Phase 2 Bericht](docs/PHASE2_REPORT.md)
- [Phase 3 Bericht](docs/PHASE3_REPORT.md)
- [Phase 3.5 Bericht — Datenbankintegration](docs/PHASE3_5_REPORT.md)
- [Phase 4 Bericht — öffentliche Website](docs/PHASE4_REPORT.md)
- [Phase 4.5 Bericht — Sicherheit, Cache, CI, Vercel](docs/PHASE4_5_REPORT.md)
- [Phase 4.6 Bericht — CI, 404-Cache, Vercel-Vorbereitung](docs/PHASE4_6_REPORT.md)
- [Phase 4.7 Bericht — realer CI-Lauf und Lockfile-Reparatur](docs/PHASE4_7_REPORT.md)
- [GitHub-Integration — Release-Quelle und Projektinhalte](docs/GITHUB_INTEGRATION_REPORT.md)
- [Deployment & Vercel-Readiness](docs/DEPLOYMENT.md)
- [Legal- & Lizenz-Checkliste](docs/LEGAL_LAUNCH_CHECKLIST.md)
