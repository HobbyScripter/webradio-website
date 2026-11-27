# INFRA 1.3 – Native Linux-Validierung (Ubuntu, VMware)

**Datum:** 2026-11-21
**Repository:** `F:\Dev\webradio-website`
**Branch:** `feature/analytics-vercel-schedules` (HEAD `a3b757f`, unverändert)
**Zielsystem:** Ubuntu 26.04.1 LTS in VMware Workstation (Gast `ramon-VMware-Virtual-Platform`, NAT `192.168.43.132`)
**Status:** **VALIDIERT** – ein Punkt offen (unabhängiger systemd-Lifecycle-Lauf als Root), siehe §8. Der VM-Neustart ist nachgewiesen (§4.12).

Keine Commits, Pushes, Merges oder Deployments. Keine produktiven Datenbanken, keine produktiven Secrets, keine Änderungen außerhalb der isolierten Test-VM. Alle Testdaten liegen ausschließlich in `webradio_infra13_test`.

---

## 1. Kurzfassung

Die INFRA-1.2-Portabilität wurde erstmals **nativ auf Linux ohne Docker** ausgeführt. PostgreSQL 18.6, Node 24.22.3, der Next.js-16.4.6-Standalone-Build, ein dedizierter Systembenutzer, systemd, journald, cron und Caddy mit HTTPS funktionieren auf dem Zielsystem.

Belegt sind: Build und alle Regressionstests unter Linux, 14 Migrationen von Null, `db:verify --strict` (Marker + Schema), 126 Integrationstests, Backup/Restore mit Marker und Tabellenvergleich, die vollständige Cron-Matrix inklusive echter Crontab-Ausführung, HTTPS/HTTP2/HTTP3, Redirect, Sicherheitsheader, `TRUST_PROXY` am IP-Rate-Limit, Reconnect nach Verbindungsabbruch sowie Ressourcenverbrauch.

Wesentliche Einschränkung: Der systemd-Lifecycle konnte vom Agenten nicht selbst ausgeführt werden, weil `ramon` keine systemd-Berechtigung hat (Polkit verlangt interaktive Authentifizierung) und privilegierte Wrapper in dieser Sitzung nicht ausführbar sind. Die Belege stammen aus dem Provisioning-Protokoll und dem Journal (vom Benutzer ausgelöste Aktionen). Der VM-Neustart wurde am 2026-11-21 um 23:25 CET durchgeführt: PostgreSQL-Cluster und Dienst starten automatisch in der richtigen Reihenfolge, und alle Kerntests wurden danach unverändert wiederholt (§4.12).

---

## 2. Umgebung und Versionen

| Komponente | Wert |
| --- | --- |
| Betriebssystem | Ubuntu 26.04.1 LTS („resolute“), Kernel `7.0.0-43-generic` |
| Virtualisierung | VMware Workstation, 4 vCPU, 7.376 MB RAM, 98 GB Disk (49 GB belegt, 45 GB frei) |
| Node.js | v24.22.3 (`~/.local/node24` für Build/Tests, `/opt/node24` für den Dienst), npm 11.19.1 |
| PostgreSQL | 18.6 (`18.6-0ubuntu0.26.04.1`), `listen_addresses=localhost`, `ssl=on`, `password_encryption=scram-sha-256` |
| Next.js | 16.4.6 (Standalone-Output) |
| Prisma | 8.0.0-rc.27 (Contract-basierte Migrationen unter `migrations/`) |
| Caddy | 2.11.9 (benutzerlokal, interne CA) |
| Sonstiges | git 2.53.0, jq 1.8.1, systemd, journald, cron (aktiv und enabled) |

Testobjekte:

| Pfad | Inhalt |
| --- | --- |
| `/home/ramon/webradio-infra13` | Projektquelle + Build + `node_modules` (3,2 GB) |
| `/opt/webradio-infra13/app` | Standalone-Deployment (`0750 webradio:webradio`) |
| `/etc/webradio-infra13/webradio.env` | Laufzeit-Env (`0600 root:root`, Verzeichnis `0750`) |
| `/etc/systemd/system/webradio-infra13.service` | Unit (`0600 root:root`) + Drop-in `webradio-infra13.service.d/override.conf` |
| `~/infra13-caddy/Caddyfile` | Reverse Proxy, interne CA, Ports 8080/8443 |
| `~/infra13-cron/run-schedule.sh` | Cron-Helfer (`0700`), Secret aus `~/.config/webradio-infra13/cron.env` (`0600`) |

---

## 3. Bestandsaufnahme

### 3.1 Anwendung und Datenbankkonfiguration

`DATABASE_PROVIDER=self-hosted` ist gesetzt; CLI und Runtime lösen beide `DATABASE_URL (self-hosted)` mit Host `127.0.0.1` auf (Ausgabe ist bewusst secret-frei, es erscheinen nur Quellvariable und Hostname). Die Laufzeit Verbindung wurde zusätzlich indirekt bestätigt: `pg_stat_activity` zeigt eine aktive `webradio_app`-Session auf `webradio_infra13_test`, und die Anwendungsfehler vor der Migration nannten fehlende Tabellen (`relation "public.Theme" does not exist`) — also eine erfolgreiche, authentifizierte Verbindung.

Env-Schlüssel (Werte nicht protokolliert): `NODE_ENV`, `PORT=3010`, `HOSTNAME=127.0.0.1`, `DATABASE_PROVIDER=self-hosted`, `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL=https://webradio.infra13.test:8443`, `TRUST_PROXY=1`, `CRON_SECRET`.

### 3.2 PostgreSQL-Rollen und -Rechte

| Prüfung | Ergebnis |
| --- | --- |
| Anmeldung als `webradio_app` über TCP/127.0.0.1 | **PASS** (SCRAM) |
| Rolle | kein Superuser, kein `CREATEDB`, kein `CREATEROLE`, `LOGIN` |
| Datenbankeigentümer | `webradio_app` (UTF8, `de_DE.UTF-8`) |
| `public`-Schema | Eigentümer `pg_database_owner`, `USAGE`/`CREATE` über Datenbankeigentum |
| Falsches Passwort | **PASS** (abgelehnt: `password authentication failed`) |
| Ohne Passwort | **PASS** (abgelehnt: `no password supplied`) |
| Unbekannte Datenbank | **PASS** (abgelehnt: `does not exist`) |
| Listener | nur `127.0.0.1:5432` — keine externe Exposition |

### 3.3 Migrationen

15 Migrationsverzeichnisse unter `migrations/app/`, je `migration.json`, `migration.ts`, `ops.json`, alle Snapshots vorhanden.

**WARNING:** `20261031T1732_legal_documents` und `20261031T1811_legal_documents` sind inhaltsgleich (identische Dateigrößen), aber auf unterschiedliche Startpunkte rebased (`297315b0…` bzw. `096f7da5…`). `1732` ist ein toter Zweig; Prisma führt ihn nicht aus (kein `pending`, nicht im Routenpfad). Die Kette `…2041 → 1811 → 2014 → … → 80e32e10` ist linear. Der INFRA-1.2-Bericht spricht von „allen 15 Migrationen“; tatsächlich sind **14** auf dem Pfad.

Vor der Migration (read-only):

| Prüfung | Ergebnis |
| --- | --- |
| `migration status` | 14 `pending`, DB-Marker leer |
| `db migrate --show` | Route `∅ → b0d9463 → … → 80e32e1`, 14 Migrationen, `1732` nicht enthalten |
| `db verify` | `CONTRACT.MARKER_MISSING` (erwartet: leere, unsignierte DB) |
| Schema | 0 Tabellen |

### 3.4 systemd-Konfiguration

`User=webradio`, `Group=webradio`, `WorkingDirectory=/opt/webradio-infra13/app`, `ExecStart=/opt/node24/bin/node /opt/webradio-infra13/app/server.js`, `Restart=on-failure`, `RestartSec=3`, `TimeoutStopSec=20`, `KillSignal=SIGTERM`, `KillMode=mixed`, `SuccessExitStatus=143` (Drop-in), `NoNewPrivileges=yes`, `PrivateTmp=yes`, `ProtectSystem=strict`, `ProtectHome=yes`, `ReadWritePaths=/opt/webradio-infra13/app/.next/cache /opt/webradio-infra13/data`, `UMask=0077`, `LimitNOFILE=65536`, `EnvironmentFile=/etc/webradio-infra13/webradio.env`, `After=/Requires=postgresql.service`, `SyslogIdentifier=webradio-infra13`. Unit ist `enabled`.

---

## 4. Durchgeführte Tests und Ergebnisse

Status: **PASS** / **FAIL** / **WARNING** / **NOT RUN** / **UNAVAILABLE**.

### 4.1 Build und Regressionstests unter Linux

| Test | Ergebnis |
| --- | --- |
| `npm ci` | **PASS** (Exit 0) |
| `tsc --noEmit` | **PASS** (0 Fehler, 21,06 s) |
| `eslint .` | **PASS** (0 Errors, 19,4 s) |
| `npm test` | **PASS** (66 Suiten / 643 Tests) |
| `prisma contract emit` | **PASS** (`storageHash 80e32e10…`) |
| `prisma contract print` | **PASS** („Contract printed as Prisma 8 PSL“) |
| `npm run build` | **PASS** (Exit 0, 54,81 s, maxRSS 1.466.256 KB) |
| Standalone-Artefakt | 84 MB, startet als `server.js` |

### 4.2 Migrationen und Schema

| Test | Ergebnis |
| --- | --- |
| `npm run db:migrate` (14 Migrationen, frische DB) | **PASS** (Exit 0, 2.998 ms) |
| Marker nach Migration | `80e32e10d066867f39c44f1dd61537a5d28a2b6e1076b8a375c34cba034c89df` |
| `db:verify --strict` | **PASS** („Database marker and schema match contract“, `profileHash 3916f444…`) |
| `migration status` | **PASS** (alle 14 `applied`) |
| Tabellen | 44, **alle** im Besitz von `webradio_app`, keine Fremdeigentümer |

### 4.3 Anwendung hinter systemd (Port 3010, loopback)

| Route | Ergebnis |
| --- | --- |
| `/api/health` | **PASS** 200 (~7–10 ms) |
| `/` | **PASS** 200 (~70–107 ms), Journal ohne SQL-Fehler |
| `/plugins`, `/themes`, `/releases`, `/news`, `/docs`, `/roadmap`, `/report`, `/nutzungsbedingungen` | **PASS** je 200 |
| `/impressum`, `/datenschutz`, `/auth/login` | **PASS** je 200 |
| `/admin` | **PASS** 307 → `/auth/login?callbackUrl=%2Fadmin` |
| Journal nach Migration | **PASS** keine Fehler/`⨯`-Einträge im Testzeitraum |

### 4.4 Integrationstests gegen die echte Testdatenbank

| Test | Ergebnis |
| --- | --- |
| `npm run test:integration` (`TEST_DATABASE_URL=…webradio_infra13_test`) | **PASS** 7 Suiten / 126 Tests in 37,686 s |

Die abschließende Jest-Warnung „did not exit one second after…“ ist bekannt und beeinflusst den Exit-Code nicht.

### 4.5 Backup und Restore

| Schritt | Ergebnis |
| --- | --- |
| Markerzeile (`WebsitePageViewDaily`, `path='/_infra13_backup_marker'`, `count=42`) | **PASS** gesetzt |
| `pg_dump -Fc` | **PASS** 331 ms, 258.006 Bytes, 94 Objekteinträge |
| Datenverlust simuliert | **PASS** Marker weg (count=0) |
| `pg_restore --clean --if-exists` | **PASS** 630 ms, Exit 0 |
| Marker nach Restore | **PASS** vorhanden, `count=42` |
| Tabellenvergleich | **PASS** 44 Tabellen, Zeilenzahlen identisch |
| `db:verify --strict` nach Restore | **PASS** (Marker + Schema) |

Anmerkung: Der Retention-Lauf hat die Markerzeile später regulär entfernt (`pageViewsDeleted: 1`, Tag `1999-01-01`) — das bestätigt zusätzlich die Retention-Funktion.

### 4.6 Cron-Endpunkt und echte Crontab

Matrix (`POST /api/cron/analytics`, Secret aus `0600`-Datei):

| Fall | Ergebnis |
| --- | --- |
| `GET` | **PASS** 405 `METHOD_NOT_ALLOWED`, `Cache-Control: no-store` |
| ohne Secret | **PASS** 401 |
| falsches Secret | **PASS** 401 |
| unbekannter Schedule | **PASS** 400 mit Liste der gültigen Namen |
| `schedule=analytics-retention` | **PASS** 200 (`ok:true`, Laufzeit 12–22 ms) |
| zwei parallele Läufe | **PASS** 200 + 409 `ALREADY_RUNNING` |

Echte Crontab (Benutzer `ramon`, `cron` aktiv/enabled):

| Test | Ergebnis |
| --- | --- |
| Testeintrag `* * * * *` | **PASS** Ausführungen um 22:15:02, 22:16:01, 22:17:01, 22:18:01 UTC, jeweils `status=200` |
| `CRON_TZ=UTC` | **PASS** Probe schrieb `22:15`, identisch mit `date -u` |
| Endgültige Einträge (aus `vercel.json`) | installiert: 03:15 `analytics-traffic`, 03:45 `analytics-repo-stats`, 04:15 `analytics-releases`, 04:45 `analytics-retention` (UTC) |
| Tägliche Läufe selbst | **NOT RUN** (nur geplant; der Ausführungsmechanismus ist über die Minuteneinträge belegt) |

### 4.7 Caddy, HTTPS und Proxy-Verhalten

| Test | Ergebnis |
| --- | --- |
| `caddy validate` | **PASS** |
| Initialer Start | **FAIL** – Caddy wollte zusätzlich `:80` für automatische Redirects binden (`permission denied`, kein Root) |
| Korrektur | `auto_https disable_redirects` im globalen Block (expliziter 8080-Redirect bleibt) |
| Listener | `:8080` und `:8443` (HTTP/2, HTTP/3), App weiterhin nur `127.0.0.1:3010`, PostgreSQL nur `127.0.0.1:5432` |
| HTTPS-Health | **PASS** `HTTP/2 200` |
| Zertifikat | **PASS** `CN=Caddy Local Authority - ECC Intermediate`, Verify `0 (ok)` gegen die lokale Root-CA |
| TLS 1.2 / 1.3 | **PASS** beide 200 über HTTP/2 |
| HTTP → HTTPS | **PASS** `301` nach `https://webradio.infra13.test:8443/plugins?x=1` |
| Sicherheitsheader | **PASS** `strict-transport-security: max-age=86400`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy`, kein `Server`-Header |
| Proxy-Header | **PASS** `via: 1.1 Caddy`, `X-Forwarded-Proto`/`X-Real-IP` gesetzt |
| Admin über Proxy | **PASS** 307 → `/auth/login?callbackUrl=%2Fadmin` |
| Startseite/Login über HTTPS | **PASS** 200 (73 ms / HTTP2) |

`HOSTNAME=127.0.0.1` und `TRUST_PROXY=1` passen zusammen: Der App-Port ist nicht öffentlich, nur Caddy erreicht ihn.

**WARNING:** `max-age=86400` ist ein Testwert (Testhost/interne CA); produktiv sind 6–12 Monate üblich. Die Caddy-Root-CA wurde nicht systemweit installiert (`sudo`-Installation verweigert); geprüft wurde mit `--cacert`.

### 4.8 `TRUST_PROXY` (empirisch, nicht nur konfiguriert)

`POST /api/auth/password-reset/request` mit `Origin: https://webradio.infra13.test:8443`, Limit 10/15 min je IP:

| Fall | Ergebnis |
| --- | --- |
| 11 Anfragen mit gleicher `X-Forwarded-For: 203.0.113.7` | **PASS** `200 200 200 200 200 200 200 200 200 200 429` (`RATE_LIMITED`) |
| andere IP (`203.0.113.8`) | **PASS** 200 (eigener Bucket) |
| ohne `X-Forwarded-For` | **PASS** 200 (kein IP-Bucket, nur Konto-Limit) |
| `RateLimitBucket`-Zeilen | 16 (gehashte Schlüssel, keine Klartext-IP) |

Damit ist belegt: `x-forwarded-for` wird nur wegen `TRUST_PROXY=1` als Bucket-Schlüssel verwendet.

### 4.9 Reconnect nach Verbindungsverlust

| Test | Ergebnis |
| --- | --- |
| Alle App-Verbindungen via `pg_terminate_backend` beendet | 4 Verbindungen |
| `/plugins` direkt danach | **PASS** 200 in 33 ms |
| `/`, `/admin` danach | **PASS** 200 / 307 |
| Journal | keine Fehler |

### 4.10 systemd-Lifecycle (Belege aus Provisioning/Journal)

| Test | Ergebnis |
| --- | --- |
| Start | **PASS** `Started`, Health nach 1.994 ms (Provisioning-Protokoll) |
| Stop (vor Korrektur) | **FAIL** Zustand `failed` wegen `status=143` → `Failed with result 'exit-code'` |
| Korrektur | Drop-in `SuccessExitStatus=143` (vom Benutzer ergänzt, 22:53) |
| Stop (nach Korrektur) | **PASS** 22:53:36 und 22:54:20 sauber `Stopped`, `Result=success` |
| Restart | **PASS** Stop+Start-Zyklus 22:54:20, Health wieder da |
| Crash (`kill -9`) | **PASS** 22:54:57 `code=killed, status=9/KILL`, `Failed with result 'signal'`, 22:55:00 `Scheduled restart job, restart counter is at 1`, `Started` (≈3 s), `NRestarts=1` |
| Automatischer Start nach VM-Neustart | **PASS** 23:25:58, `MainPID=1836`, `NRestarts=0` (§4.12) |
| journald | **PASS** `SyslogIdentifier=webradio-infra13`, strukturierte Start-/Stop-/Restart-Zeilen |
| Unabhängiger Nachvollzug durch den Agenten | **NOT RUN** – `ramon` darf die Unit nicht bedienen (Polkit: interaktive Authentifizierung), privilegierte Wrapper sind gesperrt |
| PostgreSQL-Dienst-Neustart + Reconnect | **NOT RUN** (Root nötig) – ersetzt durch §4.9 |

### 4.11 Ressourcen

| Messung | Wert |
| --- | --- |
| App-Prozess (RSS) | 254 MB im Leerlauf, 310 MB nach Last |
| Threads | 11 |
| systemd-Cgroup `MemoryCurrent` | 190.074.880 Bytes (≈181 MiB) |
| `CPUUsageNSec` (kumuliert, ~21 min Laufzeit) | 6.308.106.000 ns (≈6,3 s) |
| 50 × `GET /plugins` direkt | 1.769 ms (≈35 ms/Request) |
| 50 × `GET /plugins` über Caddy/HTTPS | 2.018 ms (≈40 ms/Request) |
| System gesamt | 7.376 MB RAM, 2.175 MB belegt, 5.201 MB verfügbar; Disk 49 GB/98 GB (52 %) |

---

### 4.12 Boot-Persistenz nach VM-Neustart

Vollständiger Neustart der Gast-VM am 2026-11-21 (Boot 23:25 CET, `who -b`); Prüfung vier Minuten nach dem Boot.

| Prüfung | Ergebnis |
| --- | --- |
| `postgresql.service`, `cron`, `webradio-infra13.service` | **PASS** alle `enabled` **und** `active` |
| PostgreSQL-Cluster | **PASS** `pg_lsclusters`: `18 main 5432 online postgres /var/lib/postgresql/18/main`, Log `/var/log/postgresql/postgresql-18-main.log`, Start 23:25:55 |
| App-Start | **PASS** automatisch 23:25:58, `MainPID=1836`, `NRestarts=0` (kein Fehlstart, kein Restart nötig) |
| Startreihenfolge | **PASS** PostgreSQL (23:25:55) vor App (23:25:58), wie `After=`/`Requires=` es verlangen |
| Datenbankverbindung danach | **PASS** `webradio_app@webradio_infra13_test` über 127.0.0.1:5432; 44 Tabellen, 0 Fremdeigentümer; `pg_postmaster_start_time()` = Boot-Zeit |
| Listener | nur `127.0.0.1:3010` und `127.0.0.1:5432` |
| Routen | **PASS** `/api/health` 200 (7 ms), `/` 200, `/plugins` 200, `/themes` 200, `/releases` 200, `/news` 200, `/auth/login` 200, `/admin` 307 |
| Crontab nach Boot | **PASS** unverändert: `CRON_TZ=UTC` + 03:15/03:45/04:15/04:45 UTC; `cron` active/enabled |
| `db:verify --strict` nach Boot | **PASS** Marker + Schema, unveränderte Hashes (`80e32e10…`, `3916f444…`) |
| Integrationstests nach Boot | **PASS** 7 Suiten / 126 Tests (56,1 s) |
| Cron-Matrix nach Boot | **PASS** `FAILS=0` (405/401/401/400/200; parallel 200 + 409) |
| HTTPS nach Boot | **WARNING** Caddy war erwartungsgemäß nicht aktiv (benutzerlokal, keine Unit); nach manuellem Start erneut **PASS** (HTTP/2 200, alle Header, 301-Redirect, Admin 307) |
| Journal seit Boot | keine Fehler; eine erwartete Next.js-Warnung: `metadataBase` nicht gesetzt, daher `http://localhost:3010` für Social-Images (siehe §7) |

Damit ist die Boot-Persistenz für Datenbank und Anwendung belegt. Nicht automatisch startet Caddy in dieser Testkonfiguration — produktiv gehört es in eine systemd-Unit (§8).

---

## 5. Aufgetretene Fehler und vorgenommene Korrekturen

1. **Stop hinterließ `failed`** — Node beendet bei `SIGTERM` mit 143, systemd wertete das als Fehler. Korrektur: Drop-in `SuccessExitStatus=143`; danach `Result=success`. Dokumentiert in §4.10.
2. **Caddy-Start scheiterte an `:80`** — die automatische HTTPS-Redirect-Route band Port 80 (kein Root). Korrektur: `auto_https disable_redirects`; der explizite 8080→8443-Redirect bleibt. In Produktion mit 80/443 entfällt die Zeile.
3. **`pkill -f` auf ein Caddy-Muster beendete die eigene SSH-Shell** (Muster stand in ihrer Kommandozeile). Korrektur: PID-Datei + `pgrep -x caddy`; keine Mustersuche mehr.
4. **Privilegierte Schritte nicht ausführbar** — `sudo`/systemctl als `ramon` verweigert; alle Root-Aufgaben liefen über ein idempotentes Provisioning-Skript, das der Benutzer ausführt.
5. **Prüfskript-Fehler (nur Diagnose, kein Produktfehler)** — ein `$(...)`-Konstrukt fing die eigene Log-Zeile mit ein und meldete fünf falsche FAILs; die Endpunkt-Antworten waren korrekt (405/401/401/400/200) und nach der Korrektur meldet die Matrix `FAILS=0`. Ein zweiter Lauf brach an einer Zeilenenden-/Editierstelle ab, nachdem die eigentliche Prüfung bereits bestanden war; die endgültige Crontab wurde direkt gesetzt.
6. **`db:verify` nach Restore** scheiterte zunächst am Arbeitsverzeichnis (`Cannot find module …/scripts/prisma-db.mts`), nicht an der Datenbank; im Projektverzeichnis wiederholt: **PASS**.

Keine Änderung an Anwendungscode, Unit-Sandbox, Datenbankberechtigungen, Firewall oder DNS.

---

## 6. Sicherheit der Testumgebung

| Prüfung | Ergebnis |
| --- | --- |
| App-Port | nur `127.0.0.1:3010` |
| PostgreSQL | nur `127.0.0.1:5432` |
| Caddy | `:8080`/`:8443` (Test Exposition bewusst, nur LAN/NAT) |
| Env-Datei | `0600 root:root`, Verzeichnis `0750` |
| App-Verzeichnis | `0750 webradio:webradio` |
| Dienstbenutzer | `webradio`, kein Root, `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome` |
| Cron-Secret | nur aus `0600`-Datei, nicht in der Crontab, nicht im Log |
| Logs | keine Secrets, keine vollständigen Verbindungs-URLs; `db verify` maskiert die URL selbst |
| Admin | 307 auf Login, sowohl direkt als auch über Caddy |

---

## 7. Nicht durchgeführte Tests und Einschränkungen

| Test | Status | Grund |
| --- | --- | --- |
| Unabhängiger systemd-Lifecycle-Lauf (Stop/Start/Restart/Crash) durch den Agenten | NOT RUN | Polkit/fehlende Root-Rechte in der Agenten-Sitzung; Journal-Belege vorhanden (§4.10) |
| Vollständiger PostgreSQL-Dienst-Neustart | NOT RUN | Root nötig; ersetzt durch Reconnect-Test (§4.9) |
| Boot-Persistenz nach VM-Neustart | **PASS** | durchgeführt 2026-11-21 23:25, siehe §4.12 |
| Caddy-Autostart nach Boot | **WARNING** | nach dem Boot nicht aktiv (benutzerlokal, keine Unit); manuell gestartet, HTTPS danach erneut PASS |
| `metadataBase` in Next-Metadaten | **WARNING** | `NEXT_PUBLIC_SITE_URL` ist nicht gesetzt, daher nutzt Next.js `http://localhost:3010` für Social-Images |
| `503`-Pfad des Cron-Endpunkts (`CRON_SECRET` fehlt) | NOT RUN | Env-Datei ist root-only; in INFRA 1.2 im Container geprüft |
| Tägliche 03:15/03:45/04:15/04:45-Läufe | NOT RUN | nur geplant; Ausführungsmechanismus über Minuteneinträge belegt |
| Vollständiger Browser-Login (Registrierung → Login → Session) | NOT RUN | nicht Teil dieser Phase; über Integrationstests abgedeckt |
| `ufw`-Regeln | UNAVAILABLE | `ufw status` erfordert Root; Listener-Prüfung ersetzt die Aussage |
| Caddy-Root-CA systemweit installiert | UNAVAILABLE | `sudo`-Installation verweigert; Prüfung mit `--cacert` |

---

## 8. Abschließende Bewertung der Linux-Hosting-Portabilität

**Bewertung: portabel und produktionsnah einsetzbar, mit zwei offenen Betriebsnachweisen.**

Belastbar belegt sind alle Anwendungspfade, die den Umzug von Vercel auf einen eigenen Linux-Server ausmachen:

- eigener PostgreSQL-Server mit `DATABASE_PROVIDER=self-hosted`, strenger Host-Prüfung und ohne Superuser-Rechte für die App,
- 14 Migrationen von Null plus Marker-/Schema-Verifikation,
- Standalone-Build unter systemd mit dediziertem Benutzer, Sandbox und Auto-Restart,
- 126 Integrationstests gegen die echte Datenbank,
- Backup/Restore mit Datenmarker und vollständigem Tabellenvergleich,
- portabler Scheduler ohne Vercel: `POST /api/cron/analytics` mit Secret-Auth, echter Crontab, `CRON_TZ=UTC` und den Frequenzen aus `vercel.json`,
- HTTPS-Reverse-Proxy mit HTTP/2, HTTP/3, Redirect, Sicherheitsheadern und korrekt funktionierendem `TRUST_PROXY`,
- Reconnect nach Verbindungsverlust, Ressourcen im erwarteten Rahmen.

Offen und vor einem Produktivbetrieb nachzuholen:

1. **Unabhängiger Lifecycle-Lauf als Root** (Skript liegt bereit), damit Stop/Start/Restart/Crash nicht nur aus Journal und Provisioning-Protokoll, sondern aus einem reproduzierbaren Lauf belegt sind. Dieser Punkt ist **weiterhin offen**.
2. **Caddy als Systemdienst** mit `:80`/`:443`, systemweit vertrauenswürdiger CA bzw. ACME und HSTS-Langzeitwert — im Test bewusst benutzerlokal auf 8080/8443, daher kein Autostart nach dem Boot.
3. **`NEXT_PUBLIC_SITE_URL`** setzen, damit `metadataBase` und Social-Images auf den echten Origin zeigen.
4. **Dead Branch `20261031T1732_legal_documents`** im Repository entfernen oder als obsolet markieren, damit die Migrationshistorie eindeutig bleibt (kein Laufzeitfehler, aber eine Stolperfalle).

---

## 9. Repo-Schutz und Aufräumen

- Keine Commits, Pushes, Merges, Releases oder Deployments.
- Keine Änderungen an Anwendungscode oder Konfiguration im Repository; alle Artefakte dieser Phase liegen unter `.local-db/infra13/` (gitignoriert) bzw. auf der Test-VM.
- Keine produktiven Daten oder Secrets; Test-Secrets nur auf der VM (`0600`, nie ausgegeben).
- Auf der VM verbleiben: Testdatenbank `webradio_infra13_test`, Deploy unter `/opt/webradio-infra13`, Test-Crontab (4 UTC-Einträge), Caddy-Prozess mit PID-Datei, Diagnose-Logs unter `/home/ramon`.
- Noch zu entfernen, sobald die offenen Punkte erledigt sind: temporäres SSH-Keypair `.local-db/infra13/ssh/`, `~/infra13-secrets.env` und die Cron-Env-Datei auf der VM.
