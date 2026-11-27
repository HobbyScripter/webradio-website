# WebRadio – Phase 1.3: Finaler Pull-Request-Audit

**Datum:** 2026-11-18  
**Repository:** HobbyScripter/webradio-website  
**Geprüfter Branch:** `feature/analytics-vercel-schedules`  
**Geprüfter Commit:** `377ba5f` – „Analytics Phase 8: Private Vercel Schedules für getrennte Sync-Jobs“  
**PR:** [#3](https://github.com/HobbyScripter/webradio-website/pull/3) → Basis `master` (`9150623`)  
**Status:** Audit abgeschlossen – **Merge-Empfehlung: noch nicht mergen** (ein blockierender Befund), kein Merge, kein Deploy, kein Push im Rahmen dieses Audits

---

## 1. Prüfgegenstand

| Merkmal | Wert |
| --- | --- |
| Commits im PR | 1 (`377ba5f`) |
| Basis | `origin/master` = `9150623` (ist Vorfahre des Branch-Heads) |
| Dateien | 10 (5 neu, 5 geändert) |
| Umfang | +936 / −74 Zeilen |
| Merge-Status | `open`, `merged: false` |
| Fremde Arbeitsstand-Änderungen im Commit | **ja, teilweise** – siehe Befund B1 |

Es wurden ausschließlich lesende Prüfungen durchgeführt. Keine Änderung an Produktionsumgebung, Secrets, Datenbank oder Vercel-Einstellungen; kein Merge, kein Deploy, kein Push.

---

## 2. Vollständiger Änderungsumfang

| Datei | Status | ± | Inhalt |
| --- | --- | --- | --- |
| `vercel.json` | geändert | +26 / −5 | `crons` entfernt; `functions`-Trigger `schedule/v1beta`; vier `schedules` auf `api/schedules/analytics` |
| `src/app/api/schedules/analytics/route.ts` | neu | +45 | privater `handleSchedule`-POST, strukturiertes Log, Fehlerwurf bei `ok: false` |
| `src/lib/analytics/schedules.ts` | neu | +93 | `ANALYTICS_SCHEDULES`, `isAnalyticsScheduleName`, `runAnalyticsSchedule` |
| `src/lib/analytics/sync.ts` | geändert | +65 / −10 | `includeRetention`, `runAnalyticsRetention`, `errorCode` je Job, striktere `ok`-Semantik |
| `src/lib/__tests__/analytics-schedules.test.ts` | neu | +188 | Mapping, Job-Trennung, Fehler, übersprungene Jobs |
| `src/app/api/__tests__/analytics-schedule-route.test.ts` | neu | +88 | Dispatch über `metadata.name`, Log- und Fehlerpfad |
| `src/lib/__tests__/analytics-sync.test.ts` | geändert | +28 | `includeRetention: false`, `LOCKED`, `LOCK_ERROR` |
| `docs/PHASE_1.3_VERCEL_SCHEDULES_REPORT.md` | neu | +170 | Umsetzungsbericht |
| `package.json` | geändert | +2 | `@vercel/schedules` **und** `@playwright/test` |
| `package-lock.json` | geändert | +231 / −59 | `@vercel/schedules`-Baum, Playwright-Baum, 2 unabhängige Entfernungen |

### Diff-Prüfung auf fremde Arbeiten

- `jest.setup.js`: **nicht** im Commit (nur im Arbeitsverzeichnis geändert). ✔
- `e2e/`, `playwright.config.ts`, `docs/PHASE1*`: **nicht** im Commit (untracked). ✔
- `@playwright/test`: **im Commit enthalten** (siehe B1). ✘

---

## 3. Befunde

### B1 – Blockierend (Scope): Playwright-Abhängigkeit im Commit

`package.json` fügt neben `@vercel/schedules` auch `@playwright/test@^1.65.1` in `devDependencies` hinzu. Das Lockfile zieht entsprechend drei fremde Pakete ein:

```
node_modules/@playwright/test
node_modules/playwright
node_modules/playwright-core
```

Damit ist eine Änderung aus der parallelen E2E-Arbeit (Phase 1.2) im Analytics-PR enthalten – genau das, was laut Vorgabe ausgeschlossen sein soll. Es fehlen die zugehörigen Quelldateien (`playwright.config.ts`, `e2e/`), die Abhängigkeit ist im PR also verwaist.

**Auswirkung:** kein Laufzeitrisiko (dev-only, nicht im Function-Bundle), aber Scope-Verletzung, größerer Lockfile-Diff und ein PR, der fremde Arbeit mitzieht.

**Behebung:** `@playwright/test` aus `package.json` entfernen, Lockfile mit `npm install --package-lock-only` neu erzeugen, `npm ci` + Typecheck + fokussierte Tests + `vercel build` erneut prüfen, Commit amendieren, Force-Push mit `--force-with-lease`.

### B2 – Hoch (CI): „Unit Tests“ rot, aber vorbestehend

CI-Status für `377ba5f`:

| Check | Ergebnis |
| --- | --- |
| Build | success |
| Type Check | success |
| Lint | success |
| Integration (PostgreSQL) | success |
| Vercel Preview Comments / Vercel | success |
| **Unit Tests** | **failure** |

Ursache ist nicht dieser Branch, sondern der Zustand von `master`:

- `temporal-polyfill@1.0.6` ist ESM-only (`"type": "module"`); `jest.setup.js` importiert es, Jest lädt im CJS-Modus → `Must use import to load ES Module`.
- Zusätzlich scheitern 10 Prisma-/DB-Suiten an der Contract-Hydration (`Cannot assign to read only property 'kind'`).

**Beleg:** `origin/master` (`9150623`) hat denselben roten „Unit Tests“-Check. Es handelt sich also um eine bestehende Regression des Test-Setups (Node 26 / Prisma 8 rc), nicht um eine Folge dieses PRs. Lokal laufen die brancheigenen Analytics-Suiten mit einer Transform-Ausnahme für `temporal-polyfill` grün (siehe Abschnitt 4).

**Auswirkung:** Der PR kann nicht mit „CI grün“ freigegeben werden; das ist aber kein Kausalzusammenhang mit den Analytics-Änderungen. Sollte separat behoben werden (Polyfill-Import bzw. Jest-Transform), sonst bleibt jeder PR rot.

### B3 – Mittel: keine explizite `maxDuration`

In `vercel.json` ist für die Function weder `maxDuration` noch `memory` gesetzt. Damit gilt der Hobby-Default: **300 s Default = 300 s Maximum** (Fluid Compute; Hobby kann nicht darüber hinaus erhöhen).

Worst-Case-Abschätzung je Schedule (Request-Timeout 8 s in Traffic/Repo-Stats, 10 s im Release-Sync, Retry-Backoff 1 s/4 s, max. 3 Versuche):

| Schedule | Requests je Versuch | Theoretisches Maximum | Bewertung |
| --- | --- | --- | --- |
| `analytics-traffic` | 4 × 8 s = 32 s | 3 × 32 s + DB ≈ 100 s | unkritisch |
| `analytics-repo-stats` | 6 × 8 s = 48 s | 3 × 48 s + DB ≈ 150 s | unkritisch, aber ohne Reserve bei sehr langsamer DB |
| `analytics-releases` | 1 × 10 s | 10 s + N × M sequentielle DB-Roundtrips | **Risiko** (siehe B7) |
| `analytics-retention` | 0 | nur DB-Deletes | unkritisch |

**Empfehlung:** `"maxDuration": 300` explizit an der Function setzen (Wert ist auf Hobby gültig und dokumentiert die Absicht). Zusätzlich sollte das Release-Schedule mindestens einmal real beobachtet werden.

### B4 – Mittel: Retention-Fehler bleibt im Admin-Lauf unsichtbar

`runAnalyticsSync` fängt Fehler von `cleanupAnalyticsRetention()` ab und setzt `retention = null`, während `ok` unverändert bleiben kann (Test: „still reports success when retention fails“). Der dedizierte `analytics-retention`-Schedule meldet `RETENTION_FAILED` korrekt; der manuelle Admin-Lauf meldet dagegen Erfolg, obwohl der Cleanup ausgefallen ist. Das Verhalten ist vorbestehend, wird durch die Aufteilung aber relevanter, weil Retention jetzt ein eigener Verantwortungsbereich ist.

**Empfehlung:** `errorCode: 'RETENTION_FAILED'` auch im Summary setzen (ohne `ok` zwingend zu kippen), damit Admin-Läufe den Ausfall zeigen. Nicht blockierend.

### B5 – Niedrig: veralteter Docstring in der Admin-Route

`src/app/api/admin/analytics/sync/route.ts` beschreibt weiterhin „Vercel Cron calls GET with the CRON_SECRET bearer token“. Der Cron existiert nicht mehr; der `CRON_SECRET`-Zweig in `isAuthorized` ist damit ein toter, aber weiterhin aktiver Auth-Pfad (funktional harmlos, aber irreführend und ein zusätzlicher Angriffsvektor, falls `CRON_SECRET` noch gesetzt ist).

**Empfehlung:** Docstring anpassen und entscheiden, ob der `CRON_SECRET`-Zweig entfällt. Nicht blockierend, aber im selben PR sinnvoll.

### B6 – Niedrig: unabhängiger Lockfile-Churn

Das Lockfile entfernt zwei Pakete, die mit diesem PR nichts zu tun haben:

```
node_modules/@prisma/composer/node_modules/@types/node
node_modules/@prisma/composer/node_modules/undici-types
```

Das ist npm-Auflösungs-Churn (Deduplizierung), funktional unkritisch, macht den Diff aber schwerer prüfbar. `npm ci` läuft mit dem Lockfile sauber durch (Exit 0), die Änderung ist also konsistent.

### B7 – Niedrig: Release-Sync mit sequentiellen DB-Roundtrips

Der Release-Job holt bis zu 100 Releases und schreibt je Asset mehrere Datensätze (Existenzprüfung, Create/Update, Snapshot-First, Snapshot-Create) **sequentiell**. Bei vielen Releases/Assets kann das den 300-s-Rahmen sprengen; ein Timeout würde die Function mitten im Schreiben beenden. Die Aufteilung in ein eigenes Schedule reduziert den Blast-Radius (Traffic und Repo-Stats sind dann bereits fertig), beseitigt das Risiko aber nicht.

**Empfehlung:** Laufzeit des ersten produktiven Laufs messen (`durationMs` steht im Log), bei Bedarf Batches/Parallelisierung oder Pagination begrenzen. Nicht blockierend.

### B8 – Niedrig: Route-Test mockt das SDK

`analytics-schedule-route.test.ts` ersetzt `handleSchedule` durch `(handler) => handler` und ruft den Callback direkt auf. Damit ist das eigene Routing/Logging getestet, **nicht** das SDK-Verhalten (Header-Parsing, 400 bei kaputtem Dispatch). Verifiziert wurde das SDK-Verhalten durch Lesen von `node_modules/@vercel/schedules/dist/index.cjs`:

- `handleSchedule` parst die CloudEvent-Header, ruft den Handler und gibt bei Erfolg `200` zurück.
- Fehler aus dem Handler werden **nicht** abgefangen – die Exception läuft in Next.js und erzeugt dort `500`. Der Fehlerwurf in der Route führt also tatsächlich zu einer roten Execution, aber über Next, nicht über das SDK.
- Parse-Fehler liefern `400`/`500` direkt aus dem SDK.

Kein Handlungsbedarf, aber die Test-Abdeckung sollte bewusst so verstanden werden.

### B9 – Info: Betriebsvoraussetzungen

- `@vercel/schedules` ist Beta; laut README schlägt ein Deployment mit `schedules` / `schedule/v1beta` fehl, wenn Schedules für das Team nicht aktiviert ist. Der Vercel-Preview-Status des Commits ist `success`, was auf aktivierte Schedules hindeutet – im Dashboard wurde das im Rahmen dieses Audits **nicht** geprüft.
- Die Function authentifiziert sich laut README über den Vercel-OIDC-Token; zusätzliche Secrets sind dafür nicht nötig. Für die Jobs bleiben `DATABASE_URL_POOLED`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` erforderlich.

### B10 – Info: Jitter und Abstände passen zu Hobby

Laut Vercel-Dokumentation gilt auf Hobby ein Jitter-Fenster von **immer 15 Minuten**, minimale Wiederholung alle 15 Minuten. Die vier Schedules liegen 30 Minuten auseinander (03:15/03:45/04:15/04:45 UTC), ein Jitter von 15 Minuten kann sie also nicht überlappen lassen. `jitter` ist nicht gesetzt – auf Hobby korrekt (die SDK/CLI akzeptiert dort nur `15`). Auf Pro würde ohne Angabe ein 1-Minuten-Jitter gelten, ebenfalls unkritisch.

Hobby-Grenzen: bis zu 100 statische Schedules pro Deployment, 1.000 Schedules pro Team, 5.000 Ausführungen pro Abrechnungszeitraum. Mit vier Läufen pro Tag unproblematisch.

### B11 – Info: zwei unabhängige Locking-Mechanismen

Der Release-Job nutzt zusätzlich das `DownloadSyncLog`-Lock (5-Minuten-Fenster) aus `download-analytics-service.ts`, der Orchestrator sein eigenes `AnalyticsSyncRun`-Lock. Ein gleichzeitiger Admin-Lauf kann daher `ALREADY_RUNNING` erzeugen; dieser Code ist als nicht-retrybar eingestuft und führt zu `ok = false` und einer roten Execution, obwohl der andere Lauf erfolgreich war. Bewusste, aber erklärungsbedürftige Semantik.

---

## 4. Prüfung der Kernanforderungen

| Anforderung | Ergebnis |
| --- | --- |
| Private Function statt öffentlichem Pfad | ✔ `functions`-Trigger `schedule/v1beta`, kein `path`-Target, kein `GET` in der Route |
| `handleSchedule` + `metadata.name` | ✔ `POST = handleSchedule(async (metadata) => …)`, Dispatch über `runAnalyticsSchedule(metadata.name, …)`, unbekannter Name wirft |
| Vier Schedules | ✔ `analytics-traffic`, `analytics-repo-stats`, `analytics-releases`, `analytics-retention`, alle UTC, alle auf `api/schedules/analytics` |
| Alter Cron entfernt | ✔ `crons` nicht mehr vorhanden (`crons`-Key fehlt vollständig, Build-Output `crons: []`) |
| Function-Pfad aus Build-Output | ✔ `.vercel/output/functions/api/schedules/analytics.func` entspricht `"function": "api/schedules/analytics"` |
| Admin-Sync unverändert funktionsfähig | ✔ `runAnalyticsSync()` ohne Argumente → `includeRetention` bleibt `true`; Test „records SUCCESS … and runs retention“ deckt das ab |
| Retention getrennt | ✔ Sync-Schedules übergeben `includeRetention: false`; `analytics-retention` ruft ausschließlich `runAnalyticsRetention()` |
| Übersprungene Jobs ≠ Erfolg | ✔ `ok = false` bei `skipped: true`, `errorCode` `LOCKED`/`LOCK_ERROR` |
| Fehlerstatus sichtbar | ✔ `console.error` + `throw` → 500 über Next.js |
| Locking | ✔ 5-Minuten-Fenster über `AnalyticsSyncRun`, Prüfung vor dem Anlegen; Lock-Fehler wird als `LOCK_ERROR` von Kontention (`LOCKED`) unterschieden |
| Retry-Verhalten | ✔ max. 3 Versuche (`retryDelaysMs` = 1 s, 4 s), nur bei retrybaren Codes; `PERMISSION_DENIED`, `NOT_CONFIGURED`, `NOT_FOUND`, `INVALID_RESPONSE`, `ALREADY_RUNNING`, `RATE_LIMITED`, `UNSUPPORTED` sind blockierend |
| Keine Secrets im Log | ✔ Logzeile enthält Schedule, Execution-ID, Zeiten, Dauer, Quellen, Fehlercodes – keine Tokens oder URLs |

---

## 5. Testergebnisse

### Lokal (Node v26.8.2, frisches `npm ci`)

| Prüfung | Ergebnis |
| --- | --- |
| `npm ci` | Exit 0 |
| `npx tsc --noEmit` | Exit 0 |
| ESLint (Analytics, Schedule-Route, Admin-Route, betroffene Tests) | Exit 0 |
| `npx jest` fokussiert (3 Suiten) | **19/19 Tests grün** |
| `npx vercel build` | Exit 0 (auf identischem Code-Stand; danach nur Doku geändert) |
| Build-Output | Function `api/schedules/analytics.func` mit `experimentalTriggers: schedule/v1beta`, 4 Schedules, `crons: []` |
| Volle `npm test`-Suite | 10/60 Suiten scheitern (Prisma/Node 26), zusätzlich ESM-Fehler in `jest.setup.js` – vorbestehend, siehe B2 |

### CI für `377ba5f`

Build, Type Check, Lint, Integration (PostgreSQL) und Vercel-Preview sind grün; „Unit Tests“ ist rot. `origin/master` ist im selben Check ebenfalls rot → keine Regression durch diesen PR.

---

## 6. Offene Probleme

1. **B1** Playwright-Dev-Dependency und ihre drei Lockfile-Pakete müssen aus dem PR entfernt werden (blockierend).
2. **B2** Rotes „Unit Tests“-CI auf `master` und im PR (vorbestehend, separat zu beheben).
3. **B3** `maxDuration` nicht explizit gesetzt; Hobby-Default 300 s gilt.
4. **B4** Retention-Fehler im Admin-Lauf unsichtbar.
5. **B5** Docstring/`CRON_SECRET`-Pfad der Admin-Route veraltet.
6. **B7** Release-Job ohne gemessenes Zeitbudget; erster Produktionslauf beobachten.
7. **B9** Schedules-Beta-Freigabe für das Team vor dem Merge bestätigen.

---

## 7. Merge-Empfehlung

**Noch nicht mergen.** Fachlich ist die Umsetzung vollständig und entspricht den Vorgaben: vier private Schedules, gemeinsame Function, Routing über `metadata.name`, getrennte Retention, ehrliche Fehler- und Skip-Semantik, unveränderter Admin-Sync, belegter Build-Output.

Der PR ist jedoch nicht freigabefähig, solange **B1** enthalten ist: Mit `@playwright/test` zieht der Analytics-PR fremde Arbeit aus Phase 1.2 mit, ohne deren Quelldateien. Nach Entfernen der Abhängigkeit und Neuerzeugung des Lockfiles (plus erneuter lokaler Prüfung und CI-Lauf) ist der Branch aus Audit-Sicht **mergebar**; B3/B4/B5 können als Folgearbeit erfolgen, sollten aber vor dem ersten produktiven Schedule-Lauf mindestens bewertet werden.

Freigabe für Merge, Force-Push und Deploy erfolgt separat durch den Auftraggeber.

---

## 8. Durchgeführte Prüfkommandos (Auszug)

```
git log --oneline origin/master..HEAD
git diff --stat origin/master...HEAD
git diff --name-status origin/master...HEAD
git diff origin/master...HEAD -- package.json package-lock.json vercel.json
npx tsc --noEmit
npx eslint <geänderte Dateien>
npx jest --transformIgnorePatterns '/node_modules/(?!temporal-polyfill|temporal-spec|temporal-utils)/' \
  --testPathPatterns 'analytics-(sync|schedules)\.test|analytics-schedule-route'
node -e "… vercel.json + .vercel/output/config.json validieren …"
GitHub API: Pulls/3, check-runs für 377ba5f und 9150623
```

Es wurden keine schreibenden Operationen an Repository, Vercel oder Datenbank ausgeführt.
