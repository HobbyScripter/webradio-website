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

`vercel.json` deklariert vier private Schedules auf einer gemeinsamen Function
(`api/schedules/analytics` mit `schedule/v1beta`); der frühere `crons`-Eintrag
ist entfernt:

| Schedule | Zeit (UTC) | Aufgabe |
|---|---|---|
| `analytics-traffic` | 03:15 | Traffic |
| `analytics-repo-stats` | 03:45 | Repository-Statistiken |
| `analytics-releases` | 04:15 | Releases/Assets |
| `analytics-retention` | 04:45 | nur Retention-Cleanup |

Jeder Lauf führt genau einen Job aus und läuft damit deutlich kürzer als der
frühere Gesamtlauf. Auf Vercel Hobby gilt ein Jitter von 15 Minuten; die
30-Minuten-Abstände verhindern Überlappungen.

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
4. **Secret:** `CRON_SECRET` bleibt nur für den Download-Sync relevant; die
   Analytics-Schedules benötigen es nicht.
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

## 9. Nicht umgesetzt

- Kein Live-Test gegen GitHub in dieser Umgebung (keine App-Credentials).
- Kein visueller Browser-Test der Admin-Seiten.
- Keine automatische Löschung von Referrer-/Pfad-Snapshots und Sync-Läufen.
- Keine Produktionsmigration und kein Deployment im Rahmen der Umsetzung.


## 10. Phase DA 2.0 – Release-Kanäle, RC-Erkennung & erweiterte Download-Analytics

Mit Phase DA 2.0 wurde das Download- und Release-Analytics-System konsolidiert und erweitert:

### 10.1 Zentrale Release-Kanal-Klassifikation (`src/lib/analytics/channel.ts`)

Zuvor existierte in `src/lib/download-analytics-service.ts` eine Dreifach-Unterscheidung (`stable`, `beta`, `alpha`), wodurch Release Candidates wie `1.0.8-rc.1` fälschlicherweise als `beta` erfasst wurden.

Die zentrale Logik (`channelFor(tagName, prerelease)`) deckt nun alle vier Standardkanäle plus Edge-Cases ab:

| Kanal | Kennzeichnung | Token / Farbe | Beschreibung |
|---|---|---|---|
| **Stable** | `prerelease: false` (oder saubere Versionsnummer) | `#22c55e` (Grün) | Offiziell veröffentlichte Versionen |
| **Release Candidate (RC)** | Tag enthält `rc` (z. B. `1.0.8-rc.1`, `v1.0.8-RC.2`) | `#8b5cf6` (Violett) | Finale Testversionen vor dem Release |
| **Beta** | Tag enthält `beta` (z. B. `1.0.8-beta.1`) | `#f59e0b` (Orange) | Feature-vollständige Testversionen |
| **Alpha** | Tag enthält `alpha` (z. B. `1.0.8-alpha.1`) | `#ef4444` (Rot) | Frühe Entwicklungsversionen |
| **Unbekannt** | `prerelease: true`, aber kein bekanntes Muster | `#71717a` (Zink) | Fallback; keine stillschweigende Umwidmung |

Farben werden in der UI grundsätzlich von textuellen Badges (`ChannelBadge`) begleitet, um die Barrierefreiheit zu gewährleisten.

### 10.2 Erweiterte Zeiträume und Kennzahlen

- **Zeitfenster:** Die Filter unterstützen nun `7`, `30`, `90`, `180` (6 Monate) und `365` (1 Jahr) Tage.
- **KPI-Karten:** Neben den Gesamtzahlen (GitHub kumulativ vs. Website-Anfragen getrennt) werden Differenzen im ausgewählten Zeitfenster, der tägliche Zuwachsschnitt und der Spitzentag ausgewertet.
- **Plattform- und Format-Analyse:** Aufschlüsselung nach Betriebssystem (Windows, Linux, macOS, Arch Linux, Debian) sowie Paketformaten (EXE Installer, Portable, AppImage, DMG, PKG.TAR.ZST).
- **Referrer-Auswertung:** Normalisierte Herkunfts-Hostnames für Download-Anfragen (ohne speicherbare sensible Query-Parameter).
