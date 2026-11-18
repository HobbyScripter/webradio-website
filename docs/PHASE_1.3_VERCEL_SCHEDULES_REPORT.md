# WebRadio – Phase 1.3: Analytics-Synchronisierung über private Vercel Schedules

**Datum:** 2026-11-18  
**Repository:** HobbyScripter/webradio-website  
**Arbeitsverzeichnis:** F:\Dev\webradio-website  
**Branch:** `feature/analytics-vercel-schedules` (abgezweigt von `origin/master`, `9150623`)  
**Status:** Implementierung und lokale Prüfungen abgeschlossen – PR offen, **nicht gemergt, nicht deployt**

---

## Zusammenfassung

Der bisherige einzelne Cron (`15 3 * * *` auf `/api/admin/analytics/sync`, alle drei Jobs plus Retention in einem Lauf) wurde durch **vier unabhängige, private Vercel Schedules** ersetzt:

| Schedule-Name | Zeit (UTC) | Aufgabe | Quelle(n) |
| --- | --- | --- | --- |
| `analytics-traffic` | `15 3 * * *` | Traffic-Sync | `TRAFFIC_VIEWS`, `TRAFFIC_CLONES`, `TRAFFIC_REFERRERS`, `TRAFFIC_PATHS` |
| `analytics-repo-stats` | `45 3 * * *` | Repository-Statistiken | `REPO_METADATA`, `COMMIT_ACTIVITY`, `CONTRIBUTORS`, `CODE_FREQUENCY`, `PARTICIPATION`, `PUNCH_CARD` |
| `analytics-releases` | `15 4 * * *` | Release-/Asset-Downloads | `RELEASES` |
| `analytics-retention` | `45 4 * * *` | ausschließlich Retention-Cleanup | – |

Alle vier Schedules zeigen auf **eine gemeinsame private Function** (`api/schedules/analytics`), die über `metadata.name` genau eine Aufgabe ausführt. Der öffentliche `path`-Cron und der `crons`-Block sind im selben Schritt entfallen; es gibt kein neues öffentliches Pfad-Ziel.

---

## Geänderte Dateien

| Datei | Art | Inhalt |
| --- | --- | --- |
| `vercel.json` | geändert | `crons` entfernt; `functions`-Trigger `schedule/v1beta` für die Route; vier Einträge unter `schedules` |
| `src/app/api/schedules/analytics/route.ts` | neu | privater `handleSchedule`-POST, strukturiertes Logging, Fehlerwurf bei `ok: false` |
| `src/lib/analytics/schedules.ts` | neu | stabile Schedule-Namen, `isAnalyticsScheduleName`, `runAnalyticsSchedule` inkl. Retention-only-Zweig |
| `src/lib/analytics/sync.ts` | geändert | `includeRetention?: boolean` (Default `true`), `runAnalyticsRetention()`, `errorCode` je Job (`LOCKED`/`LOCK_ERROR`), `ok` ist bei übersprungenen Jobs `false` |
| `src/lib/__tests__/analytics-sync.test.ts` | geändert | Fälle für `includeRetention: false`, `LOCKED`, `LOCK_ERROR` |
| `src/lib/__tests__/analytics-schedules.test.ts` | neu | Job-Trennung, `metadata.name`-Zuordnung, Fehler, übersprungene Jobs |
| `src/app/api/__tests__/analytics-schedule-route.test.ts` | neu | Route-Handler, Logzeile, Fehlerpfad, unbekannter Schedule-Name |
| `package.json`, `package-lock.json` | geändert | `@vercel/schedules@^0.0.3` |

Der bestehende manuelle Admin-Endpunkt `src/app/api/admin/analytics/sync/route.ts` bleibt unverändert und weiterhin admin-geschützt.

### Hinweis zum Arbeitsstand

Im Arbeitsverzeichnis liegen zusätzlich **nicht zu diesem Branch gehörende** Änderungen (u. a. `jest.setup.js`, `@playwright/test`, `e2e/`, `playwright.config.ts`, weitere `docs/PHASE1*`-Berichte). Sie werden bewusst **nicht** mitcommittet. `package.json`/`package-lock.json` enthalten daher neben `@vercel/schedules` auch den bereits vorher vorhandenen Playwright-Eintrag; eine Trennung ohne konfliktfreies Umbauen des Lockfiles war nicht möglich.

---

## Architektur

### Trigger und Privatheit

```json
"functions": {
  "src/app/api/schedules/analytics/route.ts": {
    "experimentalTriggers": [{ "type": "schedule/v1beta" }]
  }
}
```

Der `schedule/v1beta`-Trigger entfernt die öffentliche URL der Route; sie ist nur noch über den Scheduler erreichbar. Die Route exportiert ausschließlich `POST = handleSchedule(...)` – kein `GET`, kein manueller Trigger.

### Routing über `metadata.name`

`ANALYTICS_SCHEDULES` bildet die vier Namen auf je eine Aufgabe ab. Ein unbekannter Name führt zu einem Fehler (kein stiller Fallback auf „alles synchronisieren“). Die Namen sind Teil des Deployment-Vertrags; Umbenennen entspricht dem Löschen und Neuanlegen eines Schedules.

### Retention getrennt

- `runAnalyticsSync({ includeRetention: false })` überspringt den Cleanup vollständig (Default bleibt `true`, damit der bestehende Admin-Aufruf unverändert weiterläuft).
- `runAnalyticsRetention()` führt ausschließlich `cleanupAnalyticsRetention()` aus.
- Die drei Analytics-Schedules rufen niemals Retention auf; `analytics-retention` führt keine Sync-Jobs aus.

### Ergebnis- und Fehlersemantik

- `ok` ist nur `true`, wenn alle angeforderten Jobs gelaufen sind und keine Quelle `FAILED` gemeldet hat.
- Ein übersprungener Job (Lock gehalten oder Lock-Fehler) setzt `ok = false` und `errorCode = 'LOCKED'` bzw. `'LOCK_ERROR'`; er wird **nicht** als Erfolg gemeldet.
- Bei `ok = false` wird die strukturierte Zeile mit `console.error` geloggt und anschließend ein `Error` geworfen, damit die Vercel-Execution-History den Lauf nicht fälschlich als grün zeigt.

### Logging

Eine JSON-Zeile pro Lauf (`event: "analytics.schedule"`) mit: Schedule-Name, Execution-ID, `scheduledAt`, Trigger-Quelle, Start-/Abschlusszeit, Laufzeit in ms, `ok`, Fehlercode, beteiligte Quellen und je Job `skipped`/`attempts`/`errorCode`/Outcome-Status. Es werden keine Tokens, Connection-Strings oder Secrets geloggt.

---

## Build-Nachweis (aus `.vercel/output`, nicht aus dem Quellpfad abgeleitet)

`npx vercel build` endete mit Exit 0. Ergebnis:

- Function-Ordner: `.vercel/output/functions/api/schedules/analytics.func`
- `.vc-config.json`: `runtime: nodejs26.x`, `operationType: API`, `experimentalTriggers: [{ "type": "schedule/v1beta" }]`
- `.vercel/output/config.json`:
  - `schedules`: `analytics-traffic`, `analytics-repo-stats`, `analytics-releases`, `analytics-retention` – jeweils `function: "api/schedules/analytics"`, `timezone: "UTC"`
  - `crons`: `[]`

Der Function-Pfad in `vercel.json` (`api/schedules/analytics`) entspricht damit exakt dem Build-Output (ohne `.func`).

Der Build benötigte Platzhalterwerte für `DATABASE_URL_POOLED` und `DIRECT_URL`, weil die gezogene Preview-Umgebung maskierte (`[SENSITIVE]`) Werte enthält und der Prebuild sonst abbricht. Es wurden keine echten Zugangsdaten gelesen oder verändert; die temporär erzeugte `.vercel/.env.preview.local` wurde gelöscht.

---

## Tests

Neu bzw. erweitert:

- `analytics-schedules.test.ts`: jeder Schedule-Name führt genau seinen Job aus; Sync-Schedules übergeben `includeRetention: false`; `analytics-retention` ruft nur `runAnalyticsRetention()`; unbekannter Name wirft; Fehler- und Lock-Ergebnisse werden korrekt auf `ok`/`errorCode` abgebildet.
- `analytics-schedule-route.test.ts`: `metadata.name` steuert die Ausführung; Erfolg loggt auf `console.info`; Fehlschlag loggt auf `console.error` und wirft; Logzeile enthält Schedule, Execution-ID, Zeiten, Dauer, Quellen und Fehlercode.
- `analytics-sync.test.ts`: `includeRetention: false` überspringt den Cleanup; `LOCKED`/`LOCK_ERROR` markieren den Lauf als nicht erfolgreich.

Ergebnis der fokussierten Suiten: **3 Suiten, 19 Tests, alle grün.**

### Einschränkung: vollständige Suite auf diesem Arbeitsstand

`npm test` über alle Suiten ist auf diesem Rechner mit **Node v26.8.2** und frischem `npm ci` nicht vollständig grün – **unabhängig von diesem Branch**:

- `jest.setup.js` (nicht Teil dieses Branches, sondern uncommittete Fremdänderung) importiert `temporal-polyfill/full`; `temporal-polyfill@1.0.6` ist vollständig ESM (`"type": "module"`), Jest lädt es im CJS-Modus und bricht mit `Must use import to load ES Module` ab.
- Mit einer Transform-Ausnahme für `temporal-polyfill` laufen 50 von 60 Suiten (470 Tests grün). Die verbleibenden 10 Suiten scheitern beim Laden von `src/lib/db.ts` an der Prisma-8-Contract-Hydration (`TypeError: Cannot assign to read only property 'kind' of object '#<StorageValueSet>'`). Dieser Fehler tritt auch ohne Polyfill-Setup und auch mit `testEnvironment: node` auf, betrifft ausschließlich Prisma/Datenbank-Suiten und keine Analytics-Datei dieses Branches.

Beides ist vorbestehend (Node-/Prisma-8-rc-Kompatibilität bzw. Fremd-WIP) und wurde hier nicht „repariert“, um den Branch fachlich eng zu halten. Die Analytics-Suiten wurden mit
`npx jest --transformIgnorePatterns '/node_modules/(?!temporal-polyfill|temporal-spec|temporal-utils)/' --testPathPatterns 'analytics-(sync|schedules)\.test|analytics-schedule-route'`
ausgeführt.

---

## Geprüfte Kommandos

| Prüfung | Ergebnis |
| --- | --- |
| `npm ci` | Exit 0 (1031 Pakete) |
| `npx tsc --noEmit` | Exit 0, keine Fehler |
| `npx eslint` (Analytics-/Schedule-/Test-Dateien) | Exit 0, keine Findings |
| fokussierte Jest-Suiten | 19/19 Tests grün (siehe Einschränkung oben) |
| `npx vercel build` | Exit 0, Function `api/schedules/analytics`, Trigger `schedule/v1beta`, vier Schedules, `crons: []` |
| vollständige `npm test`-Suite | 10 von 60 Suiten scheitern vorbestehend (Prisma/Node 26), siehe oben |

---

## Benötigte Vercel-Umgebungsvariablen

Die Schedules laufen in derselben Function wie die Anwendung und brauchen daher die bereits vorhandenen Produktionsvariablen:

- `DATABASE_URL_POOLED` (gepoolter Host `pooled.db.prisma.io`) – Schreiben von Sync-Status und Analytics-Daten
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` – GitHub-App-Token für Traffic, Repo-Statistiken und Releases
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL` – App-Kontext (u. a. `src/lib/env.ts`)

Es wurden **keine** Secrets gelesen, ausgegeben oder geändert und keine Vercel-Projekteinstellungen angepasst.

---

## Betriebsgrenzen (Vercel Hobby)

- Statische Schedules sind deployment-gebunden; ein Rollback stellt den Stand des vorherigen Deployments wieder her.
- Hobby führt Schedules mit **bis zu 15 Minuten Jitter** aus. Die gewählten 30-Minuten-Abstände (03:15 / 03:45 / 04:15 / 04:45 UTC) verhindern, dass benachbarte Läufe durch Jitter überlappen.
- Limit: 100 statische Schedules und 5.000 Ausführungen pro Monat – mit vier Läufen pro Tag unkritisch.
- Function-Ziele werden von Vercel **nicht automatisch wiederholt**. Wiederholungen erfolgen nur innerhalb eines Laufs über die vorhandene Retry-Logik (`retryDelaysMs`, Standard 1 s/4 s) und nur bei retrybaren Fehlercodes.
- Die Function-Laufzeit ist durch das Hobby-Limit begrenzt; die Jobs sind einzeln geschnitten, damit ein einzelner Lauf deutlich kürzer bleibt als der bisherige Gesamtlauf.

---

## Offene Punkte / nächste Schritte

1. PR gegen `master` reviewen und mergen (nicht in dieser Phase).
2. Nach dem Merge Deployment beobachten: erste Ausführung je Schedule in der Vercel-Execution-History prüfen (Logzeile `analytics.schedule`, `ok`, `errorCode`, `sources`).
3. Sicherstellen, dass die Produktionsumgebung `GITHUB_APP_*` und `DATABASE_URL_POOLED` gesetzt hat, sonst melden die Schedules `NOT_CONFIGURED`/`UNAVAILABLE`.
4. Fremd-WIP im Arbeitsverzeichnis (`jest.setup.js`, Playwright, `e2e/`) separat abschließen; die Polyfill-Importvariante ist in `temporal-polyfill@1.0.6` nicht CJS-ladbar.
5. Der bekannte Kaltstart-Timeout (`timeout exceeded when trying to connect`) wird durch diesen Branch nicht adressiert; der 20-s-Pool-Fix liegt als Commit `de2656f` auf `feature/download-analytics`.

---

## Risiko und Rollback

- **Risiko:** gering. Die Sync-Logik selbst ist unverändert; neu sind Aufteilung, Privatheit der Route und Fehlerpropagierung.
- **Rollback:** `vercel.json` auf den vorherigen Stand zurücksetzen (ein `crons`-Eintrag auf `/api/admin/analytics/sync`) und die Schedule-Route entfernen. Daten und Tabellen werden dabei nicht angefasst.
