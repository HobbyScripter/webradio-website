# Produktionsvorprüfung vor Datenbankmigration

**Datum:** 2026-11-26
**Repository:** YourEliteSystems/WebRadio-Website
**Datenbank:** Prisma Postgres (`db.prisma.io`, `postgres`), Verbindung über `DIRECT_URL`
**Art der Prüfung:** ausschließlich lesend
**Ergebnis:** **NOT READY FOR MIGRATION** – technischer Stand ist konsistent, aber der Backup-Nachweis und die Betreiberfreigabe fehlen (Details in Abschnitt 7).

> Es wurde **keine** Migration ausgeführt, kein Datensatz und keine Tabelle verändert, keine Umgebungsvariable geändert, nichts committet, gepusht oder deployt. Alle Prüfungen bestanden ausschließlich aus `SELECT`-Abfragen, `db:status`, `db:verify` und einem `pg_dump --schema-only` nach `/dev/null`.

---

## 0. Zugang und Geheimnisschutz

- Die produktiven Verbindungsdaten liegen lokal in `.env.vercel.production` (`DIRECT_URL`, `DATABASE_URL_POOLED`, gitignoriert über `.env*`).
- Die Prüfungen liefen über `DIRECT_URL` (direkte Verbindung, Port 5432, `sslmode=require`). Der Pooler (`pooled.db.prisma.io`) wurde nicht verwendet, weil Schema-/Ledger-Abfragen über die direkte Verbindung laufen müssen.
- **Kein Connection-String, kein Benutzer, kein Passwort und kein Secret** wird in diesem Bericht, in Logs oder in der Konsole ausgegeben. Nur Hostname und Datenbankname wurden zur Identifikation geprüft.
- Hilfsskripte (`.acceptance/run-prod-readonly.mjs`, `.acceptance/prod-preflight-snapshot.mjs`) lesen die URL zur Laufzeit und geben sie nie aus; `.acceptance/` ist ungetrackt.

---

## 1. Tatsächlicher Produktions-Migrationsmarker

| Feld | Wert |
| --- | --- |
| `prisma_contract.marker.space` | `app` |
| **`core_hash` (Migrationsmarker)** | **`e54862c5d731bb20d89d75e46c4c0d41ab25a388639be96f2f02bcb0785ae1a6`** |
| `profile_hash` | `3916f444a8a17ad749191acf9e08dad97d1a327b88c2f1d45d12f240296aa8b2` |
| Ledger-Zeilen | 15 |
| Ledger-Head | `20261122T2030_advertising_partner_portal → e54862c5…` |

**Wichtig:** Der Produktionsstand entspricht **keinem** der beiden im Auftrag genannten Ausgangspunkte, sondern liegt dazwischen:

| Erwartet | Hash | Trifft zu? |
| --- | --- | --- |
| Analytics-Stand | `80e32e10…` | ❌ nein |
| i18n-Stand | `e8dc0773…` | ❌ nein |
| **Tatsächlich** | **`e54862c5…`** | ✅ – Advertising/Partner-Portal ist **bereits angewendet**, i18n noch nicht |

Das ist kein Widerspruch, sondern der erwartbare Zwischenschritt: `e54862c5…` ist exakt der Ziel-Hash von `20261122T2030_advertising_partner_portal` und der Start-Hash von `20261124T1823_i18n_content_translations`.

**Konsequenz für den Migrationsplan:** Es fehlen **3 Kanten** (35 Operationen), nicht 1 und nicht 4.

---

## 2. Ergebnis von `npm run db:status`

Exit-Code **0**. Auszug (gekürzt, ohne Verbindungsdaten):

```
✓ applied   … 15 Kanten von ∅ bis 20261122T2030_advertising_partner_portal (e54862c5)
  pending   20261124T1823_i18n_content_translations   e54862c5 → 43914ff3   6 ops
  pending   20261124T1840_i18n_translation_engine     43914ff3 → e8dc0773  19 ops
  pending   20261125T1957_add_custom_links            e8dc0773 → 763e3b57  10 ops
⚠ 3 pending — run `prisma db migrate --to 763e3b57bc99`
```

- Alle 15 angewendeten Kanten stimmen mit den Repository-Hashes überein; es gibt **keine** unbekannte oder abweichende angewendete Migration.
- Die drei ausstehenden Kanten haben exakt die Hashes aus dem Repository (`e54862c5 → 43914ff3 → e8dc0773 → 763e3b57`). Die Kette ist damit lückenlos an den Produktionsstand angeschlossen.
- Der tote Zweig erscheint im Graphen als unangewendete Abzweigung (`297315b → 1a8b3a1`) und wird von `db migrate` nicht betreten.

---

## 3. Ergebnis von `npm run db:verify -- --strict`

Exit-Code **4** mit:

```
✘ [CONTRACT.MARKER_MISMATCH] Hash mismatch
  why: Contract storageHash does not match database marker
```

**Bewertung: erwartet und unkritisch.** `--strict` vergleicht die Live-DB mit dem **eingecheckten Contract-Head** `763e3b57…`. Die Produktion steht bei `e54862c5…`, also drei Kanten davor – ein Mismatch ist die zwangsläufige Folge und **kein** Zeichen für einen beschädigten Produktionsstand.

Belege, dass der Produktionsstand trotzdem in sich konsistent ist:

- `prisma_contract.marker.core_hash` = `e54862c5…`, identisch mit dem Ziel-Hash der zuletzt angewendeten Kante im Ledger.
- Ledger enthält 15 Zeilen, jede mit fortlaufendem `origin_core_hash` → `destination_core_hash` ohne Lücke.
- Schema-Inventar passt zum Marker: 53 Tabellen, 192 Indizes, 154 Constraints – und **keine** der Objekte, die erst durch die ausstehenden Kanten entstehen (siehe Abschnitt 5).

Nach der Migration muss `--strict` grün sein (`storageHash 763e3b57…`); das ist das Abnahmekriterium, nicht der heutige Stand.

---

## 4. Backup-Status und Wiederherstellbarkeit

### 4.1 Was geprüft werden konnte

| Prüfung | Ergebnis |
| --- | --- |
| Datenbank ist Prisma Postgres | ✅ `db.prisma.io`, Plattform erstellt Backups automatisch (`prisma postgres backup`: „The platform takes backups automatically; there is no backup-create command“) |
| Prisma CLI angemeldet | ❌ `prisma auth whoami` → `status signed out` |
| Backup-Liste abrufbar | ❌ `prisma postgres list` → `[CLI.CREDENTIALS_REQUIRED] You must be signed in`; damit auch **kein** Backup-Zeitstempel und **keine** Restore-Bereitschaft verifizierbar |
| Unabhängiges `pg_dump` möglich | ✅ **ja, technisch nachgewiesen**: `pg_dump` 18.4 verbindet sich über `DIRECT_URL` und erzeugt einen Schema-Dump fehlerfrei (Exit 0, Ausgabe nach `/dev/null`) |

### 4.2 Was bewusst nicht getan wurde

- **Kein Backup erstellt.** Ein vollständiger `pg_dump` würde die gesamte Produktionsdaten enthalten (u. a. Benutzer-E-Mails, Session-Hashes, Audit-Log). Das ist eine Datenhaltungs-Entscheidung des Betreibers und gehört zur Freigabe, nicht zur Vorprüfung.
- **Keine Prisma-Anmeldung** (`prisma auth login`) durchgeführt: interaktiver Fremd-Login, nicht Teil dieses Auftrags.

### 4.3 Voraussetzungen für ein belastbares Backup

1. `prisma auth login` mit dem Konto, dem das Prisma-Postgres-Projekt gehört, danach `prisma postgres backup list <database>`; jüngsten Backup-Zeitpunkt dokumentieren und als wiederherstellbar bestätigen.
2. Zusätzlich unabhängiges logisches Backup (auf Freigabe, mit `DIRECT_URL`):
   ```
   pg_dump --format=custom --no-owner --no-privileges "$DIRECT_URL" > backup_prod_<datum>.dump
   ```
   Ablage außerhalb des Repositories, Zugriff beschränkt, Aufbewahrung ≥ 7 Tage nach Abnahme.
3. Restore-Pfad vorab einmal durchspielen (idealerweise gegen eine Wegwerf-Datenbank, nicht gegen Produktion):
   ```
   prisma postgres backup restore <database>     # Plattform-Backup, ersetzt den aktuellen Stand
   pg_restore --clean --if-exists --no-owner --no-privileges -d "$DIRECT_URL" backup_prod_<datum>.dump
   ```

**Fazit:** Wiederherstellbarkeit ist **grundsätzlich** möglich (Plattform-Backups + eigener Dump, Werkzeuge vorhanden und getestet), aber **heute nicht nachgewiesen** – der Backup-Zeitstempel ist von hier aus nicht lesbar.

---

## 5. Abgleich der erwarteten Migrationskette

### 5.1 Kettenkontrolle

```
∅ … 20261114T2227_analytics_sync_status                       (80e32e10) ✓ angewendet
  → 20261122T2030_advertising_partner_portal  50 ops           (e54862c5) ✓ angewendet  ← Produktion steht hier
  → 20261124T1823_i18n_content_translations    6 ops           (43914ff3) ⏳ ausstehend
  → 20261124T1840_i18n_translation_engine     19 ops           (e8dc0773) ⏳ ausstehend
  → 20261125T1957_add_custom_links            10 ops           (763e3b57) ⏳ ausstehend  ← Ziel
```

| Prüfpunkt | Ergebnis |
| --- | --- |
| Reihenfolge Advertising → i18n Content → Translation Engine → Custom Links | ✅ bestätigt, Advertising ist bereits angewendet, die drei folgenden sind ausstehend |
| Unerwartete Migrationen | ✅ keine – 15 angewendete Kanten, alle mit Repository-Hashes |
| Abweichende Hashes | ✅ keine – jede Kante schließt exakt an den Vorgänger-Hash an |
| Linearität | ✅ keine Verzweigung auf dem Pfad; Snapshot `e54862c5…` liegt im Repository vor, die Kette ist ab Produktionsstand planbar |
| Toter Zweig `20261031T1732_legal_documents` | ✅ **nicht angewendet** – 0 Ledger-Zeilen mit Ziel `1a8b3a12…`, Marker ≠ `1a8b3a12…`; im Graphen als unangetastete Abzweigung sichtbar |
| Unbeabsichtigte Datenverluste | ✅ keine zu erwarten – siehe 5.3 |

### 5.2 Ausstehende Schemaänderungen (35 Operationen)

| Kante | Änderungen |
| --- | --- |
| `i18n_content_translations` (6) | `createTable ContentTranslation` (+ Unique über `entityType/entityId/locale/field`), **`addColumn User.locale`** (nullable `text`, kein Default), 3 Indizes |
| `i18n_translation_engine` (19) | `createTable TranslationJob`, `TranslationEvent`, `TranslationUsage`; 3 `addColumn` + 2 `setDefault` an `ContentTranslation`; 10 Indizes, 1 Unique |
| `add_custom_links` (10) | `createTable CustomLink` (Check-Constraints `position`, `type`), `createTable CustomLinkLabel`, Unique `(linkId, locale)`, 6 Indizes, FK `linkId → CustomLink(id) ON DELETE CASCADE` |

Rein additiv: **keine** `dropTable`, `dropColumn`, `renameColumn`, kein Typwechsel, kein `UPDATE`/Backfill. Bestehende Zeilen werden nicht umgeschrieben; `User.locale` bleibt für vorhandene Konten `NULL` (App fällt auf Standard-Locale zurück).

### 5.3 Ist-Zustand der Produktionsdaten (Stichproben, rein lesend)

| Objekt | Wert |
| --- | --- |
| Tabellen / Indizes / Constraints (Schema `public`) | 53 / 192 / 154 |
| `User` | 2 Konten – `ADMIN`=1, `SYSTEM_ADMIN`=1, beide `ACTIVE` |
| `Session` | 7 |
| `Plugin` | 1, `APPROVED`; `Theme` 1 |
| `LegalDocument` / `LegalConsent` | 3 / 0 |
| `Release` / `News` | 0 / 0 |
| Advertising/Partner | `Advertiser` 0, `AdCampaign` 0, `AdvertisingApplication` 0, `Partner` 0 (Tabellen existieren, noch ungenutzt) |
| Datenreichste Tabellen | `GitHubDownloadSnapshot` 846, `GitHubPunchCardSlot` 168, `GitHubReleaseAsset` 141, `RateLimitBucket` 55, `AnalyticsSyncRun` 55, `AuditLog` 35 |
| `User.locale` | Spalte existiert **nicht** (konsistent mit Marker) |
| `ContentTranslation`, `TranslationJob`, `TranslationEvent`, `TranslationUsage`, `CustomLink`, `CustomLinkLabel` | existieren **nicht** (konsistent mit Marker) |

Damit sind **keine** APPROVED-Übersetzungen und **keine** Translation-Jobs in Produktion vorhanden – der in der Planung geschützte Bestand kann durch die Migration nicht beeinträchtigt werden, weil er noch nicht existiert. Geschützt und unverändert bleiben: 2 Benutzerkonten mit Rollen, 7 Sessions, Plugin/Theme, 3 Legal-Dokumente sowie die Analytics-Bestände.

### 5.4 Erwartete Zielwerte nach der Migration

| Kennzahl | jetzt | nach Migration |
| --- | --- | --- |
| Marker | `e54862c5…` | `763e3b57…` |
| Ledger-Zeilen | 15 | 18 |
| Tabellen | 53 | 59 (+6) |
| Indizes | 192 | 220 (+28) |

(Die Zielwerte 59/220 sind auf isolierten Datenbanken zweifach verifiziert: volle Kette und Upgrade ab i18n-Head, jeweils `db verify --strict` grün.)

---

## 6. Abweichungen und offene Voraussetzungen

### 6.1 Abweichungen gegenüber dem bestehenden Plan

| # | Abweichung | Bewertung |
| --- | --- | --- |
| 1 | Produktionsstand ist `e54862c5…`, nicht `80e32e10…` oder `e8dc0773…` | unkritisch – Advertising ist bereits migriert; es fehlen **3** statt 1/4 Kanten. `docs/PRODUCTION_MIGRATION_PLAN.md` ist entsprechend zu präzisieren (Abschnitt 8). |
| 2 | `.env` enthält weiterhin **keine** Produktionszugänge; diese liegen in `.env.vercel.production` (gitignoriert) | unkritisch, aber dokumentationsrelevant: der Plan sprach von „nur in Vercel“. Tatsächlich sind sie lokal in einer separaten, ignorierten Datei vorhanden. |

Keine Abweichung bei Kettenintegrität, Hashes, totem Zweig oder Datenbestand.

### 6.2 Offene Voraussetzungen (blockierend)

| # | Voraussetzung | Status |
| --- | --- | --- |
| 1 | **Backup-Nachweis**: Backup-Zeitpunkt und Restore-Bereitschaft bestätigen (Prisma-CLI-Anmeldung erforderlich) | ❌ offen – CLI `signed out` |
| 2 | **Unabhängiges `pg_dump`-Backup** erstellen und außerhalb des Repos ablegen | ❌ offen – technisch nachgewiesen, bewusst nicht erstellt |
| 3 | **Ausdrückliche Betreiberfreigabe** für die Migration | ❌ offen |
| 4 | Wartungsfenster / Deploy-Reihenfolge (erst migrieren, dann App-Version mit Custom Links ausrollen) | ❌ offen (organisatorisch) |
| 5 | Migrationsdateien versioniert: `20261124T1823_…`, `20261124T1840_…`, `20261125T1957_…` und `refs/db.json` sind im Arbeitsbaum **uncommittet** | ⚠️ Hinweis – der Lauf ist nur reproduzierbar, wenn exakt dieser Arbeitsbaum verwendet wird; Commit ist in diesem Auftrag verboten |

---

## 7. Bewertung

> ## NOT READY FOR MIGRATION

**Technisch** ist die Produktionsdatenbank in einem sauberen, migrationsbereiten Zustand:

- Marker `e54862c5…` ist ein bekannter, erwarteter Zwischenstand; Ledger und Schema sind lückenlos konsistent.
- Die fehlenden drei Kanten sind rein additiv (35 Operationen, keine destruktive Operation), schließen exakt an den Produktions-Hash an und wurden auf isolierten Datenbanken zweifach erfolgreich durchgespielt.
- Der tote Zweig ist nicht angewendet und wird nicht betreten.
- Der Datenbestand ist klein und wird durch die Migration nicht verändert (keine Übersetzungen/Jobs vorhanden, 2 Konten, 1 Plugin, 1 Theme, 3 Legal-Dokumente).

**Nicht bereit** ist der Vorgang aus Prozesssicht:

1. Es gibt **keinen verifizierten Backup-Nachweis** (Backup-Zeitpunkt/Restore-Check nicht abrufbar, CLI nicht angemeldet).
2. Ein **unabhängiges `pg_dump`-Backup** wurde – auftragsgemäß – noch nicht erstellt.
3. Die **Betreiberfreigabe** fehlt ausdrücklich.

**Was auf READY FOR MIGRATION hebt:** Backup-Zeitpunkt dokumentiert und Restore-Bereitschaft bestätigt (1), eigenes `pg_dump`-Backup vorhanden (2), Freigabe erteilt (3). Es sind keine technischen Änderungen an Datenbank, Code oder Migrationskette erforderlich.

**Unverändert gesperrt:** `db:migrate`, jede Schreiboperation auf produktiven Tabellen, Änderungen an Vercel-Umgebungsvariablen, Datenbankkonfiguration, Commit, Push, Deployment, Rollback.

---

## 8. Nachtrag zum bestehenden Migrationsplan

`docs/PRODUCTION_MIGRATION_PLAN.md` beschreibt zwei Fälle (1 oder 4 Kanten). Der gemessene Stand ist ein **dritter** Fall:

```
Produktion: e54862c5…  →  3 Kanten, 35 Operationen
  20261124T1823_i18n_content_translations   (6)
  20261124T1840_i18n_translation_engine    (19)
  20261125T1957_add_custom_links           (10)
```

Auszuführender Befehl nach Freigabe (unverändert, ohne `--to`, damit genau die fehlenden Kanten laufen):

```
DATABASE_URL="$DIRECT_URL" npm run db:migrate
DATABASE_URL="$DIRECT_URL" npm run db:verify -- --strict   # erwartet: storageHash 763e3b57…
```

Der Migrationsplan selbst (Entscheidung „gemeinsamer Lauf über die bestehende lineare Kette, keine synthetische Combined-Migration“) bleibt unverändert gültig – er wird durch die Messung bestätigt, nicht widerlegt.
