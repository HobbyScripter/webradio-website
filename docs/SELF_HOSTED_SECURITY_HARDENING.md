# WebRadio Website – Self-Hosted Security Hardening

Härtung und Restrisiken des selbst gehosteten Betriebs. Gilt für die native
Form (systemd, Host-PostgreSQL, Caddy) und die Compose-Form. Prüfergebnisse:
[`PHASE_INFRA1.5_PRODUCTION_DEPLOYMENT_PREPARATION_REPORT.md`](./PHASE_INFRA1.5_PRODUCTION_DEPLOYMENT_PREPARATION_REPORT.md)
und [`PHASE_INFRA1.4_PRODUCTION_READINESS_REPORT.md`](./PHASE_INFRA1.4_PRODUCTION_READINESS_REPORT.md);
Betriebsabläufe: [`SELF_HOSTED_DEPLOYMENT_GUIDE.md`](./SELF_HOSTED_DEPLOYMENT_GUIDE.md).

## 1. Schutzziele und Angreifermodell

Schutzziele: Vertraulichkeit der Secrets und Nutzerdaten, Integrität der
Datenbank, Verfügbarkeit der öffentlichen Seiten, Nachvollziehbarkeit von
Änderungen.

Angenommen wird: Das Internet kann 80/443 erreichen; ein Angreifer kann
Anmeldeendpunkte, Webhooks und Cron-Endpunkte beliebig oft aufrufen. Nicht
angenommen wird ein bereits kompromittierter Host oder Root-Zugriff – dafür
greifen die Backup- und Recovery-Prozesse.

## 2. Benutzer und Dateiberechtigungen

| Objekt | Owner | Modus | Zweck |
|---|---|---|---|
| `/opt/webradio` | `webradio:webradio` | 0750 | Anwendung, kein Schreibzugriff für andere |
| `deploy/env.production` | root (bzw. Deploy-User) | **0600** | Produktions-Secrets |
| `/etc/webradio/app.env` | `webradio:webradio` | 0600 | Laufzeit-Env der nativen Form |
| `/etc/webradio/backup.env`, `monitoring.env`, `offsite.env` | `root:root` | 0600 | Backup-/Monitoring-/Offsite-Konfiguration |
| `/etc/webradio/backup.key` | `root:root` | 0600 | Backup-Verschlüsselung |
| `/etc/webradio/cron.env` | `root:root` | 0600 | `CRON_SECRET` für den Timer |
| `/etc/caddy/caddy.env` | `root:root` | 0600 | Domain/ACME |
| `/var/backups/webradio` | `root:root` | 0700 | verschlüsselte DB-/Config-Archive |
| `/var/backups/webradio-offsite` | `root:root` | 0700 | lokale Offsite-Simulation |
| `/var/log/caddy`, `/var/log/webradio` | `caddy`/`root` | 0750 | Logs |
| Container-Anwendung | `nextjs` (uid 1001) | – | kein Root im Container |

Regeln:

* Die Anwendung läuft nie als `root`. Nativ per `User=webradio` + `NoNewPrivileges`,
  im Container per `USER nextjs` und `cap_drop: [ALL]`.
* Secrets werden nie in Images, Logs, `docker inspect`-Umgebungen des Images
  oder gewöhnliche Backup-Archive geschrieben. Der Build nutzt nur Platzhalter
  (`ARG` im Builder-Stage); `docker inspect webradio-website` enthält keine
  Secrets (geprüft). Das `tools`-Image enthält keine Env-Datei, der Runner
  keine `DATABASE_URL` (INFRA 1.5 erneut geprüft).
* Das Konfigurationsbackup ist eine **Whitelist** und prüft das fertige Archiv
  zusätzlich auf `.env`, `env.production`, `env.test`, `.key`, `.pem` und
  `secret`; bei einem Treffer bricht es ab. Der Schlüssel liegt nie im Archiv.
* Die Offsite-Kopie überträgt ausschließlich `*.enc` und `*.sha256`; Keys,
  Klartextdumps, Env-Dateien und Logs verlassen den Host nicht.
* `.gitignore` schließt `deploy/env.production`, `deploy/env.test` und
  `deploy/env.*.local` aus (`.env*` deckt zusätzlich `.env.vercel.production` ab).
* Der Docker-Build-Kontext enthält keine echten Env-Dateien: `.dockerignore`
  schließt `.env`, `.env*.local`, `.env.vercel.production` und
  `deploy/env.{production,test,*.local}` aus. Geprüft mit
  `docker run --rm --entrypoint sh webradio-website:infra1.4-tools -c 'ls deploy'`
  – keine Env-Datei im Image.

## 3. systemd-Härtung

Die Caddy-Unit (`deploy/systemd/caddy.service`) setzt:

```ini
User=caddy
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
ReadWritePaths=/var/lib/caddy /var/log/caddy
UMask=0027
```

Damit darf Caddy nur Ports binden und ausschließlich seine Daten-/Logpfade
schreiben. Für die Anwendungs-Unit gilt dieselbe Linie, zusätzlich
`PrivateDevices`, `ProtectClock`, `ProtectHostname`, `RestrictSUIDSGID` und
`StartLimitBurst=5`. Sie startet über `/usr/bin/env node` und schreibt nur
nach `.next/cache`. `systemd-analyze verify` prüft seit INFRA 1.5 alle
**13 Units** vor dem Aktivieren.

Backup-, Drill- und Health-Unit laufen als `root` (Zugriff auf DB-Socket,
Backup-Verzeichnis, Journal), sind aber `Type=oneshot` ohne Netz-Listener und
mit `Nice`/`IOSchedulingClass` gedrosselt. Fehler lösen über
`OnFailure=webradio-alert@%n.service` einen Alarm aus.

`systemd-analyze verify` wurde für alle acht Units ausgeführt (PASS). Die
Root-Installation auf einem echten Host steht noch aus (Abschnitt 9).

## 4. Docker-Härtung (Compose)

| Maßnahme | Wert | Wirkung |
|---|---|---|
| Runtime-User | `nextjs` uid 1001 | kein Root in der App |
| `cap_drop: [ALL]` | App | keine Kernel-Capabilities, kein Signal an PID 1 |
| `security_opt: no-new-privileges` | alle Services | kein Setuid-Eskalationspfad |
| `init: true` | App | korrektes Signal-/Zombie-Handling |
| `stop_grace_period: 30s` | App | laufende Requests werden beendet |
| `tmpfs /tmp:size=64m` | App | Schreibbedarf ohne Image-Änderung |
| Netz `backend` (`internal: true`) | App + DB | DB hat **keinen** Weg nach außen |
| Netz `edge` | nur Caddy | Proxy getrennt vom DB-Netz |
| Keine `ports:` bei App/DB | – | kein Host-Zugriff auf 3000/5432 (geprüft) |
| Logging `10m × 3` | alle | kein volles Disk-Volume durch Logs |
| `mem_limit`/`cpus` | 768M/2, 512M/1, 128M/0,5 | Schutz vor Ressourcen-Erschöpfung |

Der Caddy-Container läuft als Root, weil das offizielle Image 80/443 bindet.
Risiko gemindert durch `no-new-privileges`, read-only gemountete Caddyfile und
keine weiteren Capabilities; ein non-root-Betrieb würde `NET_BIND_SERVICE` und
angepasste Volume-Rechte erfordern (siehe Restrisiko R6).

## 5. Netzwerkexposition

| Port | Dienst | Exposition |
|---|---|---|
| 80 | Caddy (Redirect) | öffentlich |
| 443 | Caddy (TLS) | öffentlich |
| 3000 | Next.js | nur `backend`/`egress` |
| 5432 | PostgreSQL | nur `backend`, nie veröffentlicht |
| 2019 | Caddy Admin-API | deaktiviert (`admin off`) |

`TRUST_PROXY=1` ist nur hinter Caddy korrekt. Wird die Anwendung direkt
erreichbar, können `X-Forwarded-For`/`X-Forwarded-Proto` gefälscht werden –
Deshalb bindet die native Form auf `127.0.0.1:3010`.

Rate-Limits und Bot-Schutz sind Aufgabe des Edge (Caddy-Module oder
vorgelagertes CDN) und der Anwendung (Login-/Webhook-Logik); im Testaufbau
bewusst nicht aktiviert.

## 6. Datenbankzugriff

* Getrennte Rollen empfohlen: `webradio_app` (DML auf dem Schema),
  `webradio_backup` (`SELECT`/`pg_dump`, `CREATEDB` nur wenn nötig),
  `webradio_monitor` (nur `CONNECT`/`SELECT 1`). In der Compose-Form ist der
  Container-Superuser `POSTGRES_USER` bewusst einfach gehalten; für Produktion
  sind separate Rollen nachzuziehen.
* `password_encryption=scram-sha-256`, `max_connections=50`.
* Kein `trust` in Produktion; im Testhost nur loopback-gebundene Wegwerf-DB.
* Das Backup-Skript verbindet sich ohne Passwort auf der Kommandozeile
  (`PGPASSWORD`/`.pgpass`), damit keine Secrets in `ps` erscheinen.
* Der Restore verwendet `--no-owner --no-privileges`, damit eingespielte Objekte
  keine fremden Owner mitbringen (Drill prüft `foreign_owners=0`).

## 7. Secrets-Verwaltung

* Erzeugen: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
* Ablage: nur 0600-Dateien bzw. Docker-`--env-file`; keine Secrets in
  `docker-compose.yml`, Images, Git oder Chat.
* Rotation: `NEXTAUTH_SECRET` (invalidiert Sessions), `CRON_SECRET`, DB-Passwort
  und Backup-Schlüssel (alter Schlüssel bleibt zum Entschlüsseln alter Archive
  nötig – neuen Schlüssel parallel verwahren).
* Das Monitoring protokolliert nur Statuscodes, keine Bodies mit Tokens;
  `health.jsonl` enthält Health-JSON, keine Secrets.
* Webhook-URLs für Alarme sind Secrets (Token in der URL) und gehören in
  `monitoring.env` (0600).

## 8. Logs, Backups und Wiederanlauf

* Logs: Docker `json-file` 10 MB × 3; Caddy mit Rotation (10 MiB, 5 Dateien,
  720 h); Journal über `journald`-Limits des Hosts.
* Backups: DB- und Konfigurationsarchiv verschlüsselt, 0600, Rotation 14,
  SHA-256 je Lauf, wöchentlicher Restore-Drill (Details im
  Disaster-Recovery-Guide). Das Monitoring prüft zusätzlich die Prüfsumme des
  neuesten Archivs, nicht nur dessen Alter.
* Offsite: Kopie der verschlüsselten Archive mit Ziel-Verifikation und
  Rotation; lokal getestet, extern freigabepflichtig.
* Wiederanlauf: `restart: unless-stopped` (Compose) bzw. `Restart=always`
  (systemd). Auf Engine-Ebene belegt: Testcontainer mit `exit 1` wurde fünfmal
  neu gestartet. `docker stop`/`kill` gelten als manueller Stopp.
* Datenbankausfall: Die App bleibt stehen (kein Crash-Loop), statische/Cache-
  Seiten antworten weiter, DB-abhängige Requests schlagen fehl, das Monitoring
  meldet `FAIL postgres`; nach DB-Start antwortet `/plugins` sofort wieder 200
  (gemessen, ohne App-Neustart).

## 9. Restrisiken (priorisiert)

| ID | Risiko | Prio | Status / Maßnahme |
|---|---|---|---|
| R1 | Root-Installation auf dem echten Zielserver noch nicht ausgeführt | **P1** | in einer isolierten systemd-Umgebung vollständig getestet (13 Units, 5 Timer, Boot, OnFailure); Zielhost bleibt freigabepflichtig |
| R2 | Offsite-Kopie nur lokal getestet; externes Ziel fehlt | **P1** | `offsite-sync.sh` implementiert und lokal verifiziert; SSH/S3 ohne Credentials/Freigabe nicht eingerichtet |
| R3 | Kein Point-in-Time-Recovery, RPO 24 h | P2 | akzeptiert für aktuelle Datenmenge; WAL-Archivierung als Option dokumentiert |
| R4 | Produktions-DNS/Firewall/ACME nicht geprüft (keine Freigabe, keine Domain) | P2 | Testhost nutzt interne CA; echtes Zertifikat = NOT TESTED |
| R5 | Compose-Test lief auf Docker Desktop (Windows), nicht auf Docker CE/Ubuntu | P2 | Container selbst linux/amd64; Host-Themen (ufw, unattended-upgrades, Daemon-Autostart) offen |
| R6 | Caddy-Container läuft als Root (Portbindung) | P2 | `no-new-privileges`, Caddyfile read-only; non-root-Variante dokumentiert |
| R7 | `tools`-Image ~5,5 GB auf dem Host | P3 | nicht zur Laufzeit aktiv; nach Migration entfernbar, jederzeit neu baubar |
| R8 | Env-Datei-Rechte auf Windows-Testsystem sind 0644 (Filesystem ohne POSIX-Modus) | P3 | auf Linux 0600; Installer/Guide fordert 0600 |
| R9 | Keine Edge-Rate-Limits/Bot-Abwehr aktiv | P3 | Anwendung limitiert Login/Webhooks; Edge-Härtung offen |
| R10 | `docker-compose.yml` (Dev-DB, 127.0.0.1:5433) liegt neben `compose.yaml` | P3 | Compose bevorzugt `compose.yaml`; Dev-Datei ist klar kommentiert, kein Konflikt |
| R11 | Backup-Schlüssel nur auf dem Host, wenn kein Passwortmanager genutzt wird | P3 | Prozessvorgabe: zwei externe Kopien |
| R12 | BuildKit warnt vor `ARG/ENV NEXTAUTH_SECRET` (nur Platzhalter) | P3 | Runner erbt den Wert nicht; BuildKit-Secret als nächste Härtungsstufe |
| R13 | `/api/health` ist Liveness und antwortet auch bei DB-Ausfall mit 200 | P3 | behoben: `/api/ready` prüft die DB (`SELECT 1`, 200/503); Caddy und Monitoring nutzen es |

## 10. Härtungs-Checkliste vor Produktivgang

- [ ] `deploy/install/install-production.sh --apply` ausgeführt (Dry-Run zuerst)
- [ ] `deploy/install/preflight.sh` → 0 FAIL
- [ ] `deploy/env.production` 0600/0640, alle `CHANGE_ME` ersetzt
- [ ] `NEXTAUTH_SECRET`/`CRON_SECRET` ≥ 32 Byte zufällig, verschieden
- [ ] DB-Passwort ≥ 24 Zeichen, nicht wiederverwendet
- [ ] `backup.key` 0600 + zwei externe Kopien
- [ ] `sudo REPO=/opt/webradio bash deploy/systemd/install-native-ops.sh` ausgeführt,
      `caddy.service`/`webradio-app.service` aktiv, 5 Timer aktiv
- [ ] `systemd-analyze verify` ohne Fehler (13 Units)
- [ ] Firewall: nur 22/80/443 offen, 3000/5432 nicht erreichbar
- [ ] `docker compose ... ps`: App/DB ohne veröffentlichte Ports
- [ ] Login, Admin, Cron (401/200 für konfigurierte Schedules), Webhook-Signatur geprüft
- [ ] DB-Backup + Config-Backup + Drill im Zielmodus erfolgreich
- [ ] Offsite-Ziel konfiguriert, `offsite-sync.sh --dry-run` und ein Lauf geprüft
- [ ] Monitoring zeigt 0 FAIL, Alarmweg getestet
- [ ] `unattended-upgrades` und Docker-/Kernel-Updates geplant
