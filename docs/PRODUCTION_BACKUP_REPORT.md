# Produktions-Backup: Erstellung und Verifikation

**Datum:** 2026-11-26
**Repository:** YourEliteSystems/WebRadio-Website
**Datenbank:** Prisma Postgres, `db.prisma.io`, Datenbank `postgres` (Zugriff über `DIRECT_URL`)
**Art der Aufgabe:** Backup erstellen und Wiederherstellbarkeit prüfen – **ausschließlich lesend** gegenüber Produktion
**Ergebnis:** **BACKUP VERIFIED** – vollständiges logisches Backup erstellt und in einer isolierten PostgreSQL-18-Instanz vollständig wiederhergestellt (ein Plattform-Objekt ausgenommen, siehe 6.1).

> Es wurde **keine** Migration ausgeführt, kein Datensatz und keine Tabelle verändert, keine Umgebungsvariable und keine Datenbankkonfiguration geändert, nichts committet, gepusht, deployt oder zurückgerollt und kein vorhandenes Backup gelöscht. Der Zugriff auf Produktion bestand ausschließlich aus `SELECT`-Abfragen, `db:status` und einem lesenden `pg_dump`.

---

## 0. Schutz der Zugangsdaten und Ablage

| Aspekt | Umsetzung |
| --- | --- |
| Quelle der Zugangsdaten | `.env.vercel.production` → `DIRECT_URL` (gitignoriert über `.env*`) |
| Übergabe an `pg_dump` | über `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGSSLMODE` und eine temporäre `PGPASSFILE`-Datei (Modus 0600, nach dem Lauf gelöscht) |
| Connection-String in Kommandozeile | **nein** – die URL erscheint in keinem Argument |
| Connection-String in Logs/Bericht | **nein** – nur Hostname, Datenbankname und Rolle wurden zur Identifikation genannt |
| Hilfsskripte | `.acceptance/prod-backup.mjs`, `.acceptance/prod-table-counts.mjs`, `.acceptance/prod-sql.mjs` – ungetrackt, lesen die URL zur Laufzeit und geben sie nie aus |
| Ablage des Backups | `F:\Dev\webradio-backups\` – **außerhalb** des Git-Repositories, nicht versioniert |
| Zugriffsrechte | Vererbung entfernt; nur `DFark`, `Administratoren`, `SYSTEM` mit Vollzugriff (`icacls /inheritance:r`) |
| Übertragung an Dritte | keine |

---

## 1. Plattform-Backup-Status (Prisma Postgres)

| Prüfung | Ergebnis |
| --- | --- |
| Prisma CLI angemeldet | ❌ `npx prisma auth whoami` → `status: signed out` |
| Backup-Liste abrufbar | ❌ `npx prisma postgres backup list postgres` → `✘ [CLI.CREDENTIALS_REQUIRED] You must be signed in to run this command.` |
| Backup-Modell der Plattform | ✅ laut `prisma postgres backup --help`: „The platform takes backups automatically; there is no backup-create command.“ Verfügbar sind nur `backup list <database>` und `backup restore <database>` |
| Datum/Uhrzeit des letzten Plattform-Backups | ❌ **nicht ermittelbar** (CLI nicht angemeldet) |
| Backup-Typ und Umfang | ❌ nicht ermittelbar; laut CLI-Doku plattformseitig automatisch, Umfang nicht dokumentiert |
| Aufbewahrungsdauer | ❌ nicht ermittelbar |
| Wiederherstellungsoption | `prisma postgres backup restore <database>` – **ersetzt den aktuellen Zustand der Datenbank** nach exakter ID-Bestätigung |
| Restore ohne Eingriff in Produktion testbar? | ❌ **nein** – der Plattform-Restore schreibt zwangsläufig in die Zieldatenbank. Ein Test hätte die Produktion überschrieben und war damit in diesem Auftrag unzulässig |

**Erforderliche Authentifizierung (nicht durchgeführt):** `npx prisma auth login` mit dem Konto, dem das Prisma-Postgres-Projekt gehört. Danach:

```
npx prisma postgres backup list postgres
```

Damit wären Zeitstempel, Typ und Aufbewahrung abrufbar. Es wurden **keine** Zugangsdaten geraten, erfunden oder ausgegeben und **kein** interaktiver Fremd-Login durchgeführt.

---

## 2. Eigenes unabhängiges Backup

| Feld | Wert |
| --- | --- |
| **Dateiname** | `webradio-production-backup-20261126-195635.dump` |
| **Pfad** | `F:\Dev\webradio-backups\webradio-production-backup-20261126-195635.dump` |
| **Zeitpunkt (Start)** | 2026-11-26 19:56:35 CET (18:56:35 UTC) |
| **Dauer** | 15,1 s, Exit-Code 0 |
| **Werkzeug** | `pg_dump` (PostgreSQL) 18.4, Client gegen Server PostgreSQL **17.2** (Prisma Postgres) |
| **Format** | Custom (`--format=custom`, gzip-komprimiert, Dump-Version 1.16-0) |
| **Inhalt** | vollständiges Schema **und** Daten (`--schema-only` wurde nicht verwendet) |
| **Schemas** | `public` und `prisma_contract` (Migrations-Ledger und -Marker) |
| **Konsistenz** | `pg_dump` arbeitet in einem wiederholbaren Snapshot; parallele Schreiber würden den Dump nicht verfälschen |

Das Backup enthält personenbezogene Daten (u. a. Benutzer-E-Mails, Session-Hashes, Audit-Log) und ist entsprechend geschützt abgelegt. Es wurde weder in das Repository kopiert noch an einen öffentlichen Dienst übertragen.

---

## 3. Backup-Größe

```
379.888 Bytes (≈ 371 KiB)
```

Zum Vergleich: 53 Anwendungstabellen, 15 Ledger-Zeilen und 846 Zeilen in der datenreichsten Tabelle (`GitHubDownloadSnapshot`).

---

## 4. SHA-256-Prüfsumme

```
dd6b7ad02ca69fd5bd2e7b44878541e6c4f8d9896520a82b68ade23f8be8fdca
```

Die Prüfsumme liegt neben dem Backup in `webradio-production-backup-20261126-195635.dump.sha256` und wurde nach der Rechteänderung erneut geprüft:

```
sha256sum -c webradio-production-backup-20261126-195635.dump.sha256
→ webradio-production-backup-20261126-195635.dump: OK
```

---

## 5. Ergebnis von `pg_restore --list`

Exit-Code **0**, keine Fehlerausgabe. Der Report wurde vollständig nach `.acceptance/prod-backup-restore-list.txt` geschrieben.

| Kennzahl | Wert |
| --- | --- |
| TOC-Einträge (laut Kopfsatz) | 351 |
| Zeilen im Report | 361 |
| `TABLE public …` | 53 |
| `TABLE DATA …` | 56 (53 × `public` + 3 × `prisma_contract`) |
| `INDEX public …` | 105 (hinzu kommen 87 Index-Objekte aus PK/UNIQUE-Constraints) |
| `CONSTRAINT public …` | 117 (plus 37 eigenständige `CHECK`-Einträge im Schema) |
| `SEQUENCE SET` | 1 (`prisma_contract.ledger_id_seq`) |
| Schemas | `public`, `prisma_contract` |
| Extensions | `prisma_postgres`, `pg_stat_statements` |
| Kopfsatz | `Archive created at 2026-11-26 19:56:35`, `dbname: postgres`, `Format: CUSTOM`, `Compression: gzip` |

Damit enthält das Archiv sowohl Schemadefinitionen als auch **für jede Tabelle einen `TABLE DATA`-Eintrag** – es ist kein reiner Schema-Dump.

---

## 6. Isolierter Restore-Test

### 6.1 Durchführung

| Schritt | Detail |
| --- | --- |
| Zielumgebung | frisch initialisierter Cluster PostgreSQL **18.4** (`initdb`, `-A trust`, UTF-8), `listen_addresses=127.0.0.1`, Port **5436**, Datenverzeichnis `.acceptance/pgdata-restore` |
| Zieldatenbank | `webradio_prod_restore_test` (neu erstellt, leer) |
| Befehl | `pg_restore --no-owner --no-privileges -h 127.0.0.1 -p 5436 -U postgres -d webradio_prod_restore_test <dump>` |
| Exit-Code | **1** |
| Fehler | **2**, beide ausschließlich zur Plattform-Extension `prisma_postgres`: `CREATE EXTENSION … is not available` und das folgende `COMMENT ON EXTENSION … does not exist` |
| Alle übrigen Objekte | ohne Fehler und ohne Warnungen wiederhergestellt (Log: `.acceptance/prod-restore.log`) |
| Produktion berührt? | **nein** – der Restore lief ausschließlich gegen `127.0.0.1:5436` |

`prisma_postgres` ist eine von Prisma Postgres bereitgestellte Server-Extension (Version 0.4.0), die auf einer lokalen PostgreSQL-Installation nicht existiert. Sie enthält keine Anwendungsdaten; das Objekt selbst ist im Dump enthalten (`CREATE EXTENSION IF NOT EXISTS prisma_postgres WITH SCHEMA public`) und wird auf der Plattform beim Restore angelegt.

### 6.2 Objekt- und Datenvergleich Produktion ↔ wiederhergestellte Kopie

| Prüfung | Produktion | Restore | Bewertung |
| --- | --- | --- | --- |
| Tabellen (`public`) | 53 | 53 | ✅ identisch |
| Indizes (`public`, `pg_indexes`) | 192 | 192 | ✅ identisch |
| Constraints (`public`, ohne PG18-interne NOT-NULL-Einträge) | 154 | 154 | ✅ identisch |
| Indexdefinitionen (`public` + `prisma_contract`) | 195 | 195 | ✅ **zeilenweise identisch** (`diff` leer) |
| Spaltendefinitionen Anwendung (Name, Position, Typ, Länge, NULL-Zulässigkeit, Default) | 474 | 474 | ✅ **zeilenweise identisch** (`diff` leer) |
| Zeilenzahl **aller** 56 Tabellen | 56 Werte | 56 Werte | ✅ **alle identisch** (`diff` leer) |
| Migrationsmarker | `e54862c5…` (`profile 3916f444…`) | `e54862c5…` (`profile 3916f444…`) | ✅ identisch |
| Ledger-Zeilen | 15 | 15 | ✅ identisch |
| Ledger-Head | `20261122T2030_advertising_partner_portal → e54862c5…` | derselbe | ✅ identisch |
| Benutzer | 2 (`ADMIN`=1, `SYSTEM_ADMIN`=1) | 2, gleiche Rollen | ✅ identisch |
| `Session` / `Plugin` / `LegalDocument` | 7 / 1 / 3 | 7 / 1 / 3 | ✅ identisch |
| `AuditLog` / `GitHubDownloadSnapshot` | 35 / 846 | 35 / 846 | ✅ identisch |

Einzige Differenz im Schemavergleich: die System-View `pg_stat_statements` (Extension-Version 1.11 auf Produktion, 1.12 lokal) hat in PostgreSQL 18 zwei zusätzliche Statistikspalten. Das ist eine Extension-Versionseigenschaft des lokalen Clusters, **kein** Anwendungsobjekt und nicht Teil des Datenbestands.

Die wiederhergestellte Datenbank wurde nach der Prüfung nicht gelöscht; der Testcluster wurde sauber gestoppt (`pg_ctl stop -m fast`, kein Listener mehr auf 5436) und lässt sich mit `pg_ctl -D .acceptance/pgdata-restore -o "-p 5436 -c listen_addresses=127.0.0.1" start` erneut starten.

---

## 7. Nachkontrolle der Produktionsdatenbank

Unmittelbar nach der Backup-Erstellung erneut rein lesend geprüft (Snapshot: `.acceptance/prod-postcheck-snapshot.txt`):

| Kennzahl | Ausgangszustand | Nach Backup | Bewertung |
| --- | --- | --- | --- |
| Migrationsmarker | `e54862c5d731bb20d89d75e46c4c0d41ab25a388639be96f2f02bcb0785ae1a6` | identisch | ✅ unverändert |
| `profile_hash` | `3916f444…` | identisch | ✅ unverändert |
| Ledger-Zeilen | 15 | 15 | ✅ unverändert |
| Ledger-Head | `20261122T2030_advertising_partner_portal → e54862c5…` | identisch | ✅ unverändert |
| Tabellen | 53 | 53 | ✅ unverändert |
| Indizes | 192 | 192 | ✅ unverändert |
| Constraints | 154 | 154 | ✅ unverändert |
| Benutzer / Sessions | 2 / 7 | 2 / 7 | ✅ unverändert |
| Extensions | `plpgsql`, `pg_stat_statements`, `prisma_postgres` | identisch | ✅ unverändert |
| `npm run db:status` | Exit 0, 15 angewendet / 3 ausstehend | Exit 0, unverändert | ✅ unverändert |
| Ausstehende Kanten | `i18n_content_translations`, `i18n_translation_engine`, `add_custom_links` | unverändert ausstehend | ✅ keine Migration erfolgt |

Die Produktionsdatenbank ist damit nachweislich im selben Zustand wie vor der Aufgabe. Es wurde kein `db:migrate` ausgeführt.

---

## 8. Offene Probleme und Einschränkungen

| # | Einschränkung | Auswirkung |
| --- | --- | --- |
| 1 | **Prisma CLI nicht angemeldet** (`signed out`) | Zeitstempel, Typ, Umfang und Aufbewahrung der Plattform-Backups sind **nicht** dokumentiert. Abhilfe: `npx prisma auth login`, danach `npx prisma postgres backup list postgres`. |
| 2 | **Plattform-Restore nicht getestet** | `prisma postgres backup restore` ersetzt den Produktionszustand und war hier unzulässig. Ob die Plattform-Backups tatsächlich zurückspielbar sind, ist damit **unbewiesen** – belegt ist nur das eigene logische Backup. |
| 3 | **`prisma_postgres`-Extension lokal nicht verfügbar** | Der Restore meldete genau 2 Fehler, beide zu dieser Plattform-Extension. Anwendungsschema und alle Daten wurden vollständig und verifiziert wiederhergestellt. |
| 4 | **Versionssprung beim Restore-Test** | Produktion läuft PostgreSQL **17.2**, der Testcluster **18.4**. Der Restore-Test beweist Lesbarkeit und Vollständigkeit, nicht das Verhalten eines Restores auf einem PG-17-Server. Für einen echten Restore genügt der `pg_restore`-Client 18 gegen Server 17. |
| 5 | **Keine Zweitkopie / kein Offsite-Backup** | Das Backup liegt ausschließlich auf demselben Rechner (`F:\Dev\webradio-backups\`). Ein Hardware- oder Dateisystemausfall würde Produktion und Backup gemeinsam treffen. |
| 6 | **Aufbewahrung nicht formalisiert** | Empfehlung: mindestens 7 Tage nach Abnahme aufbewahren, danach erst nach erfolgreicher Migration und Verifikation löschen. Ein Aufbewahrungsplan ist nicht eingerichtet. |
| 7 | **Backup nicht verschlüsselt** | Der Dump ist gzip-komprimiert, aber nicht verschlüsselt; Schutz beruht auf Verzeichnisrechten (`icacls`, nur `DFark`/`Administratoren`/`SYSTEM`). Für eine Auslagerung wäre eine Verschlüsselung (z. B. `age`/GPG) erforderlich. |
| 8 | **Restore-Befehl für den Ernstfall nicht geprobt** | Ein echtes Zurückspielen würde `pg_restore --clean --if-exists --no-owner --no-privileges -d "$DIRECT_URL" <dump>` bedeuten und den aktuellen Produktionsstand ersetzen. Das ist bewusst **nicht** Teil dieser Aufgabe. |
| 9 | **Migrationsdateien weiterhin uncommittet** | Unverändert gegenüber der Vorprüfung; für die Migration gilt weiterhin, dass nur genau dieser Arbeitsbaum den Lauf reproduziert. |

---

## Bewertung

> ## BACKUP VERIFIED

**Begründung:** Das Backup wurde vollständig erstellt (Custom-Format, Schema und Daten, Exit 0, 379.888 Bytes, SHA-256 dokumentiert) und in einer isolierten PostgreSQL-18-Datenbank erfolgreich eingespielt. Die Wiederherstellung wurde nicht nur „ohne Abbruch“ bewertet, sondern objektweise gegen Produktion geprüft:

- 53/53 Tabellen, 192/192 Indizes, 154/154 Constraints,
- 474/474 Spaltendefinitionen und 195/195 Indexdefinitionen zeilenweise identisch,
- alle 56 Tabellen mit exakt identischen Zeilenzahlen,
- Migrationsmarker `e54862c5…` und Ledger (15 Zeilen, gleicher Head) identisch.

Die einzigen Abweichungen betreffen die plattformspezifische Extension `prisma_postgres` (lokal nicht installierbar) und die Version der System-Extension `pg_stat_statements` – beides keine Anwendungsdaten und kein Anwendungsschema.

**Einschränkung der Bewertung:** Die **Plattform-Backups** von Prisma Postgres sind weiterhin **unbewertet** (CLI nicht angemeldet, Restore nicht testbar ohne Eingriff in Produktion). „BACKUP VERIFIED“ bezieht sich ausschließlich auf das hier erstellte, unabhängige logische Backup.

**Unverändert gesperrt:** `db:migrate`, jede Schreiboperation auf produktiven Tabellen, Änderungen an Vercel-Umgebungsvariablen, Datenbankkonfiguration, Commit, Push, Deployment, Rollback sowie das Löschen vorhandener Backups. Aus diesem Bericht folgt **keine** Migrationsfreigabe; die endgültige Produktionsfreigabe bleibt ausschließlich beim Betreiber.

---

## Anhang: Reproduktion

```
# Verbindungstest (gibt keine Zugangsdaten aus)
node .acceptance/prod-backup.mjs --check

# Vollständiges Backup (Custom-Format) außerhalb des Repositories
node .acceptance/prod-backup.mjs "F:\Dev\webradio-backups\webradio-production-backup-<stamp>.dump"

# Integrität und Inhalt
sha256sum -c webradio-production-backup-<stamp>.dump.sha256
pg_restore --list webradio-production-backup-<stamp>.dump

# Isolierter Restore (niemals gegen DIRECT_URL)
initdb -D .acceptance/pgdata-restore -U postgres -A trust -E UTF8 --no-locale
pg_ctl -D .acceptance/pgdata-restore -o "-p 5436 -c listen_addresses=127.0.0.1" -l .acceptance/pg5436.log start
createdb -h 127.0.0.1 -p 5436 -U postgres webradio_prod_restore_test
pg_restore --no-owner --no-privileges -h 127.0.0.1 -p 5436 -U postgres \
  -d webradio_prod_restore_test webradio-production-backup-<stamp>.dump

# Vergleich mit Produktion
node .acceptance/prod-table-counts.mjs > .acceptance/prod-rowcounts.txt
```
