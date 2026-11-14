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
- Der Sync-Endpunkt akzeptiert entweder `Authorization: Bearer $CRON_SECRET`
  oder eine Admin-Session. Alles andere erhält `401`.
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
- **Retention:** `cleanupAnalyticsRetention()` läuft am Ende jedes Syncs.

### Endpunkt

```bash
# Cron / manuell
curl -X POST https://<host>/api/admin/analytics/sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

`GET` und `POST` verhalten sich gleich; Vercel Cron verwendet `GET`.

### Zeitplan

`vercel.json`:

```json
"crons": [{ "path": "/api/admin/analytics/sync", "schedule": "15 3 * * *" }]
```

Täglich 03:15 UTC. Auf Vercel Hobby ist ein Lauf pro Tag möglich; alle Quellen
laufen sequenziell. Bei Timeout kann der Lauf in zwei Cron-Einträge
(Traffic/Stats) geteilt werden.

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
4. **Cron-Secret:** `CRON_SECRET` in Produktion setzen (wird bereits für den
   Download-Sync verwendet).
5. **Manueller Smoke-Test:**
   `curl -X POST https://<host>/api/admin/analytics/sync -H "Authorization: Bearer $CRON_SECRET"`.
   Erwartet: `200`, elf Quellenstatus, keine Tokens in der Antwort.
6. **Status prüfen:** `/admin/analytics/sync` und
   `/admin/analytics/traffic`; bei fehlender Traffic-Berechtigung
   `PERMISSION_DENIED` prüfen.
7. **Cron beobachten:** Nach dem ersten geplanten Lauf prüfen, ob
   `AnalyticsSyncRun` neue Einträge enthält.

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
| Cron läuft nicht | `CRON_SECRET` fehlt, Deployment nicht aktiv oder Hobby-Plan-Limit |

## 9. Nicht umgesetzt

- Kein Live-Test gegen GitHub in dieser Umgebung (keine App-Credentials).
- Kein visueller Browser-Test der Admin-Seiten.
- Keine automatische Löschung von Referrer-/Pfad-Snapshots und Sync-Läufen.
- Keine Produktionsmigration und kein Deployment im Rahmen der Umsetzung.
