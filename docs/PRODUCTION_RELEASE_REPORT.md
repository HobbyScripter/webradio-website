# Produktionsrelease – Mehrsprachigkeit, Übersetzungsengine, Custom Links

Stand: 27. November 2026
Verdikt: **RELEASE COMPLETED – 2 OFFENE BETREIBERPUNKTE (Konfiguration)**

---

## 1. Ausgangslage

Die drei Produktionsmigrationen waren zuvor abgeschlossen und verifiziert:
Marker `763e3b57bc99fa207bbd840d3b44199daed778109dc6e7ae6ee2f2c103ff70d6`,
18 Ledger-Einträge, `db:verify --strict` Exit 0
(siehe `docs/PRODUCTION_MIGRATION_EXECUTION_REPORT.md`).

Der Arbeitsbaum enthielt danach die vollständige, noch nicht committete
Funktionsarbeit (i18n-Routing, Übersetzungsengine, Custom Links, Betriebs-
unterlagen). Genau dieser Stand ist Gegenstand des Releases.

---

## 2. Repository und Commit

| Punkt | Ergebnis |
| --- | --- |
| Branch | `feature/analytics-vercel-schedules` |
| Vorher | `f6b443c` (identisch mit `origin`) |
| Release-Commit | `aa1136339320110b53c7e4260c6a2e9a7ef90274` |
| Umfang | 363 Dateien, +79.322 / −4.386 Zeilen |
| Push | `f6b443c..aa11363` → `origin/feature/analytics-vercel-schedules` |
| Arbeitsbaum danach | sauber |

Inhalt: Locale-Routing unter `src/app/[locale]`, i18n-Nachrichten und
`/api/locale`, Übersetzungsengine mit Admin-Oberfläche und Cron-Route,
Custom Links (Verwaltung + öffentliche Auslieferung), die drei Migrationen samt
Snapshots, Betriebsunterlagen (`Dockerfile`, `compose.yaml`, `deploy/`, `e2e/`)
und die zugehörigen Berichte.

### Nicht committet (bewusst)

- `.acceptance/` (PostgreSQL-Datenverzeichnisse, Migrations- und Prüf-Logs,
  Backup-Pfade) — neu in `.gitignore` aufgenommen, ebenso `.freebuff/`.
- `.env*`, `deploy/env.production`, `deploy/env.test` (bereits ignoriert).
- Keine Backup-Dateien, keine Schlüssel, keine DPAPI-Blobs.

### Secret-Scan

Alle 79.322 hinzugefügten Zeilen wurden gegen Verbindungszeichenfolgen mit
Zugangsdaten, `sk-`/`ghp_`/`dpl_`/`AKIA`/`AIza`-Muster, JWT-Header und private
Schlüssel geprüft. Treffer ausschließlich: Platzhalter (`CHANGE_ME`,
`REPLACE_WITH_…`), Test-Fixtures und Doku-Beispiele. **Kein Echtgeheimnis im
Commit.**

### Prüfungen vor dem Commit

| Prüfung | Ergebnis |
| --- | --- |
| `npm run type-check` | Exit 0 |
| `npm run lint` | Exit 0 (0 Fehler, 12 bestehende Warnungen) |
| `npm test` | 846 Tests grün |
| `npm run build` (ohne DB-Zugang) | Exit 0, 677 statische Seiten |
| Migration von Null auf Wegwerf-DB | 18 Migrationen, Endmarker `763e3b57…` |
| `npm run db:verify -- --strict` (Wegwerf-DB) | Exit 0, Marker + Profilhash identisch zu Produktion |
| `npm run test:integration` | 10 Suites / 170 Tests grün |
| Schreibende HTTP-Funktionsproben | 33 Prüfungen, 0 Fehler |

---

## 3. Preview

| Punkt | Ergebnis |
| --- | --- |
| Auslöser | automatisch durch den Push (Vercel-Git-Integration) |
| Deployment | `https://webradio-qmsfii0kc-ramonoltmann-3017s-projects.vercel.app` |
| Status | `Ready`, Target `preview`, Build ≈ 3 min |
| Schutz | Vercel Authentication (SSO) — geprüft über `vercel curl` |

### Ergebnis am Preview

| Prüfung | Ergebnis |
| --- | --- |
| `/` | 307 → `/de` |
| `/de`, `/en`, `/pl`, `/fr` | 200, korrektes `lang`-Attribut, übersetzte Inhalte (pl: „Wtyczk/Motyw/Pobierz", en: „Plugins/Themes/Download") |
| `/de/plugins`, `/themes`, `/news`, `/datenschutz`, `/impressum` | 200 |
| `/de/auth/login` | 200 |
| `/de/admin` | 307 → `/de/auth/login?callbackUrl=%2Fde%2Fadmin` |
| `/de/account` | 200 (Streaming-Shell) — enthält **keine** Kontodaten, nur die Redirect-Anweisung |
| `/api/ready` | `{"status":"ready","checks":{"database":"ok"}}` |
| `/api/custom-links?position=…` | 200, Struktur korrekt; ohne `position` 400 `unknown_position` |
| `POST /api/locale` | 303 → /pl + `webradio-locale`-Cookie; ungültige Sprache 400 |
| `/robots.txt`, `/sitemap.xml` | 200 |
| Runtime-Logs | keine Ausnahmen; nur `pg`-Warnung zu `sslmode=require` |

### Grenze der Preview-Abnahme

Schreibende Tests **auf dem Preview** waren nicht möglich und wurden dort auch
nicht durchgeführt:

1. Preview-Deployments sind mit Vercel Authentication geschützt (kein
   Browser-Login ohne interaktive Freigabe).
2. Es liegen keine Anmeldedaten für ein Konto vor.
3. Die Preview-Umgebung nutzt `DATABASE_URL_POOLED`/`DIRECT_URL` als Secrets, die
   gemeinsam mit der Produktion angelegt wurden. Ein Schreibtest dort hätte die
   **Produktionsdaten** verändert, bevor der Release freigegeben ist.

Ersatzweise liefen die schreibenden Proben gegen eine lokale, wegwerfbare
PostgreSQL-18-Instanz, die aus dem Repository auf denselben Marker
(`763e3b57…`) migriert wurde — identisches Schema wie Produktion.

---

## 4. Schreibende Funktionsproben (Wegwerf-DB)

33 Prüfungen, 0 Fehler (`.acceptance/release-write-test.sh`):

| Bereich | Geprüft |
| --- | --- |
| Auth | CSRF, Login mit gültigen Daten (Rolle `ADMIN`), falsches Passwort erzeugt keine Session, Logout, Admin-API danach 401 |
| Zugriffsschutz | `GET`/`POST /api/admin/custom-links` ohne Session 401 |
| Custom Links anlegen | Hauptmenü (de+en) 201, Footer 201 |
| Validierung | `javascript:`-URL 400, unbekannte Position 400 |
| Auslieferung | API-Label je Sprache, Link erscheint im Hauptmenü und Footer des HTML, keine deutsche Beschriftung im englischen HTML |
| Sprache speichern | `POST /api/locale` 303, `User.locale` in der Datenbank auf `pl`, Rückschalten auf `de`, ungültige Sprache 400 |
| Übersetzungsengine | Admin-Seite meldet fehlende Konfiguration; `POST /api/cron/translations` ohne `CRON_SECRET` 503 (fail-closed) |
| Aufräumen | Löschen 200, Link verschwindet aus HTML (nächster Request) und nach Cache-Ablauf (60 s) aus der API, Tabelle leer |

Beobachtetes Cache-Verhalten (by design): Die öffentliche API antwortet mit
`Cache-Control: max-age=60`; gerenderte Seiten ziehen beim nächsten Request nach
(`revalidateTag`). Ein neu angelegter Link ist damit sofort auf der Seite
sichtbar, die API folgt binnen ≤ 60 s.

---

## 5. Produktionsrelease

| Punkt | Ergebnis |
| --- | --- |
| Auslöser | `vercel deploy --prod` aus Commit `aa11363` (sauberer Arbeitsbaum) |
| Deployment | `dpl_CHa3NKp66kGGncbBrZUxdPNSLWC3` (`https://webradio-6204n2tu4-ramonoltmann-3017s-projects.vercel.app`) |
| Alias | `https://webradio-weld.vercel.app` |
| Build | 4 min 31 s, 677 statische Seiten, alle API-Routen als `ƒ` |
| Vorherige Produktion | `dpl_7YkB622gd44mV7AYhMk4nBYN2q2v` (23.11., weiterhin als Rollback deploybar) |

Hinweis zur `DEPLOYMENT_NOT_FOUND`-Frage: Das Projekt heißt `webradio`, die
Produktions-Domain ist `webradio-weld.vercel.app`. Die früher geprüfte Adresse
`webradio-website.vercel.app` existiert in diesem Projekt nicht — die
Konfiguration war korrekt, nur der Hostname falsch. Die Git-Integration hat den
Push korrekt als Preview gebaut.

---

## 6. Live-Abnahme (Produktion)

| Prüfung | Ergebnis |
| --- | --- |
| `/` | 307 → `/de` |
| `/de`, `/en`, `/pl` | 200, `lang="de"`/`"en"`/`"pl"` |
| `/de/plugins`, `/themes`, `/news`, `/releases`, `/datenschutz`, `/impressum` | 200 |
| `/api/ready` | `{"status":"ready","checks":{"database":"ok"}}` |
| `/api/news`, `/api/plugins` | 200 |
| `/api/custom-links` (Hauptmenü/Footer) | 200, `{"links":[]}` — Funktion aktiv, noch keine Links gepflegt |
| `/robots.txt`, `/sitemap.xml` | 200 |
| `/de/admin` ohne Session | 307 → Login mit `callbackUrl` |
| `/de/account` ohne Session | 200, 0 E-Mail-Adressen im HTML, nur Redirect-Anweisung |
| Login mit ungültigen Daten | keine Session (`{}`) |
| Sprachumschaltung | 303 → /pl + Secure/HttpOnly-Cookie |
| Übersetzungs-Cron | 404 (siehe Befund 1) |
| Serverlogs | keine Ausnahmen; ein `cron.analytics.rejected` (CRON_SECRET_MISSING) aus der eigenen Probe, sonst nur `pg`-SSL-Warnungen |

Geplante Analytics-Läufe der Vorgängerversion liefen am 27.11. erfolgreich
(`AnalyticsSyncRun`: TRAFFIC_*, REPO_METADATA, RELEASES = SUCCESS), der
Schedule-Mechanismus ist also intakt.

---

## 7. Offene Punkte (Konfiguration, keine Codeänderung im Release)

**1. `/api/cron/translations` ist über HTTP nicht erreichbar (404).**
Der Eintrag in `vercel.json` (`functions` → `experimentalTriggers`) entfernt —
wie bei `/api/schedules/analytics` beabsichtigt — die öffentliche URL. Anders als
die Analytics-Route ist die Übersetzungsroute jedoch nicht mit
`handleSchedule` umgesetzt, sodass der Scheduler-Aufruf keine gültige
Authentifizierung mitbringt (`verifyCronRequest` → 503 `misconfigured`, solange
`CRON_SECRET` fehlt, sonst 401). Damit ist der tägliche Lauf der
Übersetzungsengine derzeit wirkungslos, und der in
`docs/TRANSLATION_ENGINE.md` dokumentierte manuelle Aufruf
(`curl -X POST … -H "Authorization: Bearer $CRON_SECRET"`) läuft ins Leere.
Empfehlung: entweder Route wie `src/app/api/schedules/analytics/route.ts` mit
`handleSchedule` umsetzen, oder den `translations-worker`-Schedule-Eintrag
entfernen und den Lauf über externen Cron/systemd (dokumentierter Weg) fahren.

**2. Produktionsumgebung ohne `CRON_SECRET` und ohne `DEEPL_API_KEY`.**
Ohne `DEEPL_API_KEY` meldet die Engine `NOT_CONFIGURED` und sendet nichts
(fail-closed, entspricht der Designentscheidung). Ohne `CRON_SECRET` antworten
alle portablen Cron-Endpunkte mit 503. Beides ist reine Konfiguration in
Vercel → Settings → Environment Variables; ohne diese Werte bleibt die
Übersetzung funktionslos, die Oberfläche erklärt das korrekt.

**3. `origin/master` enthält den Release-Commit noch nicht.**
`origin/master` (`91638bb`) enthält `f6b443c`, aber nicht `aa11363`. Die
Produktion wurde per CLI aus `aa11363` gebaut. Ein späterer Produktions-Build
aus `master` würde den Release-Stand verlieren, solange der Merge nicht erfolgt.
Empfehlung: PR `feature/analytics-vercel-schedules` → `master` mergen.

**4. Custom Links sind inhaltlich leer.**
Die Funktion ist verifiziert, aber es ist noch kein Link gepflegt. Nach dem
ersten Anlegen im Adminbereich erscheinen sie sofort in Hauptmenü und Footer.

**5. Hinweise ohne Release-Bezug.**
`pg` warnt beim Verbindungsaufbau vor der künftigen Semantik von
`sslmode=require` (aktuell identisch zu `verify-full`); rein informativ.
GitHub meldet für den Default-Branch 74 Dependabot-Funde (9 high) — unabhängig
von diesem Release.

---

## 8. Rollback

1. `vercel rollback` bzw. Redeploy von `dpl_7YkB622gd44mV7AYhMk4nBYN2q2v`
   (vorherige Produktion, 23.11.) für die Anwendung.
2. Ein Datenbank-Rollback ist **nicht** erforderlich: der Release enthält keine
   Migrationen; die drei Kanten waren bereits vor diesem Release angewendet und
   verifiziert.

---

## 9. Zusammenfassung

Der Release ist ausgerollt und live geprüft: Mehrsprachigkeit, Sprachumschaltung,
Custom Links, Anmeldung und Zugriffsschutz funktionieren in Produktion. Die
Übersetzungsengine ist ausgeliefert und verhält sich fail-closed, kann aber ohne
`DEEPL_API_KEY`/`CRON_SECRET` und ohne korrigierte Schedule-Verdrahtung noch
nicht übersetzen. Der Release-Commit liegt auf dem Feature-Branch; der Merge nach
`master` steht aus.
