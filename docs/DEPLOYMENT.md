# Deployment & Vercel-Readiness

**Stand:** 2026-10-25 (Phase 4.6, aktualisiert in Phase 5.2)

**Status:** vorbereitet, **nicht deployt** und **nicht gegen Vercel verifiziert**.

Dieses Dokument beschreibt, was für einen späteren Vercel-Betrieb geprüft wurde.
Es ersetzt keinen Deployment-Test. Es wurden keine produktiven Ressourcen,
Datenbanken oder Zugangsdaten angelegt oder verändert.

Die konkrete Konfigurationsänderung aus Phase 5.2 (minimale `vercel.json`,
Env-Variablen-Matrix, Build- ohne Datenbank-Nachweis) ist in
[`VERCEL_DEPLOYMENT_REPORT.md`](VERCEL_DEPLOYMENT_REPORT.md) dokumentiert.

## 1. Laufzeit und Framework

| Komponente | Befund |
|---|---|
| Next.js | 16.4.3, App Router, `cacheComponents: true` |
| Node.js | Projekt verlangt `>=24.11.0`; lokal 26.8.2, CI 24.x |
| Prisma | CLI 8.0.0-rc.27, Runtime `@prisma/orm-postgres` 8.0.0-rc.20 |
| PostgreSQL | 18.4 lokal; CI-Service `postgres:18.4-alpine` |
| NextAuth | 4.24.15, Credentials-Provider + eigene DB-Session |

Vercel dokumentiert Node.js 22.x/24.x und Next.js als unterstütztes Framework.
Eine explizite Vercel-Freigabe für exakt Next.js 16.4 wurde in der Recherche nicht
gefunden (die öffentliche Ankündigung nennt 16.3). Der tatsächliche Build muss
deshalb auf Vercel mit der gewählten Node-Version geprüft werden.

Quellen:
- <https://vercel.com/docs/functions/runtimes/node-js/node-js-versions>
- <https://vercel.com/docs/frameworks/full-stack/nextjs>
- <https://nextjs.org/docs/app/guides/upgrading/version-16>

## 2. Build und Start

```bash
npm ci
npm run build   # führt prebuild → prisma contract emit aus
npm run start
```

`prebuild` führt `prisma contract emit` bereits aus; ein zusätzlicher
`contract emit`-Schritt ist weder lokal noch auf Vercel nötig.

**Vercel-Auflösung der Befehle (laut Vercel-Doku):**

- Install: Vercel nutzt bei vorhandenem `package-lock.json` standardmäßig
  `npm install`. Deshalb setzt `vercel.json` explizit `installCommand: "npm ci"`
  (lockfile-exakt, identisch zu CI).
- Build: Vercel verwendet das `build`-Script aus `package.json`, wenn es
  existiert — also `npm run build` inklusive `prebuild`. Ein
  `buildCommand`-Override wäre redundant und ist deshalb nicht gesetzt.
- Dev: `devCommand` ist nur für `vercel dev` relevant und wurde entfernt; das
  Next.js-Preset liefert `next dev`.

Der Build benötigt **keine** erreichbare und auch **keine gesetzte**
`DATABASE_URL`: `prisma contract emit` liest nur den Contract-Quelltext, und
`src/lib/db.ts` verwendet während der Build-Phase einen Platzhalter. Lokal
verifiziert mit `DATABASE_URL="" npm run build` (Exit 0, Contract emittiert).
Ein Vercel-Build darf daher keine Produktionsdatenbank erreichen — und führt
keine Migration aus (§10).

Zur Laufzeit gilt das Gegenteil: Fehlt `DATABASE_URL` in Produktion, bricht
`src/lib/db.ts` mit einer klaren Fehlermeldung ab, statt still eine lokale
Platzhalterverbindung zu öffnen. Verifiziert mit `next start` bei leerer
Variable (HTTP 500 plus `DATABASE_URL must be set at runtime in production`).

### Node.js-Version

- Projektanforderung: `engines.node: ">=24.11.0"` (Prisma 8 RC, Next.js 16).
- Vercel bietet laut Doku die Major-Versionen 22.x und 24.x an und wertet
  `engines.node` aus; ein Bereich wie `>=22.0.0` wird auf die neueste 24.x
  abgebildet. Ob **genau** `>=24.11.0` akzeptiert wird, ist der Doku nicht zu
  entnehmen und wurde nicht gegen Vercel geprüft.
- Verbindliche Maßnahme beim Anlegen des Projekts: in den
  Vercel-Projekteinstellungen **Node.js Version 24.x** wählen und den ersten
  Build-Log auf die tatsächlich verwendete Version prüfen.

Quellen:
- <https://vercel.com/docs/functions/runtimes/node-js/node-js-versions>
- <https://vercel.com/docs/package-managers>
- <https://vercel.com/docs/builds/configure-a-build>

## 3. Umgebungsvariablen (Namen, keine Werte)

Alle Werte werden ausschließlich in den Vercel-Projekteinstellungen gepflegt —
nie in `vercel.json`, im Repository oder in einem `NEXT_PUBLIC_*`-Bundle.
`NEXT_PUBLIC_SITE_URL` ist die einzige Variable, deren Wert bewusst im
Client-Bundle landet (öffentliche Basis-URL, kein Geheimnis).

| Variable | Zweck | Build | Runtime | Vercel-Umgebungen | Geheim? | Format / sichere Erzeugung |
|---|---|---|---|---|---|---|
| `DATABASE_URL` | PostgreSQL-Verbindung der Anwendung | optional (Platzhalter greift) | **zwingend** | Production **und** Preview, je eigene Datenbank | ja (enthält Zugangsdaten) | `postgresql://USER:PASS@HOST:5432/DB?sslmode=require`; für Serverless den Pooler-String des Anbieters verwenden. Fehlt sie zur Laufzeit, bricht die App mit klarer Meldung ab. |
| `NEXTAUTH_SECRET` | Signiert die NextAuth-JWTs (Transport der DB-Session-ID) | **zwingend** (wird beim Import von `src/lib/auth.ts` in Produktion geprüft) | **zwingend** | Production und Preview, **je eigener Wert** | ja | 32 zufällige Bytes, base64url: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `NEXTAUTH_URL` | Maßgebliche Origin für Cookies (`__Secure-`-Präfix), E-Mail-Links und Origin-Prüfung; wird nie aus dem Request-Host abgeleitet | **zwingend** | **zwingend** | Production und Preview **getrennt** | nein, aber exakt und öffentlich bekannt | `https://<origin>` ohne Pfad, ohne Trailing Slash. Produktion ausschließlich HTTPS; Loopback-HTTP nur für lokale `next start`-Prüfungen. |
| `NEXT_PUBLIC_SITE_URL` | Canonical-URLs, Open Graph, Sitemap | **wirksam** (Metadaten) | gelesen | Production; Preview optional | nein (öffentlich) | `https://<origin>` ohne Pfad. Ohne Wert werden die Tags weggelassen (kein Fallback auf eine erfundene Domain). |
| `TRUST_PROXY` | Erlaubt `x-forwarded-for` für IP-Limits und Audit-IPs | – | gelesen | auf Vercel **nicht setzen** | nein | Vercel setzt `VERCEL=1` selbst; ohne Vertrauen bleiben IP-basierte Limits aus. |
| `EMAIL_FROM` | Absenderadresse für Reset-/Verifizierungsmails | – | gelesen | Production (Preview nur für Versandtests) | nein | gültige Absenderadresse des tatsächlichen Mailproviders |
| `EMAIL_SERVER_HOST` | SMTP-Host | – | gelesen | Production | nein | Hostname des Providers |
| `EMAIL_SERVER_PORT` | SMTP-Port | – | gelesen | Production | nein | `587` (STARTTLS) oder `465` (SMTPS), Default `587` |
| `EMAIL_SERVER_USER` | SMTP-Benutzer | – | gelesen | Production | meist ja | Provider-Vorgabe |
| `EMAIL_SERVER_PASSWORD` | SMTP-Passwort | – | gelesen | Production | ja | Provider-Vorgabe; nur in Vercel-Secrets |
| `GITHUB_TOKEN` | Höheres Rate-Limit der öffentlichen GitHub-REST-API | – | gelesen (nur serverseitig) | Production, optional Preview | ja | Fine-grained Token **ohne** Schreibrechte; niemals `NEXT_PUBLIC_*` und nie im Client-Bundle |
| `TEST_DATABASE_URL` | Datenbank der Integrationstests | – | – | **nicht auf Vercel** | ja | DB-Name muss auf `_test` enden; `test:integration` verweigert alles andere |
| `ADMIN_BOOTSTRAP_*`, `SYSTEM_ADMIN_*` | einmalige CLI-Bootstraps/Recovery | – | – | **nicht auf Vercel** | ja | nur lokal/CI mit Shell- und DB-Zugriff; siehe README |
| `STORAGE_*`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET` | derzeit von **keinem** Codepfad gelesen (nur in `src/lib/env.ts` deklariert) | – | – | nicht setzen | – | erst konfigurieren, wenn eine Funktion sie tatsächlich nutzt |

`ADMIN_BOOTSTRAP_*` und `SYSTEM_ADMIN_*` gehören **nicht** in Vercel. Beide
Bootstraps sind einmalige, lokale CLI-Vorgänge mit Datenbankzugriff auf die
jeweilige Umgebung. Die höchste Rolle `SYSTEM_ADMIN` ist über keinen
HTTP-Endpunkt erreichbar; sie wird nach dem ersten Deployment bewusst vom
Betreiber mit `npm run system-admin:bootstrap` angelegt (siehe README). Ein
Recovery (`npm run system-admin:recover`) fügt nur ein weiteres verifiziertes
Konto hinzu und entfernt den bestehenden Zugang nicht. Für Production muss
dieser Schritt ausdrücklich freigegeben und auditiert werden; das Deployment
selbst führt ihn nicht aus.

### NEXTAUTH_URL

Die Anwendung leitet sichere Cookies und E-Mail-Links bewusst aus
`NEXTAUTH_URL` ab und **nicht** aus dem Request-Host. In Produktion muss die
Variable eine HTTPS-Origin sein (Loopback-HTTP ist nur für lokale
`next start`-Prüfungen erlaubt); sonst bricht der Start ab.

Für Preview muss ein eigener Wert gesetzt werden. Ein fest eingetragener
Produktionswert würde Preview-Cookies und Reset-Links auf die falsche Domain
zeigen. Vercel-Systemvariablen können aktiviert werden, ersetzen hier aber
nicht die explizite, verifizierte Origin.

## 4. Datenbank und Verbindungen

- Die lokale Datenbank auf `127.0.0.1:5433` ist **keine** Produktionsdatenbank.
- Development, Preview und Production brauchen getrennte Datenbanken und
  getrennte Secrets.
- Migrationen laufen mit dem Prisma-8-Workflow, nicht mit
  `prisma migrate deploy`:

```bash
npm run prisma:contract:emit
npm run db:migrate
npm run db:verify
```

Für Produktion muss dieser Ablauf als kontrollierter Deploy-Schritt laufen,
bevor die neue Anwendung Instanzen erhält. Ein automatisches Migrieren beim
ersten Request ist nicht implementiert. Die Migration
`20261024T1815_system_admin_role` ist rein erweiternd (Check-Constraint für
den Rollenwert); sie wurde lokal auf einer leeren Datenbank sowie auf der
Entwicklungs- und Testdatenbank angewendet, aber **nicht** auf einer
produktiven Datenbank.

### Connection Pooling

`src/lib/db.ts` hält einen modulweiten `postgres()`-Client pro Instanz. Das ist
für Vercel-Fluid-Compute-Instanzen grundsätzlich geeignet, aber jede Instanz
hat einen eigenen Pool. Vercel empfiehlt für `pg`-Pools zusätzlich
`attachDatabasePool(pool)` aus `@vercel/functions`, damit Leerlaufverbindungen
vor dem Suspendieren geschlossen werden. Dieses Paket ist **nicht** installiert
und der Hook ist **nicht** verdrahtet; das ist ein konkreter offener
Deployment-Schritt.

Prisma 8 exponiert derzeit nur `poolOptions.connectionTimeoutMillis` und
`idleTimeoutMillis`, nicht `max`. Für eine harte Obergrenze müsste ein eigener
`pg.Pool` erzeugt und über die `pg:`-Option übergeben werden. Vor einem
Produktivbetrieb ist außerdem eine gepoolte PostgreSQL-Verbindung
(PgBouncer/Anbieter-Pooler) zu verwenden, besonders bei vielen gleichzeitigen
Funktionsinstanzen.

Quellen:
- <https://vercel.com/kb/guide/connection-pooling-with-functions>
- <https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package>
- paketinterne Prisma-8-Referenz `references/runtime.md`

## 5. Prisma 8 RC

Bekannte, dokumentierte Einschränkungen der RC (Auszug):

- APIs können sich bis zur GA ändern.
- Kein `prisma migrate deploy`; verwendet wird `prisma db migrate`.
- Kein klassischer `@prisma/client`/`prisma generate`-Pfad.
- Kein `$extends`, keine atomaren Increments, keine P2002-Fehlercodes.
- Node.js-Anforderung: 22.18+ oder 24.11+.
- Das Projekt nutzt **keinen** NextAuth-Prisma-Adapter, sondern einen eigenen
  Credentials-Flow mit eigener Session-Tabelle. Damit besteht keine
  unverifizierte Adapter-Abhängigkeit.

Vor jedem Upgrade: `node_modules/@prisma/orm-postgres/skills/prisma-8/` lesen,
Versionen prüfen, Migration auf leerer DB testen, `db:verify` ausführen.

## 6. Cache und Cookies

- Öffentliche Katalog-APIs senden `Cache-Control: no-store`. Ein entzogener
  Eintrag darf nicht aus einem Shared Cache weiterleben.
- Erfolgreiche Katalog- und Detailseiten senden `private, no-cache, no-store`,
  weil jede Anfrage PostgreSQL liest.
- **Unbekannte oder unveröffentlichte Detail-Slugs** beantwortet der Proxy
  direkt mit HTTP 404, `Cache-Control: no-store, max-age=0`,
  `CDN-Cache-Control: no-store` und `Vercel-CDN-Cache-Control: no-store`.
  Es wird keine gerenderte 404-Seite und kein Rewrite mehr verwendet; damit
  kann keine `s-maxage`-Direktive einer vorgerenderten Seite an einer
  negativen Antwort hängen. Lokal mit `next start` geprüft: 404-Header und
  kein `x-nextjs-prerender`; nach dem Veröffentlichen desselben Slugs sofort
  HTTP 200. Der `HEAD`-Fall ist zusätzlich durch den Proxy-Unit-Test
  abgedeckt (gleiche Header, kein Body).
- Die Vercel-CDN-Semantik selbst ist **nicht** verifiziert, weil kein
  Deployment erfolgte. Die drei Cache-Header sind die dokumentierte,
  providerübergreifende Absicherung; ein Preview-Test muss bestätigen, dass
  Vercel sie unverändert ausliefert.
- Auth-, Session- und personalisierte Antworten senden ebenfalls `no-store`.
- Session-Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, in Produktion
  `Secure` und `__Secure-`-Präfix.
- Kein `Domain`-Attribut wird gesetzt; Cookies bleiben hostgebunden. Preview
  und Production teilen daher keine Cookie-Domain.

## 6a. GitHub-Release-Quelle

- Die Release-Seite und `/api/releases` lesen ausschließlich die öffentliche
  GitHub REST API für `YourEliteSystems/WebRadio`. Drafts werden verworfen;
  nur echte Release-Assets dieses Repositories werden als Download angeboten.
- Erfolgreiche Antworten werden pro Serverinstanz fünf Minuten gehalten. Bei
  Ausfall oder Rate-Limit wird ein bis zu 24 Stunden alter öffentlicher
  Bestand als `stale` gekennzeichnet; ist kein Bestand vorhanden, antwortet die
  API mit `503`. Die Antworten selbst sind `no-store`, damit ein CDN keine
  veralteten Downloads zwischenspeichert.
- Ohne `GITHUB_TOKEN` gilt das öffentliche Limit von 60 Anfragen pro Stunde und
  IP. Bei mehreren Instanzen kann ein Token sinnvoll sein; er wird nur
  serverseitig gelesen und gehört in die Vercel-Projekteinstellungen, nie in
  `vercel.json`, das Repository oder ein `NEXT_PUBLIC_*`-Bundle.
- Ein GitHub-Ausfall beeinflusst weder Login noch Datenbankzugriffe oder
  Berechtigungsprüfungen. Die Seiten bleiben bedienbar und zeigen einen
  Fehler- beziehungsweise Stale-Zustand.

## 7. Rate Limiting und Wartung

Rate-Limits liegen in PostgreSQL (`RateLimitBucket`), damit sie über alle
Instanzen gelten. Die Tabelle wächst pro Zeitfenster und Identifier um eine
Zeile. `cleanupExpiredRateLimits()` ist implementiert, aber **nicht** als Cron
eingebunden. Für Produktion ist ein periodischer Job (z. B. täglich) oder eine
Aufbewahrungsrichtlinie nötig; die Korrektheit hängt nicht davon ab.

## 8. E-Mail

- Mit SMTP-Konfiguration wird über Nodemailer versendet.
- Ohne SMTP schreibt Development/Test in `.local-db/outbox/` (git-ignoriert,
  Dateimodus 0600) und loggt **kein** Token.
- Production ohne SMTP kann keine Reset-/Verifizierungsmails zustellen. Die
  API antwortet weiterhin generisch; das ist bewusst, aber kein erfolgreicher
  Versand.

## 9. Vercel-Schritte (noch nicht ausgeführt)

1. Separates Vercel-Projekt und getrennte Preview-/Production-Datenbanken.
2. Umgebungsvariablen je Environment setzen; keine Werte in `vercel.json`.
3. `NEXTAUTH_URL` je Environment auf die tatsächliche HTTPS-Origin setzen.
4. Migration in einem kontrollierten Schritt ausführen und `db:verify` prüfen.
5. `attachDatabasePool` bzw. einen gepoolten Connection-String evaluieren.
6. Preview-Deployment testen: Login, Session, Reset-Link, Verifizierung,
   API-`no-store`, geschützte Bereiche, fremde Origin.
7. Erst danach Production veröffentlichen.

`vercel.json` enthält nur noch Framework und Installationsbefehl:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "npm ci"
}
```

Begründung (Phase 5.2):

- `installCommand: "npm ci"` — ohne Override nutzt Vercel `npm install`; `npm ci`
  installiert exakt das Lockfile und entspricht der CI.
- Kein `buildCommand` — Vercel führt das `build`-Script aus, `prebuild`
  (`prisma contract emit`) läuft damit automatisch. Ein Override würde einen
  doppelten oder ausgelassenen Prisma-Schritt riskieren.
- Kein `devCommand` — nur für `vercel dev` relevant; das Next.js-Preset liefert
  `next dev`.
- Keine `regions` — der frühere Pin auf `iad1` (US) war eine unbelegte
  Produktionsannahme. Für eine deutschsprachige Website mit EU-Datenverarbeitung
  sind Datenresidenz, Latenz und die Angaben in der Datenschutzerklärung zu
  prüfen (`fra1` wäre naheliegend). Die Region wird **bewusst im Vercel-Projekt**
  gesetzt und nicht im Repository vorweggenommen.
- Keine `headers`/`redirects`/`rewrites`/`crons` — bestehende Cache-, Cookie- und
  Origin-Schutzmechanismen bleiben unangetastet.
- Keine Secrets, keine Domains, keine Datenbankverbindungen.

Secrets werden ausschließlich über die Vercel-Projekteinstellungen verwaltet;
frühere `@secret`-Referenzen bleiben entfernt.

## 10. Build, Migration und Produktionsschutz

- `npm run build` führt **keine** Datenbankmigration und keinen
  `prisma db migrate`-Aufruf aus. Der `prebuild`-Schritt ist ausschließlich
  `prisma contract emit` (Contract-Artefakte, kein Datenbankzugriff).
- `vercel.json` setzt nur `installCommand` und `framework`; dort ist kein
  Migrationsbefehl verdrahtet, und es existiert kein Vercel-Cron.
- Migrationen sind ein separater, freizugebender Schritt mit einer explizit
  gesetzten `DATABASE_URL` der Zielumgebung:

```bash
# Ziel-URL bewusst prüfen, niemals aus einer lokalen .env übernehmen
export DATABASE_URL="postgresql://…/webradio_production"
npm run prisma:contract:emit
npm run db:migrate
npm run db:verify
```

- Vor jeder Produktionsmigration: Backup/Snapshot, `db:status`, Review der
  `ops.json` auf `destructive`-Operationen. Bei einer destruktiven Operation
  abbrechen und eine additive Migration planen.
- `npm run db:migrate` setzt den Live-Marker, aber nicht den `db`-Ref. Nach
  dem Anwenden den Ref auf die neue Spitze setzen (siehe README), sonst plant
  der nächste Schritt von einem älteren Stand.
- Ein normaler Vercel-Build darf keine Produktionsdatenbank erreichen müssen.
  Der Build wurde lokal mit einer nicht erreichbaren Platzhalter-URL
  erfolgreich ausgeführt.

## 11. Rollback und Wiederherstellung

- **Anwendung:** Vercel-Rollback auf die vorherige Deployment-Version.
  Datenbankmigrationen werden dadurch nicht rückgängig gemacht.
- **Datenbank:** Wiederherstellung aus dem letzten verifizierten Backup /
  Point-in-Time-Recovery des Anbieters. Ein Rollback der Anwendung setzt einen
  kompatiblen Schemastand voraus; additive Migrationen bleiben in der Regel
  rückwärtskompatibel, destruktive nicht.
- **Migrationsfehler:** Nicht blind erneut ausführen. Zuerst `db:status`,
  Operator-Log und die fehlgeschlagene Operation prüfen; bei unbekanntem
  Zustand den Vorgang stoppen und den Datenbankzustand rekonstruieren.
- **Sessions/Cookies:** Nach einem Rollback können Cookie-Namen und
  `NEXTAUTH_URL` abweichen. Betroffene Nutzer müssen sich neu anmelden;
  Datenbank-Sessions bleiben gültig, bis sie ablaufen oder widerrufen werden.
- **Wiederherstellung der Admin-Kontrolle:** Nur über den dokumentierten
  SYSTEM_ADMIN-Recovery-Weg mit Shell- und Datenbankzugriff; kein HTTP-Weg.

## 12. Preview-Prüfmatrix (nach einem echten Deployment)

- [ ] `GET /api/health` → 200, keine internen Daten
- [ ] Startseite, `/plugins`, `/themes`, `/releases`, `/docs` laden ohne
      Konsolen-/Netzwerkfehler
- [ ] `/api/releases` → 200 mit `source.provider=github`, `fetchedAt` und
      `stale`; Download-URLs zeigen auf `github.com/YourEliteSystems/WebRadio`
- [ ] GitHub kurzzeitig nicht erreichbar → `/api/releases` 503 oder
      ausdrücklich `stale: true`; keine erfundene Version, kein erfundener Link
- [ ] Kein `GITHUB_TOKEN` im Browser-Bundle, in HTML oder in Logs
- [ ] Login, Session-Cookie (`Secure`, `HttpOnly`, `SameSite=Lax`), Logout
- [ ] Geschützte Seiten `/admin`, `/developer` ohne Session → Redirect
- [ ] USER/DEVELOPER erhalten serverseitig keine Admin-Aktionen
- [ ] Registrierung, E-Mail-Verifizierung, Passwort-Reset (nur mit echtem
      SMTP; sonst als nicht zustellbar dokumentieren)
- [ ] Fremde `Origin` bei schreibenden Requests → 403
- [ ] Öffentliche APIs und Detailseiten → `Cache-Control: no-store`
- [ ] Unbekannter Detail-Slug → 404 mit allen drei `no-store`-Headern
- [ ] Veröffentlichung desselben Slugs → sofort 200 (kein CDN-404)
- [ ] `NEXTAUTH_URL` entspricht der Preview-Origin; Reset-Links zeigen dorthin

## 13. Health-Checks, Logs und Datenschutz bei der Diagnose

- `/api/health` ist ein **Liveness**-Check: Er prüft Prozess und Version, nicht
  PostgreSQL. Für Readiness muss ein separater, nicht öffentlicher Check die
  Datenbank anpingen; ein öffentlicher DB-Check würde Last und
  Informationsleck-Risiko erzeugen.
- Vercel-Funktionslogs enthalten die von `console.error` ausgegebenen
  Fehlernamen/-codes. Es werden keine Passwörter, Tokens, Session-IDs,
  E-Mail-Adressen oder vollständigen Verbindungs-Strings geloggt.
- Logs nur so lange aufbewahren, wie für Betrieb und Sicherheit nötig; die
  Aufbewahrungsfrist muss in die Datenschutzerklärung.
- Bei der Fehlerdiagnose keine vollständigen Request-Bodies oder Cookies in
  Tickets/Screenshots übernehmen.
- Ein Datenbankausfall wird im Proxy **nicht** zu einem 404 (sonst würde ein
  temporärer Fehler als „nicht vorhanden“ gecacht); die Seite zeigt ihren
  Fehlerzustand.
- **Offener Header-Befund:** API-Antworten setzen `X-Content-Type-Options:
  nosniff`, und der direkte 404 setzt zusätzlich CSP/Referrer-Policy. Für die
  übrigen HTML-Seiten ist derzeit **keine** globale CSP, HSTS,
  `X-Frame-Options`- oder `Permissions-Policy`-Konfiguration vorhanden. Das
  ist vor einem öffentlichen Launch zu ergänzen und mit Next.js-Inline-Skripten
  bzw. HTTPS zu testen; ohne Deployment wurde bewusst keine ungeprüfte
  CSP aktiviert.
