# WebRadio Website

Die offizielle Website für das WebRadio-Projekt. Verwaltet Plugins, Themes, Releases, News und Community-Ressourcen.

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
über `POST /api/admin/users/role` (nur ADMIN, wird auditiert).

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
| `/` | Startseite mit Live-Vorschau von Katalog und Releases |
| `/plugins`, `/plugins/[slug]` | Plugin-Katalog und Detailseite |
| `/themes`, `/themes/[slug]` | Theme-Katalog und Detailseite |
| `/releases` | Stabile Releases und Beta-Builds aus der Datenbank |
| `/docs` | Projektinformationen, Installation, API und Einschränkungen |
| `/news`, `/news/[slug]` | Veröffentlichte und datierte Neuigkeiten |
| `/roadmap` | Roadmap-Einträge aus der Datenbank |

Öffentliche Read-only-API: `GET /api/plugins`, `GET /api/themes` (jeweils `q`,
`sort=newest|name|downloads`, `page`), `GET /api/releases` und `GET /api/news`.
Die Routen liefern keine E-Mail-Adressen, Sessions, Audit-Logs oder Entwürfe.

Ohne `NEXT_PUBLIC_SITE_URL` werden keine Canonical-URLs, Open-Graph-URLs oder
Sitemap-Einträge erzeugt. Datenschutz und Impressum sind noch nicht
veröffentlicht; die Website verlinkt daher bewusst keine Platzhalterseiten.

Den vollständigen Stand, die Testergebnisse und offenen Punkte dokumentiert
[`docs/PHASE4_REPORT.md`](docs/PHASE4_REPORT.md).

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
│   │   ├── api-response.ts  # Fehler-Sanitisierung + Same-Origin-Schutz
│   │   └── validations.ts   # Zod-Schemata
│   └── proxy.ts             # Next.js-16-Proxy (Cookie-Check + 404 für Detail-Slugs)
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
| `TEST_DATABASE_URL` | Ausschließlich für `npm run test:integration` (Name muss auf `_test` enden) |

**Sicherheitshinweis:** `.env` ist in `.gitignore` eingetragen und darf **niemals** in Git landen.

## CI/CD

GitHub Actions führt bei jedem Push auf `main`/`develop` und bei Pull Requests aus:

- **Lint:** ESLint
- **Type Check:** TypeScript
- **Test:** Jest (Unit-Tests, datenbanklos; Integrationstests benötigen einen PostgreSQL-Service)
- **Build:** Next.js Produktionsbuild

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
