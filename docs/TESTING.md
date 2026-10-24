# WebRadio Website — Testing

**Stand:** 2026-10-24 (GitHub-Integration)

Dieses Dokument beschreibt die **tatsächlich vorhandenen** Tests. Es gibt
bewusst keine erfundenen Coverage-Ziele oder nicht installierten E2E-Tools.

## 1. Teststufen

| Stufe | Werkzeug | Datenbank | Dateien |
|---|---|---|---|
| Unit / Component | Jest 30, React Testing Library | keine | `src/**/__tests__/*.test.ts(x)` |
| Echte Integration | Jest + PostgreSQL 18 | `_test`-Datenbank | `src/**/*.integration.test.ts` |
| HTTP-Smoke | `next start` + `curl` | lokale Dev-/Test-DB | manuell dokumentiert |
| E2E im Browser | **nicht vorhanden** | – | – |

`jest.config.mjs` schließt `*.integration.test.ts` aus dem normalen Lauf aus.
`jest.config.integration.mjs` führt ausschließlich diese Dateien aus.

## 2. Befehle

```bash
npm test                  # Unit- und Component-Tests, ohne DB
npm run test:integration  # echte PostgreSQL-Tests
npm run test:watch        # Unit-Tests im Watch-Modus
npm run test:coverage     # Coverage-Bericht (keine Schwelle erzwungen)
npm run type-check
npm run lint
npm run db:verify
npm run build
```

Zusätzlich dokumentiert `PHASE4_6_REPORT.md` einen lokalen HTTP-Smoke-Test:
Ein zunächst unveröffentlichter Plugin-Slug liefert 404 mit `no-store`; nach
dem Veröffentlichen liefert derselbe Slug 200 und erscheint in der API.

## 3. Schutz der Testdatenbank

`npm run test:integration` startet `scripts/run-integration-tests.mjs`:

- liest `TEST_DATABASE_URL` (Fallback nur, wenn `DATABASE_URL` bereits auf
  `_test` endet),
- akzeptiert ausschließlich Loopback-Hosts,
- verfordert einen Datenbanknamen mit Endung `_test`,
- setzt `NODE_ENV=test` und übergibt die URL als `DATABASE_URL`,
- `ensureTestDatabase()` prüft dieselben Regeln noch einmal im Testprozess.

Die Tests leeren die `_test`-Datenbank. Ein Lauf gegen `webradio_dev`, eine
Preview- oder Produktionsdatenbank wird vorher abgebrochen.

## 4. Abgedeckte Bereiche

### Unit / Component

- Passwort-Hashing und -Prüfung, Session-Token-Erzeugung und -Hashing
- Rollenhierarchie inklusive `SYSTEM_ADMIN`, Fehler-Sanitisierung,
  Same-Origin-Prüfung
- Rollen-Schemata: `SYSTEM_ADMIN` lesbar, aber nicht zuweisbar;
  Registrierung entfernt jede Rollenangabe
- Admin-Rollenroute: `SYSTEM_ADMIN` im Body → 400, Akteur kommt aus der
  Server-Session, fremde Origin → 403
- Zod-Schemata inklusive WebRadio-Produktgrenze
- Katalog-Suche, Sortierung, Pagination und URL-Aufbau
- öffentliche API-Routen: Validierung, `no-store`, generische Fehler,
  GitHub-Release-Antwort und `503` bei GitHub-Ausfall
- GitHub-Client (gemocktes `fetch`, keine Netzwerkzugriffe):
  Repository-Identität und Produktgrenze, stabile/beta/alpha-Kanäle,
  Draft-Filter, Asset-Whitelist und fremde Hosts, unvollständige Uploads,
  Rate-Limit-/Timeout-/Payload-Fehler, fünfminütiger Cache und maximal
  24 Stunden alter Stale-Fallback, README-Sanitisierung
- Release-Komponenten: keine Download-Schaltfläche ohne Asset, exakte
  GitHub-URL, Größe und Digest, Release Notes ohne HTML-Injektion
- Auth-Routen: 429-Weitergabe, generische Reset-Antwort, Tokenfehler
- NextAuth-Credentials-Guard: Konto-/IP-Bucket, Body bleibt lesbar
- Server-Auth: DB-Session statt JWT-Claim, Rollen aus der DB
- Proxy: unbekannter/unveröffentlichter Detail-Slug → 404 mit
  `no-store` auf Browser-, CDN- und Vercel-Ebene, kein Prerender-Header,
  `HEAD` ohne Body, DB-Ausfall ≠ 404, Veröffentlichung nach 404 → 200
- E-Mail: sichere `NEXTAUTH_URL`-Ableitung, lokale Outbox ohne Token-Log
- öffentliche UI: Inhalte, Links, leere Zustände, mobile Navigation

### Echte PostgreSQL-Integration

- Migration/Contract-Marker (`db verify` separat)
- Registrierung, normalisierte E-Mail, Unique-Constraint
- bcrypt-Hash, falsches/richtiges Passwort, unbekannte E-Mail
- Session-Erzeugung, Laden, Ablauf, Widerruf, Kaskade
- Rollen aus der DB, USER/DEVELOPER ohne Admin-Rechte
- privilegierte Rolle nur mit verifizierter E-Mail
- SYSTEM_ADMIN-CLI: verweigert ohne Bestätigungsphrase, legt das erste Konto
  an, befördert ein verifiziertes Konto, verweigert einen zweiten normalen
  Bootstrap, verlangt die Recovery-Bestätigung
- SYSTEM_ADMIN-Schutz: normaler ADMIN kann kein SYSTEM_ADMIN-Konto ändern,
  letzter SYSTEM_ADMIN nicht herabstufbar, reziproke parallele Änderungen
  hinterlassen nie null Systemadministratoren, `SYSTEM_ADMIN` ist nicht
  zuweisbar, Audit-Einträge vorhanden
- Audit-Log ohne Passwort/Hash/Token
- Veröffentlichungsfilter für Plugins, Themes, News
- Widerruf: Eintrag verschwindet aus Liste und Detail
- Produktgrenze: DB-Check lehnt ein anderes Produkt ab
- Legacy-`Release`/`Changelog`-Tabellen bleiben lesbar; die öffentliche
  Release-API und Release-Seite verwenden sie nicht mehr
- Rate-Limiting: Limit, atomare Parallelität, neues Zeitfenster,
  gehashter Schlüssel, Ablaufbereinigung
- Passwort-Reset: Hash-only-Token, Einmalverwendung, Session-Widerruf,
  neues Passwort, Audit
- E-Mail-Verifikation: Hash-only-Token, Einmalverwendung, Audit
- Abgelaufene Tokens werden abgelehnt

## 5. CI

`.github/workflows/ci.yml` enthält getrennte Jobs:

- Lint
- Type Check
- Unit Tests
- Integration (PostgreSQL-Service `postgres:18.4-alpine`, Contract-Emit,
  `db:migrate`, `db:verify`, `test:integration`)
- Build

Der Workflow läuft auf `main`, `master` und `develop` (Push und Pull Request),
hat `permissions: contents: read`, setzt `persist-credentials: false` beim
Checkout und verwendet ausschließlich Wegwerf-Testwerte. Der Integration-Job
nutzt eine leere Datenbank `webradio_ci_test` auf Loopback; der
Unit-Test-Job benötigt keine Datenbank. Der Build-Job verwendet eine nicht
erreichbare Platzhalter-`DATABASE_URL` und wurde lokal in dieser Form
ausgeführt.

Die vollständige Befehlskette wurde lokal auf einer frischen
PostgreSQL-Datenbank reproduziert. Zwei echte GitHub-Actions-Läufe zeigten
nacheinander einen unvollständigen npm-10-Lockfile (`40125408700`) und einen
Jest/ESM-Fehler unter Node 22 (`40128763959`). Beide Ursachen sind lokal
behoben: CI nutzt jetzt Node 24, der Lockfile ist mit npm 10.9.4 erzeugt, und
die komplette Kette wurde unter Node 24 in einer sauberen Kopie validiert. Ein
grüner Lauf des aktuellen Stands steht noch aus. Details stehen im
`PHASE4_7_REPORT.md`.

Die GitHub-Tests sind vollständig gemockt. Sie benötigen weder Netzwerk noch
GitHub-Zugangsdaten und schreiben nie in das Upstream-Repository. Ein echter
GitHub-Liveabruf ist kein Bestandteil der Testsuite; die Release-Seite wird
beim lokalen Build/Start gegen die öffentliche API geprüft.

## 6. Nicht vorhanden / offen

- Kein Playwright/Cypress-E2E-Lauf.
- Keine erzwungene Coverage-Schwelle; `test:coverage` liefert nur Zahlen.
- Kein automatischer Browser-Test des NextAuth-Cookie-Flows.
- Kein Last-/Performance-Test.
- Kein visueller Regressionstest.
- Keine erfolgreiche CI-Ausführung auf GitHub; die realen Läufe scheiterten
  an Lockfile bzw. Node-22-Jest/ESM. Der Node-24-Fix ist lokal verifiziert,
  aber noch nicht auf GitHub bestätigt.
