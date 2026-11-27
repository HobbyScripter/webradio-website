# Produktionsmigration – Preflight-Bericht

**Datum:** 2026-11-27
**Repository:** YourEliteSystems/WebRadio-Website (Head `f6b443c`, Arbeitsbaum mit unversionierten Migrationsdateien)
**Datenbank:** Prisma Postgres (`db.prisma.io`, DB `postgres`), Verbindung über `DIRECT_URL`
**Art der Prüfung:** ausschließlich lesend (`SELECT`, `db:status`, `db:verify`)
**Ergebnis:** **READY FOR MIGRATION** – technisch migrationsbereit; Phase 2 bleibt gesperrt bis zur ausdrücklichen Freigabe und bis das frische Backup aus Schritt 2.1 vorliegt.

> Es wurde **keine** Migration ausgeführt, keine Schreiboperation auf Produktion, keine Änderung an Vercel-/Prisma-Konfiguration, kein Commit, Push oder Deployment. Das Original-Backup wurde nicht verändert. Dieser Bericht ersetzt den Preflight vom 2026-11-26 (`docs/PRODUCTION_MIGRATION_PREFLIGHT_REPORT.md`) und bestätigt dessen Befund mit aktuellem Messstand.

---

## 1. Produktions-Migrationsstand und Schema-Hash

| Feld | Messwert (2026-11-27) |
| --- | --- |
| `prisma_contract.marker.space` | `app` |
| **`core_hash` (Migrationsmarker)** | **`e54862c5d731bb20d89d75e46c4c0d41ab25a388639be96f2f02bcb0785ae1a6`** |
| `profile_hash` | `3916f444a8a17ad7…` (unverändert) |
| Ledger-Zeilen | **15** |
| Jüngste Ledger-Kante | `20261122T2030_advertising_partner_portal → e54862c5…` (angelegt 2026-11-23 21:37:21 CET) |
| Contract-`storageHash` im Repo (`prisma/contract.json`) | `763e3b57bc99fa207bbd840d3b44199daed778109dc6e7ae6ee2f2c103ff70d6` |
| `db:status` | Exit **0**, **3 pending**, 0 unbekannte/abweichende Kanten |
| `db:verify --strict` | Exit **4**, `[CONTRACT.MARKER_MISMATCH]` – erwartet (DB steht 3 Kanten vor dem Contract-Head) |

Der Marker ist exakt der Ziel-Hash der zuletzt angewendeten Kante und exakt der Start-Hash der ersten ausstehenden Kante. Die Kette ist lückenlos.

---

## 2. Erwarteter Migrations-Head aus `refs/db.json`

```json
{ "hash": "e8dc07735da9f571e94ee9b1a8321f53913db3a2f1a8b8b18da97882efda7245", "invariants": [] }
```

**Einordnung:** `migrations/app/refs/db.json` enthält **nicht** den End-Head, sondern die **Datenbank-Referenz, gegen die die jüngste Migration erzeugt wurde** – also den Startzustand von `20261125T1957_add_custom_links`. Der Wert ist genau der i18n-Head `e8dc0773…`, der zugleich das Ziel der zweiten ausstehenden Kante ist.

| Erwartung | Hash | Trifft zu? |
| --- | --- | --- |
| `refs/db.json` (= Start der letzten Kante) | `e8dc0773…` | ✅ |
| Ziel der Kante `20261124T1840_i18n_translation_engine` | `e8dc0773…` | ✅ identisch mit `refs/db.json` |
| **Erwarteter Migrations-Head (Contract)** | **`763e3b57…`** | ✅ in `prisma/contract.json` und als Ziel von `add_custom_links` |
| Produktionsmarker | `e54862c5…` | ✅ Start-Hash der ersten ausstehenden Kante |

Es gibt keinen Widerspruch: `refs/db.json` beschreibt den Referenzstand der Migration-Autorenschaft, der Head ergibt sich aus der Kette `e54862c5 → 43914ff3 → e8dc0773 → 763e3b57`. Alle vier Snapshots liegen unter `migrations/snapshots/<hash>/` vor.

---

## 3. Die drei Migrationen und ihre Abhängigkeiten

| # | Migration | Start → Ziel | Ops | Inhalt |
| --- | --- | --- | --- | --- |
| 16 | `20261124T1823_i18n_content_translations` | `e54862c5` → `43914ff3` | 6 | `createTable ContentTranslation` (PK `id`, Unique `entityType/entityId/locale/field`, Status-Default `DRAFT`), **`addColumn User.locale`** (nullable `text`, kein Default), 3 Indizes |
| 17 | `20261124T1840_i18n_translation_engine` | `43914ff3` → `e8dc0773` | 19 | `createTable TranslationJob`, `TranslationEvent`, `TranslationUsage`; `addColumn` `outdated`/`provider`/`sourceHash` an `ContentTranslation`; 2 `setDefault`; 1 Unique (`TranslationJob_jobKey_key`); 10 Indizes |
| 18 | `20261125T1957_add_custom_links` | `e8dc0773` → `763e3b57` | 10 | `createTable CustomLink` (+ Check `position IN ('MAIN_NAVIGATION','FOOTER')`, `type IN ('INTERNAL','EXTERNAL')`), `createTable CustomLinkLabel`; Unique `(linkId, locale)`; FK `linkId → CustomLink(id) ON DELETE CASCADE`; 6 Indizes |

**Operationstypen insgesamt (35):** 6 × `createTable`, 4 × `addColumn`, 2 × `setDefault`, 3 × `addUnique`, 19 × `createIndex`, 1 × `addForeignKey`.

**Destruktive Operationen:** keine. Kein `dropTable`, `dropColumn`, `renameColumn`, kein Typwechsel, kein `ALTER COLUMN TYPE`, kein `UPDATE`/Backfill. Bestehende Zeilen werden nicht umgeschrieben; `User.locale` bleibt für vorhandene Konten `NULL`.

**Sachliche Abhängigkeiten:**

1. **#16 → #17:** #17 erweitert `ContentTranslation` (in #16 erzeugt) um drei Spalten und ändert zwei Defaults. Ohne #16 ist #17 nicht anwendbar.
2. **#17 → #18:** technisch über den Hash gebunden (`refs/db.json` = `e8dc0773…`), fachlich unabhängig (eigene Tabellen).
3. **#16 hängt an #15** (Advertising, bereits angewendet): `e54862c5…` ist dessen Ziel-Hash.

Die Reihenfolge ist durch die lineare Kette erzwungen und wird von `db migrate` (ohne `--to`) automatisch eingehalten.

---

## 4. Keine zusätzlichen oder unerwarteten Migrationen

| Prüfpunkt | Ergebnis |
| --- | --- |
| Migrationsverzeichnisse in `migrations/app/` | 19 (18 auf dem Pfad zum Head + 1 toter Zweig) |
| Ledger in Produktion | 15 Zeilen, jede mit fortlaufendem `origin_core_hash → destination_core_hash` |
| Ausstehend laut `db:status` | genau **3** – die oben genannten, in Kettenreihenfolge |
| Kanten außerhalb des Pfads | nur `20261031T1732_legal_documents` (`297315b → 1a8b3a1`, 12 Ops) – **nicht angewendet**, wird von `db migrate` nicht betreten (kein Ledger-Eintrag, Marker ≠ `1a8b3a1`) |
| Repo-Migrationen ohne Ledger-Eintrag | keine außer dem toten Zweig |
| Abweichende Hashes | keine |
| Verzweigung auf dem Pfad | keine |

**Konsequenz:** `db migrate` wendet in Produktion exakt 3 Kanten / 35 Operationen an – nicht mehr und nicht weniger.

**Wichtig (Arbeitsbaum):** Die drei Migrationsverzeichnisse, die zugehörigen Snapshots sowie `prisma/contract.*` und `migrations/app/refs/db.json` sind **uncommittet**. Der Lauf ist nur mit genau diesem Arbeitsbaum reproduzierbar; ein Commit ist in diesem Auftrag nicht erlaubt (separate Freigabe).

---

## 5. PostgreSQL-Version und Kompatibilität

| Prüfpunkt | Messwert |
| --- | --- |
| Server | **PostgreSQL 17.2** (`x86_64-pc-linux-musl`, Alpine-Build), `server_version_num = 170002` |
| Extensions | `plpgsql 1.0`, `pg_stat_statements 1.11`, `prisma_postgres 0.4.0` |
| Schemas | `public`, `prisma_contract` |
| Verwendete Typen | `text`, `bool`, `int4`, `timestamptz` – alle seit PostgreSQL 8 verfügbar |
| Verwendete DDL | `CREATE TABLE`, `ADD COLUMN`, `ALTER COLUMN SET DEFAULT`, `CREATE UNIQUE INDEX`/`UNIQUE CONSTRAINT`, `CREATE INDEX`, `CHECK`, `FOREIGN KEY … ON DELETE CASCADE` |
| PG-18-spezifische Syntax | keine (keine `NULLS NOT DISTINCT`-Abhängigkeit, keine neuen Systemkataloge, kein `MERGE`/`RETURNING`-Sonderfall) |
| Extension-Abhängigkeit der Migration | keine – die Migrationen erzeugen ausschließlich App-Objekte in `public` |
| Schreibziel außerhalb `public` | `prisma_contract` (Ledger/Marker/Contract) – vom Migrationswerkzeug selbst, erwartetes Verhalten |

**Bewertung:** Die Migrationen sind mit PostgreSQL 17.2 vollständig kompatibel. Die Kanten wurden zuvor auf einem isolierten PostgreSQL-18-Cluster zweifach durchgespielt (volle Kette und Upgrade ab Analytics-Head, jeweils `db verify --strict` grün); PG 18 ist gegenüber 17.2 strenger, ein dort erfolgreicher Lauf ist daher kein Kompatibilitätsrisiko für 17.2.

**Sperrverhalten:** `CREATE TABLE`/`CREATE INDEX` betreffen ausschließlich **neue, leere** Tabellen (kein Rewrite, kein Scan bestehender Daten), `ADD COLUMN` auf `User` ist nullable ohne Default → kein Tabellen-Rewrite. Erwartete Sperren im Millisekundenbereich; kein Ausfall zu erwarten.

---

## 6. Backup und Wiederherstellbarkeit

### 6.1 Vorhandene Sicherungen

| Kopie | Details | Status |
| --- | --- | --- |
| Original-Dump | `F:\Dev\webradio-backups\webradio-production-backup-20261126-195635.dump`, 379.888 Bytes, SHA-256 `dd6b7ad02ca69fd5bd2e7b44878541e6c4f8d9896520a82b68ade23f8be8fdca`, `pg_dump -Fc` (PG 18.4 gegen Server 17.2) | ✅ Prüfsumme am 2026-11-27 erneut geprüft: OK |
| Verschlüsselte Zweitkopie | `E:\webradio-backups-encrypted\…dump.aes256gcm`, 379.921 Bytes, AES-256-GCM, SHA-256 `b530406cdd692349df4f7077f11e7b1f482efc56f980df6a56af16c69085aec1` | ✅ Entschlüsselungstest bestanden (bitgleich), Schlüssel DPAPI, **Key Storage offen** |
| Wiederherstellbarkeit | Restore in isolierten PG-18-Cluster (Port 5436) | ✅ 53/53 Tabellen, 192/192 Indizes, 154/154 Constraints, alle 56 Zeilenzahlen identisch |

Belege: `docs/PRODUCTION_BACKUP_REPORT.md`, `docs/PRODUCTION_BACKUP_ENCRYPTION_REPORT.md`.

### 6.2 Aktualität – wichtig für Phase 2

Der Dump vom 2026-11-26 19:56 ist **älter als der aktuelle Datenstand**. Beleg (reine `count(*)`-Abfragen, Datei `.acceptance/preflight-rowcounts-20261127.txt`):

| Tabelle | im Backup/Restore | heute |
| --- | --- | --- |
| `GitHubDownloadSnapshot` | 846 | **987** |
| `AuditLog` | 35 | 35 |
| `User` / `Session` | 2 / 7 | 2 / 7 |
| `Plugin` / `Theme` / `LegalDocument` | 1 / 1 / 3 | 1 / 1 / 3 |

Die Differenz stammt aus dem laufenden Analytics-Sync (Scheduler), nicht aus der Migration. **Konsequenz:** Vor der Migration ist ein **frisches** Backup Pflicht (Phase 2, Schritt 1). Das vorhandene Backup bleibt als Vor-Vor-Migration-Stand erhalten und wird nicht gelöscht.

### 6.3 Bewertung

Wiederherstellbarkeit ist **nachgewiesen** (vollständiger Restore gegen isolierte Instanz, objektweise verglichen). Ein Plattform-Backup von Prisma Postgres ist weiterhin nicht abrufbar (`prisma auth whoami` → `signed out`); das ist für die Migration nicht blockierend, weil das eigene logische Backup den Wiederherstellungspfad abdeckt.

---

## 7. Aktueller Produktionsbackup-Plan (für Phase 2)

**Schritt 1 – Frisches logisches Backup (unmittelbar vor der Migration)**

```bash
node .acceptance/prod-backup.mjs "F:/Dev/webradio-backups/webradio-production-backup-<YYYYMMDD-HHMMSS>.dump"
```

- `pg_dump --format=custom` (vollständig, Schema + Daten), URL ausschließlich zur Laufzeit aus `.env.vercel.production`, Credentials über temporäre `PGPASSFILE` (0600, wird gelöscht) – keine URL in `argv` oder Logs.
- Ablage außerhalb des Repositories in `F:\Dev\webradio-backups\` (ACL auf `DFark`/`Administratoren`/`SYSTEM` beschränkt).
- Danach: `.sha256`-Datei erzeugen, `sha256sum -c` prüfen, Größe und `pg_restore --list` (Exit 0, 53 `TABLE`/56 `TABLE DATA`) dokumentieren.

**Schritt 2 – Verschlüsselte Zweitkopie des frischen Backups**

```bash
powershell -File .acceptance/backup-key-create.ps1 -OutFile "C:/Users/DFark/AppData/Local/webradio-backup-keys/<name>.key.dpapi"
powershell -File .acceptance/backup-key-pipe.ps1 -Path "<key>.dpapi" | node .acceptance/backup-encrypt.mjs <in.dump> "E:/webradio-backups-encrypted/<name>.dump.aes256gcm" --expect-sha <dump-sha256>
```

- AES-256-GCM mit eigenem, neuem Schlüssel je Backup (frische Key ID), DPAPI-Blob außerhalb von Repo und Backup-Verzeichnissen.
- Entschlüsselungs-Gegentest in ein temporäres Verzeichnis, SHA-256-Vergleich mit dem frischen Dump, temporäre Datei überschreiben und löschen.

**Schritt 3 – Aufbewahrung**

- Neues Backup + verschlüsselte Kopie bleiben mindestens **30 Tage nach erfolgreicher Abnahme**, mindestens jedoch 90 Tage.
- Das Backup vom 2026-11-26 (Original + verschlüsselte Kopie) bleibt unangetastet als Vor-Vor-Migration-Stand.
- **Keine** automatische Löschung, keine Rotation, kein Cronjob in diesem Auftrag.

**Rollback-Pfad:** Wiederherstellung des frischen Dumps (`pg_restore --clean --if-exists --no-owner --no-privileges` gegen eine kontrollierte Ziel-DB) bzw. Plattform-Backup nach Anmeldung. Es gibt keinen Down-Pfad in den Migrationen; Vorwärtskorrektur per neuer Migration ist bei reinen Schemafehlern die schonendere Variante.

---

## 8. Ausgangs-Inventar (Vergleichsbasis für Phase 2)

| Kennzahl | Wert |
| --- | --- |
| Basistabellen `public` | **53** (zusätzlich 2 Views aus `pg_stat_statements` – keine App-Objekte) |
| Indizes `public` | 192 |
| Constraints `public` (ohne `NOT NULL`-Einträge) | 154 |
| `User` / `Session` | 2 / 7 |
| `Plugin` / `Theme` | 1 / 1 |
| `LegalDocument` / `LegalConsent` | 3 / 0 |
| `AuditLog` | 35 |
| `GitHubDownloadSnapshot` | 987 |
| `ContentTranslation`, `TranslationJob`, `TranslationEvent`, `TranslationUsage`, `CustomLink`, `CustomLinkLabel` | **existieren nicht** (0 Treffer in `pg_tables`) |
| `User.locale` | **existiert nicht** (0 Spalten) |
| Ledger-Zeilen | 15 |
| Marker | `e54862c5…` |

**Zielwerte nach der Migration:** Marker `763e3b57…`, Ledger **18** Zeilen, **59** Tabellen (+6), **220** Indizes (+28), 6 neue Tabellen leer, `User.locale` vorhanden und `NULL` für beide Konten, alle übrigen Zeilenzahlen unverändert.

---

## 9. Risiken und offene Punkte

| # | Punkt | Bewertung |
| --- | --- | --- |
| 1 | Backup älter als aktueller Datenstand (Analytics wächst) | ⚠️ durch frisches Backup in Phase 2 Schritt 1 abgedeckt |
| 2 | Schlüssel-Verwahrung der verschlüsselten Kopie noch nicht extern gesichert (Key Storage offen) | ⚠️ betrifft Katastrophenschutz, nicht die Migration selbst; vor Phase 2 empfohlen |
| 3 | Migrationsdateien uncommittet | ⚠️ Lauf nur mit diesem Arbeitsbaum reproduzierbar; Commit separat freizugeben |
| 4 | Laufende Analytics-Schreibvorgänge während der Migration | ✅ unkritisch: DDL betrifft neue leere Tabellen; `ADD COLUMN` nullable ohne Default |
| 5 | App-Version liest neue Tabellen noch nicht | ✅ Reihenfolge: erst migrieren, dann die App-Version mit Custom Links/i18n deployen (Deployment separat freizugeben) |
| 6 | Kein Down-Pfad | ✅ dokumentiert; Rollback = Restore |
| 7 | Plattform-Backup-Metadaten nicht abrufbar (CLI nicht angemeldet) | ℹ️ nicht blockierend, eigenes Backup vorhanden |
| 8 | Migrationsfehler mitten in der Kette | ⚠️ dann sofortiger Stopp, keine Reparatur an Produktionsdaten, Zustand melden; Rollback über Restore |

---

## 10. Bewertung

> ## READY FOR MIGRATION

**Alle sieben Preflight-Punkte bestanden:**

1. ✅ Produktionsstand eindeutig: Marker `e54862c5…`, 15 Ledger-Zeilen, `db:status` Exit 0.
2. ✅ Erwarteter Head `763e3b57…` bestätigt; `refs/db.json` (`e8dc0773…`) ist konsistent als Start-Referenz der letzten Kante.
3. ✅ Drei Migrationen, 35 rein additive Operationen, Abhängigkeiten und Reihenfolge eindeutig, alle Snapshots vorhanden.
4. ✅ Keine unerwarteten Migrationen; einzige Abzweigung ist der tote Zweig und wird nicht betreten.
5. ✅ PostgreSQL 17.2, alle verwendeten Typen/DDL kompatibel, keine Extension-Abhängigkeit.
6. ✅ Wiederherstellbarkeit nachgewiesen; Backup vorhanden und geprüft.
7. ✅ Backup-Plan für Phase 2 definiert (frischer Dump + verschlüsselte Kopie + Aufbewahrung).

**Phase 2 bleibt gesperrt, bis:**

- die **ausdrückliche Freigabe** für die Migration vorliegt („Freigabe erteilt, Migration ausführen"), und
- das **frische Backup** nach Abschnitt 7 erstellt und mit Prüfsumme belegt ist.

**Unverändert verboten:** Daten löschen/zurücksetzen, synthetische Sammelmigration, Änderungen außerhalb des Migrationsumfangs, Commit/Push/Deployment ohne separate Freigabe, eigenständige Reparaturen an Produktionsdaten.

---

## Anhang: geplante Befehlsfolge nach Freigabe

```bash
# 1) Frisches Backup + Prüfsumme
node .acceptance/prod-backup.mjs "F:/Dev/webradio-backups/webradio-production-backup-<ts>.dump"
#    .sha256 erzeugen, sha256sum -c, pg_restore --list

# 2) Verschlüsselte Zweitkopie (neuer Schlüssel, DPAPI) + Entschlüsselungs-Gegentest

# 3) Stand unmittelbar vor der Migration erneut festhalten
node .acceptance/run-prod-readonly.mjs db:status

# 4) Migration – genau die 3 fehlenden Kanten, in Kettenreihenfolge
DATABASE_URL="$DIRECT_URL" npm run db:migrate

# 5) Abnahme
DATABASE_URL="$DIRECT_URL" npm run db:verify -- --strict    # erwartet storageHash 763e3b57…, Exit 0
#    Marker 763e3b57…, Ledger 18, 59 Tabellen, 220 Indizes, Zeilenzahlen gegen Abschnitt 8
```

Das Migrationsergebnis wird separat in `docs/PRODUCTION_MIGRATION_EXECUTION_REPORT.md` dokumentiert.
