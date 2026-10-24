# WebRadio Website — Testing

**Stand:** 2026-10-24 (Phase 4.5)

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
- öffentliche API-Routen: Validierung, `no-store`, generische Fehler
- Auth-Routen: 429-Weitergabe, generische Reset-Antwort, Tokenfehler
- NextAuth-Credentials-Guard: Konto-/IP-Bucket, Body bleibt lesbar
- Server-Auth: DB-Session statt JWT-Claim, Rollen aus der DB
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

Der Integration-Job ist lokal mit derselben Befehlskette verifiziert. Eine
Ausführung auf GitHub Actions ist noch nicht erfolgt; das ist im
`PHASE4_5_REPORT.md` als nicht extern verifiziert vermerkt.

## 6. Nicht vorhanden / offen

- Kein Playwright/Cypress-E2E-Lauf.
- Keine erzwungene Coverage-Schwelle; `test:coverage` liefert nur Zahlen.
- Kein automatischer Browser-Test des NextAuth-Cookie-Flows.
- Kein Last-/Performance-Test.
- Kein visueller Regressionstest.
- Keine CI-Ausführung auf GitHub (nur lokale Reproduktion der Schritte).
