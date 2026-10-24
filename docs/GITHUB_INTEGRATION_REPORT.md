# GitHub-Integration — Release-Quelle und Projektinhalte

**Projekt:** WebRadio-Website (`F:\Dev\webradio-website`)
**Stand:** 2026-10-24
**Status:** lokal implementiert, getestet und per HTTP-Smoke geprüft;
**nicht deployt**, **nicht auf GitHub Actions ausgeführt**, **nicht gegen Vercel verifiziert**.

Dieser Bericht ergänzt `docs/PHASE4_6_REPORT.md`. Er beschreibt die Umstellung der
Website auf das reale öffentliche Projekt
[`YourEliteSystems/WebRadio`](https://github.com/YourEliteSystems/WebRadio).
Das Electron-Repository wurde ausschließlich lesend behandelt. Es gab keine
Schreibzugriffe, Commits, Issues oder Releases von dieser Website aus.

## 1. Zusammenfassung

Die Website präsentiert jetzt das tatsächliche WebRadio-Projekt statt
allgemeiner Platzhalter. Offizielle Releases, Release Notes, Download-Artefakte,
Repository-Metadaten, Lizenz und der README-Auszug kommen aus der öffentlichen
GitHub REST API. Die Website-Datenbank bleibt für Benutzer, Rollen, Plugins,
Themes, News, Roadmap, Audit-Logs und Moderation zuständig.

Wesentliche Ergebnisse:

- GitHub ist die alleinige Quelle für offizielle Releases und Downloads.
- Draft-Releases und fremde Assets werden serverseitig verworfen.
- Download-URLs werden nur aus validierten GitHub-Antworten übernommen; es gibt
  keine anhand von Dateinamen konstruierten Links.
- Das offizielle Tray-Icon des Repositories wird als Logo und Favicon verwendet.
- Die Startseite, Release-Seite, Dokumentationsseite, Navigation und Footer sind
  am realen Produkt ausgerichtet.
- Die bestehende WebRadio-Produktgrenze, Authentifizierung, Rollenprüfung und
  Cache-Sicherheit bleiben unverändert wirksam.
- Das frühere `Release`/`Changelog`-Modell bleibt aus Kompatibilitätsgründen im
  Contract, ist aber keine öffentliche Release-Quelle mehr.

## 2. Untersuchte GitHub-Quellen

Read-only geprüft am 2026-10-24:

| Quelle | Verwendung |
|---|---|
| `https://api.github.com/repos/YourEliteSystems/WebRadio` | Name, Beschreibung, Standardbranch, Topics, Lizenz, Homepage, `archived`, `pushed_at` |
| `https://api.github.com/repos/YourEliteSystems/WebRadio/releases` | veröffentlichte Releases, Kanäle, Notes, Assets, Größen, Digests |
| `https://api.github.com/repos/YourEliteSystems/WebRadio/readme` (`application/vnd.github.raw+json`) | gekürzter README-Text |
| `https://github.com/YourEliteSystems/WebRadio` | Repository- und Issue-Links |
| `https://github.com/YourEliteSystems/WebRadio/releases` | Release-Übersicht |
| `https://github.com/YourEliteSystems/WebRadio/releases/latest` | neuester stabiler Release |
| `https://github.com/YourEliteSystems/WebRadio/blob/main/assets/icons/tray.png` | offizielles Logo (Quelle) |

Beobachteter Datenstand (nur Momentaufnahme, keine dauerhaft festgeschriebene
Wahrheit):

- Repository: `YourEliteSystems/WebRadio`, nicht archiviert
- Lizenz: Apache License 2.0 (`Apache-2.0`)
- 17 öffentliche Releases in der abgerufenen Liste
- neueste stabile Version: `v1.0.6`
- neueste Beta: `v1.0.7-beta.2`
- neueste Alpha: `v1.0.7-alpha.5`
- Assets der Beta u. a. Windows-`.exe`, Linux-`.AppImage` und
  Arch-`.pkg.tar.zst`

Die Website speichert diese Werte nicht als feste Texte. Sie liest sie zur
Laufzeit und zeigt sie nur an, wenn GitHub sie tatsächlich liefert.

## 3. Übernommene Datenfelder und Darstellung

### Repository

- Anzeigename und Beschreibung
- Repository-URL und Issues-URL
- Lizenzname und SPDX-Kennung
- Topics (maximal 20, nur zur Anzeige)
- Hinweis auf Open Source und Apache-2.0

### Releases

- `tag_name`, Anzeigename, Veröffentlichungsdatum
- Kanal: `stable`, `beta` oder `alpha`
  - `prerelease === false` → stable
  - `prerelease === true` und Tag enthält `alpha` → alpha
  - sonst → beta
- Release Notes als reiner Text (kein ungeprüftes HTML)
- Assets mit Originalname, Größe, SHA-256-Digest und
  `browser_download_url`
- Getrennte Darstellung von neuester stabiler Version, neuester Beta und
  neuester Alpha
- Leerer Asset-Zustand: Hinweis und Link zur originalen GitHub-Release-Seite,
  **kein** erfundener Download-Button

### README

- Nur ein kurzer Plain-Text-Auszug (maximal 700 Zeichen).
- Badges, Bilder, HTML-Tags, Codeblöcke und Linkziele werden entfernt.
- Der Originaltext wird verlinkt, nicht als HTML gerendert.
- Ein README-Fehler bricht die Dokumentationsseite nicht.

### Logo

- Offizielles Tray-Icon aus `assets/icons/tray.png`, unverändert als PNG
  übernommen.
- Verwendung in Header/Hero und als App-Icon (`src/app/icon.png`).
- Herkunft und Lizenz sind in [ASSETS.md](ASSETS.md) dokumentiert.

## 4. Architektur und Datenmodell

### Serverseitige Zugriffsschicht

`src/lib/github.ts` kapselt alle GitHub-Zugriffe:

- feste Repository-Identität `YourEliteSystems/WebRadio`
- Zod-Validierung jeder Antwort
- Prüfung, dass `full_name` und `html_url` zum erwarteten Repository passen
- Ablehnung archivierter Repositories
- sechs Sekunden Timeout pro Anfrage
- maximal 40 Releases pro Abruf
- fünf Minuten In-Memory-Cache pro Serverinstanz
- maximal 24 Stunden alter öffentlicher Snapshot als ausdrücklich markierter
  Fallback
- keine Tokenausgabe an den Browser; `GITHUB_TOKEN` ist optional und wird nur
  serverseitig als `Authorization`-Header verwendet
- stabile Fehlercodes (`GITHUB_TIMEOUT`, `GITHUB_RATE_LIMITED`,
  `GITHUB_PRODUCT_MISMATCH`, …) ohne Antwortkörper oder Header im Log

Asset-Regeln:

- nur Assets mit `state === "uploaded"` (falls GitHub den Zustand liefert)
- nur `https://github.com/YourEliteSystems/WebRadio/releases/download/…`
- nur diese installierbaren Formate:
  `.exe`, `.AppImage`, `.pkg.tar.zst`, `.deb`, `.dmg`
- Update-Metadaten (`*.yml`, `*.blockmap`, Prüfsummen-Textdateien) werden nicht
  als Installationsdatei dargestellt
- Plattformbezeichnung wird aus dem tatsächlichen Dateinamen abgeleitet, nicht
  aus einer Wunschliste

### Website-Datenbank

Keine Schemaänderung und keine Migration in diesem Arbeitspaket.

- `Release` und `Changelog` bleiben im Prisma-Contract, damit bestehende
  Migrationen und Daten nicht zerstört werden.
- Die öffentliche Release-Seite und `/api/releases` lesen diese Tabellen nicht
  mehr.
- Plugins, Themes, News und Roadmap bleiben datenbankgestützt und behalten ihre
  Moderation und Produktgrenze (`Product.WEBRADIO`).
- GitHub kann die Plugin-/Theme-Moderation nicht beeinflussen oder umgehen.

### API

`GET /api/releases`:

- liest ausschließlich GitHub
- antwortet mit `Cache-Control: no-store`
- liefert `data`, `latest` (stable/beta/alpha), `repository` und
  `source: { provider: "github", fetchedAt, stale }`
- bei GitHub-Ausfall: HTTP `503` mit generischer Meldung, keine Ersatzdaten
- verwendet `io()` aus `next/cache`, damit der Build keine
  Netzwerkverbindung zu GitHub benötigt

## 5. Geänderte und neue Dateien

### Bereits im vorhandenen Commit `6e5a5e3` enthalten

Dieser Commit war beim Beginn der Nacharbeit bereits vorhanden; er wird hier
nur zur Vollständigkeit dokumentiert, nicht als in diesem Schritt erstellt
behauptet.

| Datei | Änderung |
|---|---|
| `src/lib/github.ts` | neue GitHub-Zugriffsschicht mit Validierung, Cache, Fallback, Asset-Filter |
| `src/lib/__tests__/github.test.ts` | 17 gemockte Tests für Metadaten, Releases, Drafts, Assets, Fehler, Cache, README |
| `src/components/public/ReleaseAssets.tsx` | Download-Karten nur aus validierten Assets; Leerzustand |
| `src/components/public/ReleaseNotes.tsx` | sichere Textdarstellung der Release Notes |
| `src/app/api/releases/route.ts` | Umstellung auf GitHub, `no-store`, `503` bei Ausfall |
| `src/app/(public)/page.tsx` | Startseite mit realem Logo, Projektaussage, Release-Vorschau und echten Download-Shortcuts |
| `src/app/(public)/releases/page.tsx` | Stable/Beta/Alpha, Release Notes, Assets, Quellenhinweis |
| `src/app/(public)/docs/page.tsx` | Projekt-, API- und GitHub-Dokumentation inkl. README-Auszug |
| `src/app/(public)/plugins/page.tsx`, `themes/page.tsx` | Produkttexte und Links an WebRadio ausgerichtet |
| `src/app/(public)/news/page.tsx`, `(developer)/*` | Branding/Texte konsistent |
| `src/components/public/Brand.tsx`, `Header.tsx`, `Footer.tsx`, `MobileMenu.tsx` | Logo, echte Projektlinks, GitHub-/Release-Ziele |
| `src/lib/site.ts` | zentrale Projekt-, Repository-, Release- und Dokumentations-URLs |
| `src/app/layout.tsx` | Metadaten, App-Icon |
| `src/lib/format.ts` | Dateigrößen- und Datumsformatierung |
| `public/brand/webradio-logo.png` | offizielles Projektlogo |
| `src/app/api/__tests__/public-api-routes.test.ts` | Release-API-Tests an GitHub-Antworten angepasst |

### Zusätzlich in diesem Arbeitsschritt (uncommitted)

| Datei | Änderung |
|---|---|
| `src/app/icon.png` | App-Icon aus dem offiziellen Logo |
| `src/app/favicon.ico` | Favicon (32/48/256 px) aus dem offiziellen Logo; ersetzt das Create-Next-App-Standardicon |
| `src/app/icon.svg` | entfernt (veraltetes Platzhalter-Icon) |
| `src/app/layout.tsx` | Icon-/Metadaten-Anpassung |
| `src/app/(public)/releases/page.tsx` | letzte Text- und Darstellungsanpassung |
| `src/app/(public)/__tests__/releases-page.test.tsx` | Seitentests für Kanäle, Assets, Leer- und Fehlerzustand |
| `src/components/__tests__/release-assets.test.tsx` | Tests für echte Assets und fehlende Assets |
| `public/brand/webradio-logo.png` | Logo (Byte-Gleichheit mit Tray-Icon) |
| `docs/ASSETS.md` | Herkunft, Lizenz und Verwendung der Grafik |
| `README.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md` | Dokumentation der GitHub-Quelle |
| `.env.example` | `GITHUB_TOKEN` als optionale, serverseitige Variable |

**Git-Status am Ende:** Die genannten uncommitted Änderungen wurden nicht
committet. Es gab in diesem Arbeitsschritt keinen Push und kein Deployment.

## 6. Cache- und Fehlerverhalten

| Situation | Verhalten |
|---|---|
| GitHub erfolgreich | Daten werden maximal fünf Minuten pro Instanz gehalten |
| GitHub liefert gültige, ältere Daten | Fallback bis 24 Stunden, `source.stale = true` und sichtbarer Hinweis |
| GitHub-Timeout | `GITHUB_TIMEOUT`; ohne Fallback HTTP `503` |
| GitHub 404 | `GITHUB_NOT_FOUND`; keine erfundenen Daten |
| Rate-Limit (429/403 mit Rest 0) | `GITHUB_RATE_LIMITED`, `Retry-After` wird intern beachtet |
| Ungültiges JSON/Schema | `GITHUB_INVALID_RESPONSE`; kein Teilresultat |
| Fremdes Repository oder archiviert | `GITHUB_PRODUCT_MISMATCH`; Abbruch |
| Draft-Release | wird vor der Ausgabe verworfen |
| Asset von fremdem Host/Pfad | wird verworfen |
| GitHub-Ausfall bei Seite | Fehler- oder Leerzustand; Seite bleibt bedienbar |
| CDN | Release-API und öffentliche Seiten weiterhin `no-store`; negatives 404-Caching bleibt durch die Phase-4.6-Maßnahmen adressiert |

Der GitHub-Cache enthält ausschließlich öffentliche Projektdaten. Er enthält
keine Benutzer-, Session- oder Moderationsdaten. Ein GitHub-Fehler kann daher
keine Website-internen Daten offenlegen.

## 7. Tests und tatsächliche Ergebnisse

Ausgeführt am 2026-10-24 in `F:\Dev\webradio-website`:

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| Unit-/Component-Tests | `npm test` | **134/134 bestanden**, 16 Suiten |
| PostgreSQL-Integration | `npm run test:integration` | **54/54 bestanden**, 1 Suite |
| Type-Check | `npm run type-check` | bestanden, keine Fehler |
| Lint | `npm run lint` | bestanden, keine Fehler |
| Contract/DB-Verifikation | `npm run db:verify` | bestanden |
| Produktions-Build | `npm run build` | bestanden, 38 Seiten generiert |
| HTTP-Smoke | `next start` auf `127.0.0.1:3100` | Startseite, `/releases`, `/docs`, `/plugins`, `/themes`, `/icon.png` → 200 |
| Favicon | `GET /favicon.ico` | 200, `image/x-icon`, byte-gleich mit `src/app/favicon.ico` |
| Release-API live | `GET /api/releases` | 200, 17 echte Releases, `Cache-Control: no-store` |
| 404 ohne Cache | unbekannter Detail-Slug | 404 mit `no-store` |
| Externe Projektlinks | 17 Ziele (GitHub, Read the Docs, Website-Repo) | alle HTTP 200 |
| GitHub-Tests | Teil von `npm test` | ausschließlich gemocktes `fetch`; kein Schreibzugriff |

Die 17 GitHub-Tests decken ab:

- erfolgreiche Repository-Metadaten
- Ablehnung eines fremden oder archivierten Repositories
- Trennung von stable/beta/alpha und echte Assets
- Drafts werden nie ausgegeben
- fremde Asset-Hosts und unvollständige Uploads werden verworfen
- Release-URL mit falschem Tag wird verworfen
- leere Release-Liste
- Rate-Limit, Timeout, ungültige Antwort
- Cache-Treffer, begrenzter Stale-Fallback, Ablauf nach 24 Stunden
- README-Bereinigung und Rohabruf

**Wichtig:** Die Tests verwenden keine echten GitHub-Zugangsdaten und schreiben
nicht in das Upstream-Repository. Der Live-Abruf wurde nur lesend im lokalen
HTTP-Smoke-Test ausgeführt.

## 8. Abnahme gegen die Anforderungen

| Anforderung | Status |
|---|---|
| Website präsentiert das reale WebRadio-Projekt | umgesetzt |
| Offizielle Releases aus GitHub | umgesetzt und live gelesen |
| Drafts nicht öffentlich | umgesetzt und getestet |
| Nur echte Assets/Download-URLs | umgesetzt und getestet |
| Keine erfundenen Versionen/Plattformen | umgesetzt; fehlende Assets erzeugen Leerzustand |
| Stable und Beta getrennt | umgesetzt und getestet |
| README als Referenz, sicher gerendert | umgesetzt (Plain-Text-Auszug) |
| GitHub-Token serverseitig | umgesetzt; optional, nie im Client |
| Fehler/Timeout/Rate-Limit | umgesetzt und getestet |
| Cache-Fallback ohne vertrauliche Daten | umgesetzt und getestet |
| Produktgrenze WebRadio serverseitig | unverändert wirksam; GitHub kann sie nicht umgehen |
| Plugin-/Theme-Moderation unabhängig | unverändert datenbankgestützt |
| Bestehende Tests nicht abgeschwächt | alle bestehenden Tests erhalten; 134 statt zuvor 80 Unit-Tests |
| Keine Secrets eingecheckt | `.env` ignoriert; nur Variablennamen dokumentiert |
| Altes Electron-Projekt unverändert | keine Schreibzugriffe |
| Kein Deployment/Commit/Push in diesem Schritt | eingehalten |

## 9. Offene Punkte und externe Voraussetzungen

1. **CI auf GitHub:** Der Workflow ist lokal reproduziert, aber in diesem
   Arbeitsschritt nicht auf GitHub Actions ausgeführt. Das bleibt „nicht extern
   verifiziert“.
2. **Vercel:** Kein Deployment. Next.js 16.4.3, Prisma 8 RC und die
   PostgreSQL-Verbindung unter Serverless-Bedingungen sind weiterhin nicht
   gegen Vercel geprüft.
3. **GitHub Rate-Limits ohne Token:** 60 Anfragen/Stunde und IP. Der
   Fünf-Minuten-Cache reduziert Last, ersetzt aber keinen Produktions-Token.
   `GITHUB_TOKEN` ist optional vorbereitet und muss bei Bedarf in Vercel als
   serverseitiges Secret gesetzt werden.
4. **GitHub-Liveabhängigkeit:** Bei einem längeren Ausfall ohne frischen
   Snapshot zeigt die Release-Seite einen Fehlerzustand. Das ist beabsichtigt;
   es werden keine Ersatzversionen erfunden.
5. **Rechtliches:** Datenschutz, Impressum und Lizenztexte sind weiterhin offen.
   Die GitHub-Integration verarbeitet öffentliche Daten, aber Server-Logs und
   ein möglicher GitHub-Token müssen in der Datenschutzerklärung bzw. im
   Betriebskonzept berücksichtigt werden.
6. **SMTP:** E-Mail-Verifizierung und Passwort-Reset bleiben ohne echte
   SMTP-Konfiguration nicht zustellbar; lokal wird nur die Outbox verwendet.
7. **Lizenz der Website-Assets:** Das Tray-Icon stammt aus dem
   Apache-2.0-Projekt. Eine separate Marken-/Logo-Freigabe für die Website wurde
   nicht geprüft; das ist vor einem öffentlichen Launch zu klären.
8. **Release-Modell:** Die alten Tabellen bleiben absichtlich bestehen. Eine
   spätere Entfernung wäre eine eigene, migrationssichere Aufgabe.

## 10. Empfohlene nächste Schritte

1. GitHub-Actions-Workflow auf einem Branch tatsächlich ausführen und
   Ergebnisse im Report ergänzen.
2. Vercel-Preview mit eigener Testdatenbank deployen, GitHub-API und
   `GITHUB_TOKEN`-Secret prüfen, Cookies/Auth unter HTTPS testen.
3. Entscheidung über die dauerhafte Behandlung des Legacy-`Release`-Modells
   (behalten, als „legacy“ markieren oder in einer separaten Migration
   entfernen).
4. Datenschutz, Impressum und Logo-/Markenfreigabe vor Launch klären.
5. Optional: GitHub-API-Antworten mit ETag/`If-None-Match` ergänzen, um das
   Rate-Limit-Budget weiter zu schonen.
