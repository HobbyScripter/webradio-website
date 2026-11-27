# Produktionsmigration – Ausführungsbericht

**Datum:** 2026-11-27
**Repository:** YourEliteSystems/WebRadio-Website (Head `f6b443c`; Migrationsdateien uncommittet)
**Datenbank:** Prisma Postgres (`db.prisma.io`, DB `postgres`), PostgreSQL **17.2**
**Freigabe:** ausdrückliche Betreiberfreigabe für Phase 2, Umfang: ausschließlich die drei geprüften Migrationen
**Ergebnis:** **MIGRATION COMPLETED – VERIFIED**

> Angewendet wurden **genau drei** Migrationen (35 Operationen). Keine Daten gelöscht, keine bestehende Zeile verändert, keine weiteren Migrationen angewendet, kein Commit, kein Push, kein Deployment, keine Backup-Löschung oder Rotation, keine eigenständigen Reparaturen an Produktionsdaten.

---

## 1. Ergebnis in Kurzform

| Kennzahl | vor der Migration | **nach der Migration** | erwartet |
| --- | --- | --- | --- |
| Marker (`core_hash`) | `e54862c5…` | **`763e3b57bc99fa207bbd840d3b44199daed778109dc6e7ae6ee2f2c103ff70d6`** | `763e3b57…` ✅ |
| `profile_hash` | `3916f444…` | `3916f444a8a17ad749191acf9e08dad97d1a327b88c2f1d45d12f240296aa8b2` | unverändert ✅ |
| Ledger-Zeilen | 15 | **18** | 18 ✅ |
| Ledger-Head | `20261122T2030_advertising_partner_portal` | **`20261125T1957_add_custom_links → 763e3b57…`** | ✅ |
| Tabellen (`public`, Basistabellen) | 53 | **59** | 59 ✅ |
| Indizes (`public`) | 192 | **220** | 220 ✅ |
| Constraints (ohne `NOT NULL`) | 154 | **166** (+12) | ✅ |
| `db:status` | Exit 0, 3 pending | **Exit 0, 0 pending** | ✅ |
| `db:verify --strict` | Exit 4 (Marker-Mismatch) | **Exit 0, `✔ Database marker and schema match contract`** | ✅ |

---

## 2. Schritt 1–3: Frisches Produktionsbackup

| Feld | Wert |
| --- | --- |
| Datei | `F:\Dev\webradio-backups\webradio-production-backup-20261127-142037.dump` |
| Format | `pg_dump --format=custom` (vollständig: Schema + Daten) |
| Start | 2026-11-27 14:20:37 CET |
| Dauer / Exit | 6,2 s / **Exit 0** |
| Größe | **384.607 Bytes** |
| **SHA-256** | **`55e2deabb6ff0a42c5a67b810102a1763654ff835a4edcf6d9c031485baafe3e`** |
| Prüfsummendatei | `…-20261127-142037.dump.sha256`, `sha256sum -c` → **OK** |
| `pg_restore --list` | **Exit 0**, 53 `TABLE public`, 56 `TABLE DATA`, 105 `INDEX public` |

Credentials: ausschließlich zur Laufzeit aus `.env.vercel.production`, Übergabe an `pg_dump` über temporäre `PGPASSFILE` (0600, gelöscht) – keine URL in `argv`, Umgebung oder Logs.

---

## 3. Schritt 4–6: Verschlüsselte Zweitkopie und Gegentest

| Feld | Wert |
| --- | --- |
| Datei | `E:\webradio-backups-encrypted\webradio-production-backup-20261127-142037.dump.aes256gcm` |
| Verfahren | **AES-256-GCM** (256-Bit-Schlüssel, 96-Bit-IV, 128-Bit-Tag), Format `WRBK1` |
| Größe | **384.640 Bytes** (384.607 + 33 Byte Header) |
| **SHA-256 (verschlüsselt)** | **`8517a35584ba2248bc81bb135ec3e4d391237f04c47b9dbddc010108beda5885`** |
| Prüfsummendatei | `…aes256gcm.sha256`, `sha256sum -c` → **OK** |
| Schlüssel | **neues, eigenes Schlüsselmaterial** (nicht der Schlüssel vom 26.11.) |
| **Key ID** | **`e929b58d7bc0f30f`** (abgeleitet, kein Schlüsselbestandteil) |
| Schlüsselablage | `C:\Users\DFark\AppData\Local\webradio-backup-keys\webradio-backup-20261127-142037.key.dpapi` (262-Byte-**DPAPI-Blob**, Scope `CurrentUser`; kein Klartext, nicht im Repo, nicht im Backup-Verzeichnis) |
| Schlüsselübergabe | ausschließlich stdin-Pipeline; nie in `argv`, Env, Datei oder Log |
| Entschlüsselungs-Gegentest | temporäres Verzeichnis, `authenticated=true`, 384.607 Bytes, SHA-256 **`55e2deab…afe3e` = identisch mit dem Dump** ✅ |
| Temporäre Klartextdatei | mit Zufallsdaten überschrieben, gelöscht, Verzeichnis entfernt (Nachprüfung: nicht vorhanden) |
| Original nach allen Schritten | `sha256sum -c` → **OK** |

---

## 4. Schritt 7: Stand unmittelbar vor der Migration

| Prüfung | Ergebnis |
| --- | --- |
| Marker | `e54862c5d731bb20d89d75e46c4c0d41ab25a388639be96f2f02bcb0785ae1a6` |
| Ledger-Zeilen | 15 |
| `db:status` | Exit 0, **3 pending** (die drei freigegebenen Kanten) |
| Unerwartete Kanten | keine |

Der Stand entsprach exakt dem Preflight-Befund – Voraussetzung für die Ausführung erfüllt.

---

## 5. Schritt 8: Ausgeführte Migrationen

Ein Lauf, ohne `--to`, Befehl über den Helper (URL nicht in `argv`): `node .acceptance/run-prod-readonly.mjs db:migrate` → **Exit 0**.

| # | Migration | Kanten-Hash | Ops | Status |
| --- | --- | --- | --- | --- |
| 1 | `20261124T1823_i18n_content_translations` | `e54862c5` → `43914ff3` | 6 | ✅ angewendet |
| 2 | `20261124T1840_i18n_translation_engine` | `43914ff3` → `e8dc0773` | 19 | ✅ angewendet |
| 3 | `20261125T1957_add_custom_links` | `e8dc0773` → `763e3b57` | 10 | ✅ angewendet |

Reihenfolge exakt wie freigegeben; jede Kante hat eine eigene Ledger-Zeile. **Keine** weitere Migration wurde angewendet; der tote Zweig `20261031T1732_legal_documents` wurde nicht betreten (0 Ledger-Einträge mit Ziel `1a8b3a1`).

---

## 6. Schritt 9: `db:verify --strict`

```
✔ Database marker and schema match contract

storageHash:  763e3b57bc99fa207bbd840d3b44199daed778109dc6e7ae6ee2f2c103ff70d6
profileHash:  3916f444a8a17ad749191acf9e08dad97d1a327b88c2f1d45d12f240296aa8b2
```

**Exit 0** (vor der Migration: Exit 4 mit `CONTRACT.MARKER_MISMATCH` – wie erwartet).

---

## 7. Schritt 10: Schema, Ledger und Datenbestände

### 7.1 Schemaobjekte

| Objekt | Ergebnis |
| --- | --- |
| Tabellen | **59** (53 + 6 neue) |
| Indizes | **220** (192 + 28) |
| Constraints | **166** (154 + 12: 6 PK, 3 Unique, 2 Check, 1 FK) |
| Views | 2 (`pg_stat_statements`, `pg_stat_statements_info`) – unverändert |
| Extensions | `plpgsql 1.0`, `pg_stat_statements 1.11`, `prisma_postgres 0.4.0` – **unverändert** |

**Neue Tabellen, alle leer:** `ContentTranslation` 0, `TranslationJob` 0, `TranslationEvent` 0, `TranslationUsage` 0, `CustomLink` 0, `CustomLinkLabel` 0.

**Neue Spalte:** `User.locale` – `text`, nullable, **ohne Default**; `count(locale)` = 0 (beide Konten `NULL`, wie geplant).

**Schlüssel-Constraints geprüft:**

```
CustomLinkLabel_linkId_locale_key   UNIQUE ("linkId", locale)                    ✅
CustomLinkLabel_linkId_fkey         FOREIGN KEY ("linkId") REFERENCES
                                    "CustomLink"(id) ON DELETE CASCADE           ✅
CustomLink_position_check_d2c40e4f  CHECK ("position" = ANY (ARRAY['MAIN_NAVIGATION','FOOTER']))  ✅
CustomLink_type_check_14338608      CHECK (type = ANY (ARRAY['INTERNAL','EXTERNAL']))            ✅
```

### 7.2 Ledger

18 Zeilen, Head `20261125T1957_add_custom_links → 763e3b57…`, Kette lückenlos (`db:status` Exit 0, **0 pending**).

### 7.3 Datenbestände (Vergleich vor/nach, per `count(*)`)

Vergleich der vollständigen Zeilenzahlen aller Tabellen (`.acceptance/preflight-rowcounts-20261127.txt` vs. `.acceptance/phase2-rowcounts-after.txt`): **einzige Unterschiede** sind

- `prisma_contract.ledger` 15 → 18 und `prisma_contract.contract` 15 → 18 (Migrationsmetadaten),
- die 6 neuen Tabellen (jeweils 0 Zeilen).

Alle **53 bestehenden Tabellen sind zeilenzahl-identisch**, darunter:

| Objekt | vor | nach |
| --- | --- | --- |
| `User` (ADMIN, SYSTEM_ADMIN) | 2 | **2** |
| `Session` | 7 | **7** |
| `Plugin` / `Theme` | 1 / 1 | **1 / 1** |
| `LegalDocument` | 3 | **3** |
| `AuditLog` | 35 | **35** |
| `GitHubDownloadSnapshot` | 987 | **987** |
| `ContentTranslation` / `CustomLink` | – | **0 / 0** |

Damit sind keine Datensätze gelöscht oder verändert worden; die Migration war rein additiv wie angekündigt.

---

## 8. Schritt 11: Funktionsprüfung

### 8.1 Testsuite (ohne Datenbankzugriff)

```
npm test -- src/lib/translation src/app/api/__tests__/custom-links-routes.test.ts src/lib/__tests__/localization.test.ts
→ Test Suites: 5 passed, 5 total
→ Tests:       101 passed, 101 total
```

Abgedeckt: Übersetzungs-Engine (`engine.test.ts`), Provider (`providers.test.ts`), Quota (`quota.test.ts`), Lokalisierung/Feldauflösung (`localization.test.ts`), Custom-Link-API-Routen inkl. Validierung und Fehlercodes (`custom-links-routes.test.ts`).

### 8.2 Lesepfade gegen die migrierte Produktionsdatenbank (rein lesend)

Nachgebildet wurden die tatsächlichen Abfragen aus `src/lib/custom-links/service.ts`, `src/lib/locale-preference.ts` und der Übersetzungs-Engine:

| Prüfung | Ergebnis |
| --- | --- |
| Custom Links, öffentlich: `where position='MAIN_NAVIGATION' and isActive order by sortOrder` | ✅ Abfrage erfolgreich, 0 Zeilen (noch keine Links angelegt) |
| Custom Links, öffentlich: Join `CustomLinkLabel` auf `locale in ('de','en')` | ✅ erfolgreich, 0 Zeilen |
| Custom Links, Admin: alle Links sortiert | ✅ 0 Zeilen |
| Übersetzungs-Engine: `TranslationJob` gruppiert nach Status | ✅ 0 Zeilen (keine Jobs) |
| `ContentTranslation` gruppiert nach Status | ✅ 0 Zeilen |
| `TranslationUsage` / `TranslationEvent` / offene Jobs | ✅ 0 / 0 / 0 |
| Sprachumschaltung: `User.locale` lesbar, Rollen unverändert | ✅ 2 Konten, 0 mit Locale, `ADMIN,SYSTEM_ADMIN` |
| Unique-Index `TranslationJob_jobKey_key` vorhanden | ✅ |

Alle Spalten, Joins und Indizes, die die drei Features benötigen, antworten auf dem migrierten Schema fehlerfrei.

### 8.3 Was **nicht** geprüft wurde (und warum)

| Nicht durchgeführt | Grund |
| --- | --- |
| Schreibende Funktionstests gegen Produktion (Custom Link anlegen/ändern/deaktivieren, Sprache speichern, Übersetzungsjob starten) | hätte produktive Datensätze erzeugt bzw. verändert – durch die Freigabe ausdrücklich ausgeschlossen |
| Integrationstests auf einer isolierten Kopie des migrierten Stands | Der lokale PostgreSQL-18-Testcluster fiel mit einem **Windows-Umgebungsfehler** aus (`autovacuum worker … terminated by exception 0xC0000142`, danach `could not reserve shared memory region … error code 487`); auch nach Neustart nahm er keine Verbindungen an. Betrifft ausschließlich die lokale Testinfrastruktur, nicht Produktion. Cluster sauber gestoppt (`pg_ctl stop -m immediate`, kein Listener auf 5436). |
| HTTP-Prüfung der Live-Website | `https://webradio-website.vercel.app/…` liefert `DEPLOYMENT_NOT_FOUND` – unter diesem Alias ist derzeit keine Deployment erreichbar. Deployment ist nicht Teil der Freigabe. |

Als Ersatz dienen die 101 grünen Unit-/Routentests (8.1), die Lesepfad-Prüfungen gegen das echte migrierte Schema (8.2) und die bereits vor der Freigabe auf isolierten Datenbanken durchgeführten Integrationstests auf identisch migriertem Schema (`custom-links.integration.test.ts`, `public-delivery.integration.test.ts`: 2 Suites, 27 Tests grün – dokumentiert in `docs/PRODUCTION_MIGRATION_PLAN.md`, Abschnitt 6.4).

**Empfehlung:** Die schreibenden Funktionstests (Link anlegen, Sprache umstellen, Übersetzungsjob) nach der nächsten Deployment-Freigabe im Preview gegen eine kopierte Datenbank nachholen, sobald die lokale Testinstanz wieder läuft.

---

## 9. Schritt 12: Sicherungen nach der Migration

| Datei | Größe | SHA-256 | Zweck |
| --- | --- | --- | --- |
| `webradio-production-backup-20261127-142037.dump` | 384.607 B | `55e2deab…afe3e` | **Pre-Migration-Backup** (Rollback-Punkt) |
| `…-20261127-142037.dump.aes256gcm` (E:) | 384.640 B | `8517a355…5885` | verschlüsselte Zweitkopie, Key ID `e929b58d7bc0f30f` |
| `webradio-production-backup-postmigration-20261127-142037.dump` | 459.928 B | `6f390829c78077cd98f3f28052514e88d46bb717b07513c74f03788ca4e433e3` | **Post-Migration-Stand** (neuer Referenzpunkt) |
| `webradio-production-backup-20261126-195635.dump` (+ `.aes256gcm`) | 379.888 B / 379.921 B | `dd6b7ad0…fdca` / `b530406c…aec1` | älterer Stand, **unverändert aufbewahrt** |

Keine Datei gelöscht, keine Rotation eingerichtet. Der Post-Migration-Dump diente als Grundlage für den (fehlgeschlagenen) Restore-Versuch auf dem lokalen Testcluster.

---

## 10. Abweichungen und Grenzen

| # | Punkt | Bewertung |
| --- | --- | --- |
| 1 | Lokale PG-18-Testinstanz nicht lauffähig (Windows `0xC0000142` / Shared-Memory-Fehler 487) | ⚠️ betrifft nur die lokale Testinfrastruktur; Migration und Produktion nicht betroffen; dokumentiert |
| 2 | Keine erreichbare Deployment unter `webradio-website.vercel.app` (`DEPLOYMENT_NOT_FOUND`) | ⚠️ HTTP-Funktionsprüfung nicht möglich; Deployment außerhalb der Freigabe |
| 3 | Schreibende Funktionstests nicht gegen Produktion ausgeführt | ✅ bewusst – Datenschutz durch Freigabeumfang |
| 4 | Verschlüsselungsschlüssel weiterhin rechnergebunden (DPAPI), externe Verwahrung offen | ⚠️ unverändert aus `docs/PRODUCTION_BACKUP_ENCRYPTION_REPORT.md`; Schlüssel `e929b58d7bc0f30f` ebenfalls extern zu sichern |
| 5 | Migrationsdateien uncommittet | ⚠️ Reproduzierbarkeit nur mit diesem Arbeitsbaum; Commit separat freizugeben |
| 6 | Kein Down-Pfad | ✅ Rollback = Restore des Pre-Migration-Dumps |

---

## 11. Bewertung

> ## MIGRATION COMPLETED – VERIFIED

**Erreicht:**

- Genau die drei freigegebenen Migrationen angewendet, in der geprüften Reihenfolge, 35 Operationen, Exit 0.
- Zielzustand vollständig erreicht: Marker `763e3b57…`, Ledger 18, 59 Tabellen, 220 Indizes, 166 Constraints, 0 pending.
- `db:verify --strict` Exit 0 (`storageHash 763e3b57…`, `profileHash` unverändert).
- Keine Datenverluste: alle 53 bestehenden Tabellen zeilenzahl-identisch, 6 neue Tabellen leer, `User.locale` für beide Konten `NULL`.
- Frisches Pre-Migration-Backup mit Prüfsumme und `pg_restore --list`, verschlüsselte Zweitkopie mit eigenem Schlüssel und bestandenem Entschlüsselungs-Gegentest, zusätzlich Post-Migration-Referenzdump.

**Offen (nicht migrationskritisch):** externe Schlüsselverwahrung, schreibende Funktionstests im Preview nach Deployment, Commit der Migrationsdateien, lauffähige lokale Testinstanz.

**Unverändert gesperrt:** Deployment, Commit, Push, Backup-Löschung/-Rotation, jede weitere Migration.

---

## Anhang: Nachweisdateien

| Datei | Inhalt |
| --- | --- |
| `.acceptance/phase2-status-before.log` / `-after.log` | `db:status` vor/nach (Exit 0, 3 → 0 pending) |
| `.acceptance/phase2-migrate.log` | vollständige Migrationsausgabe (3 Kanten, 35 Ops) |
| `.acceptance/phase2-verify.log`, `phase2-verify-final.log` | `db:verify --strict`, Exit 0 |
| `.acceptance/phase2-backup-list.txt` | `pg_restore --list` des Pre-Migration-Dumps |
| `.acceptance/preflight-rowcounts-20261127.txt`, `phase2-rowcounts-after.txt` | Zeilenzahlen vor/nach |
| `.acceptance/phase2-restore.log` | fehlgeschlagener Restore-Versuch auf dem lokalen Cluster (0 Fehlerzeilen erreicht, Server brach vorher ab) |
| `.acceptance/pg5436-phase2.log` | Ursache des Testcluster-Ausfalls (`0xC0000142`, `error code 487`) |
