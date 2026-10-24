# WebRadio Website — Phase 4 Report: Öffentliche Website

**Datum:** 2026-10-24  
**Projekt:** `F:\Dev\webradio-website`  
**Status:** Phase 4 abgeschlossen; Phase 5 nicht begonnen

---

## 1. Zusammenfassung der umgesetzten Funktionen

Die öffentliche Website wurde von Platzhalterseiten zu einer datenbankgestützten,
responsiven Produktwebsite ausgebaut:

- einheitliches Dark-Designsystem mit Marken-Kennzeichnung, Fokus-Zuständen,
  Container-, Karten-, Badge-, Button- und Zustandskomponenten
- responsive Hauptnavigation mit per Tastatur und Screenreader bedienbarem
  mobilen Menü, Skip-Link und Footer mit echten Projektzielen
- Startseite mit Produktpositionierung, ehrlicher Standkennzeichnung,
  Live-Vorschau aus Plugin-/Theme-Katalog und Releases
- Plugin- und Theme-Katalog mit Suche, Sortierung, Pagination, Detailseiten,
  Lade-, Leer- und Fehlerzuständen
- Release-Seite aus PostgreSQL, getrennt nach stabilen Versionen und
  SemVer-Beta-Builds, inklusive Release Notes, Prüfsummen und validierten
  Download-Links
- Projektinformationsseite `/docs` mit Architektur, Installation, API,
  Sicherheitsmodell, Einschränkungen und Links zur maßgeblichen Dokumentation
- Neuigkeiten und Roadmap aus der Datenbank statt fest verdrahteter Inhalte
- öffentliche Read-only-API für Plugins, Themes, Releases und News
- echte `404`-Statuscodes für unbekannte oder nicht veröffentlichte
  Detail-Slugs durch eine Existenzprüfung im Next.js-Proxy
- SEO-Grundlagen: Seitentitel, Beschreibungen, Open Graph, Robots,
  Sitemap-Grundlage und `noindex` für Admin-, Entwickler- und Auth-Bereiche

**Nicht** umgesetzt wurden Web-Player, Plugin-Installation, Theme-Anwendung,
Einreichungs-Workflow, Rate-Limiting, Passwort-Reset, E-Mail-Verifizierung oder
eine produktive Datenbank. Diese Punkte werden nicht als fertig dargestellt.

---

## 2. Bestandsaufnahme und Architekturentscheidungen

### Geprüfter Ausgangsstand

- Next.js **16.4.3** (App Router, Cache Components und Partial Prefetching aktiv),
  React **19.3.0**, TypeScript 5, Tailwind CSS 4
- Prisma **8.0.0-rc.27**, `@prisma/orm-postgres` **8.0.0-rc.20**,
  contract-basiertes Modell in `prisma/contract.prisma`
- NextAuth.js **4.24.15**; die autoritative Session liegt in PostgreSQL
- PostgreSQL 18.4 lokal auf `127.0.0.1:5433` (Docker ist auf dem System nicht
  installiert)
- Rollen `USER`, `DEVELOPER`, `ADMIN`; serverseitige Prüfung in
  `src/lib/server-auth.ts`; Audit-Log in `auth-service.ts`
- vorhandene Seiten enthielten überwiegend statische Platzhalter, erfundene
  Kennzahlen (u. a. „< 50 ms“, „24/7“) und nicht existierende Ziele
  (`/discord`, `/forum`, `/privacy`, `/imprint`, `/auth/reset`,
  `/developer/plugins/new`)

Der Phase-3.5-Bericht wurde nicht ungeprüft übernommen. Die tatsächlichen
Routen, Komponenten, Datenmodelle und Prüfskripte wurden gelesen; der
Datenbankzugriff wurde über echte Integrationstests bestätigt.

### Wichtige Entscheidungen

1. **Vorhandene Architektur beibehalten.** Kein Wechsel von Prisma, NextAuth
   oder dem Route-Handler-Ansatz; keine neue NestJS-Anwendung.
2. **Keine Schemaänderung.** Plugin-/Theme-/Release-/News-/Roadmap-Felder
   reichten für die Anforderungen. Plattformen werden nicht erfunden, weil das
   Release-Modell kein Plattformfeld besitzt.
3. **Öffentliche Daten nur über eine Datenschicht.** `src/lib/catalog.ts`
   filtert serverseitig auf `isPublished = true` **und** `status = APPROVED`
   und liefert ausschließlich whitelisted DTOs.
4. **Server Components als Standard.** Client Components nur für mobile
   Navigation, Auth-Formulare und Error Boundary.
5. **Cache Components korrekt genutzt.** Kataloge streamen hinter
   `<Suspense>`; `searchParams` und `params` werden innerhalb der Boundaries
   gelesen. Detailseiten sind blockierende Routen, damit ein 404-Fall vor dem
   Streaming erkannt werden kann.
6. **404-Status über den Proxy.** Bei Cache Components hält ein spätes
   `notFound()` den Status 200. Der Proxy prüft deshalb den Slug vor dem
   Rendern und schreibt unbekannte oder nicht freigegebene Einträge auf `/404`
   mit Status 404 um. Das ist keine Autorisierungsschicht.
7. **Ehrliche Inhalte.** Es werden keine Beispiel-Plugins, Fantasie-Releases,
   Bewertungen, Partnerlogos oder Download-Statistiken erzeugt. Leere
   Datenbestände führen zu professionellen Empty States.

---

## 3. Neu erstellte und geänderte Dateien

### Neue Design- und Seitenkomponenten

- `src/components/public/Brand.tsx`
- `src/components/public/MobileMenu.tsx`
- `src/components/public/CatalogToolbar.tsx`
- `src/components/public/CatalogCard.tsx`
- `src/components/public/CatalogPagination.tsx`
- `src/components/public/CatalogDetail.tsx`
- `src/components/ui/button.tsx`, `badge.tsx`, `layout.tsx`, `states.tsx`, `icons.tsx`
- `src/app/icon.svg`

### Neue bzw. überarbeitete öffentliche Seiten

- `src/app/(public)/page.tsx` (Startseite)
- `src/app/(public)/plugins/page.tsx`, `plugins/[slug]/page.tsx`
- `src/app/(public)/themes/page.tsx`, `themes/[slug]/page.tsx`
- `src/app/(public)/releases/page.tsx`
- `src/app/(public)/docs/page.tsx`
- `src/app/(public)/news/page.tsx`, `news/[slug]/page.tsx`
- `src/app/(public)/roadmap/page.tsx`
- `src/app/(public)/404/page.tsx` (internes Ziel der Proxy-Rewrites)
- `src/app/(public)/layout.tsx`, `src/app/layout.tsx`, `src/app/globals.css`
- `src/app/robots.ts`, `src/app/sitemap.ts`

### Geänderte bestehende Komponenten

- `src/components/public/Header.tsx` (Server-Komponente, kein `usePathname` im Layout)
- `src/components/public/Footer.tsx` (nur echte Ziele, keine Rechts-Platzhalter)
- `src/app/(auth)/auth/login/page.tsx`, `register/page.tsx`, `(auth)/layout.tsx`
- `src/app/(admin)/admin/page.tsx`, `(admin)/layout.tsx`
- `src/app/(developer)/developer/page.tsx`, `(developer)/layout.tsx`
- `src/proxy.ts`

### Neue Datenschicht und API

- `src/lib/catalog.ts` — öffentliche Abfragen, DTOs, Release-/News-/Roadmap-Mapping
- `src/lib/catalog-query.ts` — Zod-Validierung, Pagination, Linkaufbau
- `src/lib/public-api.ts` — API-Antworten, Cache-Header, strikte Query-Prüfung
- `src/lib/site.ts` — Projektkonstanten, öffentliche Basis-URL, URL-Allowlist
- `src/lib/format.ts` — Datum, Dateigröße, SemVer-Kanal
- `src/app/api/plugins/route.ts`, `themes/route.ts`, `releases/route.ts`, `news/route.ts`

### Tests und Dokumentation

- `src/lib/__tests__/catalog-query.test.ts`
- `src/lib/__tests__/format.test.ts`
- `src/lib/__tests__/site.test.ts`
- `src/app/api/__tests__/public-api-routes.test.ts`
- `src/components/__tests__/public-ui.test.tsx`
- `src/lib/__tests__/db.integration.test.ts` (Abschnitt 8 ergänzt)
- `src/lib/__tests__/validations.test.ts` (Rollen-Stripping ergänzt)
- `src/types/jest-dom.d.ts`
- `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `.env.example`

### Nicht Teil dieser Phase

- keine Änderung an `prisma/contract.prisma` oder `migrations/`
- keine Änderung an Passwort-Hashing, Session-Erzeugung oder Rollenlogik
- keine Änderung am alten WebRadio-Projekt und keine Datenübernahme
- keine produktiven Zugangsdaten, keine Deployments

---

## 4. Datenbank- und API-Änderungen

### Datenbank

Es gab **keine Schema- oder Migrationsänderung**. Die vorhandenen Modelle
`Plugin`, `Theme`, `Release`, `Changelog`, `News` und `RoadmapItem` decken die
öffentlichen Inhalte ab.

Neu sind ausschließlich lesende Abfragen:

- Kataloge: `isPublished = true` + `status = APPROVED`, Suche über Name und
  Beschreibung, Sortierung nach Aktualität/Name/Downloads, Limit + Offset
- Detailabfragen: derselbe Freigabefilter, inklusive Versionen, Tags,
  Screenshots und Entwicklerprofil
- Releases: neueste zuerst, inklusive Changelogs
- News: `isPublished = true` und `publishedAt <= jetzt`
- Roadmap: Sortierung nach Priorität absteigend, dann Erstellungszeitpunkt
- Proxy: indizierte Existenzprüfung über `slug`, Veröffentlichungsflag und
  Freigabestatus

`npm run db:verify` bestätigte auf der Entwicklungsdatenbank:
„Database marker and schema match contract“.

### Öffentliche API

| Endpunkt | Verhalten |
|---|---|
| `GET /api/plugins` | `q`, `sort`, `page`; 9 Einträge/Seite; `data` + `pagination` |
| `GET /api/themes` | wie Plugins |
| `GET /api/releases` | max. 50 Einträge; Kanal aus SemVer; Download-URL allowlisted |
| `GET /api/news` | max. 50 veröffentlichte, datierte Einträge |

- ungültige Parameter → `400 {"error":"INVALID_QUERY", ...}`
- Datenbankfehler → generische `500`-Antwort ohne Treiberdetails
- Erfolg → `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300`
  und `X-Content-Type-Options: nosniff`
- Fehler → `Cache-Control: no-store`
- keine E-Mail-Adressen, Tokens, Audit-Logs, Review-Notizen oder Entwürfe
- Download-URLs werden nur als absolute HTTP(S)-URLs ohne eingebettete
  Zugangsdaten ausgegeben; unsichere Werte werden `null`

Ein neu unpublizierter Eintrag kann durch das Shared-Cache-Fenster für bis zu
etwa sechs Minuten (60 s fresh + 300 s stale) in einer CDN-Kopie verbleiben. Das ist dokumentiert und sollte bei Bedarf durch kürzere TTL oder
Cache-Tags ersetzt werden.

---

## 5. Sicherheits- und Berechtigungsprüfungen

### Ausgeführte Prüfungen

- **Veröffentlichungsfilter (echte DB):** freigegebene+veröffentlichte
  Plugins/Themes erscheinen; `isPublished=false`, `PENDING_REVIEW` und
  `REJECTED` erscheinen weder in Liste noch Detail.
- **News:** zukünftige und unveröffentlichte Beiträge werden ausgeblendet.
- **API-PII-Scan:** Antworten von `/api/plugins`, `/api/themes`,
  `/api/releases`, `/api/news` enthalten keine Treffer für `email`, `token`
  oder `audit`.
- **Öffentliche Detail-Routen:** unbekannte Slugs liefern HTTP `404`;
  nicht veröffentlichte Slugs ebenfalls.
- **Nicht angemeldet:** `/admin` und `/developer` → `307` zum Login;
  `/api/admin/audit-logs` und `/api/developer/status` → `401`.
- **Als USER angemeldet (echter HTTP-Login):** Admin- und Developer-API → `403`;
  `/admin` und `/developer` zeigen die serverseitige 403-Ansicht.
- **Registrierung:** `role: "ADMIN"` im Request wird vom Zod-Schema entfernt;
  die angelegte Rolle ist immer `USER` (Unit-Test + echter HTTP-Test).
- **CSRF:** Registrierung mit fremdem `Origin` → `403`; kein Datensatz angelegt.
- **Session-Cookie:** im HTTP-Test `HttpOnly` und `SameSite=Lax`; `Secure`
  wird erst unter HTTPS gesetzt und konnte lokal nicht geprüft werden.
- **Keine Berechtigung aus Client-Daten:** Rollen werden bei jedem geschützten
  Zugriff aus PostgreSQL gelesen; die Proxy-Prüfung ist ausdrücklich keine
  Autorisierung.
- **Keine Secrets:** `.env` bleibt ignoriert; `.env.example` enthält nur
  Platzhalter. Es wurden keine Tokens, Passwörter oder Verbindungszeichenfolgen
  in Dateien, Logs oder Antworten aufgenommen.

### Bewusst nicht geändert

Authentifizierung, Sessionmodell, RBAC und Audit-Log aus Phase 3.5 blieben
unverändert. Die einzigen Auth-nahen Änderungen sind UX/Redirect-Verbesserungen
im Login, die rollenabhängige Weiterleitung nach erfolgreicher Anmeldung und
die korrekte Verknüpfung von Formularlabels.

### Weiterhin offen

- Rate-Limiting für Login und Registrierung
- Passwort-Reset und E-Mail-Verifizierung
- Zwei-Faktor-Authentifizierung
- initialer ADMIN in der Entwicklungs-/Produktionsdatenbank
- Session-Cleanup ist opportunistisch, kein geplanter Job

---

## 6. Tatsächlich ausgeführte Tests und Ergebnisse

### Unit- und Komponententests

```text
npm test
Test Suites: 9 passed, 9 total
Tests:       80 passed, 80 total
```

Neu abgedeckt: Katalog-Query-Parsing und Pagination, Datums-/Dateigrößen-/
Kanalformatierung, sichere URLs und Basis-URL, API-Validierung/Cache/Fehler,
Katalogkarten, Pagination, Mobile-Menü (inklusive Escape), Empty-/Error-States
sowie Rollen-Stripping bei der Registrierung.

### Echte PostgreSQL-Integrationstests

```text
npm run test:integration
Test Suites: 1 passed, 1 total
Tests:       31 passed, 31 total
```

Abschnitt 8 kam neu hinzu und prüft gegen die echte Testdatenbank:

- nur `APPROVED` + `isPublished` in Liste und Detail
- Suche/Sortierung/Pagination ohne Duplikate
- Theme-Freigabefilter
- Releases inklusive Changelog und Download-URL
- zukünftige/unveröffentlichte News unsichtbar
- Roadmap-Sortierung nach Priorität

Die Testsuite bereinigt ihre Fixtures; die Testdatenbank bleibt leer zurück.
Der Guard akzeptiert ausschließlich Loopback-Hosts und Datenbanknamen mit
Endung `_test`.

### Contract und Datenbank

```text
npm run db:verify
✔ Database marker and schema match contract
```

### HTTP-End-to-End gegen den Produktions-Build

Mit temporären lokalen Fixtures (anschließend vollständig entfernt) geprüft:

- `/`, `/plugins`, `/themes`, `/releases`, `/docs`, `/news`, `/roadmap`,
  `/icon.svg`, `/robots.txt`, `/sitemap.xml` → `200`
- veröffentlichter Plugin-/Theme-/News-Slug → `200`, Inhalt aus der DB sichtbar
- Entwurf-Slug → `404`, nicht im HTML und nicht in `/api/plugins`
- API-Liste enthält Entwicklername, Version, Tags, aber keine E-Mail
- fremder `Origin` bei Registrierung → `403`
- nicht angemeldete geschützte Seiten/APIs → `307`/`401`
- angemeldeter USER auf Admin-/Developer-API → `403`
- ungültige API-Parameter → `400` mit sicherem Feldhinweis
- Homepage enthält keine der entfernten Fake-Marker (`< 50ms`, `24/7`,
  „MIT-Lizenz“, `/discord`, `/privacy`, `/imprint`)

Nach der Prüfung wurden alle Fixtures gelöscht; die Entwicklungsdatenbank
enthält wieder 0 Plugins, Themes, Releases, News und Roadmap-Einträge. Es
wurden keine Benutzerkonten dauerhaft angelegt.

### Nicht ausgeführt

- kein visueller Browser-/Screenshot-Test (die Anforderung verlangte keinen);
  UI wurde über DOM-/Komponententests und HTTP geprüft
- kein Test unter HTTPS (dadurch kein `Secure`-Cookie-Nachweis)
- kein Vercel-Deployment und kein Test gegen eine echte Produktionsdatenbank
- keine Messung von Core Web Vitals oder Lasttests
- Integrationstests laufen weiterhin nicht in GitHub Actions

---

## 7. Build-, Type-Check- und Lint-Ergebnisse

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| Contract-Generierung | `prisma contract emit` (im Build) | ✅ |
| Type-Check | `npm run type-check` | ✅ 0 Fehler |
| Lint | `npm run lint` | ✅ 0 Fehler, 0 Warnungen |
| Unit-/Komponententests | `npm test` | ✅ 80/80 |
| DB-Integrationstests | `npm run test:integration` | ✅ 31/31 |
| Datenbankschema | `npm run db:verify` | ✅ Marker + Schema passen |
| Produktions-Build | `npm run build` | ✅ 30 Routen, Proxy erkannt |

Der Build meldet beim Sammeln der Seitendaten Logzeilen der geschützten
API-Routen (`api:admin:audit-logs`, `api:developer:status`), weil diese ohne
Request keine Session auflösen können. Der Build bleibt erfolgreich; die
Routen antworten zur Laufzeit korrekt mit `401`.

---

## 8. Bekannte Einschränkungen und nicht ausgeführte Prüfungen

1. **Prisma 8 ist ein Release Candidate.** CLI und Runtime können sich ändern.
2. **Kein Rate-Limiting, kein Passwort-Reset, keine E-Mail-Verifizierung.**
3. **Kein initialer ADMIN** vorhanden; der CLI-Bootstrap bleibt erforderlich.
4. **Bestehende JWTs** aus der Zeit vor dem Datenbank-Sessionmodell können
   ungültig sein (einmal neu anmelden).
5. **Lokale PostgreSQL-Instanz ist keine Produktionsdatenbank.** Sie läuft auf
   `127.0.0.1:5433`; es gibt keine Verbindung zur alten Website.
6. **Docker-Compose ist unverifiziert**, weil Docker auf dem System fehlt.
7. **Integrationstests sind nicht in CI eingebunden.**
8. **Web-Player, Plugin-Installation und Theme-Anwendung fehlen.** Die Website
   beschreibt sie ausdrücklich als „in Entwicklung“.
9. **Kein Einreichungs-Workflow** für Plugins/Themes; die Dokumentation sagt das.
10. **Release-Modell enthält keine Plattformangaben und keine externe
    Release-URL.** Deshalb werden keine Betriebssysteme/Architekturen behauptet
    und es gibt keine separate Release-Detailseite; alle Release Notes stehen
    direkt auf `/releases`.
11. **Externe Screenshot-URLs** werden als lazy `<img>` mit
    `referrerPolicy="no-referrer"` geladen, nicht über den Next.js-Bildoptimierer.
    Das vermeidet datengesteuerte Remote-Host-Konfiguration, ist aber keine
    Bildoptimierung.
12. **Sitemap/Canonical nur mit `NEXT_PUBLIC_SITE_URL`.** Lokal ist die Sitemap
    leer (kein geratener Produktionshost).
13. **Shared-Cache-Fenster** der öffentlichen API (60 s fresh, 300 s stale).
14. **Proxy-Existenzprüfung** kostet eine zusätzliche indizierte DB-Abfrage pro
    Detailseite. Bei DB-Ausfall wird bewusst kein 404 erzeugt.
15. **Datenschutz und Impressum fehlen**; die Website kennzeichnet das und
    verlinkt keine leeren Rechtsseiten.
16. **Keine Lizenzdatei im Repository.** Die Texte behaupten keine MIT-Lizenz.
17. **Cookie-`Secure`-Flag** ist implementiert, aber lokal nur ohne HTTPS
    beobachtet.

---

## 9. Vercel-Vorbereitungsstatus

**Vorbereitet, nicht deployed oder gegen Vercel verifiziert.**

- `next build` und `next start` laufen erfolgreich; alle Routen werden korrekt
  erkannt.
- Erforderliche Produktionsvariablen: `DATABASE_URL`, `NEXTAUTH_SECRET`,
  `NEXTAUTH_URL`. Optional: `NEXT_PUBLIC_SITE_URL`.
- `NEXTAUTH_URL` muss die öffentliche HTTPS-Origin sein, damit
  `__Secure-`-Cookies und `Secure` korrekt greifen.
- Die Datenbank muss eine eigene, leere PostgreSQL-Datenbank sein. Die lokale
  Instanz auf `127.0.0.1:5433` ist ausdrücklich **keine** Produktionsdatenbank.
- Migrationen werden **nicht** automatisch beim Deployment ausgeführt. Der
  dokumentierte Prisma-8-Ablauf bleibt:
  `prisma contract emit` → `prisma db migrate` → `prisma db verify`.
  Eine Migration auf einer fremden/produktiven DB wurde nicht ausgeführt.
- `vercel.json` verweist auf benannte Umgebungsvariablen; es wurden keine
  Zugangsdaten ergänzt.
- Der Proxy läuft in der Node.js-Runtime und importiert den DB-Client für die
  404-Prüfung. Das funktioniert lokal; auf Vercel muss geprüft werden, ob
  Bundle-Größe und Cold-Start-Verhalten akzeptabel sind.
- Prisma 8 RC und Node.js 22+ sollten in der Vercel-Projektkonfiguration
  festgelegt und in einem Preview-Deployment getestet werden.
- Es wurden keine Preview-/Production-Deployments, Domainänderungen oder
  Datenbankmigrationen auf Vercel durchgeführt.

---

## 10. Empfohlene nächste Schritte für Phase 5

1. Rate-Limiting für Registrierung/Login und ein sicherer Passwort-Reset mit
   E-Mail-Verifizierung.
2. Integrationstests mit PostgreSQL-Service in GitHub Actions verdrahten.
3. ADMIN-Bootstrap in der Zielumgebung kontrolliert ausführen und dokumentieren.
4. Vercel-Preview mit separater Staging-Datenbank aufsetzen; Proxy-/Prisma-
   Kaltstart und Migrationen dort verifizieren.
5. Einreichungs- und Review-Workflow für Plugins/Themes implementieren, inklusive
   Audit-Log und serverseitiger Statusübergänge.
6. Release-Synchronisation mit einer verifizierten Quelle (GitHub Releases oder
   Upload-Pipeline), inklusive Signatur-/Prüfsummenprüfung und Plattformfeldern.
7. Cache-Tags für öffentliche Kataloge einführen, damit unpublizierte Inhalte
   sofort aus dem Shared Cache verschwinden.
8. Datenschutzerklärung, Impressum und ggf. eine Lizenzdatei ergänzen.
9. Accessibility-Audit mit Tastatur und Screenreader sowie visuelle Prüfung auf
   realen Geräten; dabei die mobile Navigation und Fokusreihenfolge testen.
10. Optional: Web-Player und Plugin-/Theme-Installation als getrennte,
    klar abgegrenzte Phase planen.
