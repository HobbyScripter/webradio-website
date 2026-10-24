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
- PostgreSQL-Datenbank (Neon, Supabase, Railway oder lokal)

### Installation

```bash
# Repository klonen
git clone <repository-url>
cd webradio-website

# Abhängigkeiten installieren
npm install

# Umgebungsvariablen konfigurieren
cp docs/env.example .env
# → .env bearbeiten und DATABASE_URL + NEXTAUTH_SECRET eintragen
# → oder: node scripts/generate-env.cjs (erzeugt .env mit generiertem NEXTAUTH_SECRET)
```

### Datenbank einrichten

```bash
# Prisma-Schema gegen Datenbank anwenden (erste Einrichtung)
npm run prisma:db:init

# Datenbankstatus prüfen
npx prisma db verify
```

### Entwicklungsserver starten

```bash
npm run dev
```

Öffne [http://localhost:3000](http://localhost:3000).

## Verfügbare Befehle

| Befehl | Beschreibung |
|---|---|
| `npm run dev` | Entwicklungsserver starten |
| `npm run build` | Produktionsbuild erzeugen (inkl. `prisma contract emit`) |
| `npm run lint` | ESLint ausführen |
| `npm run lint:fix` | ESLint-Fehler automatisch beheben |
| `npm run type-check` | TypeScript-Typprüfung |
| `npm test` | Tests ausführen |
| `npm run test:coverage` | Tests mit Coverage-Report |
| `npm run prisma:contract:emit` | Prisma-Contract-Artefakte generieren |
| `npm run prisma:db:init` | Schema erstmalig auf Datenbank anwenden |
| `npm run prisma:db:update` | Schema-Änderungen (Entwicklung, ohne Migration) |
| `npm run prisma:db:migrate` | Migrationen anwenden |

## Projektstruktur

```
webradio-website/
├── prisma/
│   ├── contract.prisma      # Datenbankschema (Prisma 8 Format)
│   ├── contract.json        # Generiert – nicht bearbeiten
│   └── contract.d.ts        # Generiert – nicht bearbeiten
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/
│   │   │   ├── auth/        # NextAuth.js Handler
│   │   │   └── health/      # Health-Check-Endpoint
│   │   ├── layout.tsx       # Root-Layout
│   │   └── page.tsx         # Startseite
│   ├── components/          # React-Komponenten (Phase 3+)
│   ├── lib/
│   │   ├── db.ts            # Prisma 8 Datenbank-Singleton
│   │   ├── env.ts           # Umgebungsvariablen-Validierung
│   │   ├── auth.ts          # NextAuth.js Konfiguration
│   │   └── validations.ts   # Zod-Schemata
│   └── middleware/
│       └── index.ts         # Route-Schutz-Middleware
├── docs/
│   ├── ARCHITECTURE.md      # Architektur-Dokumentation
│   ├── SECURITY.md          # Sicherheitskonzept
│   ├── TESTING.md           # Teststrategie
│   ├── REQUIREMENTS.md      # Anforderungen
│   ├── env.example          # Umgebungsvariablen-Vorlage
│   ├── PHASE1_REPORT.md     # Phase-1-Bericht
│   └── PHASE2_REPORT.md     # Phase-2-Bericht
├── scripts/
│   └── generate-env.cjs     # .env-Generator mit sicherem NEXTAUTH_SECRET
├── prisma.config.ts         # Prisma CLI Konfiguration
├── next.config.ts           # Next.js Konfiguration
└── vercel.json              # Vercel-Deployment-Konfiguration
```

## Umgebungsvariablen

Alle Variablen sind in [`docs/env.example`](docs/env.example) dokumentiert.

**Pflichtfelder:**

| Variable | Beschreibung |
|---|---|
| `DATABASE_URL` | PostgreSQL Connection String |
| `NEXTAUTH_SECRET` | Session-Signierungsschlüssel (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Anwendungs-URL (z.B. `http://localhost:3000`) |

**Sicherheitshinweis:** `.env` ist in `.gitignore` eingetragen und darf **niemals** in Git landen.

## CI/CD

GitHub Actions führt bei jedem Push auf `main`/`develop` und bei Pull Requests aus:

- **Lint:** ESLint
- **Type Check:** TypeScript
- **Test:** Jest (16 Unit-Tests, datenbanklos)
- **Build:** Next.js Produktionsbuild

## Dokumentation

- [Architektur](docs/ARCHITECTURE.md)
- [Sicherheitskonzept](docs/SECURITY.md)
- [Teststrategie](docs/TESTING.md)
- [Anforderungen](docs/REQUIREMENTS.md)
- [Phase 1 Bericht](docs/PHASE1_REPORT.md)
- [Phase 2 Bericht](docs/PHASE2_REPORT.md)
