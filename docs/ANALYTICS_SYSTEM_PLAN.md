# WebRadio Analytics – Bestandsaufnahme und Umsetzungsplan

Stand: 14.11.2026 · Status: **Phase 0 abgeschlossen, Plan freigegeben zur Umsetzung**
Grenzen: keine Produktionsdatenbank-Änderung, keine Produktionsmigration, kein Deployment,
keine GitHub-Schreibzugriffe, keine Secret-Änderung.

---

## 1. Phase 0 – Bestandsaufnahme

### 1.1 Vorhandene GitHub-App-Integration

| Baustein | Datei | Zustand |
|---|---|---|
| JWT (RS256, Client ID als `iss`, `iat` −60 s, `exp` +9 min) | `src/lib/github-app.ts` | vollständig, getestet |
| Installation Access Token (`POST /app/installations/{id}/access_tokens`) | `src/lib/github-app.ts` | vollständig, In-Process-Cache mit 2-Minuten-Reserve |
| Read-only-Verbindungscheck (JWT → Token → Repository → Releases) | `src/lib/github-app.ts` | vollständig, setzt `lastApiCallAt` |
| Repository-/Release-Snapshot mit Zod-Validierung und 5-Minuten-Cache | `src/lib/github.ts` | vollständig |
| Webhook (HMAC, Delivery-Idempotenz, `release`/`installation`/`installation_repositories`) | `src/app/api/webhooks/github/route.ts` | vollständig, getestet |
| Adminstatus mit Fehlercodes | `src/app/(admin)/admin/settings/integrations/github/page.tsx` | vollständig |

**Wichtig:** Die bestehende App hat laut Setup-Doku nur `Contents: read` und `Metadata: read`.
Die Traffic-Endpunkte verlangen laut GitHub-Doku (`REST API endpoints for repository traffic`
und „Permissions required for GitHub Apps“, Bereich *Administration*) **`Administration: read`**.
Ohne diese Berechtigung antworten alle vier Traffic-Endpunkte mit **403**. Das ist eine manuelle
GitHub-App-Änderung (Berechtigung ergänzen, Installation bestätigen) – kein Secret, kein Schreibzugriff.

### 1.2 Vorhandene Download-Analytics

| Baustein | Datei | Zustand |
|---|---|---|
| Release-Asset-Sync (Assets, Größe, `digest`, Download-Count, Tages-Snapshots) | `src/lib/download-analytics-service.ts` | vorhanden, idempotent per Unique-Key |
| Website-Download-Zählung (Asset + Land + UTC-Tag) | `src/app/api/downloads/[assetId]/route.ts` | vorhanden, 30/Minute/IP, keine IP-Speicherung |
| Download-Dashboard | `src/app/(admin)/admin/downloads/page.tsx` | vorhanden; seit Commit `0dbf420` mit Fehler-/Leerzuständen |
| Sync-Endpunkt (Admin-Session oder `CRON_SECRET`) | `src/app/api/admin/downloads/sync/route.ts` | vorhanden, nur POST, kein Zeitplan |
| Sync-Log / Lock | `DownloadSyncLog` | vorhanden (5-Minuten-Lock) |

### 1.3 Datenbankmodelle und Migrationen

Vorhanden (`prisma/contract.prisma`): `GitHubAppInstallation`, `GitHubWebhookDelivery`,
`GitHubReleaseAsset`, `GitHubDownloadSnapshot`, `WebsiteDownloadStat`, `DownloadSyncLog`.
Migration `migrations/app/20261114T2014_download_analytics_and_github_app` existiert und wurde
in Produktion angewendet (separate Freigabe, nicht Teil dieses Auftrags).

**Fehlend:** Traffic-Tageswerte, Referrer/Paths, Repository-Statistiken, Pageviews,
Download-Anfrage-Dimensionen, Sync-Status pro Datenquelle, Aufbewahrungs-Cleanup.

### 1.4 Admin-Routen, API-Endpunkte, Berechtigungen

- Admin-Routen: `/admin`, `users`, `moderation`, `reports`, `developer-applications`, `news`,
  `legal`, `downloads`, `audit`, `settings/integrations/github`. **Kein** `/admin/analytics`.
- Admin-APIs: `/api/admin/{users,news,moderation,audit-logs,downloads/sync}`.
- Autorisierung überall: `getServerAuthSession()` + `hasRole(role, 'ADMIN')`; Cron nur mit
  `Authorization: Bearer $CRON_SECRET`. Rollen unverändert.
- Öffentliche APIs: `/api/releases`, `/api/news`, `/api/plugins`, `/api/downloads/[assetId]`.

### 1.5 Cronjobs und Hintergrundprozesse

- `vercel.json` enthält **nur** `framework` und `installCommand` – **kein `crons`**.
- Kein Scheduler, kein Queue, kein Worker. `syncGitHubDownloadStats` läuft ausschließlich manuell
  über den Admin-Endpunkt; Webhooks triggern ihn bei `release` fire-and-forget.

### 1.6 Webhook-Verarbeitung

Signaturprüfung (HMAC-SHA256, `timingSafeEqual`), Repository-Bindung, Idempotenz über
`GitHubWebhookDelivery.deliveryId`, Statuswechsel bei `installation`, Sync-Anstoß bei `release`.
Tests: `src/app/api/__tests__/github-webhook-route.test.ts` (8 Fälle).

### 1.7 Fehlende Komponenten (Zusammenfassung)

1. GitHub Traffic (4 Endpunkte) inkl. 14-Tage-Archivierung.
2. Erweiterte Asset-Felder (`contentType`, `state`, garantiertes `digest`) und Release-Metadaten.
3. Repository-Statistiken (5 Endpunkte) und Metadaten-Snapshots.
4. Website-Analytics (Pageviews, Download-Einstiege, Dimensionen, Retention).
5. `/admin/analytics` mit 8 Unterbereichen und Filtern.
6. Zentraler Sync-Orchestrator mit Quellenstatus, Retry, Rate-Limit- und 202/204/422-Behandlung.
7. Täglicher Cron.
8. Aufbewahrungs-/Löschjob und Datenschutzdokumentation.

---

## 2. Architektur

```
GitHub REST (App-Token, read-only)          Browser (same-origin, anonym)
  traffic/*  stats/*  releases  repo           pageview / download request
        │                                         │
        ▼                                         ▼
 src/lib/analytics/github-*.ts            src/app/api/analytics/*,
 (Fetch + Zod + Retry + Rate-Limit)       src/app/api/downloads/[assetId]
        │                                         │
        └──────────► runAnalyticsSync() ◄─────────┘
                       │  pro Quelle: Lock, Status, Upsert
                       ▼
     AnalyticsSyncRun / AnalyticsSourceStatus + Fakten-Tabellen
                       │
                       ▼
        /admin/analytics/* (Server Components, ADMIN)
```

Grundsätze:

- **Eine** GitHub-Authentifizierung: `getInstallationAccessToken()`; keine zweite Token-Logik.
- Jede Quelle läuft isoliert; ein Fehler setzt nur ihren Status, nie das Dashboard außer Gefecht.
- Alle Schreibvorgänge sind Upserts über Unique-Keys → wiederholte Läufe zählen nicht doppelt.
- Nur lesende GitHub-Aufrufe, keine Schreiboperationen.

---

## 3. Datenbankmodelle (Vorschlag, Migration lokal erstellen – nicht anwenden)

### 3.1 GitHub Traffic

```prisma
model GitHubTrafficDaily {
  id             String   @id @onCreate(uuid(7))
  day            DateTime            // UTC 00:00
  views          Int      @default(0)
  uniqueVisitors Int      @default(0)
  clones         Int      @default(0)
  uniqueClones   Int      @default(0)
  capturedAt     DateTime
  updatedAt      DateTime @onUpdate(now())
  @@unique([day])
  @@index([day])
}

model GitHubTrafficReferrerSnapshot {
  id          String   @id @onCreate(uuid(7))
  capturedFor DateTime            // UTC-Tag des Abrufs
  referrer    String
  count       Int
  uniques     Int
  @@unique([capturedFor, referrer])
  @@index([capturedFor])
}

model GitHubTrafficPathSnapshot {
  id          String   @id @onCreate(uuid(7))
  capturedFor DateTime
  path        String
  title       String?
  count       Int
  uniques     Int
  @@unique([capturedFor, path])
  @@index([capturedFor])
}
```

- `traffic/views|clones` liefern Tageswerte (UTC) für 14 Tage → Upsert pro `day`; korrigierte
  Werte überschreiben, bereits gespeicherte Tage bleiben erhalten.
- Referrer/Paths liefern nur Top-10 für das Fenster, keine Tagesaufteilung → Snapshot pro Abruftag,
  atomar ersetzen (nur dieser Tag), Historie bleibt.
- Eindeutige Besucher pro Tag stammen aus dem Feld `uniques` je Tag; die Gesamtsumme des Fensters
  wird **nicht** als Tagessumme interpretiert.

### 3.2 Release-Assets (Erweiterung)

`GitHubReleaseAsset` ergänzen: `contentType String?`, `state String?`, `digest String?`,
`releaseName String?`, `releasePublishedAt DateTime?`, `isPrerelease Boolean @default(false)`.
Bestehende Spalten und Daten bleiben unverändert; `digest` wird nur übernommen, wenn
`sha256:[0-9a-f]{64}` matcht (wie in `src/lib/github.ts`).

### 3.3 Repository-Statistiken

```prisma
model GitHubRepoStatsSnapshot {
  id          String   @id @onCreate(uuid(7))
  capturedFor DateTime
  stars Int  forks Int  watchers Int  openIssues Int
  language String?  license String?  topics String?  // JSON-Array
  @@unique([capturedFor])
}

model GitHubCommitActivityWeek  { weekStart DateTime @unique, total Int, daysJson String }
model GitHubContributorSnapshot { capturedFor DateTime, login String, contributions Int,
                                  @@unique([capturedFor, login]) }
model GitHubCodeFrequencyWeek   { weekStart DateTime @unique, additions Int, deletions Int }
model GitHubParticipationWeek   { weekStart DateTime @unique, allCount Int, ownerCount Int }
model GitHubPunchCardSlot       { weekday Int, hour Int, count Int, @@unique([weekday, hour]) }
```

- `202 Accepted` = GitHub berechnet noch → Quelle `PENDING`, **kein** Retry in derselben Anfrage,
  erneuter Versuch beim nächsten Lauf (max. 3 Läufe, dann `UNAVAILABLE`).
- `204 No Content` = leere, aber gültige Antwort → `EMPTY` (kein Fehler).
- `422` = nicht verfügbar (z. B. zu junges/leeres Repo) → `UNSUPPORTED`, keine Wiederholung.

### 3.4 Website-Analytics (anonym, aggregiert)

```prisma
model WebsitePageViewDaily {
  id          String   @id @onCreate(uuid(7))
  day         DateTime
  path        String            // normalisierte Route, ohne Query/Hash
  referrerHost String?          // nur Hostname, nie volle URL
  countryCode String   @default("XX")
  deviceType  String   @default("unknown")   // desktop|mobile|tablet|unknown
  os          String   @default("unknown")   // windows|macos|linux|android|ios|other
  count       Int      @default(1)
  @@unique([day, path, referrerHost, countryCode, deviceType, os])
  @@index([day]) @@index([path])
}

model WebsiteDownloadRequestDaily {
  id          String   @id @onCreate(uuid(7))
  day         DateTime
  assetId     String?
  releaseTag  String?
  channel     String?
  platform    String?
  arch        String?          // x64|arm64|other, nur aus Dateiname/UA
  countryCode String   @default("XX")
  referrerHost String?
  count       Int      @default(1)
  @@unique([day, assetId, releaseTag, channel, platform, arch, countryCode, referrerHost])
  @@index([day]) @@index([releaseTag])
}
```

**Abgrenzung:** `WebsitePageViewDaily` = Seitenaufruf; `WebsiteDownloadRequestDaily` =
Download-**Anfrage** (kein bestätigter erfolgreicher Download). Bestehende
`WebsiteDownloadStat` bleibt unangetastet und wird weiter gepflegt; das neue Dashboard liest
beide getrennt, ohne Doppelzählung.

### 3.5 Sync-Status

```prisma
enum AnalyticsSyncStatus { RUNNING SUCCESS PARTIAL FAILED PENDING EMPTY UNSUPPORTED }
enum AnalyticsSource { TRAFFIC_VIEWS TRAFFIC_CLONES TRAFFIC_REFERRERS TRAFFIC_PATHS
                       RELEASES REPO_METADATA COMMIT_ACTIVITY CONTRIBUTORS
                       CODE_FREQUENCY PARTICIPATION PUNCH_CARD }

model AnalyticsSyncRun {
  id String @id @onCreate(uuid(7))
  source AnalyticsSource
  status AnalyticsSyncStatus
  startedAt DateTime @onCreate(now())
  completedAt DateTime?
  httpStatus Int?
  itemCount Int @default(0)
  errorCode String?
  errorMessage String?
  @@index([source, startedAt]) @@index([status])
}

model AnalyticsSourceStatus {
  source AnalyticsSource @id
  status AnalyticsSyncStatus
  lastSuccessAt DateTime?
  lastFailureAt DateTime?
  lastHttpStatus Int?
  lastErrorCode String?
  lastErrorMessage String?
  updatedAt DateTime @onUpdate(now())
}
```

### 3.6 Aufbewahrung

| Daten | Aufbewahrung | Begründung |
|---|---|---|
| Traffic-Tageswerte, Release-Snapshots | dauerhaft | aggregiert, keine Personenbezüge |
| Referrer/Paths | 180 Tage | Momentaufnahmen ohne Personenbezug |
| Pageviews/Download-Anfragen (Tagesaggregate) | 90 Tage granular, danach Löschjob | Datenminimierung; keine Wiederherstellbarkeit von Personen |
| Sync-Logs | 30 Tage | Betriebsdiagnose |

Löschjob `cleanupAnalyticsRetention()` läuft im täglichen Cron mit.

---

## 4. API-Endpunkte und Berechtigungen

| Endpunkt | Methode | Zugriff | Zweck |
|---|---|---|---|
| `/api/analytics/pageview` | POST | öffentlich, same-origin, Rate-Limit | anonymer Seitenaufruf, Antwort `204` |
| `/api/downloads/[assetId]` | GET | öffentlich, bestehendes Limit | Anfrage zählen (neue Dimensionen), Weiterleitung |
| `/api/admin/analytics/sync` | GET + POST | `CRON_SECRET` **oder** ADMIN | Sync aller/ausgewählter Quellen |
| `/admin/analytics` und Unterseiten | GET | ADMIN (Layout prüft bereits) | Dashboard |

**Keine neuen Rollen, keine gelockerten Prüfungen.** `SYSTEM_ADMIN` erbt wie bisher über
`hasRole`. Kein Analytics-Zugriff für `DEVELOPER` oder `USER`.

---

## 5. Synchronisation

- Orchestrator `runAnalyticsSync({ sources?, force? })` mit Lock pro Quelle
  (`RUNNING` jünger als 5 Minuten blockiert) und `AnalyticsSyncRun`-Protokoll.
- Retry: max. 3 Versuche, Backoff 1 s / 4 s / 9 s, nur bei Netzwerk, 5xx, 429
  (Respect `Retry-After`, Deckel 30 s). Kein Retry bei 401/403/404/422.
- Rate-Limit: `x-ratelimit-remaining`/`x-ratelimit-reset` lesen; bei 0 Quelle
  `RATE_LIMITED` beenden, nächster Cron-Lauf versucht erneut.
- Idempotenz: alle Schreibvorgänge als Upsert über die Unique-Keys aus §3.
- Fehlerisolation: jede Quelle eigenes `try/catch`; gespeicherte Daten bleiben lesbar.
- Status: `lastSuccessAt`, `lastFailureAt`, `lastHttpStatus`, stabiler `lastErrorCode`
  (nie Response-Body, nie Token).
- Zeitplan: `vercel.json` → `crons: [{ path: "/api/admin/analytics/sync", schedule: "15 3 * * *" }]`.
  Vercel-Cron ruft GET mit `Authorization: Bearer $CRON_SECRET` auf. Auf Hobby ist ein Lauf/Tag
  möglich; alle Quellen laufen sequenziell mit kurzen Timeouts. Bei Timeout-Gefahr werden
  Traffic und Stats auf zwei Cron-Einträge verteilt (Plan-abhängig).

---

## 6. Datenschutz (Phase 4)

Ohne Einwilligung verarbeitet (aggregiert, keine Kennungen):

- normalisierter Pfad, Tag (UTC), Referrer-**Host**, Land aus Hoster-Header, grobe
  Geräte-/OS-Klasse, Download-Anfrage je Asset/Kanal/Plattform.

Nicht verarbeitet: vollständige IP, Cookies, localStorage-IDs, Fingerprints, Cross-Site-IDs,
volle User-Agents, Query-Strings, E-Mail/Account-Bezug.

Regeln:

- `DNT: 1` und `Sec-GPC: 1` → keine Zählung.
- Bot-/Prefetch-Erkennung (`purpose: prefetch`, bekannte Crawler-UA) → keine Zählung.
- Admin-, Auth- und Account-Pfade werden ausgeschlossen.
- Pfade auf 200 Zeichen begrenzt, unbekannte Pfade zu `(other)` zusammengefasst.
- Keine externe GeoIP-Übertragung; Land ausschließlich aus `x-vercel-ip-country`/`cf-ipcountry`.
- Eine Einwilligung wäre erst nötig, wenn künftig Cookies, geräteübergreifende IDs oder
  personenbezogene Profile hinzukommen. Das wird in `docs/PRIVACY.md` ergänzt.

---

## 7. Phasen und Deliverables

| Phase | Inhalt | Dateien (neu/geändert) | Tests |
|---|---|---|---|
| **P1 Schema** | Modelle aus §3, Migration **lokal** erzeugen, keine Prod-Anwendung | `prisma/contract.prisma`, `migrations/app/<neu>/` | `db:verify` lokal |
| **P2 Traffic** | 4 Endpunkte, Zod, Upsert, 14-Tage-Archiv, 403/429/5xx | `src/lib/analytics/github-traffic.ts`, `.../github-client.ts` | 200, 403, 429, 5xx, 202/204, leere/ungültige Payloads |
| **P3 Releases** | neue Asset-Felder, Release-Metadaten, Snapshot-Differenzen | `github-releases.ts`, `download-analytics-service.ts` | Digest/Content-Type/State, unveränderte Summen |
| **P4 Repo-Stats** | 5 Statistik-Endpunkte + Metadaten-Snapshots, 202/204/422 | `src/lib/analytics/github-repo-stats.ts` | 202→PENDING, 204→EMPTY, 422→UNSUPPORTED, 429 |
| **P5 Website** | Pageview-API, Download-Dimensionen, DNT/GPC, Retention | `src/app/api/analytics/pageview/route.ts`, `src/lib/analytics/website.ts`, `src/lib/analytics/retention.ts` | DNT/GPC, Bot, Pfadnormalisierung, Rate-Limit, keine IP |
| **P6 Admin** | `/admin/analytics` + 8 Unterseiten, Filter, getrennte GitHub/Website-Zahlen | `src/app/(admin)/admin/analytics/**`, `src/lib/analytics/queries.ts` | Rendering mit Daten, leer, Quellenfehler, Berechtigungen |
| **P7 Sync/Cron** | Orchestrator, Status, Retry, `vercel.json`-Cron | `src/lib/analytics/sync.ts`, `src/app/api/admin/analytics/sync/route.ts` | Lock, Doppellauf, Teilausfall, Statuswerte |
| **P8 Härtung** | vollständige Tests, `tsc`, Lint, Build, Doku | `docs/ANALYTICS.md`, `docs/PRIVACY.md` | siehe §8 |

Jede Phase endet mit eigenem Bericht; keine Phase gilt als fertig ohne Tests.

---

## 8. Testmatrix (Phase 8)

- GitHub: 200, 202, 204, 403, 404, 422, 429, 500, Timeout, ungültiges JSON, unvollständige Felder.
- Traffic: doppelter Lauf am selben Tag (keine Duplikate), korrigierte Werte (Update),
  ältere Tage bleiben nach 14 Tagen erhalten.
- Releases: neue Felder, fehlender Digest, Kanalerkennung, Snapshot-Differenz ohne negative Werte.
- Repo-Stats: 202 wird nicht in einer Anfrage wiederholt; 3 Fehlversuche → `UNAVAILABLE`.
- Website: DNT/GPC, Bot-UA, Pfadnormalisierung, keine IP-Speicherung, Retention-Löschung.
- Admin: alle 8 Bereiche mit Daten, leer und bei Quellenfehler; Zugriff nur ADMIN.
- Sync: Lock, Teilausfall einer Quelle, Status pro Quelle, Rate-Limit-Abbruch.
- Gesamt: `npm test`, `npm run type-check`, `npm run lint`, `npm run build`.

---

## 9. Offene Entscheidungen / manuelle Schritte

1. **GitHub-App-Berechtigung `Administration: read` ergänzen** und Installation bestätigen –
   ohne sie liefern alle Traffic-Endpunkte 403. Kein Secret, kein Schreibzugriff.
2. **Cron-Plan**: ein täglicher Lauf (Hobby) oder zwei (Traffic/Stats getrennt, Pro).
3. **Retention**: 90 Tage granular / 180 Tage Referrer bestätigen.
4. **Pfad-Speicherung**: normalisierte Routen ja, Query/Hash nein (Vorschlag).
5. **Produktionsmigration**: wird in diesem Auftrag **nicht** ausgeführt; Migration wird nur
   lokal erzeugt und geprüft.

---

## 10. Nicht Teil dieses Auftrags

- Deployment, Produktionsmigration, Änderung von Secrets oder GitHub-App-Berechtigungen.
- Änderung bestehender Webhook-/Auth-Mechanismen.
- Löschen vorhandener Daten.
