# WebRadio Advertising & Partner Portal – Reparatur und Abschluss

**Datum:** 2026-11-22 (Reparatur), 2026-11-23 (Browser-Abnahme)
**Repository:** YourEliteSystems/WebRadio-Website
**Branch:** `feature/analytics-vercel-schedules` (uncommitted, HEAD `a3b757f`)
**Status:** REPARIERT UND IM BROWSER ABGENOMMEN – Build, Typprüfung, Lint und Tests grün; Abnahme mit 14 dokumentierten Befunden (§11); wartet auf Freigabe

> Kein Commit, kein Push, kein Deployment, keine Produktionsmigration.
> Alle Änderungen liegen ausschließlich im Arbeitsbaum.

---

## 1. Ausgangslage

| Paket | Installierte Version |
| --- | --- |
| `prisma` (Prisma 8, contract-first ORM) | `8.0.0-rc.27` |
| `@prisma/orm-postgres` | `8.0.0-rc.27` |
| `zod` | `4.6.7` |
| `next` | `16.4.6` |

Die im vorherigen Bericht genannten 53 TypeScript-Fehler wurden nachgezählt:
`npx tsc --noEmit` lieferte **44 Diagnosezeilen** (die ältere Zahl zählte
Folgezeilen mit). Zusätzlich bestanden 8 ESLint-Fehler und der Production-Build
brach an der Seite `/partners` ab.

Ursachen, alle bestätigt an den installierten Typdeklarationen:

1. **Prisma-7-Syntax statt Prisma 8:** `.insert()`, `.all().first()`,
   `.findMany()`, `.create()` mit Fremdschlüssel-Objekt, `.count()` als
   Collection-Terminal und `.and()` als Feldmethode existieren in Prisma 8 nicht.
2. **`DateTime` ist `Temporal.Instant`, nicht `Date`.** Der Contract deklariert
   `pg/timestamptz-temporal@1`; jedes `new Date()` an einer Spalte ist ein
   Typfehler.
3. **Fehlende Typimporte:** `ApplicationStatus`, `AdvertiserStatus`,
   `AdCampaignStatus`, `PartnerStatus`, `PartnerRelationshipType`,
   `PartnerRelationshipStatus` wurden nie importiert.
4. **Zod 4:** `ZodError.errors` wurde zu `issues`; `z.nativeEnum` liefert einen
   nominalen TS-Enum-Typ, der nicht als Contract-Stringwert verwendbar ist.
5. **Nicht existierende Helfer:** `requireRateLimit` aus `@/lib/rate-limit` gab
   es nie; das Projekt nutzt `enforceIpRateLimit`/`consumeRateLimitSafely`.
6. **Next 16:** dynamische Route-Parameter sind ein `Promise` und müssen
   `await`ed werden.
7. **Cache Components:** eine ungecachte Datenabfrage ohne `Suspense` (und ohne
   `connection()`) bricht den Prerender ab.

---

## 2. Fehlerinventar und Behebung

| Datei | Diagnosen | Ursache | Behebung |
| --- | --- | --- | --- |
| `src/lib/advertising/service.ts` | 27 | Prisma-7-API, `Date` statt `Instant`, fehlende Statusstypen, `_type` | vollständig auf die Prisma-8-API umgestellt (siehe §3), Typaliase aus `Models`, `toInstant()`/`utcDayStart()` |
| `src/lib/partner/service.ts` | 10 | `.insert()`, `.all().first()`, fehlende Typen, `orderBy` auf Boolean, `.count()` | Prisma-8-API, Aggregat statt `count()`, „Featured zuerst“ in JS (stabiler Sort) |
| `src/app/advertising/AdvertisingForm.tsx` | 2 | `ZodError.errors` entfernt | `error.issues`, Feldpfad typisiert |
| `src/app/advertising/page.tsx` | 1 | `AdvertisingForm` nicht importiert | Import ergänzt |
| `src/app/api/admin/advertising/applications/route.ts` | 1 | `requireAdmin(request, true)` liefert `true \| Session` | `requireAdminSession()` (DB-validierte Session) |
| `src/app/api/admin/partners/[id]/history/route.ts` | 1 | `findMany` existiert nicht; `params` ist ein Promise | `.where().include().orderBy().all()`, `await params` |
| `src/app/api/advertising/application/route.ts` | 1 | `requireRateLimit` existiert nicht | `enforceIpRateLimit` mit neuem Scope `advertisingApplicationIp` |
| `src/app/partners/page.tsx` | 1 | `PartnerService` nicht importiert; `any`-Pay­load | reine Dauerfunktion, typisierte Daten, `Suspense` + `connection()` |

Zusätzlich behoben (vom Typecheck nicht erfasst, aber fehlerhaft):

- **8 ESLint-Fehler** (`no-explicit-any`) in den vier Admin-Seiten; alle
  API-Antworten sind jetzt konkret typisiert.
- **Hook-Reihenfolgefehler** in `admin/advertising/applications/page.tsx`:
  `useEffect` rief `fetchApplications` auf, bevor die Konstante deklariert war
  (`Cannot access variable before it is declared`) – das wäre zur Laufzeit ein
  `ReferenceError` beim ersten Rendern gewesen. Jetzt lädt der Effekt selbst und
  ein `refreshKey` löst das Nachladen aus.
- **Build-Abbruch `/partners`:** Die Seite holte ihre Daten per HTTP von sich
  selbst (`NEXTAUTH_URL/api/partners`). Sie liest jetzt über den vorhandenen
  Service direkt aus PostgreSQL, innerhalb eines `Suspense`-Rahmens und hinter
  `await connection()`.

---

## 3. Prisma-8-Korrekturen im Einzelnen

| Vorher (Prisma 7) | Jetzt (Prisma 8, verifiziert) |
| --- | --- |
| `db.orm.public.X.insert({...})` | `db.orm.public.X.create({...})` |
| `.insert({...}).all().first()` | `await ...create({...})` – liefert die Zeile |
| `.where({id}).first()` | unverändert gültig (`LIMIT 1`) |
| `.update({...}).all().first()` | `await .where({id}).update({...})` – liefert `Row \| null` |
| `db.orm.public.PartnerHistory.findMany({where, include, orderBy})` | `.where({...}).include('relationship').orderBy((e) => e.createdAt.desc()).all()` |
| `.where((c) => c.placement.eq(p).and(...))` | `and(...)` aus `@prisma/orm-postgres/orm-client` |
| `.where({ day: new Date() })` | `.where({ day: Temporal.Instant })` |
| `.where({status}).count()` | `.aggregate((a) => ({ total: a.count() }))` |
| `.orderBy((p) => p.isFeatured.desc())` | Boolean ist nicht sortierbar → Sortierung der geladenen Zeilen in JS |

Die Datenmodelle und Beziehungen wurden **nicht** verändert; der Contract-Diff
gegenüber `HEAD` besteht ausschließlich aus den 255 Zeilen der neuen
Advertising-/Partner-Modelle und -Enums. `.env`, Schema und Tabellenstruktur
bleiben unverändert.

**Korrektur einer Fehlzuordnung:** `createCampaign` schrieb die eingehende
`advertiserId` in die Spalte `partnerId`. Jetzt wird `advertiserId` gesetzt
(`partnerId` bleibt `null`, es ist der separate Partner-Pfad derselben Tabelle),
und `getCampaigns({ advertiserId })` filtert auf `advertiserId`. Die
Admin-Kampagnenliste erhält dafür `include('advertiser')`.

---

## 4. Authentifizierung und Rollen

Es wurde **keine** parallele Authentifizierung eingeführt. Alle administrativen
Endpunkte nutzen jetzt den vorhandenen, DB-validierten Pfad
`requireAdminSession()` aus `src/lib/server-auth.ts` (derselbe Helfer wie in
`(admin)/admin/actions.ts`): 401 bei fehlender Session, 403 bei zu niedriger
Rolle, Rolle immer aus PostgreSQL statt aus dem JWT-Claim.

| Endpunkt | Schutz |
| --- | --- |
| `GET/PATCH /api/admin/advertising/applications` | `requireAdminSession` |
| `GET/POST/PATCH /api/admin/advertising/advertisers` | `requireAdminSession` |
| `GET/POST/PATCH /api/admin/advertising/campaigns` | `requireAdminSession` |
| `GET /api/admin/advertising/campaigns/[id]/stats` | `requireAdminSession` |
| `GET/POST/PATCH /api/admin/partners` | `requireAdminSession` (GET war zuvor ungeschützt) |
| `POST/PATCH /api/admin/partners/relationships` | `requireAdminSession` |
| `GET /api/admin/partners/[id]/history` | `requireAdminSession` |
| `GET /api/admin/partners/stats` | `requireAdminSession` |
| `GET /api/partners` | öffentlich (war fälschlich admin-only und damit für die öffentliche Seite unbrauchbar) |
| `POST /api/advertising/application` | öffentlich + Same-Origin + Rate-Limit |
| `GET /api/advertising/campaigns` | öffentlich, nur aktive Kampagnen |
| `POST /api/advertising/{impression,click}` | öffentlich, Same-Origin, validierte Nutzlast |

Weitere Sicherheitskorrekturen:

- **Same-Origin-Prüfung** (`isSameOriginRequest`) für alle schreibenden
  Endpunkte.
- **`performedBy` in der Partnerhistorie** kommt aus der Session (`admin.id`)
  statt aus dem Request-Body; ein Administrator kann keine fremde Identität
  eintragen.
- **URL-Schema:** `z.string().url()` akzeptiert auch `javascript:`-URIs. Für
  `targetUrl`, Website- und Logo-URLs ist jetzt zusätzlich `http(s)://`
  vorgeschrieben (Schutz vor `href`/`src`-Injection).
- **Rate-Limit:** neuer Scope `advertisingApplicationIp` (5 Bewerbungen pro
  Minute und IP) im bestehenden durable Limiter; ohne vertrauenswürdigen Proxy
  wird – wie bei allen anderen IP-Limits im Projekt – bewusst übersprungen.

---

## 5. Zod 4 und TypeScript

- `ZodError.errors` → `error.issues` (Formular und API-Antworten).
- **Datumsfelder:** ein `<input type="date">` sendet `YYYY-MM-DD`, die alten
  Schemata verlangten `z.string().datetime()` und lehnten damit jede Eingabe ab.
  Akzeptiert werden jetzt ISO-Datum **und** ISO-Zeitstempel; die
  Validierungsregel bleibt „gültiges ISO-8601“.
- **Contract-Werte:** `AdFormat`/`AdPlacementType` sind keine TS-Enums mehr,
  sondern aus `z.enum([...])` abgeleitete String-Unions. Ein nominaler Enum-Typ
  ließ sich nicht als Contract-Wert verwenden (`"BANNER"` ≠ `AdFormat.BANNER`).
- **Keine Unterdrückung:** kein `any`, kein `@ts-ignore`, kein `@ts-nocheck`,
  keine `as`-Casts an den reparierten Stellen. Fehlgeschlagene Validierung wird
  als HTTP 400 mit Feldpfaden beantwortet (`errorResponse` behandelt
  `ZodError` jetzt zentral).

---

## 6. Datenbank und Migration

Das Projekt versioniert Migrationen unter `migrations/app/<zeitstempel>_<name>/`
mit Contract-Snapshots unter `migrations/snapshots/`.

- **Neue Migration:** `migrations/app/20261122T2030_advertising_partner_portal`
  (geplant mit `--from 80e32e10…`, dem zuletzt angewandten Contract-Hash).
- **Umfang:** 9 Tabellen (`Advertiser`, `AdCampaign`, `AdCreative`,
  `AdImpression`, `AdClick`, `AdvertisingApplication`, `Partner`,
  `PartnerRelationship`, `PartnerHistory`), 2 Unique-Constraints, 30 Indizes,
  9 Fremdschlüssel – **50 Operationen**.
- **Reihenfolge und Abhängigkeiten:** Tabellen zuerst, dann Unique-Constraints,
  dann Indizes, dann alle Fremdschlüssel. `PartnerRelationship` referenziert
  `Partner`, `PartnerHistory` referenziert `Partner` und
  `PartnerRelationship`, `AdvertisingApplication` referenziert `User`.
  Löschregeln wie im Contract (`Cascade`, `SetNull`).
- **Anwendung ausschließlich lokal:** auf einer wegwerfbaren
  PostgreSQL-18.6-Instanz (`127.0.0.1:5433`, Datenbank `webradio_test`), nicht
  auf der Entwicklungs- oder Produktionsdatenbank.
- **Ergebnis:** 15 Migrationen von leerer Datenbank angewandt (14 bestehende +
  neue), Marker `e54862c5d731…`, `db verify --strict` grün
  („Database marker and schema match contract“).
- Die Wegwerf-Instanz wurde nach den Tests vollständig entfernt
  (Container und Volume). Die lokale Entwicklungsdatenbank auf Port 5432 wurde
  nicht angefasst.

---

## 7. Testergebnisse

| Prüfung | Befehl | Ergebnis |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | **0 Fehler** (vorher 44) |
| ESLint | `npx eslint .` | **0 Fehler**, 9 Warnungen (vorher 8 Fehler, 11 Warnungen) |
| Unit-Tests | `npm test` | **68 Suiten / 662 Tests grün** (vorher 66/643) |
| Integrationstests | `TEST_DATABASE_URL=… npm run test:integration` | **8 Suiten / 137 Tests grün** (vorher 7/126) |
| Production-Build | `npm run build` | **Exit 0** |
| DB-Verifikation | `npm run db:verify -- --strict` | **grün** (Marker + Schema) |

Die 9 verbleibenden ESLint-Warnungen sind bestehende Stilhinweise
(`<img>` statt `next/image`, ein unbenutzter `Link`-Import); keine davon ist ein
Fehler und keine wurde unterdrückt.

### Neue Tests

**Unit (`src/lib/__tests__/partner-duration.test.ts`, 7 Tests)** – Dauerberechnung:
Jahre/Monate/Tage, Singularformen, Tagesübertrag aus dem Vormonat, gleicher Tag,
fehlendes Enddatum, ISO-String/ungültige Eingabe (kein „NaN“).

**Unit (`src/lib/__tests__/advertising-validations.test.ts`, 12 Tests)** –
Schemata: Formularwerte mit leeren optionalen Datumsfeldern, Datum vs.
Zeitstempel, Pflichtzustimmung, Mindestlänge, unbekannte Enums, Kampagnen-Zeitraum
(`endDate` nicht nach `startDate`), Nicht-UUID-Advertiser, `javascript:`-URL
abgelehnt, Tracking-Nutzlast, Query-Coercion, Umwandlung in `Temporal.Instant`,
ungültige Beziehungstypen/-Status.

**Integration (`src/lib/__tests__/advertising-partner.integration.test.ts`, 11
Tests, echte PostgreSQL-Datenbank):**

- Bewerbung: `PENDING`, `Instant`-Datumsfelder, `null`-Felder, UUIDv7.
- Statusfilter, Statuswechsel mit `reviewedAt`/`internalNotes`.
- Werbepartner anlegen; Kampagne wird über `advertiserId` (nicht `partnerId`)
  zugeordnet; `include('advertiser')` liefert den Firmennamen.
- Ungültiger Zeitraum wird abgelehnt.
- `getActiveCampaigns`: nur `ACTIVE` innerhalb des Zeitfensters und nur für die
  passende Platzierung.
- Impressionen/Klicks: Tagesaggregat ohne Duplikate (2 Impressionen → eine
  Zeile `count=2`), CTR 50 %, Datumsfilter liefert 0.
- Partner mit **drei Partnerschaftsarten gleichzeitig**; alle Zeilen bleiben
  erhalten.
- Beziehung beenden: `status=ENDED` + `endDate`, Zeile bleibt bestehen,
  Historieneintrag mit `performedBy` und Beziehungsreferenz.
- Öffentliche Liste: nur aktive Partner, nur aktive **öffentliche**
  Beziehungen, inaktive Partner unsichtbar, „Featured“ zuerst.
- Statistik: aktive/featured Partner, öffentliche Beziehungen je Typ.
- Historienabfrage des Admin-Endpunkts inklusive Beziehung.

Die Tests räumen ihre Daten selbst auf (Kampagnen kaskadieren zu
Impressionen/Klicks, Partner zu Beziehungen/Historie).

---

## 8. Build-Ergebnis

`npm run build` → **Exit 0**, „Compiled successfully“, TypeScript-Prüfung im
Build grün, 126 Seiten generiert.

- `/api/advertising/*` und `/api/admin/advertising/*`, `/api/admin/partners/*`
  sind dynamisch (`ƒ`).
- `/partners` ist **Partial Prerender** (`◐`): der Seitenrahmen wird
  vorgerendert, die Partnerliste wird zur Anfragezeit im `Suspense`-Rahmen
  gestreamt.
- `/advertising` ist statisch.

---

## 9. Geänderte Dateien

**Bibliothek**

- `src/lib/advertising/service.ts` – Prisma-8-Umsetzung, `Instant`-Umwandlung.
- `src/lib/advertising/validations.ts` – Status-/Query-/Tracking-Schemata,
  Datum-oder-Zeitstempel, HTTP(S)-URLs, Contract-Unions.
- `src/lib/partner/service.ts` – Prisma-8-Umsetzung, öffentliche Liste,
  Statistik, Historie.
- `src/lib/partner/duration.ts` – **neu**, reine Dauerformatierung.
- `src/lib/partner/validations.ts` – **neu**, Partner-/Beziehungs-Schemata.
- `src/lib/api-response.ts` – `ZodError` → 400 mit Feldpfaden.
- `src/lib/rate-limit.ts` – Scope `advertisingApplicationIp`.

**API-Routen**

- `src/app/api/admin/advertising/{applications,advertisers,campaigns}/route.ts`
- `src/app/api/admin/advertising/campaigns/[id]/stats/route.ts`
- `src/app/api/admin/partners/route.ts`
- `src/app/api/admin/partners/[id]/history/route.ts`
- `src/app/api/admin/partners/relationships/route.ts`
- `src/app/api/admin/partners/stats/route.ts`
- `src/app/api/advertising/{application,campaigns,click,impression}/route.ts`
- `src/app/api/partners/route.ts`

**Seiten**

- `src/app/advertising/page.tsx`, `src/app/advertising/AdvertisingForm.tsx`
- `src/app/partners/page.tsx`
- `src/app/(admin)/admin/advertising/{advertisers,campaigns,applications}/page.tsx`
- `src/app/(admin)/admin/partners/page.tsx`

**Datenbank**

- `migrations/app/20261122T2030_advertising_partner_portal/` (neu)
- `migrations/snapshots/e54862c5…/` (neu)

**Tests**

- `src/lib/__tests__/advertising-partner.integration.test.ts` (neu)
- `src/lib/__tests__/partner-duration.test.ts` (neu)
- `src/lib/__tests__/advertising-validations.test.ts` (neu)

Unverändert: `prisma/contract.prisma` (Modelle wurden nur gelesen),
`prisma/contract.json`/`contract.d.ts` wurden durch `contract emit` neu erzeugt,
`compose.yaml`, `deploy/`, alle Analytics-Dateien.

---

## 10. Verbleibende Einschränkungen

1. **Kein Commit, Push, Deployment, keine Produktionsmigration.** Die neue
   Migration ist lokal angewandt und liegt ungetrackt im Arbeitsbaum.
2. **Kampagnenzahl in der Werbepartner-Adminliste bleibt 0.** Der Contract hat
   keine Rückbeziehung `Advertiser.campaigns`; die Spalte zeigt deshalb
   weiterhin 0. Eine Rückbeziehung wäre eine neue Funktion samt weiterer
   Migration und wurde bewusst nicht ergänzt.
3. **Impression/Klick-Zählung ist lesen-dann-schreiben.** Zwei parallele
   Anfragen für dieselbe Kampagne/Platzierung/Tag können am Unique-Constraint
   scheitern; die Zählung ist nicht atomar. Das war vorher so und wurde nicht
   umgebaut (kein Fehlerbild der Reparaturphase).
4. **Visuelle Prüfung erfolgt.** Die Admin-Seiten wurden am 2026-11-23 im
   Browser durchgeklickt; die dabei gefundenen Darstellungs- und Funktionsfehler
   stehen in §11 und sind **nicht** behoben (der Abnahme-Auftrag schloss
   Fehlerbehebung und neue Funktionen aus).
5. **`src/lib/auth-middleware.ts` ist jetzt unbenutzt.** Alle Verwaltungsrouten
   nutzen `requireAdminSession()`; das alte JWT-only-Modul wurde nicht gelöscht.
6. **9 ESLint-Warnungen bestehen weiter** (Bildoptimierung, unbenutzter Import);
   sie sind projektweit vorhanden und keine Fehler.
7. **Kein Vercel-/Deployment-Test** in diesem Schritt; der Build ist lokal
   geprüft.
8. **`migrations/app/refs/db.json`** zeigt weiterhin auf den vorherigen
   Contract-Hash; der Ref wird erst durch einen expliziten Ref-Advance
   fortgeschrieben. Die Migrationskette selbst ist linear und vollständig.

---

## 11. Finale Browser- und Funktionsabnahme (2026-11-23)

### 11.1 Umgebung und Vorgehen

Die Abnahme lief gegen einen lokalen Dev-Server (`next dev`, Port 3000,
`NEXTAUTH_URL=http://localhost:3000`) und eine **wegwerfbare** lokale
PostgreSQL-18-Instanz (`127.0.0.1:5433`, Container `infra-acceptance-pg`).
Auf diese Instanz wurde die **bestehende** Migrationskette angewandt
(15 Migrationen, Marker `e54862c5…`); es wurde **keine** neue Migration
geplant oder geschrieben und **keine** Schemaänderung vorgenommen.

Testkonten (nur in der Wegwerf-Datenbank):

| Konto | Rolle | Zweck |
| --- | --- | --- |
| `abnahme-admin@example.test` | `ADMIN` | Verwaltungsbereich |
| `abnahme-user@example.test` | `USER` | Zugriffsschutz |

Testdaten (ausschließlich lokal, über die echten Endpunkte angelegt):
1 Werbepartner, 2 Kampagnen (`ACTIVE`), 3 Partner mit 6 Beziehungen
(öffentlich/privat, `ACTIVE`/`PAUSED`/`ENDED`), 1 Bewerbung über das
öffentliche Formular. Die Instanz wurde nach der Abnahme entfernt.

**Browser:** Chromium der Freebuff-Desktop-Anwendung (Local browser),
Geräteemulation über die Viewport-Steuerung.
**Bildschirmgrößen:** 1440 × 900 (Desktop), 1200 × 900 (kleiner Desktop),
390 × 844 (Mobil).

> Methodik: Die Screenshots der Vorschau spiegeln die Panel-Breite wider und
> beschneiden bei großen Viewports den rechten Rand. Überlappungen und
> horizontales Scrollen wurden deshalb **zusätzlich messtechnisch** geprüft
> (`document.documentElement.scrollWidth` gegen `innerWidth` sowie
> `getBoundingClientRect()` je Element). Die Aussagen unten beruhen auf diesen
> Messwerten, nicht auf dem Bildausschnitt.

### 11.2 Getestete Seiten und Funktionen

| Bereich | Geprüft | Ergebnis |
| --- | --- | --- |
| `/partners` | Rendering, Abschnitte je Beziehungsart, Karten, Website-Link, Dauerangabe | funktioniert; Sichtbarkeitsregeln korrekt |
| `/partners` (leer) | Verhalten ohne Daten | Abschnittsköpfe fehlen, **keine** Leer-Meldung (Befund D9) |
| `/advertising` | Rendering, Werbeformen, Ablauf, Datenschutz, Formular | funktioniert |
| Bewerbungsformular | Pflichtfelder, Kurzbeschreibung, `javascript:`-URL, Absenden | Client-Validierung mit Feldmeldungen; POST → **201**; Erfolgsansicht |
| Bewerbungsformular | Serverantwort bei ungültigem Origin | **403** (Same-Origin) |
| `/admin` | Anmeldung, Dashboard | funktioniert; Rolle aus der Datenbank |
| Bewerbungen | Liste, Statusfilter, Statuswechsel | Liste/Filter ok; **Sackgasse „Prüfen“** (Befund D1) |
| Bewerbungen | `PATCH` auf `APPROVED` | **200**, `reviewedById` aus der Session |
| Werbepartner | Liste, Deaktivieren, Aktivieren | funktioniert; Kampagnenspalte immer 0 (D11) |
| Werbepartner | Anlegen | nur per API (**201**), keine Oberfläche (D4) |
| Kampagnen | Liste, Werbepartner-Spalte, Zeitraum, Statuskette | `DRAFT → SCHEDULED → ACTIVE → PAUSED` im Browser durchgeklickt |
| Kampagnen | Anlegen, Partnerzuordnung | nur per API (**201**), keine Oberfläche (D4) |
| Kampagnen | Statistiken | API liefert Zahlen (3 Impressionen, 1 Klick, CTR 33,3 %), aber Pfad-Parameter wird ignoriert (D2); keine Oberfläche (D5) |
| Werbemittel (`AdCreative`) | Anzeige | **keine** Route und **keine** Oberfläche vorhanden (D5) |
| Partner (Admin) | Liste, Beziehungsanzahl, Statistik (2 aktiv / 1 Hauptpartner) | funktioniert |
| Partner (Admin) | Historie | Panel mit 3 `RELATIONSHIP_CREATED`-Einträgen, Datum, Detailtext |
| Partner (Admin) | „Bearbeiten“, Partnerschaftsdauer | Schaltfläche ohne Funktion (D7); Dauer nur öffentlich (D13) |
| Öffentliche Kampagnen-API | `GET /api/advertising/campaigns?placement=…` | nur `ACTIVE` im Laufzeitfenster; fehlende Platzierung → **400** |
| Tracking | `POST /impression`, `/click` | **200**, Tagesaggregat und CTR korrekt |

Keine JavaScript-Fehler in der Konsole; die einzigen Hintergrundanfragen waren
`/api/analytics/pageview` (204) und Next-Dev-Ressourcen. Keine fehlgeschlagenen
Anfragen außer einem abgebrochenen HMR-Chunk beim Seitenwechsel.

### 11.3 Darstellung Desktop und Mobil

| Seite | 1440/1200 px | 390 px |
| --- | --- | --- |
| `/partners` | sauber, Karten in 3 Spalten | eine Spalte, kein Überlauf (373 ≤ 390) |
| `/partners` (leer) | nur Kopfbereich, große leere Fläche | dito |
| `/advertising` | sauber, Formular zweispaltig | eine Spalte, kein Überlauf |
| Admin: Bewerbungen/Werbepartner/Kampagnen | Tabellen passen (`scrollWidth` ≤ Viewport) | **Tabellen abgeschnitten** (Befund D3) |
| Admin: Partner | Statistik + Tabelle passen | Tabelle ebenfalls betroffen (D3) |

Befund D3 im Detail: Die Tabellen sind 805 px breit, ihr Container ist auf
Mobil 341 px breit und hat `overflow-x: hidden` (`scrollWidth` 805 bei
`clientWidth` 341). Spalten wie Platzierung, Zeitraum, Status und die
Aktionen („Freigeben“, „Pausieren“) sind dadurch auf Mobilgeräten weder
sichtbar noch erreichbar; es gibt keinen horizontalen Scrollbereich.

`/partners` und `/advertising` liegen außerhalb der Route-Group `(public)` und
rendern deshalb **ohne** globale Kopf- und Fußnavigation (Befund D10).

### 11.4 Zugriffstests

| Prüfung | Ergebnis |
| --- | --- |
| `GET /admin`, `/admin/partners`, `/admin/advertising/*` ohne Session | **307** → `/auth/login?callbackUrl=…` |
| `GET /api/admin/partners`, `/stats`, `/advertising/advertisers`, `/advertising/applications` ohne Session | **401** `UNAUTHORIZED` |
| `GET /partners`, `/advertising`, `/api/partners` ohne Session | **200** |
| `GET /admin` als `USER` | Seite „403 — Keine Berechtigung“ (AccessDenied) |
| `GET /admin/advertising/campaigns` als `USER` | dito, keine Tabelle gerendert |
| `GET /api/admin/partners` als `USER` | **403** „Die Rolle \"ADMIN\" ist erforderlich (aktuelle Rolle: \"USER\")“ |
| `/partners` als `USER` | **200** (öffentliche Daten bleiben abrufbar) |
| `POST /api/advertising/impression` mit `Origin: https://evil.example` | **403** `Cross-origin request rejected.` |
| `POST /api/admin/partners` mit fremdem Origin | **403** |
| `POST /api/advertising/application` mit fremdem Origin | **403** |

Alle Rechteprüfungen verwenden die Datenbankrolle (`requireAdminSession`), nicht
den JWT-Claim. Die Same-Origin-Prüfung greift bei vorhandenem `Origin`-Header;
Nicht-Browser-Clients ohne `Origin` bleiben – wie dokumentiert – zugelassen.
Hinweis zur Prüfmethodik: Ein `Origin`-Header lässt sich aus dem Browser nicht
fälschen (Forbidden Header), die Cross-Origin-Tests liefen deshalb mit `curl`.

### 11.5 Gefundene Darstellungs- und Funktionsfehler

| Nr. | Befund | Auswirkung |
| --- | --- | --- |
| D1 | In der Bewerbungsliste haben nur `PENDING`-Zeilen Aktionen. Nach „Prüfen“ (`UNDER_REVIEW`) verschwinden alle Schaltflächen. | Eine geprüfte Bewerbung kann über die Oberfläche nie genehmigt oder abgelehnt werden. |
| D2 | `GET /api/admin/advertising/campaigns/[id]/stats` liest `campaignId` aus der Query, nicht aus dem Pfad. | Der dokumentierte Pfad antwortet **400**; nur `…/stats?campaignId=<id>` liefert **200**. |
| D3 | Admin-Tabellen nutzen `overflow-hidden` mit `whitespace-nowrap`. | Auf Mobilgeräten sind Status und Aktionen abgeschnitten und nicht bedienbar. |
| D4 | Keine Oberfläche zum Anlegen von Werbepartnern und Kampagnen; die Hub-Seite wirbt mit „Erstellen und verwalten Sie Werbekampagnen“. | Anlegen nur per API möglich. |
| D5 | Keine Statistik-Ansicht, keine Werbemittel-/Placement-Verwaltung (`AdCreative` hat weder Route noch UI). | Zwei der geforderten Admin-Funktionen fehlen vollständig. |
| D6 | Die Admin-Navigation enthält weder „Advertising“ noch „Partner“. | Die Bereiche sind nur über URL oder die Hub-Seite erreichbar. |
| D7 | „Bearbeiten“ in der Partnerliste hat keinen Handler. | Schaltfläche ohne Wirkung. |
| D8 | „Partner seit“ nutzt `relationships[0]`; die Beziehungen sind nach `startDate desc` sortiert. | Die angezeigte Dauer bezieht sich auf die **jüngste** Beziehung: Klangwerk Studio erscheint mit 3 J 10 M, obwohl die erste Beziehung 2021 begann (5 J 6 M). |
| D9 | `/partners` hat keinen Leerzustand. | Ohne Daten bleibt eine leere Seite ohne Erklärung. |
| D10 | `/partners` und `/advertising` liegen außerhalb von `(public)`. | Keine globale Kopf-/Fußnavigation auf beiden Seiten. |
| D11 | Werbepartner-Liste zeigt „Kampagnen“ immer als 0. | Bekannte Contract-Einschränkung (keine Rückbeziehung `Advertiser.campaigns`). |
| D12 | Für `desiredStartDate`/`desiredEndDate` gibt es kein Feldfehler-Element. | Ein Serverfehler zu diesen Feldern erscheint nur als allgemeine Meldung. |
| D13 | Partnerschaftsdauer wird nur öffentlich angezeigt, nicht im Admin-Bereich. | „Dauer kontrollieren“ ist im Portal nicht möglich. |
| D14 | Bewerbungsliste ohne Leerzustand; `internalNotes` sind über die UI nicht editierbar. | Leere Filterung wirkt wie ein Ladefehler; interne Notizen nur per API. |

Alle 14 Befunde sind **dokumentiert, nicht behoben**: Der Auftrag schloss
Fehlerbehebung und neue Funktionen ausdrücklich aus.

### 11.6 Bewertung

Kernfunktionen sind nutzbar: öffentliche Partnerliste mit korrekter
Sichtbarkeitsfilterung, Bewerbungsformular mit wirksamer Validierung, Anmeldung
und rollenbasierter Schutz aller Verwaltungsendpunkte, Kampagnen-Statuswechsel,
Werbepartner-Aktivierung, Partnerhistorie sowie Impression-/Klick-Zählung.
Die Lücken liegen bei der Bedienoberfläche der Verwaltung (D1, D4, D5, D6, D7,
D13), bei einem falsch parametrisierten Statistik-Endpunkt (D2) und bei der
Mobiltauglichkeit der Tabellen (D3).

Es wurden **keine** produktiven Daten verändert, nichts committet, gepusht oder
deployt und keine Migration erstellt. Die Wegwerf-Datenbank und der Dev-Server
wurden nach der Abnahme entfernt.

Screenshots der Abnahme liegen unter `docs/abnahme/`.

---

## 12. Website-Integration und Behebung der Befunde (2026-11-23)

### 12.1 Integration in das bestehende Layout

`/partners` und `/advertising` liegen jetzt in der Route-Group `(public)` und
teilen sich damit Kopf-/Fußnavigation, Typografie, Abstände und Farben mit allen
anderen öffentlichen Seiten. Die alten Verzeichnisse `src/app/partners` und
`src/app/advertising` wurden entfernt, damit es keinen Routenkonflikt gibt.

Beide Seiten verwenden ausschließlich vorhandene Bausteine
(`PageHeader`, `Section`, `Badge`, `EmptyState`, `Button`) und das bestehende
Dark-Designsystem. Für die Verwaltung entstand **ein** gemeinsamer Baustein
(`src/components/admin/portal-ui.tsx`) auf Basis von `admin/users`,
`ui/badge`, `ui/button`, `ui/layout` und `ui/states`; es wurde kein zweites
Layoutsystem eingeführt.

### 12.2 Befundstatus nach der Integrationsphase

| Nr. | Status | Umsetzung |
| --- | --- | --- |
| D1 | behoben | Statusaktionen für `PENDING` **und** `UNDER_REVIEW` (Prüfen, Genehmigen, Ablehnen, Zurück zu ausstehend); zentrale Übergangstabelle `APPLICATION_STATUS_TRANSITIONS` |
| D2 | behoben | Statistik-Endpunkt liest die `campaignId` aus dem Pfad (`params` ist in Next 16 ein Promise); Query nur noch für den Datumsbereich |
| D3 | behoben | Alle Admin-Tabellen in einem `overflow-x-auto`-Container mit `min-w`-Tabelle; Aktionen und Status bleiben auf 390 px per horizontalem Scrollen erreichbar |
| D4 | behoben | Oberflächen zum Anlegen/Bearbeiten von Werbepartnern und Kampagnen (inkl. Partnerzuordnung) |
| D5 | behoben | Statistik-Panel je Kampagne, `/admin/advertising/creatives` (Anlegen/Löschen) und `/admin/advertising/placements` (aggregierte Übersicht) |
| D6 | behoben | „Advertising“ und „Partner“ in der Admin-Navigation; Hub-Seite verlinkt alle fünf Verwaltungsseiten |
| D7 | behoben | „Bearbeiten“ öffnet ein Panel mit funktionierendem `PATCH`-Handler (`updatePartner`) |
| D8 | behoben | `earliestRelationshipStart()` bestimmt den ursprünglichen Beziehungsbeginn; „Partner seit“ und Dauer beziehen sich auf die **erste** Beziehung |
| D9 | behoben | Leerzustand auf `/partners` (`EmptyState` mit Erklärung) |
| D10 | behoben | Beide Seiten rendern im globalen Website-Layout |
| D11 | behoben (ohne Schemaänderung) | `getAdvertisersWithCampaignCounts()` lädt die `AdCampaign`-Zeilen einmal und zählt in JS; die UI zeigt die echte Zahl (Abnahme: 2 bzw. 0) |
| D12 | behoben | `AdvertisingForm` mit Feldmeldungen für alle Felder, inklusive `desiredStartDate`/`desiredEndDate`; Server-`issues` werden auf die Felder abgebildet |
| D13 | behoben | Admin-Tabelle zeigt „Partner seit“ und die dynamische Dauer; das Bearbeiten-Panel zeigt sie je Beziehung |
| D14 | behoben | Leerzustände in Bewerbungen/Werbepartnern/Kampagnen/Werbemitteln/Platzierungen; `internalNotes` sind im Bewerbungs-Detail und im Kampagnen-Formular editierbar |

Zusätzlich: Statuswechsel von Kampagnen schreiben `AD_CAMPAIGN_STATUS_CHANGED`
mit `from`/`to` ins Audit-Log; `RuleError` wird von `api-response.ts` als
HTTP 400 `RULE_VIOLATION` statt als 500 beantwortet; `updateApplicationStatus`
überschreibt interne Notizen nicht mehr, wenn sie nicht mitgesendet werden.

### 12.3 Entscheidung zu D11

Eine Contract-Änderung war **nicht** erforderlich. Die vorhandene Struktur
(`AdCampaign.advertiserId`) erlaubt eine korrekte Zählung ohne Rückbeziehung:
Eine zusätzliche Abfrage aller Kampagnen und Zählung im Speicher reicht für die
Listengröße des Portals. Es wurde **keine** Migration eingeführt.

### 12.4 Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | **0 Fehler** |
| `npx eslint .` | **0 Fehler**, 9 unveränderte Warnungen (u. a. bestehende `<img>`-Hinweise) |
| `npm test` | **68 Suites / 671 Tests** grün (vorher 662; +9 neue) |
| `npm run test:integration` | **8 Suites / 143 Tests** grün (vorher 137; +6 neue) gegen `webradio_test` |
| `npm run build` | **Exit 0**, `/partners` und `/advertising` als Partial-Prerender-Routen enthalten |

Neue Tests decken ab: Datumsreihenfolge im Bewerbungsformular, die
Update-Schemata (Werbepartner, Kampagne, Werbemittel), die Statusmaschinen,
`earliestRelationshipStart` (mehrere gleichzeitige Beziehungen, Temporal-Werte)
sowie integrationstechnisch Notizen-Erhalt bei Statuswechseln, unerlaubte
Übergänge, Kampagnen-Bearbeitung, Kampagnenzahl je Werbepartner, Werbemittel
(Anlegen/Listen/Löschen) und die Placement-Übersicht.

### 12.5 Zweite Browser-Abnahme

Umgebung wie in 11.1: wegwerfbare PostgreSQL-18-Instanz auf `127.0.0.1:5433`
(`webradio_dev` und `webradio_test`, bestehende Migrationskette, keine neue
Migration), `next dev` auf Port 3000, Konten `abnahme-admin@example.test`
(`ADMIN`) und `abnahme-user@example.test` (`USER`). Testdaten über die echten
Services angelegt: 2 Werbepartner, 2 Kampagnen (`ACTIVE`/`DRAFT`), 1 Werbemittel,
2 Bewerbungen (`PENDING`/`UNDER_REVIEW`), 2 Partner mit 3 Beziehungen
(davon 1 beendet, 1 Partner inaktiv).

| Bereich | Geprüft | Ergebnis |
| --- | --- | --- |
| `/partners` 1440/390 | Layout, Kopf-/Fußnavigation, Karten, „Partner seit“, Dauer, Leerzustand | im Website-Layout; „Partner seit 01. April 2021“ aus der **ersten** Beziehung, Dauer 5 J 7 M 22 T; kein horizontaler Überlauf (`scrollWidth` −17 px) |
| `/advertising` 1440/1200/390 | Layout, Angebote, Ablauf, Formular | im Website-Layout, zweispaltig ab `sm`, mobil einspaltig (Feldbreite 291 px), kein Überlauf |
| Bewerbungsformular | Ausfüllen und Absenden mit realen Daten | `POST /api/advertising/application` → **201**, Erfolgsansicht, Datensatz erscheint als `PENDING` in der Verwaltung |
| Admin-Navigation | „Advertising“, „Partner“ | vorhanden; alle fünf Advertising-Seiten und die Partnerverwaltung erreichbar |
| Bewerbungen | Genehmigen einer `UNDER_REVIEW`-Bewerbung | Status „Genehmigt“, Meldung „Status auf ‚Genehmigt‘ gesetzt.“, Aktionen reduzieren sich korrekt auf „Details“ |
| Werbepartner | Anlegen über die Oberfläche | „Werbepartner angelegt.“, Zeile mit Kampagnenzahl **0**; bestehender Partner zeigt **2** |
| Kampagnen | Bearbeiten inkl. interner Notizen und Datumsvalidierung | Fehlerfall „Enddatum muss nach Startdatum liegen“ (ohne rohes Feld-Präfix), danach „Kampagne aktualisiert.“, Notiz und Zeitraum serverseitig gespeichert |
| Kampagnenstatistik | „Statistik“ je Kampagne | Anfrage geht an `/api/admin/advertising/campaigns/<uuid>/stats` (Pfad-Parameter), Panel zeigt Impressionen/Klicks/CTR |
| Werbemittel | Liste, Anlegen/Löschen | Tabelle mit Kampagne, Bild-URL, Maßen, Datei, Datum; Aktion „Löschen“ |
| Platzierungen | Übersicht | drei Platzierungen mit Kampagnen-, Live- und Werbemittelzahlen; „Keine Kampagne für diese Platzierung.“ als Leerzustand |
| Partner (Admin) 1440/390 | Statistik, Tabelle, Beginn/Dauer, Bearbeiten, Beziehungen | „Partner seit 01. April 2021“, Dauer 5 J 7 M 22 T, 2 Beziehungen; Panel mit Beziehungsliste (je Beziehung Status, Zeitraum, Dauer, Sichtbarkeit, Aktionen) und „Beziehung hinzufügen“; Speichern → „Partner gespeichert.“ |
| Mobile Tabellen 390 px | Kampagnen, Partner | Tabelle horizontal scrollbar (`overflow-x: auto`, `scrollWidth` > `clientWidth`), Aktionen erreichbar, Seite selbst ohne Überlauf |
| Zugriffsschutz | ohne Session | `/admin`, `/admin/advertising*`, `/admin/partners` → **307** auf `/auth/login?callbackUrl=…` |
| Zugriffsschutz | als `USER` | `/admin/advertising` → „403 — Keine Berechtigung“ (AccessDenied), `GET /api/admin/advertising/applications` → **403**; `/partners` und `/advertising` bleiben **200** |
| Regression | `/`, `/plugins`, `/releases`, `/news`, `/docs` | **200**, Kopf-/Fußnavigation intakt, kein Layoutüberlauf |

Methodik wie in 11.1: Darstellung und Überlauf wurden messtechnisch geprüft
(`scrollWidth` gegen `innerWidth`, `getBoundingClientRect`). Bei 1200 px
bestätigen die Messwerte das zweispaltige Raster (2 × 549,5 px) und
`scrollWidth` −17 px; die Vorschau-Screenshots beschneiden in dieser Größe den
rechten Rand und sind dafür nicht aussagekräftig.

Neue Screenshots: `docs/abnahme/partners-1440.png`, `partners-390.png`,
`advertising-1440.png`, `advertising-390.png`, `phase2-advertising-1200.png`,
`phase2-applications-1440.png`, `phase2-campaigns-1440.png`,
`phase2-campaigns-390.png`, `phase2-partners-admin-1440.png`,
`phase2-partners-admin-390.png`, `phase2-user-403.png`.

### 12.6 Verbleibende Einschränkungen und Beobachtungen

1. **Unverändert:** E-Mail-Versand ist lokal nicht konfiguriert
   (Verifizierung/Passwort-Reset), wie in Abschnitt 10 beschrieben.
2. **Beobachtung (nicht Teil dieses Auftrags, nicht geändert):** Das
   Anmeldeformular ist ein natives Formular ohne `action`. Wird es vor
   abgeschlossener Hydration abgeschickt, entsteht ein GET auf dieselbe URL mit
   `email`/`password` in der Query. Mit aktiver Hydration läuft die Anmeldung
   korrekt über `POST /api/auth/callback/credentials`. Empfehlung für einen
   eigenen Auftrag: Formular erst nach Hydration absendbar machen oder
   `method="post"` mit serverseitigem Fallback versehen.
3. **Testdaten:** Logo- und Banner-URLs der lokalen Demo-Daten zeigen auf
   nicht existierende Domains; die Partnerkarte klemmt defekte Bilder jetzt in
   der 48-px-Box ab, statt Textüberlauf zu erzeugen.
4. **Kein separates Creatives-Modell:** Werbemittel speichern Metadaten und
   URL (kein Upload), passend zum bestehenden `AdCreative`-Contract.

---

## 13. Freigabe

Alle geforderten Prüfungen sind ausgeführt und dokumentiert; keine Prüfung wurde
durch Unterdrückung von Fehlern „grün“ gemacht. Es wurde nichts committet,
gepusht oder deployt, keine produktiven Daten verändert und keine
Produktionsmigration ausgeführt. Wegwerf-Datenbank und Dev-Server wurden nach
der Abnahme entfernt.

**Warte auf ausdrückliche Freigabe für Commit und weitere Schritte.**

---

## 14. Öffentliche Verlinkung von Advertising & Partner Portal

Die Seiten waren bereits integriert, aber von der übrigen Website aus nicht
verlinkt. Diese Phase ergänzt ausschließlich die Auffindbarkeit; Datenmodell,
Migrationen und Verwaltungsfunktionen bleiben unverändert.

### 14.1 Umsetzung

| Ort | Änderung |
| --- | --- |
| Footer | Neue Gruppe **„Partner & Unternehmen“** mit „Unsere Partner“ → `/partners` und „Werbung & Sponsoring“ → `/advertising`. Sie erscheint über das bestehende `(public)`-Layout auf allen öffentlichen Seiten. |
| Footer-Raster | `lg:grid-cols-3`, ab `xl` sechs Spalten (`1.5fr` + fünf Linkgruppen); das bisherige Raster hätte die fünfte Gruppe nicht aufgenommen. |
| Aktuelle Seite | `FooterNav` (kleine Client-Komponente, einzige neue Client-Logik) setzt `aria-current="page"` und eine hellere Textfarbe für den passenden Footer-Link. Der Footer selbst bleibt eine Server-Komponente; es wird kein Router-Zustand geladen. |
| Startseite | `PartnerSpotlight` als asynchrone Server-Komponente in einer `Suspense`-Grenze vor dem abschließenden Dokumentationsbereich: höchstens sechs freigegebene Partner als dezente Kacheln, Aktion „Alle Partner ansehen“ → `/partners`. |
| `/partners` | CTA-Bereich **„Sie möchten Partner oder Sponsor von WebRadio werden?“** mit Button „Werbung & Sponsoring“ → `/advertising`, auch bei leerer Partnerliste sichtbar. |
| `/advertising` | Dezenter Link **„Unsere bestehenden Partner kennenlernen“** → `/partners` unter den Werbemöglichkeiten. |

Die Hauptnavigation im Header wurde bewusst **nicht** erweitert; die neuen
Ziele liegen in der Footer-Navigation, wie im Auftrag vorgesehen. Es wurden
keine neuen Layoutsysteme oder Komponentenbibliotheken eingeführt; die Seiten
nutzen weiterhin `Container`, `SectionHeading`, `PageHeader`, `ButtonLink`,
`Badge` und die vorhandenen Farb-/Typografieklassen.

**Datenabfragen der Startseite:** `PartnerSpotlight` ruft genau einmal
`PartnerService.getPublicPartners()` auf (eine Partnerabfrage plus die
eingebundenen Beziehungen). Es gibt keine zusätzliche Zähl- oder
Existenzabfrage. Die bereits gefilterten Beziehungen werden nur noch im
Speicher auf „mindestens eine aktive, öffentliche Beziehung“ geprüft und auf
sechs Einträge begrenzt. Bei Datenbankfehler oder ohne sichtbare Partner gibt
die Komponente `null` zurück; die Startseite bleibt dann vollständig und zeigt
keinen leeren Partnerbereich. Private, beendete und inaktive Partnerschaften
können die Startseite nicht erreichen, weil `getPublicPartners()` nur
`Partner.status = ACTIVE` und `PartnerRelationship.status = ACTIVE` mit
`isPublic = true` liefert.

### 14.2 Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | **0 Fehler** |
| `npx eslint .` | **0 Fehler**, 10 Warnungen (9 unveränderte plus der bestehende `<img>`-Hinweis, der nun auch die Startseitenkacheln betrifft) |
| `npm test` | **68 Suites / 671 Tests** grün, unverändert |
| `npm run build` | **Exit 0**, `/` und beide Seiten weiterhin im Routing |
| Regression öffentlicher Seiten | `/`, `/plugins`, `/themes`, `/releases`, `/news`, `/docs`, `/partners`, `/advertising` → **200**; Header-Navigation unverändert (`Plugins`, `Themes`, `Releases`, `Dokumentation`); kein Layoutüberlauf |

Browser-Abnahme mit wegwerfbarer PostgreSQL-18-Instanz (`127.0.0.1:5433`,
`webradio_dev`, bestehende Migrationskette, **keine** neue Migration) und
`next dev` auf Port 3000. Fünf Testpartner über SQL angelegt, um die
Freigaberegeln zu prüfen:

| Partner | Status | Beziehung | Erwartung | Ergebnis |
| --- | --- | --- | --- | --- |
| Klangwerk Audio | `ACTIVE`, hervorgehoben | 2 × `ACTIVE`, öffentlich | sichtbar | sichtbar (Startseite und `/partners`) |
| Sendertechnik Nord | `ACTIVE` | 1 × `ACTIVE`, öffentlich | sichtbar | sichtbar |
| Interne Holding | `ACTIVE` | `ACTIVE`, **nicht** öffentlich | nicht sichtbar | nicht sichtbar |
| Ehemals Media | `ACTIVE` | `ENDED`, öffentlich | nicht sichtbar | nicht sichtbar |
| Altfunk GmbH | `INACTIVE` | `ACTIVE`, öffentlich | nicht sichtbar | nicht sichtbar |

| Bereich | Geprüft | Ergebnis |
| --- | --- | --- |
| Startseite 1440 | Partnerbereich, Freigaberegeln, Footer-Gruppe, Überlauf | zwei freigegebene Partner, keine privaten/beendeten/inaktiven Daten, Footer-Links `/partners` und `/advertising`, `scrollWidth` 1423 < 1440 |
| Startseite 390 | Kacheln, Footer-Links, Überlauf | Kacheln 341 px, beide Footer-Links sichtbar, `scrollWidth` 373 < 390 |
| Footer-Link | Klick „Unsere Partner“ | navigiert zu `/partners`, Footer-Link trägt `aria-current="page"` |
| `/partners` 1440 | Abschnitte, CTA, Freigaberegeln, Überlauf | Abschnitte Offizielle Partner/Sponsoren/Technische Partner, CTA-Text exakt „Sie möchten Partner oder Sponsor von WebRadio werden?“, Button → `/advertising`, kein Überlauf |
| `/partners` 390 | Karten, CTA, Footer, Überlauf | Karten 341 px, CTA 291 px sichtbar, Footer-Links sichtbar, kein Überlauf |
| `/partners`-CTA | Klick „Werbung & Sponsoring“ | navigiert zu `/advertising` |
| `/advertising` 1440 | Rücklink, Footer-Zustand, Überlauf | „Unsere bestehenden Partner kennenlernen“ → `/partners`, Footer „Werbung & Sponsoring“ mit `aria-current="page"`, Formular vorhanden, kein Überlauf |
| `/advertising` 390 | Rücklink, Footer, Überlauf | Link 300 px sichtbar, Footer aktiv, kein Überlauf |
| `/advertising`-Rücklink | Klick „Unsere bestehenden Partner kennenlernen“ | navigiert zu `/partners` |

Methodik: `scrollWidth` gegen `innerWidth`, `getBoundingClientRect()` je Kachel,
Link und CTA sowie `aria-current` im DOM. Es wurden keine Screenshots für diese
Phase erzeugt; die Prüfung erfolgte messtechnisch und über die gerenderten
Seiten.

### 14.3 Einschränkungen und Beobachtungen

1. **Keine neuen automatisierten Tests:** Die Änderungen sind Navigation und
   Darstellung; die bestehenden Footer-/A11y-Tests rendern den Footer weiterhin
   erfolgreich. Die Freigaberegeln selbst sind bereits durch die
   Integrationstests aus Abschnitt 12 abgedeckt.
2. **Hauptnavigation:** Bewusst unverändert. Eine Aufnahme von `/partners` und
   `/advertising` in die Kopfzeile wäre eine zusätzliche Produktentscheidung.
3. **Footer-Markierung:** Die aktive Seite wird nur im Footer kenntlich gemacht,
   nicht in der Kopfzeile. Dafür wurde eine kleine Client-Komponente ergänzt;
   der restliche Footer bleibt servergerendert.
4. **Testumgebung:** Im gemeinsam genutzten Browserprofil lag ein altes
   `next-auth`-Cookie, das mit dem Wegwerf-Secret nicht entschlüsselt werden
   konnte (`JWEDecryptionFailed` im Serverlog). Die Seiten rendern korrekt als
   abgemeldeter Besucher; das ist kein Fehler der Änderung. Für die visuelle
   Prüfung wurde die Logo-URL eines Testpartners auf das lokale Logo gesetzt,
   damit kein absichtlich toter Testlink als defektes Bild erscheint.

### 14.4 Freigabe

Es wurde nichts committet, gepusht oder deployt, keine Schemaänderung und keine
Datenbankmigration ausgeführt und keine produktiven Daten verändert. Die
wegwerfbare Datenbank und der Dev-Server wurden nach der Abnahme entfernt.

**Warte auf ausdrückliche Freigabe für Commit und weitere Schritte.**
