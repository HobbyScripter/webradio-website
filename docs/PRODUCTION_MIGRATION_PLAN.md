# Produktionsmigration: Internationalisierung + Custom Links

**Datum:** 2026-11-25
**Repository:** YourEliteSystems/WebRadio-Website
**Status:** PLANUNGSREIF – wartet auf ausdrückliche Freigabe
**Umfang dieser Ausarbeitung:** Untersuchung, Planung, isolierte Tests. Es wurde **keine** produktive Migration ausgeführt, **keine** produktiven Daten verändert, **kein** Commit, **kein** Push, **kein** Deployment und **keine** Änderung produktiver Umgebungsvariablen vorgenommen.

---

## Zusammenfassung

| Frage | Antwort |
| --- | --- |
| Müssen i18n und Custom Links getrennt oder gemeinsam migriert werden? | **Gemeinsam in einem Migrationslauf** (`db migrate` ohne `--to`) – die Kette ist linear, beide Änderungen liegen bereits hintereinander auf demselben Pfad. |
| Muss dafür eine neue, zusammengefasste Migration erzeugt werden? | **Nein.** Eine synthetische Zusammenfassung würde Schemaoperationen duplizieren und die Ledger-/Marker-Kette brechen. |
| Wie viele Kanten fehlen in Produktion? | **1 Kante**, wenn der i18n-Head `e8dc0773…` bereits angewendet ist (nur `20261125T1957_add_custom_links`). **4 Kanten**, wenn der Analytics-Head `80e32e10…` der letzte Stand ist. |
| Sind die Änderungen rein additiv? | **Ja.** Alle vier Kanten enthalten ausschließlich `createTable`, `addColumn`, `setDefault`, `createIndex`, `addUnique`, `addForeignKey`. Kein `dropTable`, `dropColumn`, `renameColumn` oder Typwechsel. |
| Datenrisiko | **Keines durch die Migration selbst**: keine bestehende Zeile wird umgeschrieben, keine Spalte entfernt, kein Backfill. Getestet mit repräsentativen Daten. |
| Rollback | **Wiederherstellung aus Backup** (Plattform-Backup bzw. `pg_dump`). Es existiert bewusst kein Down-Pfad. |
| Offene Voraussetzung | Produktionszugang (`DIRECT_URL` / `DATABASE_URL_POOLED`) liegt nur in Vercel, nicht lokal → Ist-Stand der Live-DB konnte hier **nicht** gelesen werden. |

---

## 1. Ermittelter Ausgangsstand

### 1.1 Migrationssystem

Das Projekt verwendet Prisma 8 mit Contract-basierten Migrationen:

- Migrationen: `migrations/app/<timestamp>_<name>/migration.ts` (je eine `Migration<Start, End>`-Klasse mit `operations`).
- Angewendete Migrationen werden in der Datenbank im Schema `prisma_contract` geführt: `ledger` (eine Zeile pro angewendeter Kante), `marker` (aktueller `core_hash`, `profile_hash`, Contract-JSON) und `contract`.
- Referenzdatei: `migrations/app/refs/db.json` → zeigt auf `e8dc07735da9f571e94ee9b1a8321f53913db3a2f1a8b8b18da97882efda7245` (i18n-Head, im vorherigen Auftrag von `80e32e10…` korrigiert).
- Head des Repository-Contracts (frisch emittiert): `763e3b57bc99fa207bbd840d3b44199daed778109dc6e7ae6ee2f2c103ff70d6` (nach Custom Links).

### 1.2 Wichtiger Hinweis zur Einstufung

Die Einstufung „ausstehend/angewendet“ erfolgt **nicht** über Dateinamen, sondern ausschließlich über den DB-Stand (`prisma_contract.marker`, `prisma_contract.ledger`) und den Contract-Stand (`db verify --strict`, `migration status`). Genau so wurden die Tests in Abschnitt 6 durchgeführt.

### 1.3 Lokal ermittelbarer Stand

| Quelle | Ergebnis |
| --- | --- |
| Migrationen im Repository | 19 Verzeichnisse, davon **18 auf dem Pfad** zum Head |
| Ledger einer frisch migrierten DB | 18 Zeilen, Head `20261125T1957_add_custom_links → 763e3b57…` |
| `db verify --strict` (frische DB) | ✅ grün, `storageHash 763e3b57…` |
| Contract-Head | `763e3b57…`, 59 Tabellen, 220 Indizes |
| `.env` | nur `DATABASE_URL` (Dev), `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NODE_ENV`, `TEST_DATABASE_URL` |
| Produktionszugang | **nicht vorhanden** – `DIRECT_URL` und `DATABASE_URL_POOLED` liegen ausschließlich in Vercel |

**Konsequenz:** Der tatsächliche Produktions-Head ist von hier aus **nicht** lesbar. Er muss vor der Migration mit `db status` / `db verify --strict` gegen die Live-DB festgestellt werden (siehe Abschnitt 10). Alle Aussagen zu „angewendet“ in diesem Dokument beziehen sich auf die isolierten Testdatenbanken, nicht auf Produktion.

### 1.4 Toter Duplikat-Zweig (wichtig)

`migrations/app/20261031T1732_legal_documents` erzeugt dieselben drei Tabellen (`LegalDocument`, `LegalConsent`, `PrivacyImpactNote`) wie `20261031T1811_legal_documents`, führt aber auf `1a8b3a12…` statt auf den Pfad zum Head.

- Er wird von `db migrate` **nie** angewendet (nicht Teil des Pfads von `∅` zu `763e3b57…`).
- Er darf **nicht** angewendet werden – weder in Produktion noch sonst wo.
- Für die Migration ist er irrelevant; er ist hier nur dokumentiert, damit niemand ihn versehentlich als „fehlende Migration“ nachzieht.

---

## 2. Alle relevanten Migrationen

Lineare Kette von `∅` bis zum Head (Reihenfolge = Ledger-Reihenfolge, verifiziert in der Test-DB):

| # | Migration | Operationen | Inhalt |
| --- | --- | --- | --- |
| 1 | `20261024T1407_init_schema` | 75 | Grundschema |
| 2 | `20261024T1651_phase45_auth_security` | 8 | Auth/Security |
| 3 | `20261024T1700_phase45_product_scope_v2` | 9 | Produkt-Scope |
| 4 | `20261024T1815_system_admin_role` | 2 | SYSTEM_ADMIN |
| 5 | `20261024T2104_catalog_draft_and_changes_requested` | 4 | Katalog-Status |
| 6 | `20261025T1842_phase6_dev_access_reports_suspension` | 32 | Developer-Zugang, Meldungen, Sperren |
| 7 | `20261030T2041_plugin_repository_url` | 1 | Repository-URL |
| 8 | `20261031T1811_legal_documents` | 12 | LegalDocument, LegalConsent, PrivacyImpactNote |
| 9 | `20261114T2014_download_analytics_and_github_app` | 24 | Download-Analytics, GitHub-App |
| 10 | `20261114T2157_github_traffic_analytics_models` | 6 | Traffic-Analytics |
| 11 | `20261114T2213_release_asset_metadata` | 6 | Release-Assets |
| 12 | `20261114T2217_github_repo_stats` | 12 | Repo-Statistiken |
| 13 | `20261114T2223_website_analytics` | 8 | Website-Analytics |
| 14 | `20261114T2227_analytics_sync_status` | 5 | Sync-Status → **Analytics-Head `80e32e10…`** |
| 15 | `20261122T2030_advertising_partner_portal` | 50 | **Advertising/Partner** (9 Tabellen, 30 Indizes, 9 FKs, 2 Uniques) → `e54862c5…` |
| 16 | `20261124T1823_i18n_content_translations` | 6 | **i18n Teil 1**: `ContentTranslation` + `User.locale` → `43914ff3…` |
| 17 | `20261124T1840_i18n_translation_engine` | 19 | **i18n Teil 2**: `TranslationJob`, `TranslationEvent`, `TranslationUsage`, Felder an `ContentTranslation` → **i18n-Head `e8dc0773…`** |
| 18 | `20261125T1957_add_custom_links` | 10 | **Custom Links**: `CustomLink`, `CustomLinkLabel` → **Head `763e3b57…`** |

Nicht auf dem Pfad: `20261031T1732_legal_documents` (toter Duplikat-Zweig, Abschnitt 1.4).

### 2.1 Die Custom-Link-Migration im Detail

`20261125T1957_add_custom_links` (Start `e8dc0773…` → Ziel `763e3b57…`, 10 Operationen), in der migrierten DB verifiziert:

- `createTable "CustomLink"`: `id` (PK), `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `url`, `type`, `iconName`, `position`, `sortOrder`, `isActive` (Default `true`), `openInNewTab` (Default `false`) – inkl. Check-Constraints `position IN ('MAIN_NAVIGATION','FOOTER')` und `type IN ('INTERNAL','EXTERNAL')`.
- `createTable "CustomLinkLabel"`: `id` (PK), `linkId`, `locale`, `label`, `createdAt`, `updatedAt`.
- Unique `CustomLinkLabel_linkId_locale_key` auf (`linkId`, `locale`) – bestätigt vorhanden.
- Fremdschlüssel `CustomLinkLabel_linkId_fkey` → `CustomLink(id)` mit **`ON DELETE CASCADE`** – bestätigt vorhanden.
- 6 Indizes: `CustomLink(createdAt)`, `CustomLink(isActive)`, `CustomLink(position)`, `CustomLink(sortOrder)`, `CustomLinkLabel(linkId)`, `CustomLinkLabel(locale)`.

**Korrekt eingebunden:** Ja. `migrations/app/refs/db.json` zeigt auf den Vorgänger-Hash `e8dc0773…`, die Kante hängt direkt am i18n-Head, und die frische DB endet mit genau dieser Ledger-Zeile (`18` Zeilen).

### 2.2 Die Internationalisierungs-Migrationen

- `20261124T1823_i18n_content_translations`: `ContentTranslation` (Unique über `entityType`, `entityId`, `locale`, `field`; Status-Default `DRAFT`), sowie **`User.locale`** als nullable `text` **ohne Default**.
- `20261124T1840_i18n_translation_engine`: `TranslationJob` (Zähler mit Default 0, Status-Default `PENDING`), `TranslationEvent`, `TranslationUsage` (Quota-Zähler mit Defaults), plus vier Felder an `ContentTranslation` (`isManuallyEdited` Default `false`, `reviewedAt`, `reviewedBy`, `status` Default `MISSING`, `value` Default `''`) und zwei `setDefault`-Operationen.

Beide Migrationen liegen vollständig und konsistent vor; sie sind rein additiv und enthalten keine doppelten oder widersprüchlichen Schemaänderungen gegenüber früheren Kanten (geprüft: keine `drop*`/`rename*`/`alterColumn`-Operationen in den vier Kanten 15–18).

---

## 3. Abhängigkeiten und Reihenfolge

Die Kette ist **streng linear**, es gibt keine Verzweigung auf dem Pfad zum Head:

```
∅
 └─ #1 … #14  (analytics_sync_status, 80e32e10…)
      └─ #15 advertising_partner_portal        (e54862c5…)
           └─ #16 i18n_content_translations    (43914ff3…)
                └─ #17 i18n_translation_engine (e8dc0773…)
                     └─ #18 add_custom_links   (763e3b57… = Head)
```

Sachliche Abhängigkeiten:

1. **#16 → #17**: #17 erweitert `ContentTranslation` (in #16 erzeugt) und setzt Defaults darauf. Ohne #16 ist #17 nicht anwendbar.
2. **#17 → #18**: `refs/db.json` und der Ledger verlangen #18 auf `e8dc0773…`. #18 ist fachlich unabhängig, technisch aber an den Vorgänger-Hash gebunden.
3. **#15** (Advertising) ist fachlich unabhängig von #16–#18, liegt aber auf demselben Pfad davor. Ist Produktion noch auf `80e32e10…`, muss #15 mit angewendet werden – nicht weil i18n es braucht, sondern weil der Pfad darüber führt.

`db migrate` (ohne `--to`) wendet **genau die fehlenden Kanten in dieser Reihenfolge** an und schreibt jede Kante einzeln in den Ledger. Damit ist „ein Lauf“ automatisch auch „korrekte Reihenfolge“.

---

## 4. Entscheidung

> **Die Internationalisierung und die Custom Links werden gemeinsam in einem Migrationslauf ausgeführt – als bestehende, lineare Kette aus einzelnen Migrationen. Es wird keine neue, zusammengefasste Migration erzeugt.**

Konkret:

- **Ein** Befehl, **eine** Transaktion pro Kante, **eine** Reihenfolge – abhängig vom tatsächlichen Produktionsstand:
  - Produktion auf `e8dc0773…` (i18n bereits angewendet) → 1 Kante: `20261125T1957_add_custom_links`.
  - Produktion auf `80e32e10…` (Analytics) → 4 Kanten: `advertising_partner_portal` → `i18n_content_translations` → `i18n_translation_engine` → `add_custom_links`.
- Keine Wiederholung bereits angewendeter Migrationen: der Ledger verhindert das, `db migrate` prüft vor dem Anwenden.
- Keine Schemaänderung über das hinaus, was die vorhandenen Migrationen definieren.

---

## 5. Begründung der Entscheidung

1. **Die Zusammenfassung existiert bereits.** i18n und Custom Links liegen hintereinander auf demselben Pfad. Ein gemeinsamer Lauf ist genau das, was die Kette vorsieht – eine „Zusammenfassung“ ist nicht nötig, um gemeinsam zu migrieren.
2. **Eine künstliche Combined-Migration würde Schemaoperationen duplizieren.** Ein neues Verzeichnis, das `createTable "ContentTranslation"`, `"CustomLink"` usw. erneut anlegt, könnte nur funktionieren, wenn die alten Kanten aus dem Pfad entfernt oder übersprungen würden – das ist ein Umbau der Migrationshistorie, kein Migrationsplan.
3. **Ledger und Marker würden brechen.** Der Ledger ist eine Hash-Kette (`origin_core_hash → destination_core_hash`). Eine synthetische Kante müsste einen neuen, nirgends existierenden Zwischen-Hash behaupten; jede bereits migrierte Umgebung (Dev, Test, ggf. Preview) wäre danach nicht mehr fortführbar, ohne zurückzusetzen.
4. **Kein Sicherheitsgewinn.** Alle vier Kanten sind rein additiv, es gibt keinen Data-Backfill außer nullable Spalten. Das Risiko entsteht nicht durch „zwei Vorgänge statt einem“, sondern durch Schema-Konflikte – und die gibt es nicht.
5. **Bessere Diagnose und Teil-Rollback.** Getrennte Kanten liefern pro Schritt eine eigene Ledger-Zeile mit eigenem Marker. Bei einer Abweichung ist sofort erkennbar, welche Kante betroffen ist. Eine kombinierte Kante wäre ein unteilbarer Block.
6. **Kein Zwang zur Zusammenführung.** Der Auftrag erlaubt beide Wege; die vorhandene Struktur spricht eindeutig für den gemeinsamen Lauf über die bestehende Kette.

---

## 6. Ergebnis der isolierten Migrationstests

**Umgebung:** isolierter PostgreSQL-18-Cluster (Trust-Auth) auf `127.0.0.1:5434`, Datenverzeichnis `.acceptance/pgdata3`. Keine Verbindung zu Dev-, Preview- oder Produktionsdatenbanken.

| Testdatenbank | Zweck | Ausgangsstand |
| --- | --- | --- |
| `webradio_prodmig_fresh` | volle Kette auf leerer DB | `∅` |
| `webradio_prodmig_prei18n` | Szenario „ab Analytics-Head“ (= Fall „4 Kanten gemeinsam“) | `80e32e10…`, 44 Tabellen, 151 Indizes, 399 Constraints, 14 Ledger-Zeilen |
| `webradio_prodmig_i18n` | Szenario „ab i18n-Head“ (= Fall „nur Custom Links“) | `e8dc0773…`, 57 Tabellen, 211 Indizes, 540 Constraints, 17 Ledger-Zeilen |
| `webradio_prodmig_verify_test` | Funktionsprüfung auf migriertem Schema (Kopie von `webradio_prodmig_i18n`) | `763e3b57…` |

Repräsentative Daten (Seeds) je Testdatenbank: 4 Benutzer mit den Rollen `USER`, `DEVELOPER`, `ADMIN`, `SYSTEM_ADMIN` (Status `ACTIVE`), Developer-Profil, 2 Plugins + Versionen (u. a. `APPROVED`, `PENDING_REVIEW`), 1 Theme + Version, Release, News, LegalDocument + LegalConsent; im i18n-Szenario zusätzlich Advertiser + AdCampaign, 4 `ContentTranslation`-Zeilen (3× `APPROVED`, 1× `MACHINE_TRANSLATED`), TranslationJob (`COMPLETED`/`PENDING`), TranslationEvent und TranslationUsage.

### 6.1 Szenario A – leere Datenbank

- `db migrate` wendet **18 Kanten** an, endet auf `763e3b57…`.
- Ergebnis: 59 Tabellen, 220 Indizes, Ledger 18 Zeilen.
- `db verify --strict`: ✅ `Database marker and schema match contract`, `storageHash 763e3b57…`.

### 6.2 Szenario B – Upgrade ab Analytics-Head (`80e32e10…`, „gemeinsam“)

- `db migrate` wendet **4 Kanten** an (85 Operationen): `advertising_partner_portal`, `i18n_content_translations`, `i18n_translation_engine`, `add_custom_links` – jeweils in Ledger-Reihenfolge.
- Ledger: 14 → **18** Zeilen, Head `20261125T1957_add_custom_links → 763e3b57…`.
- Schema: 44 → **59** Tabellen, 151 → **220** Indizes (13 neue Tabellen aus Advertising/i18n, 2 aus Custom Links).
- `db verify --strict`: ✅ grün.
- **Datenintegrität:** Die 22 vor der Migration vorhandenen überwachten Tabellen sind inhaltlich unverändert – Benutzer-Hash (`id|email|role|status|passwordHash|name`), Plugin-/Theme-Status und Rollen-Aufstellung sind **byte-identisch** vor/nach der Migration. Die 15 neu angelegten Tabellen sind leer.
- Einzige Auffälligkeit: der vollständige Zeilen-Hash von `User` ändert sich, weil `User.locale` (nullable, ohne Default) neu in der Zeile erscheint und `NULL` ist. Das ist **keine Datenänderung** – der spaltenstabile `core_users`-Hash bleibt gleich.

### 6.3 Szenario C – Upgrade ab i18n-Head (`e8dc0773…`, „einzeln“)

- `db migrate` wendet **1 Kante** an (10 Operationen): `20261125T1957_add_custom_links`.
- Ledger: 17 → **18** Zeilen, Head `763e3b57…`.
- Schema: 57 → **59** Tabellen, 211 → **220** Indizes.
- `db verify --strict`: ✅ grün.
- **Datenintegrität:** Alle 35 überwachten bestehenden Tabellen haben **identische Data-Hashes**. Neu sind ausschließlich `CustomLink` und `CustomLinkLabel` (leer).
- Geschützte Bestände unverändert: APPROVED-Übersetzungen (`ct_1`, `ct_2`, `ct_4` inkl. Werte), `MACHINE_TRANSLATED`-Zeile (`ct_3`), Translation-Jobs/-Events/-Usage, Advertiser + AdCampaign, Benutzer/Rollen, Plugins/Themes inkl. Veröffentlichungsstatus.

### 6.4 Funktionsprüfung auf dem migrierten Schema

- Kopie der migrierten DB (`webradio_prodmig_verify_test`), danach `test:integration`:
  - `src/lib/__tests__/custom-links.integration.test.ts`
  - `src/lib/translation/__tests__/public-delivery.integration.test.ts`
- Ergebnis: **2 Suites, 27 Tests, alle grün.** Damit sind Custom-Link-CRUD (inkl. Cascade, Unique pro Locale, Positions-/Typ-Checks) und die öffentliche Übersetzungsauslieferung auf dem migrierten Schema nachgewiesen – nicht nur die Schema-Gleichheit.

### 6.5 Gegenprobe Reverse-Migration

`migration plan --to 20261125T1957_add_custom_links^ --name rollback_probe` erzeugt **keine** Rückwärtsmigration (`No changes detected`, zusätzlich Warnung vor einer Verzweigung des Migrationsgraphen). Das ist erwartet: die Migration hat keinen Down-Pfad. Rollback erfolgt daher über Wiederherstellung (Abschnitt 7).

---

## 7. Backup- und Wiederherstellungsplan

### 7.1 Vor der Migration (Pflicht)

1. **Backup-Status prüfen.** Die Datenbank läuft auf Prisma Postgres; die Plattform erstellt Backups automatisch.
   ```
   npx prisma auth login
   npx prisma postgres backup list <database>
   ```
   Der jüngste Backup-Zeitpunkt muss dokumentiert und als wiederherstellbar bestätigt sein.
2. **Eigenes logisches Backup** als zweite, unabhängige Sicherung (über `DIRECT_URL`, nicht den Pooler):
   ```
   pg_dump --format=custom --no-owner --no-privileges "$DIRECT_URL" > backup_prod_<datum>.dump
   ```
   Aufbewahrung bis mindestens 7 Tage nach erfolgreicher Abnahme.
3. **Ist-Stand schriftlich festhalten** (siehe Abschnitt 9, Schritt 1): Marker-Hash, Ledger-Head und -Anzahl, Tabellen-/Index-Zahlen, `db verify --strict`-Ausgabe.

### 7.2 Wiederherstellung (Rollback)

- **Primär:** `npx prisma postgres backup restore <database>` mit dem dokumentierten Backup von 7.1 (ersetzt den aktuellen Stand nach exakter Bestätigung). Alternativ Restore des eigenen Dumps:
  ```
  pg_restore --clean --if-exists --no-owner --no-privileges -d "$DIRECT_URL" backup_prod_<datum>.dump
  ```
- **Kein Down-Pfad nötig:** Die vier Kanten sind rein additiv. Ein Rückbau wäre ein `DROP TABLE` auf zwei bzw. 13 Tabellen und würde Marker/Ledger inkonsistent zurücklassen (`db verify --strict` würde fehlschlagen). Deshalb ist Restore der einzige saubere Weg.
- **Vorwärtskorrektur statt Rollback:** Weil nichts entfernt oder umgeschrieben wird, ist bei einem reinen Schemafehler eine neue Vorwärtsmigration die schonendere Variante – ohne Datenverlust und ohne Ausfall.
- **Nach einem Restore:** `db verify --strict` muss den zuvor dokumentierten Marker-Hash wieder melden; erst danach ist die Umgebung freigegeben.

---

## 8. Erwartete Auswirkungen auf die Live-Datenbank

| Bereich | Auswirkung |
| --- | --- |
| Tabellen | +13 (Advertising/i18n, falls noch nicht angewendet) bzw. +2 (`CustomLink`, `CustomLinkLabel`) |
| Indizes | +69 (Fall `80e32e10…`) bzw. +9 (Fall `e8dc0773…`); Endstand immer 59 Tabellen / 220 Indizes |
| Spalten an bestehenden Tabellen | nur `User.locale` (nullable `text`, kein Default, bestehende Zeilen bleiben `NULL`) und die i18n-Felder an `ContentTranslation` (neue Tabelle) |
| Bestehende Zeilen | **unverändert** – kein `UPDATE`, kein Backfill, kein `DROP`, kein `RENAME` |
| Benutzer, Rollen, Sessions | unverändert (`core_users`-Hash identisch) |
| Plugins/Themes inkl. Versionen & Status | unverändert |
| Advertising-/Partnerdaten | unverändert; Tabellen werden nur angelegt, falls sie fehlen |
| APPROVED-Übersetzungen, Jobs, Verlauf, Usage | unverändert (Szenario C: identische Hashes) |
| Website-Einstellungen | unverändert |
| Marker/Ledger | neuer Marker `763e3b57…`; je angewendeter Kante eine Ledger-Zeile |
| Sperren/Ausfall | nur kurze `ACCESS EXCLUSIVE`-Sperren für `CREATE TABLE`/`CREATE INDEX` auf neuen, leeren Tabellen – Millisekunden. Kein Tabellen-Rewrite, kein Ausfall zu erwarten. |
| Fachliche Folge | Custom-Links-Verwaltung und Übersetzungs-Engine werden nutzbar; neue Tabellen starten leer (Custom Links müssen im Admin angelegt werden, Übersetzungen entstehen bei Bedarf) |

**Reihenfolge zum Deployment:** erst migrieren, dann die App-Version deployen, die die neuen Tabellen liest. Umgekehrt würden Seiten, die Custom Links rendern, auf fehlende Tabellen treffen. Die Migration selbst ist für die aktuell laufende App-Version unschädlich (sie kennt die neuen Tabellen nicht).

---

## 9. Validierungsschritte

Nach der Migration, in dieser Reihenfolge, mit dokumentierter Ausgabe:

1. **Ist-Stand vorher festhalten** (unmittelbar vor der Migration):
   ```
   npm run db:status           # Ledger/Marker der Live-DB
   npm run db:verify -- --strict
   ```
   Erwartet: `80e32e10…` **oder** `e8dc0773…` als Marker. Weicht der Hash ab, **stoppen** und neu planen.
2. **Migration ausführen** (ein Lauf, ohne `--to`):
   ```
   DATABASE_URL="$DIRECT_URL" npm run db:migrate
   ```
   Erwartet: je fehlender Kante genau eine Zeile `app <migration> <origin> <destination> <ops>`.
3. **`db verify --strict`** → `Database marker and schema match contract`, `storageHash 763e3b57…`.
4. **Schema-Objekte kontrollieren:** 59 Tabellen, 220 Indizes; Unique `CustomLinkLabel_linkId_locale_key`; FK `CustomLinkLabel_linkId_fkey` mit `ON DELETE CASCADE`; Check-Constraints auf `position` und `type`.
5. **Marker und Ledger prüfen:** Marker `763e3b57…`, Ledger-Head `20261125T1957_add_custom_links → 763e3b57…`, Ledger-Zeilenzahl 18 (bei vorher 14) bzw. 18 (bei vorher 17).
6. **Datenstichproben:** Benutzerzahl und Rollenverteilung, `status` der Plugins/Themes, Anzahl `APPROVED`-Übersetzungen, jüngster `TranslationJob`, Advertising-/Partner-Zeilen – jeweils gegen die vor der Migration notierten Werte.
7. **Funktionsprüfung:** Admin → Custom Links (anlegen, Position wechseln, deaktivieren), öffentliche Seite in zwei Sprachen (Labels je Locale), Übersetzungs-Engine-Statusseite, Login mit bestehendem Konto.
8. **Abweichungen dokumentieren** – jede Abweichung von 3–7 blockiert die Abnahme; bei Schemaabweichung Restore (Abschnitt 7).

---

## 10. Noch offene Voraussetzungen

| # | Voraussetzung | Warum blockierend |
| --- | --- | --- |
| 1 | **Produktionszugang**: `DIRECT_URL` bzw. `DATABASE_URL_POOLED` (liegen nur in Vercel) | Ohne sie ist der Live-Head nicht lesbar und keine Migration ausführbar. Lokal ist keine Produktions-URL vorhanden – bewusst nicht im Repo. |
| 2 | **Bestätigter Backup-Zeitpunkt** (`prisma postgres backup list`, eingeloggte Prisma-CLI) | Ohne wiederherstellbares Backup keine Freigabe. |
| 3 | **Festgestellter Live-Head** (`db status` / `db verify --strict`) | Entscheidet, ob 1 oder 4 Kanten angewendet werden. Die Zahl im Plan (1 bzw. 4) ist eine Fallunterscheidung, keine Messung. |
| 4 | **Wartungsfenster / Deploy-Freeze** | Migration und App-Deployment sollen in der richtigen Reihenfolge erfolgen (Abschnitt 8). Technisch ist kein Ausfall zu erwarten, die Koordination ist trotzdem nötig. |
| 5 | **Freigabe** | Dieser Auftrag deckt nur Untersuchung, Planung und Tests ab. |
| 6 | *(nicht blockierend)* Passwort der lokalen Dev-DB auf `127.0.0.1:5432` | Wurde nicht geraten; für die Produktionsmigration irrelevant, da alle Tests auf dem isolierten Cluster (Port 5434) liefen. |

**Nicht Teil dieses Auftrags und weiterhin gesperrt:** produktive Migration, Änderung produktiver Daten, Commit, Push, Deployment, Änderung produktiver Vercel-Umgebungsvariablen. Nach Freigabe wird exakt Abschnitt 9 ausgeführt.

### Ausführender Befehl nach Freigabe (Kurzfassung)

```bash
# 1. Stand prüfen
DATABASE_URL="$DIRECT_URL" npm run db:status
DATABASE_URL="$DIRECT_URL" npm run db:verify -- --strict

# 2. Backup bestätigen
npx prisma postgres backup list <database>

# 3. Migrieren (wendet genau die fehlenden Kanten in Ledger-Reihenfolge an)
DATABASE_URL="$DIRECT_URL" npm run db:migrate

# 4. Validieren
DATABASE_URL="$DIRECT_URL" npm run db:verify -- --strict
```
