# WebRadio Website – Disaster Recovery Guide

Anleitung zur Sicherung und Wiederherstellung des selbst gehosteten Betriebs.
Gilt für beide Betriebsformen (nativ und Docker Compose). Ergebnisse der
INFRA-1.5-Prüfung: siehe Abschnitt 9 und
[`PHASE_INFRA1.5_PRODUCTION_DEPLOYMENT_PREPARATION_REPORT.md`](./PHASE_INFRA1.5_PRODUCTION_DEPLOYMENT_PREPARATION_REPORT.md);
Vorstufe: [`PHASE_INFRA1.4_PRODUCTION_READINESS_REPORT.md`](./PHASE_INFRA1.4_PRODUCTION_READINESS_REPORT.md).

## 1. Ziele

| Kennzahl | Zielwert | Begründung |
|---|---|---|
| **RPO** (max. Datenverlust) | 24 h (täglich 02:15) | täglicher `pg_dump`; keine WAL-Archivierung |
| **RTO** (Wiederherstellungszeit) | 30–60 min | Restore 250-KB-Dump in <1 min, Neuaufbau Host/Images dominiert |
| Aufbewahrung | 14 Backups (14 Tage) | `BACKUP_KEEP`, Rotation nach Anzahl |
| Drill | wöchentlich (So 05:30) | automatischer Restore in eine Wegwerf-Datenbank |

Eine feinere RPO (z. B. 15 min) würde WAL-Archivierung und ein
Continuity-Werkzeug erfordern; das ist für die aktuelle Datenmenge und das
Budget nicht verhältnismäßig und bleibt bewusst außerhalb des Umfangs.

## 2. Was gesichert werden muss

| Bestandteil | Enthalten in | Sicherung |
|---|---|---|
| Datenbank (44 Tabellen, Marker, Migrationen) | PostgreSQL | `pg_dump -Fc`, verschlüsselt, täglich |
| Deployment-Konfiguration (Compose, Caddyfiles, Units, Skripte, Docs) | Repository + `/etc` | `config-backup.sh`: verschlüsseltes tar.gz, täglich, secret-frei |
| Anwendungs-Secrets (`NEXTAUTH_SECRET`, `CRON_SECRET`, DB-Passwort) | `deploy/env.production` bzw. `/etc/webradio/app.env` | **separat** im Passwortmanager; nie im Backup-Archiv |
| Backup-Schlüssel | `/etc/webradio/backup.key` (0600) | Kopie im Passwortmanager/Offline-Safe – **ohne Schlüssel kein Restore** |
| Caddy-Konfiguration | `deploy/caddy/Caddyfile.native` bzw. `deploy/Caddyfile` | Repository + `/etc/caddy/` |
| Caddy-Zertifikate/-Daten | `/var/lib/caddy`, Compose-Volume `caddy-data` | nur für nahtlosen Umzug nötig; ACME stellt neu aus |
| systemd-Units/Timer | `deploy/systemd/*` | Repository |
| Anwendung | Git-Commit + Image `webradio-website:<tag>` | Repository/Registry; Image jederzeit reproduzierbar |
| Uploads / Dateispeicher | – | Die Anwendung speichert keine Nutzeruploads; nur DB und Logs |
| Logs | `/var/log/webradio`, Journal, Docker-JSON-Logs | nicht Teil des Restores (Diagnose, kein Bestand) |

Secrets gehören **nicht** in das Backup-Verzeichnis. Das Skript verweigert den
Lauf, wenn der Schlüssel fehlt, und legt niemals Klartextdumps ab.
`config-backup.sh` prüft das fertige Archiv zusätzlich auf `.env`, `.key`,
`.pem` und `secret` und bricht bei einem Treffer ab.

### Offsite-Kopie

`offsite-sync.sh` überträgt ausschließlich verschlüsselte Archive und
Prüfsummen an ein zweites Ziel:

```bash
# /etc/webradio/offsite.env (0600)
OFFSITE_TARGET=/mnt/offsite/webradio     # lokale zweite Disk/NAS/Simulation
OFFSITE_MODE=auto                        # auto|local|rsync
OFFSITE_KEEP=7
# OFFSITE_SSH_KEY=/root/.ssh/webradio_offsite   # für rsync-Modus
```

```bash
sudo bash deploy/backup/offsite-sync.sh --dry-run
sudo bash deploy/backup/offsite-sync.sh
```

Der Lauf prüft jede SHA-256-Datei am Ziel, rotiert nur dort und löscht nie
lokal. `rsync`-Mode (`user@host:/path`) verifiziert die Prüfsummen per SSH;
er wurde in INFRA 1.5 implementiert, aber ohne Remote-Host **nicht
ausgeführt**. S3/Restic/Rclone sind als Alternativen dokumentiert, aber ohne
externe Konten bewusst nicht eingerichtet.

## 3. Backup-Mechanik

`deploy/backup/pg-backup.sh` (installiert als `/usr/local/sbin/webradio-backup`):

1. `pg_dump -Fc` – nativ gegen den Host-Cluster, im Docker-Modus per
   `docker compose exec postgres` (kein Host-Superuser nötig).
2. Integritätsprüfung mit `pg_restore -l` **vor** dem Verschlüsseln.
3. AES-256-CBC mit `-pbkdf2` und 0600-Schlüsseldatei; der Klartext-Dump wird
   sofort gelöscht.
4. `sha256`-Datei neben jedem Archiv, Modus 0600.
5. Rotation: die neuesten `BACKUP_KEEP` (Standard 14) bleiben erhalten.
6. Eine Zeile pro Lauf in `backup.log` (Zeit, Datei, Bytes, SHA-256, Rotation) –
   ohne Secrets oder Verbindungs-URLs.
7. Exit != 0 bei jedem Fehler → systemd `OnFailure` alarmiert.
8. `config-backup.sh` legt danach ein zweites, ebenfalls verschlüsseltes
   Archiv `webradio-config-<stamp>.tar.gz.enc` an (gleicher Schlüssel,
   gleiche Rotation). `webradio-backup.service` führt beide Schritte aus.

```bash
# manuell, native Form
sudo BACKUP_MODE=native BACKUP_DIR=/var/backups/webradio \
  BACKUP_KEY_FILE=/etc/webradio/backup.key \
  PGHOST=127.0.0.1 PGUSER=webradio_backup PGDATABASE=webradio \
  PGPASSWORD="$(sudo cat /etc/webradio/backup.env | sed -n 's/^PGPASSWORD=//p')" \
  bash deploy/backup/pg-backup.sh

# manuell, Docker-Form
sudo BACKUP_MODE=docker BACKUP_DIR=/var/backups/webradio \
  BACKUP_KEY_FILE=/etc/webradio/backup.key \
  COMPOSE_FILE=/opt/webradio/compose.yaml \
  COMPOSE_ENV_FILE=/opt/webradio/deploy/env.production \
  PGUSER=webradio PGDATABASE=webradio PGPASSWORD="$DB_PASSWORD" \
  bash deploy/backup/pg-backup.sh
```

Konfiguration: `/etc/webradio/backup.env` (0600, Vorlage
`deploy/backup/backup.env.example`). Schlüssel erzeugen:

```bash
sudo install -d -m 0700 /etc/webradio
openssl rand -base64 32 | tr -d '\n' | sudo tee /etc/webradio/backup.key >/dev/null
sudo chmod 600 /etc/webradio/backup.key
```

**Schlüsselverwahrung:** zwei Kopien außerhalb des Servers (Passwortmanager und
Offline-Safe). Ein verlorener Schlüssel macht alle vorhandenen Backups
unbrauchbar; ein zusammen mit den Backups gelagerter Schlüssel entwertet die
Verschlüsselung.

### Zeitplan (systemd-Timer)

| Timer | Zeit | Unit |
|---|---|---|
| `webradio-backup.timer` | täglich 02:15 ± 5 min (`Persistent=true`) | `webradio-backup.service` |
| `webradio-restore-drill.timer` | sonntags 05:30 | `webradio-restore-drill.service` |
| `webradio-health.timer` | alle 5 min | `webradio-health.service` |

`Persistent=true` holt verpasste Läufe nach einem Neustart nach. Alle Units
haben `OnFailure=webradio-alert@%n.service`; der Alarm läuft über
`deploy/monitoring/alert.sh` (Journal + optional Webhook).

## 4. Integrität und Überwachung

* Jeder Lauf prüft den Dump mit `pg_restore -l` (Struktur lesbar).
* `health-report.sh` prüft Alter und Vorhandensein des neuesten Backups
  (`BACKUP_MAX_AGE_HOURS=26`), verifiziert dessen **SHA-256** und meldet
  `FAIL`, wenn kein Archiv, ein zu altes oder ein beschädigtes vorliegt.
  Das Konfigurationsarchiv wird separat auf Alter geprüft
  (`CONFIG_BACKUP_MAX_AGE_HOURS=48`).
* Der wöchentliche Drill beweist zusätzlich die **Wiederherstellbarkeit**, nicht
  nur die Lesbarkeit.
* `offsite-sync.sh` prüft die Kopien am Ziel; eine manipulierte Zieldatei wird
  beim nächsten Lauf ersetzt und erneut verifiziert.
* `backup.log` und `health.jsonl` wachsen langsam; Rotation über `logrotate`
  oder Größenprüfung im Monitoring.

## 5. Restore-Verfahren

### 5.1 Einzelne Datenbank (Docker-Form, empfohlen)

```bash
cd /opt/webradio
set -a; . deploy/env.production; set +a

# 1. Neuestes Backup entschlüsseln (temporär, 0600, danach löschen)
F=$(ls -1t /var/backups/webradio/webradio-*.dump.enc | head -n 1)
openssl enc -d -aes-256-cbc -pbkdf2 -in "$F" -out /tmp/restore.dump \
  -pass file:/etc/webradio/backup.key
chmod 600 /tmp/restore.dump

# 2. Leere Zieldatenbank anlegen
docker compose --env-file deploy/env.production exec -T postgres \
  createdb -U "$POSTGRES_USER" webradio_restore

# 3. Einspielen (ohne Owner/Privilegien, damit die Rollen frei wählbar bleiben)
docker compose --env-file deploy/env.production exec -T postgres \
  pg_restore --no-owner --no-privileges -U "$POSTGRES_USER" -d webradio_restore < /tmp/restore.dump
rm -f /tmp/restore.dump

# 4. Marker/Schema prüfen
docker compose --env-file deploy/env.production run --rm -T \
  -e DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@postgres:5432/webradio_restore" \
  tools node scripts/prisma-db.mts db verify --strict

# 5. Umschalten (Wartungsfenster): Anwendung stoppen, DB umbenennen
docker compose --env-file deploy/env.production stop webradio
docker compose --env-file deploy/env.production exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
  -c 'ALTER DATABASE webradio RENAME TO webradio_before_restore;'
docker compose --env-file deploy/env.production exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
  -c 'ALTER DATABASE webradio_restore RENAME TO webradio;'
docker compose --env-file deploy/env.production start webradio
```

Statt Umbenennen kann auch die alte DB gelöscht und neu angelegt werden; die
Umbenennung ist reversibel und deshalb vorzuziehen. Nach erfolgreicher Prüfung
`webradio_before_restore` löschen.

### 5.2 Native Form

```bash
sudo systemctl stop webradio
sudo -u postgres createdb webradio_restore
sudo -u postgres pg_restore --no-owner --no-privileges -d webradio_restore /tmp/restore.dump
DATABASE_PROVIDER=self-hosted \
  DATABASE_URL="postgresql://webradio_app:PASSWORT@127.0.0.1:5432/webradio_restore" \
  npm run db:verify -- --strict
sudo systemctl start webradio
```

`pg_restore` benötigt Leserechte am Dump; als `postgres`-User ausführen oder den
Dump vorher auf 0600 für den ausführenden Benutzer setzen.

### 5.3 Vollständiger Hostverlust (Compose)

1. Basis-OS installieren, Docker Engine + Compose installieren.
2. Repository auf dem Ziel-Commit auschecken, `deploy/env.production` aus dem
   Passwortmanager wiederherstellen (0600), `backup.key` bereitstellen (0600).
3. `docker compose --env-file deploy/env.production build && up -d postgres`
   (nur DB starten).
4. Restore wie 5.1, dann `up -d` für den gesamten Stack.
5. `curl -fsS https://<domain>/api/health` (Liveness) und
   `curl -fsS https://<domain>/api/ready` (Readiness/DB), Login, Admin,
   Cron-Probe.
6. Caddy stellt ACME-Zertifikate neu aus (DNS muss bereits zeigen); bei
   interner CA neu vertrauen.

### 5.4 Vollständiger Hostverlust (nativ)

1. OS + PostgreSQL 18 + Node 24 installieren, `webradio`-User anlegen.
2. Repo nach `/opt/webradio`, `npm ci && npm run build`.
3. `app.env` und `backup.key` wiederherstellen, DB-Rolle anlegen.
4. Restore wie 5.2, `db verify --strict`, `sudo systemctl enable --now webradio caddy`.
5. Installer für Timer/Monitoring erneut ausführen
   (`sudo REPO=/opt/webradio bash deploy/systemd/install-native-ops.sh`).

### 5.5 Notfall ohne Backup (Datenbank defekt, Dump vorhanden?)

Prüfen, ob PostgreSQL noch startet (`pg_isready`, `journalctl -u postgresql`).
Bei beschädigtem Cluster: Cluster neu initialisieren, Rolle anlegen, Restore aus
dem jüngsten Dump. Alles, was nach dem Dump entstanden ist, ist verloren – das
ist die RPO-Grenze und muss gegenüber Nutzern kommuniziert werden.

### 5.6 Fehlende Umgebungsvariablen

* Compose bricht bei fehlendem Pflichtwert sofort ab, z. B.
  `required variable NEXTAUTH_SECRET is missing a value` (Exit 1).
* Die native Unit startet bei fehlender `app.env` nicht („Failed to start“)
  und löst `OnFailure` aus; nach Wiederherstellung der Datei genügt
  `systemctl start webradio-app`.
* `preflight.sh` meldet fehlende Schlüssel, Platzhalter und zu offene Rechte,
  bevor der Dienst startet.

## 6. Drill (Nachweis der Wiederherstellbarkeit)

```bash
# Docker-Form (Standard)
sudo BACKUP_MODE=docker BACKUP_DIR=/var/backups/webradio \
  BACKUP_KEY_FILE=/etc/webradio/backup.key \
  COMPOSE_FILE=/opt/webradio/compose.yaml COMPOSE_ENV_FILE=/opt/webradio/deploy/env.production \
  PGUSER=webradio PGDATABASE=webradio PGPASSWORD="$DB_PASSWORD" \
  bash deploy/backup/restore-drill.sh

# native Form (benötigt CREATEDB)
sudo BACKUP_MODE=native ... bash deploy/backup/restore-drill.sh
```

Der Drill

* prüft die SHA-256-Datei,
* entschlüsselt in eine temporäre Datei (`/dev/shm`, sonst `mktemp`),
* legt `webradio_restore_test_<stamp>` an, spielt ein und prüft
  Tabellenzahl (>= 40, erwartet 44) und fremde Owner (0),
* führt `db verify --strict` gegen die Drill-DB aus,
* löscht die Drill-DB wieder (`--keep` behält sie für Analysen).

Die Live-Datenbank wird nie beschrieben. Erfolgskriterium ist `drill ok` mit
Exit 0.

## 7. Was nach einem Restore zu prüfen ist

- [ ] `db verify --strict` grün (Marker + Schema-Hash)
- [ ] `/api/health` 200, `/api/ready` 200, `/plugins` 200, `/admin` 307
- [ ] Login mit einem bekannten Konto
- [ ] Cron-Endpunkt mit gültigem Secret 200 (und 401 ohne Secret)
- [ ] Backup-Timer aktiv, nächster Lauf geplant
- [ ] Monitoring meldet 0 FAIL
- [ ] Caddy-Zertifikat gültig, HTTP→HTTPS-Redirect
- [ ] `backup.log`/`health.jsonl` schreibbar, Rechte 0600

## 8. Grenzen und Restrisiken

* **Keine Point-in-Time-Recovery**: max. 24 h Datenverlust.
* **Offsite nur lokal getestet**: `offsite-sync.sh` ist implementiert und mit
  einem lokalen Ziel verifiziert; ein externes Ziel (SSH/S3) ist ohne Freigabe
  und Credentials nicht eingerichtet. Ohne externes Ziel bleibt der Host ein
  Single Point of Failure.
* **Verschlüsselung nur mit Schlüssel**: Schlüsselverlust = Totalverlust.
* Der Drill läuft auf demselben Host; ein Hostverlust wird erst durch einen
  Restore auf fremder Hardware vollständig geprobt (INFRA 1.5: **NOT TESTED**).
* `sha256`-Dateien schützen gegen Bitfehler, nicht gegen vorsätzliche Manipulation.
* Das Konfigurationsarchiv enthält bewusst keine Secrets; diese müssen aus dem
  Passwortmanager wiederhergestellt werden.

## 9. Ergebnisse INFRA 1.5

| Prüfung | Ergebnis | Beleg |
|---|---|---|
| Docker Backup | PASS | 255.244 Bytes, AES-256, SHA-256, 0600 |
| Native Backup (Test-DB) | PASS | 20.237 Bytes, Modus 0600, kein Klartext |
| Konfigurationsarchiv | PASS | 235.120 Bytes (Compose) / 237.808 Bytes (nativ), 55 Einträge, keine Secrets |
| Rotation | PASS | `BACKUP_KEEP=3`, ältere DB-/Config-Archive entfernt |
| Integrität | PASS | `pg_restore -l` lesbar; SHA-256 je Archiv |
| Restore-Drill (Docker) | PASS | 44 Tabellen, 0 fremde Owner, `db verify --strict` ok, Drill-DB gelöscht |
| Restore-Drill (nativ) | PASS | 41 Tabellen (Test-DB), 0 fremde Owner, Drill-DB gelöscht |
| Vollrestore + Umschalten | PASS | `webradio_restore` → `webradio`; Health 200, Login 200, Admin 307, `db verify --strict` |
| Korruptes Backup | PASS | SHA-256-Mismatch, Exit 1, Original unverändert |
| Offsite (lokal) | PASS | 12 Dateien, 6 Prüfsummen, Keep=2, Selbstheilung nach Manipulation |
| Fehlende Env | PASS | Compose Exit 1 mit klarer Meldung; native Unit + `OnFailure` |
| Alter/Integrität im Monitoring | PASS | Backup 0 h, SHA-256 ok, Config 0 h |
| Offsite extern (rsync/S3) | NOT TESTED | kein Remote-Ziel, keine Freigabe |
| Restore auf fremder Hardware | NOT TESTED | kein zweiter Host verfügbar |

Windows-Hinweis: Der Test auf dem Windows-Host benötigt **relative** Pfade für
`BACKUP_DIR`/`BACKUP_KEY_FILE`, weil das native `openssl` MSYS-Pfade (`/f/...`)
nicht öffnet. Auf Linux sind absolute Pfade korrekt und getestet.
