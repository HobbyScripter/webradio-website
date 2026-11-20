# WebRadio Analytics – Betrieb und Rollout

Stand: 14.11.2026 · Ergänzt [`ANALYTICS_SYSTEM_PLAN.md`](./ANALYTICS_SYSTEM_PLAN.md)
(ursprünglicher Plan) um den tatsächlich implementierten Stand.

## 1. Überblick

| Quelle | Erfassung | Tabellen |
|---|---|---|
| GitHub Traffic | 4 Endpunkte, 14-Tage-Fenster, tägliches Archiv | `GitHubTrafficDaily`, `GitHubTrafficReferrerSnapshot`, `GitHubTrafficPathSnapshot` |
| GitHub Releases | Assets und kumulative Download-Zähler | `GitHubReleaseAsset`, `GitHubDownloadSnapshot` |
| Repository-Statistiken | Metadaten + 5 Stats-Endpunkte | `GitHubRepoStatsSnapshot`, `GitHubCommitActivityWeek`, `GitHubContributorSnapshot`, `GitHubCodeFrequencyWeek`, `GitHubParticipationWeek`, `GitHubPunchCardSlot` |
| Website | anonymer Pageview-Beacon und Download-Anfragen | `WebsitePageViewDaily`, `WebsiteDownloadRequestDaily` |
| Betrieb | Läufe und Quellenstatus | `AnalyticsSyncRun`, `AnalyticsSourceStatus` |

GitHub- und Website-Zahlen bleiben getrennt; es gibt keine gemeinsame
„Gesamtzahl“. Website-Downloads sind **Anfragen**, keine bestätigten
erfolgreichen Downloads.

## 2. Berechtigungen

- Alle Admin-Seiten unter `/admin/analytics` prüfen `ADMIN`/`SYSTEM_ADMIN`;
  Rollen wurden nicht verändert.
- Der manuelle Sync-Endpunkt `/api/admin/analytics/sync` erfordert eine
  Admin-Session. Der frühere `CRON_SECRET`-Bearer-Pfad wurde entfernt, weil
  keine geplante Instanz diesen Endpunkt mehr aufruft. Alles andere erhält
  `401`.
- GitHub-Zugriffe sind ausschließlich lesend und verwenden das bestehende
  Installationstoken der GitHub App.

### GitHub-App-Berechtigungen

| Endpunktgruppe | Benötigte Berechtigung |
|---|---|
| Releases, Metadaten | `Contents: read`, `Metadata: read` (bereits vorhanden) |
| `traffic/views`, `traffic/clones`, `traffic/popular/*` | **`Administration: read`** |

`Administration: read` ist laut GitHub-Doku die einzige Möglichkeit, Traffic zu
lesen. Fehlt sie, liefern die Traffic-Quellen `403` und der Status zeigt
`PERMISSION_DENIED`; die übrigen Quellen laufen weiter.

## 3. Sync

`runAnalyticsSync()` in `src/lib/analytics/sync.ts` führt drei Jobs aus:

| Job | Quellen |
|---|---|
| `traffic` | `TRAFFIC_VIEWS`, `TRAFFIC_CLONES`, `TRAFFIC_REFERRERS`, `TRAFFIC_PATHS` |
| `repo_stats` | `REPO_METADATA`, `COMMIT_ACTIVITY`, `CONTRIBUTORS`, `CODE_FREQUENCY`, `PARTICIPATION`, `PUNCH_CARD` |
| `releases` | `RELEASES` |

Eigenschaften:

- **Sperre pro Quelle:** Ein `RUNNING`-Eintrag, der jünger als 5 Minuten ist,
  verhindert einen zweiten Lauf derselben Quelle.
- **Retry:** maximal 3 Versuche, 1 s / 4 s Pause, nur bei transienten Fehlern.
  Kein Retry bei `PERMISSION_DENIED`, `NOT_CONFIGURED`, `NOT_FOUND`,
  `INVALID_RESPONSE`, `RATE_LIMITED` oder `ALREADY_RUNNING`.
- **Idempotenz:** Tageswerte und Wochenbuckets werden per Unique-Key
  aktualisiert; Referrer/Pfade/Contributors ersetzen nur den aktuellen
  Erhebungstag.
- **Status:** `SUCCESS`, `FAILED`, `PENDING` (202), `EMPTY` (204),
  `UNSUPPORTED` (422). `PENDING` wird im selben Lauf nicht wiederholt.
- **Retention:** `cleanupAnalyticsRetention()` läuft im manuellen Sync weiterhin
  standardmäßig mit (`includeRetention: true`). Die geplanten Analytics-Läufe
  überspringen sie und der eigene Schedule `analytics-retention` führt sie aus.
- **Fehlerstatus:** Ein fehlgeschlagener Cleanup meldet `RETENTION_FAILED` und
  setzt `ok: false` – im manuellen Lauf wie im Retention-Schedule.

### Endpunkt

`GET` und `POST` verhalten sich gleich und sind ausschließlich mit
Admin-Session erreichbar. Für geplante Läufe wird dieser Endpunkt nicht mehr
verwendet.

### Zeitplan

`vercel.json` deklariert fünf private Schedules auf einer gemeinsamen Function
(`api/schedules/analytics` mit `schedule/v1beta`); der frühere `crons`-Eintrag
ist entfernt:

| Schedule | Zeit (UTC) | Aufgabe |
|---|---|---|
| `analytics-traffic` | 03:15 | Traffic |
| `analytics-repo-stats` | 03:45 | Repository-Statistiken |
| `analytics-releases` | 04:15 | Releases/Assets |
| `analytics-retention` | 04:45 | nur Retention-Cleanup |
| `analytics-watchdog` | 05:15 | Betriebsprüfung und Alarm-Mail |

Jeder Lauf führt genau eine Aufgabe aus und läuft damit deutlich kürzer als der
frühere Gesamtlauf. Auf Vercel Hobby gilt ein Jitter von 15 Minuten; die
30-Minuten-Abstände verhindern Überlappungen.

Ein Unit-Test (`src/lib/__tests__/analytics-schedule-contract.test.ts`) hält
`vercel.json` und `ANALYTICS_SCHEDULES` zusammen: Schedule-Namen,
gemeinsames Function-Ziel und der `schedule/v1beta`-Trigger müssen
übereinstimmen, und jeder Eintrag braucht einen Cron-Ausdruck (fünf Felder)
und eine Zeitzone. Ein Rename löscht sonst still die Schedule-Historie, ein
falsches Ziel lässt die Schedules nie laufen.

### Watchdog

`analytics-watchdog` prüft um 05:15 UTC, nachdem alle schreibenden Läufe
abgeschlossen sind:

| Prüfung | Schwelle | Bedeutung |
|---|---|---|
| Quelle ohne Erfolg | > 28 h | ein ganzer Tageslauf fehlt |
| Lauf in `RUNNING` | > 15 min | Function wurde abgebrochen (Limit 300 s); der Lauf wird als `FAILED`/`ORPHANED` geschlossen |
| Traffic-Fenster | ≤ 4 verbleibende Tage | Warnung |
| Traffic-Fenster | ≤ 1 verbleibender Tag | kritisch |

Die verbleibenden Tage ergeben sich aus dem jüngsten Tag in
`GitHubTrafficDaily`. GitHub liefert nur die letzten 14 Tage; nach einem
längeren Ausfall sind die fehlenden Tage endgültig verloren. Anders als
Releases oder Repository-Statistiken lässt sich Traffic nicht rückwirkend
abrufen – deshalb ist diese Prüfung die einzige Warnung vor einem dauerhaften
Datenverlust.

Pro Lauf geht höchstens eine Mail an `ANALYTICS_ALERT_EMAIL` über
`src/lib/email.ts` (Resend/SMTP; Versand nur mit `EMAIL_DELIVERY_ENABLED=true`).
Sie enthält alle Befunde des Laufs. Gemeldet wird ein Vorfall nur einmal: Der
Watchdog speichert keinen Alarmzustand – das würde eine Migration erfordern –,
sondern leitet den Beginn des Vorfalls aus den Daten ab und mailt ihn nur
innerhalb von 25 Stunden. Ein andauernder Ausfall erzeugt damit genau eine
Mail, plus eine Eskalationsmail bei 56 h Quellen-Alter bzw. einem verbleibenden
Traffic-Tag. Verpasst der Watchdog selbst den Tag des Schwellenübertritts,
entfällt diese eine Mail; der nächste Vorfall meldet sich wieder.

Einzige Ausnahme: Liegt noch gar kein Traffic-Tag vor, gibt es keinen Zeitpunkt,
an dem der Vorfall begann. Dieser Hinweis wiederholt sich deshalb täglich, bis
der erste Lauf Daten schreibt.

Kann die Mail nicht zugestellt werden (Empfänger fehlt, Versand pausiert,
Provider-Fehler), endet der Lauf mit `NOTIFICATION_FAILED` und die
Vercel-Ausführung wird rot. Konnte der Watchdog die Statuszeilen nicht lesen,
meldet er `WATCHDOG_FAILED`.

## 4. Retention

| Daten | Frist |
|---|---|
| Pageviews und Download-Anfragen (granular) | 90 Tage |
| Traffic-Tageswerte, Release-Snapshots, Repo-Statistiken | dauerhaft (aggregiert) |
| Referrer-/Pfad-Snapshots | derzeit nicht automatisch gelöscht (dauerhaft) |
| Sync-Läufe | derzeit nicht automatisch gelöscht |

Der Cleanup löscht ausschließlich anonyme Tagesaggregate; es gibt in diesem
Schema keine personenbezogenen Datensätze.

## 5. Admin-Oberfläche

| Route | Zweck |
|---|---|
| `/admin/analytics` | Übersicht, getrennte GitHub-/Website-KPIs, Sync-Zusammenfassung |
| `/admin/analytics/traffic` | Tageswerte, Referrer, Pfade |
| `/admin/analytics/releases` | Assets, Kanäle, Digest, Download-Differenzen |
| `/admin/analytics/downloads` | Download-Anfragen nach Kanal/Plattform/Arch/Land |
| `/admin/analytics/repository` | Metadaten, Commits, Contributors, Code-Frequenz, Participation, Punch Card |
| `/admin/analytics/website` | Pageviews nach Pfad/Referrer/Land/Gerät/OS |
| `/admin/analytics/audience` | Zielgruppe, getrennt nach Quelle |
| `/admin/analytics/sync` | Quellenstatus und letzte Läufe |

Alle Seiten rendern pro Request (`await connection()`), haben Leer- und
Fehlerzustände und zeigen bei fehlenden Quellen „–“ statt geschätzter Werte.

## 6. Datenschutz

Kurzfassung; Details in [`PRIVACY.md`](./PRIVACY.md).

- Keine IP-Speicherung, keine Cookies, kein Fingerprinting, keine
  geräteübergreifenden IDs.
- Nur normalisierte Pfade, Referrer-Hostnamen, Land aus Hoster-Headern, grobe
  Geräte-/OS-Klassen und Zähler.
- `DNT`/`GPC` und Bots werden nicht gezählt; private Routen sind ausgeschlossen.
- Download-Anfragen werden nicht als erfolgreiche Downloads bezeichnet.

## 7. Rollout-Plan (nicht ausgeführt)

1. **GitHub App:** `Administration: read` ergänzen und Installation
   bestätigen; danach Traffic-Status prüfen.
2. **Migrationen:** In Preview zuerst anwenden:
   `npm run db:migrate` mit `DIRECT_URL` der Preview-Datenbank, danach
   `npm run db:verify`. Für Produktion nur nach ausdrücklicher Freigabe.
3. **Deploy:** Anwendung deployen; die Migration muss vor dem ersten Request
   abgeschlossen sein.
4. **Secrets:** `CRON_SECRET` bleibt nur für den Download-Sync relevant; die
   Analytics-Schedules benötigen es nicht. Für den Watchdog zusätzlich
   `ANALYTICS_ALERT_EMAIL` setzen und den Versand mit
   `EMAIL_DELIVERY_ENABLED=true` freigeben; ohne beides bleibt der Alarm aus
   und der Watchdog meldet `NOTIFICATION_FAILED`.
5. **Manueller Smoke-Test:** als Admin angemeldet
   `POST /api/admin/analytics/sync`. Erwartet: `200`, elf Quellenstatus, keine
   Tokens in der Antwort.
6. **Status prüfen:** `/admin/analytics/sync` und
   `/admin/analytics/traffic`; bei fehlender Traffic-Berechtigung
   `PERMISSION_DENIED` prüfen.
7. **Schedules beobachten:** Nach dem ersten geplanten Lauf die
   Vercel-Execution-History (Logzeile `analytics.schedule`) und
   `AnalyticsSyncRun` prüfen.

**Rollback:** Ein App-Rollback ist unkritisch, weil alle Analytics-Schreibpfade
additiv sind und keine bestehenden Tabellen verändern. Migrationen werden nicht
zurückgerollt; die neuen Tabellen bleiben ohne Nutzen liegen. Es werden keine
Daten gelöscht.

## 8. Fehlerbehebung

| Symptom | Ursache / Prüfung |
|---|---|
| Traffic `PERMISSION_DENIED` | `Administration: read` fehlt oder Installation wurde nicht aktualisiert |
| Alle Quellen `NOT_CONFIGURED` | GitHub-App-Credentials fehlen in der Umgebung |
| `RATE_LIMITED` | GitHub-Quota erschöpft; nächster Lauf versucht es erneut |
| `PENDING` bleibt über mehrere Läufe | GitHub berechnet die Statistik noch oder Repository ist zu jung |
| Admin-Seiten zeigen „–“ | Tabelle fehlt oder DB nicht erreichbar; `db verify` prüfen |
| Schedule läuft nicht | Schedules-Beta für das Team nicht aktiv, Deployment nicht aktiv oder Hobby-Plan-Limit |
| `RETENTION_FAILED` | Cleanup-Query fehlgeschlagen; Retention-Schedule und manueller Lauf melden es als Fehler |
| `NOTIFICATION_FAILED` | Watchdog konnte nicht mailen: `ANALYTICS_ALERT_EMAIL` fehlt, `EMAIL_DELIVERY_ENABLED` ist nicht `true` oder der Provider lehnte ab |
| `WATCHDOG_FAILED` | Watchdog konnte die Statuszeilen nicht lesen (Datenbank nicht erreichbar) |
| Watchdog meldet Traffic-Fenster | Traffic-Sync ausgefallen; Lauf anstoßen, bevor die 14 Tage ablaufen – danach sind die Tage verloren |
| Lauf steht dauerhaft auf `RUNNING` | Function abgebrochen; der Watchdog schließt ihn nach 15 min als `FAILED`/`ORPHANED` |

## 9. Nicht umgesetzt

- Kein Live-Test gegen GitHub in dieser Umgebung (keine App-Credentials).
- Kein visueller Browser-Test der Admin-Seiten.
- Keine automatische Löschung von Referrer-/Pfad-Snapshots und Sync-Läufen.
- Kein dauerhafter Alarmzustand in der Datenbank: Der Watchdog meldet einen
  Vorfall über das 25-Stunden-Fenster genau einmal (siehe §3).
- Keine Produktionsmigration und kein Deployment im Rahmen der Umsetzung.
