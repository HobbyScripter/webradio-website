# WebRadio – Phase 1.3.1: Korrekturen nach dem finalen PR-Audit

**Datum:** 2026-11-18  
**Repository:** HobbyScripter/webradio-website  
**Branch:** `feature/analytics-vercel-schedules`  
**PR:** [#3](https://github.com/HobbyScripter/webradio-website/pull/3) → Basis `master`  
**Status:** Korrekturen umgesetzt, lokal geprüft, Commit lokal amendiert – **kein Push, kein Merge, kein Deploy**

---

## Zusammenfassung

Die im Audit (`docs/PHASE_1.3_FINAL_PR_AUDIT.md`) gefundenen Befunde wurden abgearbeitet:

| Befund | Kurzfassung | Status |
| --- | --- | --- |
| B1 | Fremde Playwright-Abhängigkeit im PR | **behoben** |
| B4 | Retention-Fehler im Admin-Lauf unsichtbar | **behoben** |
| B5 | Veralteter Cron-Docstring und toter `CRON_SECRET`-Pfad | **behoben** |
| B3/B7 | Release-Job mit 4 DB-Roundtrips pro Asset | **entschärft** (2 Reads insgesamt statt 2 pro Asset; Laufzeit dokumentiert) |
| B8 | Route-Test mockte das SDK | **behoben** (zusätzlicher Test mit echtem SDK) |
| B6 | Lockfile-Churn bei Prisma | **geprüft, verbleibt** (npm-Auflösung, nicht handgepflegt) |
| B11 | Zwei Locking-Mechanismen | **geprüft, unverändert** (bewusst) |
| B2 | Rote „Unit Tests“-CI | **nicht behoben** (vorbestehend auf `master`, außerhalb des Scopes) |
| B9/B10 | Schedules-Beta, Jitter/Grenzen | **dokumentiert** |

---

## 1. Änderungsumfang dieser Phase

| Datei | ± | Inhalt |
| --- | --- | --- |
| `package.json` | +1 / −0 | nur noch `@vercel/schedules`; `@playwright/test` entfernt |
| `package-lock.json` | +185 / −59 | konsistent neu erzeugt, ohne Playwright |
| `src/lib/analytics/sync.ts` | Retention-Fehler setzt `errorCode: 'RETENTION_FAILED'` und `ok: false` |
| `src/lib/analytics/schedules.ts` | Schedule-Ergebnis übernimmt `summary.errorCode` vor dem Job-Fallback |
| `src/app/api/admin/analytics/sync/route.ts` | Docstring aktualisiert, `CRON_SECRET`-Pfad entfernt, nur Admin-Session |
| `src/lib/download-analytics-service.ts` | Release-Sync lädt Assets und Tages-Snapshots einmalig vorab |
| `src/app/api/__tests__/analytics-sync-route.test.ts` | Tests auf Admin-only umgestellt, `CRON_SECRET` wird ignoriert |
| `src/lib/__tests__/analytics-sync.test.ts` | Retention-Fehler wird als Fehlschlag geprüft, Erfolgsfall ergänzt |
| `src/lib/__tests__/analytics-schedules.test.ts` | Summary-Fixture um `errorCode` ergänzt |
| `src/app/api/__tests__/analytics-schedule-sdk.test.ts` | **neu**: echter `handleSchedule`-Wrapper (200 / Throw / 400) |
| `docs/ANALYTICS.md` | Auth, Retention-Semantik, Zeitplan und Troubleshooting aktualisiert |

Gesamtdiff gegen `master` nach den Korrekturen: **13 geänderte/neue Dateien** (siehe Abschnitt 6).

---

## 2. Befunde im Detail

### B1 – Playwright-Abhängigkeit entfernt

**Ursprüngliches Problem:** `package.json` enthielt `@playwright/test@^1.65.1` und das Lockfile drei Playwright-Pakete – Übernahme aus der parallelen E2E-Arbeit ohne die zugehörigen Quelldateien.

**Durchgeführte Änderung:**
- `@playwright/test` aus `devDependencies` entfernt. Auf `master` ist die Abhängigkeit nicht vorhanden; sie war ausschließlich durch die fremde E2E-Arbeit hinzugekommen.
- Lockfile mit `npm install --package-lock-only` (npm 12.0.2, `lockfileVersion` 3) neu erzeugt.
- Ergebnis: keine `node_modules/playwright*`-Einträge mehr; die verbleibenden vier `playwright`-Treffer im Lockfile sind ausschließlich **Peer-Deklarationen fremder Pakete** (`@vitest/browser-playwright`, optionale Peer-Angaben), keine Installation.
- Neu hinzugekommen sind nur die 16 Pakete des `@vercel/schedules`-Baums (`@vercel/cli-config`, `@vercel/cli-exec`, `@vercel/oidc`, `os-paths`, `xdg-*` usw.).
- `npm ci` läuft mit dem neuen Lockfile Exit 0; `node_modules/@playwright` ist danach nicht vorhanden.

**Betroffene Dateien:** `package.json`, `package-lock.json`

**Testergebnis:** `npm ci` Exit 0; `package.json`-Diff enthält nur `@vercel/schedules`.

**Verbleibendes Risiko / Nebenwirkung:** Die fremde, untracked E2E-Arbeit (`e2e/`, `playwright.config.ts`) typisiert lokal nicht mehr – `npx tsc --noEmit` meldet dort fehlende `@playwright/test`-Typen. Das ist erwartbar: diese Dateien sind nicht Teil des Branches und benötigen ihre Abhängigkeit in ihrem eigenen PR. Für die Prüfung dieses Branches wurde ein temporäres `tsconfig.audit.json` mit `exclude: ["e2e", "playwright.config.ts"]` verwendet (danach gelöscht); gleiches Vorgehen beim `vercel build` (Dateien kurzzeitig beiseitegelegt und wiederhergestellt).

### B4 – Retention-Fehler ist kein Erfolg mehr

**Ursprüngliches Problem:** `runAnalyticsSync` fing Fehler von `cleanupAnalyticsRetention()` ab, setzte `retention = null` und meldete weiterhin `ok: true`. Ein manueller Admin-Lauf zeigte damit Erfolg, obwohl der Cleanup ausgefallen war.

**Durchgeführte Änderung:**
- `AnalyticsSyncSummary` erhält `errorCode: 'RETENTION_FAILED' | null`.
- Im `catch` wird `retentionError = 'RETENTION_FAILED'` gesetzt; `ok = jobsOk && retentionError === null`.
- Der Standard `includeRetention: true` bleibt unverändert – der Admin-Lauf führt die Retention weiterhin aus.
- `runAnalyticsSchedule` übernimmt `summary.errorCode` vor dem bisherigen Job-Fallback, sodass ein Retention-Fehler auch im Schedule-Ergebnis korrekt benannt wird.
- Der dedizierte Schedule `analytics-retention` nutzt unverändert `runAnalyticsRetention()` und meldet `RETENTION_FAILED` (Test bleibt bestehen).

**Betroffene Dateien:** `src/lib/analytics/sync.ts`, `src/lib/analytics/schedules.ts`, Tests

**Testergebnis:** Neuer/angepasster Test „reports a failed retention cleanup as a failed run“ prüft `ok: false`, `errorCode: 'RETENTION_FAILED'`, `retention: null`; zusätzlicher Test „clears the retention error code when the cleanup succeeds“ prüft den Erfolgsfall. Beide grün.

**Verbleibendes Risiko:** Der Admin-Endpunkt antwortet weiterhin mit HTTP 200 und transportiert den Fehler im Body (`ok: false`, `errorCode`). Eine Statuscode-Änderung hätte den bestehenden API-Vertrag gebrochen; das ist bewusst nicht erfolgt.

### B5 – Cron-Referenz und `CRON_SECRET`-Pfad entfernt

**Ursprüngliches Problem:** Der Docstring der Admin-Route verwies auf einen Vercel-Cron, den es nicht mehr gibt; der `CRON_SECRET`-Bearer-Zweig war ein toter, aber aktiver Auth-Pfad.

**Durchgeführte Änderung:**
- Docstring beschreibt jetzt den tatsächlichen Zweck: manueller, admin-only Lauf für die Wiederherstellung; geplante Läufe nutzen die privaten Schedules.
- `CRON_SECRET`-Zweig aus `isAuthorized` entfernt; `isAuthorized()` prüft ausschließlich die Session und `hasRole(..., 'ADMIN')`.
- `GET`/`POST` benötigen keinen Request-Parameter mehr (keine ungenutzten Variablen, keine Lint-Warnungen).
- **Keine Schwächung:** Die Prüfung ist strikt enger als vorher (vorher: Secret **oder** Admin). Alle Nicht-Admin-Zugriffe erhalten weiterhin `401`.
- `CRON_SECRET` bleibt für den Download-Sync (`src/app/api/admin/downloads/sync/route.ts`) in Gebrauch und wurde dort nicht angefasst.
- `docs/ANALYTICS.md` beschreibt Auth, Retention-Semantik, den neuen Schedule-Zeitplan und das Troubleshooting entsprechend.

**Betroffene Dateien:** `src/app/api/admin/analytics/sync/route.ts`, `src/app/api/__tests__/analytics-sync-route.test.ts`, `docs/ANALYTICS.md`

**Testergebnis:** Tests prüfen: unauthentifiziert → `401` (auch bei gesetztem `CRON_SECRET`), Admin-Session auf `GET` und `POST` → `200`, Nicht-Admin → `401`, `runAnalyticsSync` wird nur bei Admin aufgerufen. Grün.

**Verbleibendes Risiko:** Externe Aufrufer, die den Endpunkt bisher mit `CRON_SECRET` bedienten, erhalten jetzt `401`. Das ist beabsichtigt; der bisherige einzige Aufrufer (Vercel Cron) existiert nicht mehr.

### B3/B7 – Release-Laufzeit und sequentielle Roundtrips

**Ursprüngliches Problem:** Der Release-Sync machte pro Asset vier Datenbankabfragen (`GitHubReleaseAsset.first`, Update/Create, `GitHubDownloadSnapshot.first`, Update/Create) – bei bis zu 100 Releases mit mehreren Assets ein linear wachsender Anteil der 300-s-Grenze auf Hobby.

**Analyse:** Die Writes sind einzeln idempotent (Update vorhandener Zeilen, Create sonst) und werden durch das `DownloadSyncLog`-Lock serialisiert. Die beiden `first`-Abfragen sind reine Vorabprüfungen und können gefahrlos durch einen einmaligen Lesevorgang ersetzt werden.

**Durchgeführte Änderung (bewusst minimal):**
- Zwei Vorababfragen vor der Schleife: alle `GitHubReleaseAsset`-Zeilen und alle `GitHubDownloadSnapshot`-Zeilen des heutigen Tages.
- In-Memory-Lookups per `Map` (`githubAssetId` als String-Schlüssel, `assetId` für Snapshots); neu erzeugte Zeilen werden sofort in die Map eingetragen, damit ein doppelt gelistetes Asset weiterhin aktualisiert statt erneut angelegt wird.
- **Keine Parallelisierung**, keine Transaktion, keine Änderung an Lock, Reihenfolge oder Idempotenz: Die Schreibvorgänge bleiben sequenziell und in derselben Form.

**Wirkung:** Statt `4N` Abfragen (`N` = Assets) jetzt `2 + 2N`: die beiden Lesezugriffe pro Asset entfallen vollständig.

**Dokumentierte Laufzeit (Schätzung, keine Messung):**

```
T ≈ T_fetch (≤ 10 s) + 2·N·R + T_overhead
N = Anzahl Assets (≤ 100 Releases pro Seite, Assets je Release)
R = Roundtrip-Zeit einer gepoolten DB-Abfrage
```

Bei einem für dieses Repository plausiblen Bereich von 30–160 Assets und konservativ 60 ms pro Roundtrip ergibt sich ein Datenbankanteil von rund 4–19 s zusätzlich zum GitHub-Abruf und Kaltstart – deutlich innerhalb der 300-s-Grenze. Das ist eine **Annahme mit Formel**, kein gemessenes Versprechen; der erste produktive Lauf liefert `durationMs` im Log und muss zur Bestätigung herangezogen werden.

**Betroffene Dateien:** `src/lib/download-analytics-service.ts`

**Testergebnis:** Bestehende Download-Analytics-Suiten grün (`download-analytics.test.ts`, `download-analytics-page.test.tsx`, 6 Tests). Der `vercel build` kompiliert den geänderten Serverpfad.

**Verbleibendes Risiko:**
- `GitHubReleaseAsset.all()` lädt die gesamte Asset-Tabelle pro Lauf. Bei diesem Repository ist sie durch die GitHub-Releases begrenzt; bei starkem Wachstum wäre Pagination nötig.
- Die Laufzeit ist weiterhin nicht gemessen. Bei sehr vielen Assets bleibt die 300-s-Grenze theoretisch erreichbar; ein eigener Timeout-Wächter existiert nicht.
- Zwischen Vorababfrage und Schreibvorgang kann ein paralleler, nicht durch das Lock abgedeckter Schreibzugriff (z. B. `trackWebsiteDownload`) neue Snapshots anlegen; im schlimmsten Fall entsteht ein doppelter Snapshot-Versuch, der am Unique-Key scheitern würde. Das Lock und die Unique-Keys bleiben unverändert, das Fenster ist klein.

### B6 – Prisma-Lockfile-Churn

**Ursprüngliches Problem:** Das Lockfile entfernte zwei `@prisma/composer`-Nested-Pakete (`@types/node`, `undici-types`).

**Durchgeführte Änderung:** Keine. Nach der Neuerzeugung mit npm 12 bleiben die beiden Einträge entfernt; sie sind ein Ergebnis der npm-Auflösung aus `package.json` + bestehendem Lock, kein manueller Eingriff. Ein Zurückpatchen per Hand wäre riskanter als der Churn.

**Prüfung:** `npm ci` Exit 0, `vercel build` Exit 0 (inkl. Prisma-Dependency-Emit im Prebuild), Typecheck Exit 0. Die betroffenen Pakete sind reine Typ-Pakete unter einem Build-Tool-Paket, nicht Teil des Function-Bundles.

**Verbleibendes Risiko:** minimal; die Abweichung ist im Diff sichtbar und sollte beim Review bewusst zur Kenntnis genommen werden.

### B8 – SDK-Verhalten jetzt getestet

**Ursprüngliches Problem:** Der Route-Test ersetzte `handleSchedule` durch eine Identitätsfunktion; das reale SDK-Verhalten (Header-Parsing, 400, Fehlerpropagation) war ungetestet.

**Durchgeführte Änderung:** Neuer Test `analytics-schedule-sdk.test.ts` ohne SDK-Mock. Er baut einen echten `Request` mit den CloudEvent-Headern (`ce-specversion`, `ce-type`, `ce-id`, `ce-vssschedulename`, …) und prüft:
- Erfolg → `200`, Handler wird mit `analytics-traffic`/`exec-1` aufgerufen,
- Fehler → die Route wirft (Next.js erzeugt daraus `500`),
- unvollständige Header → `400` und kein Job-Aufruf.

**Betroffene Dateien:** `src/app/api/__tests__/analytics-schedule-sdk.test.ts` (neu)

**Testergebnis:** 3 zusätzliche Tests grün; fokussierte Suiten jetzt 4 Suiten / 23 Tests.

**Verbleibendes Risiko:** Der `500`-Status entsteht durch Next.js, nicht durch das SDK; das ist im Test als „throw“ abgebildet und im Bericht dokumentiert.

### B11 – Zwei Locking-Mechanismen (unverändert)

**Befund:** `AnalyticsSyncRun` (Orchestrator) und `DownloadSyncLog` (Release-Sync) sperren unabhängig. Ein überlappender manueller Lauf kann `ALREADY_RUNNING` erzeugen, was als nicht-retrybarer Fehler zu `ok: false` und einer roten Execution führt.

**Entscheidung:** Keine Änderung. Eine Zusammenführung der Locks wäre ein Umbau außerhalb des Phase-1.3-Umfangs und würde das Verhalten des bestehenden Download-Syncs verändern.

**Verbleibendes Risiko:** Ein seltener, aber korrekt als Fehler gemeldeter Lauf bei bewusst überlappenden manuellen Aufrufen. Dokumentiert.

### B2, B9, B10 – unverändert bzw. dokumentiert

- **B2:** Die roten „Unit Tests“ sind vorbestehend (`master` ebenfalls rot, `temporal-polyfill@1.0.6` ESM-only plus Prisma-Contract-Hydration unter Node 26). Es wurden **keine** Kaschierungen vorgenommen: kein `transformIgnorePatterns` in `jest.config.mjs`, keine Test-Ausschlüsse, keine `skip`-Marker. Die fokussierten Suiten wurden wie zuvor mit einer CLI-Transform-Ausnahme ausgeführt, die nichts im Repository verändert.
- **B9:** Schedules bleiben Beta-Funktion; die Vercel-Preview des Branches war erfolgreich. Vor dem Merge sollte die Freigabe für das Team bestätigt werden.
- **B10:** Kein `jitter` gesetzt – auf Hobby korrekt (immer 15 Minuten, Abstände 30 Minuten). `maxDuration` bleibt nicht gesetzt; der Hobby-Default von 300 s gilt. Eine explizite Angabe ist weiterhin empfohlen, aber nicht Teil dieser Korrektur.

---

## 3. Laufzeit-/Limit-Einordnung

| Schedule | Worst Case (Requests) | Einordnung |
| --- | --- | --- |
| `analytics-traffic` | 4 × 8 s pro Versuch, max. 3 Versuche ≈ 100 s inkl. DB | innerhalb 300 s |
| `analytics-repo-stats` | 6 × 8 s pro Versuch, max. 3 Versuche ≈ 150 s inkl. DB | innerhalb 300 s, knapp bei sehr langsamer DB |
| `analytics-releases` | ≤ 10 s Fetch + 2 + 2N Abfragen | siehe Schätzung oben |
| `analytics-retention` | nur DB-Deletes | unkritisch |

Hobby-Grenzen (Vercel-Dokumentation, Stand 2026-11): 300 s Default und Maximum pro Function, 100 statische Schedules pro Deployment, 1.000 Schedules pro Team, 5.000 Ausführungen pro Abrechnungszeitraum, Jitter immer 15 Minuten.

---

## 4. Tests

| Prüfung | Ergebnis |
| --- | --- |
| `npm ci` (npm 12.0.2, Node v26.8.2) | **Exit 0**, `@playwright` nicht installiert |
| `npx tsc --noEmit` | Exit 0 – mit temporärem `tsconfig.audit.json`, das die fremden `e2e/`-Dateien ausschließt; Datei danach gelöscht |
| ESLint (Analytics, Download-Service, beide Routen, 5 Testdateien) | Exit 0, keine Warnungen |
| Jest fokussiert: `analytics-sync`, `analytics-schedules`, `analytics-schedule-route`, `analytics-schedule-sdk` | **4 Suiten / 23 Tests grün** |
| Jest `download-analytics` (Release-Prefetch betroffen) | 2 Suiten / 6 Tests grün |
| `npx vercel build` | **Exit 0**, Function `api/schedules/analytics.func`, `schedule/v1beta`, vier Schedules, `crons: []` |
| Volle `npm test`-Suite | weiterhin rot (vorbestehend, B2) – nicht kaschiert |

Hinweis: Für `vercel build` wurden die untracked Fremddateien `e2e/` und `playwright.config.ts` während des Builds kurzzeitig verschoben und anschließend wiederhergestellt (beide vorhanden, geprüft).

---

## 5. Git-Stand

- Branch unverändert `feature/analytics-vercel-schedules`.
- Der bestehende Commit wurde **lokal per `--amend`** aktualisiert (weiterhin genau ein Commit über `master`).
- **Kein Push, kein Force-Push, kein Merge, kein Deployment.** Der entfernte Remote-Stand `377ba5f` ist damit bewusst älter als der lokale Stand.
- Nicht übernommen: `jest.setup.js` (Fremd-WIP), `e2e/`, `playwright.config.ts`, `docs/PHASE1*`, `docs/PHASE_1.3_FINAL_PR_AUDIT.md` (bleibt untracked).
- Keine Änderungen an Produktionsumgebung, Secrets, Vercel-Einstellungen oder Datenbank.

---

## 6. Verbleibende Risiken und offene Punkte

1. **B2:** Rote „Unit Tests“ in CI, vorbestehend auf `master`. Solange das nicht separat behoben ist, kann kein PR einen grünen Gesamt-CI-Status erreichen.
2. **Release-Laufzeit:** verbessert, aber nicht gemessen; erster produktiver Lauf muss anhand `durationMs` bewertet werden. `GitHubReleaseAsset.all()` skaliert linear mit der Asset-Tabelle.
3. **`maxDuration`:** nicht explizit gesetzt (Hobby-Default 300 s). Empfehlung bleibt, den Wert bewusst zu setzen.
4. **B11:** Doppeltes Locking kann bei überlappenden manuellen Läufen `ALREADY_RUNNING` als roten Lauf melden.
5. **Fremd-WIP:** Die E2E-Arbeit ist ohne Playwright-Abhängigkeit lokal nicht typisierbar und braucht einen eigenen PR mit eigener Abhängigkeit.
6. **B9:** Schedules-Beta-Freigabe für das Team vor dem Merge bestätigen.

---

## 7. Merge-Empfehlung

**Mergebar nach Freigabe** – vorbehaltlich der weiterhin roten, aber vorbestehenden „Unit Tests“-CI und der Bestätigung, dass Schedules für das Team aktiviert sind.

Der blockierende Befund B1 ist behoben: Der PR enthält nur noch die Analytics-Änderungen und `@vercel/schedules`, keine Playwright-Pakete, keine fremden Dateien. B4, B5 und B8 sind umgesetzt und getestet; B3/B7 ist ohne Architekturbruch entschärft und die Laufzeit nachvollziehbar dokumentiert. Die verbleibenden Punkte sind bewusst offen gelegt und blockieren den Merge aus fachlicher Sicht nicht.

Push, Merge und Deployment erfolgen erst nach ausdrücklicher Freigabe.
