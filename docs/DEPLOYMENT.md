# Deployment & Vercel-Readiness

**Stand:** 2026-10-24 (Phase 4.6)

**Status:** vorbereitet, **nicht deployt** und **nicht gegen Vercel verifiziert**.

Dieses Dokument beschreibt, was für einen späteren Vercel-Betrieb geprüft wurde.
Es ersetzt keinen Deployment-Test. Es wurden keine produktiven Ressourcen,
Datenbanken oder Zugangsdaten angelegt oder verändert.

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
npm run prisma:contract:emit
npm run build
npm run start
```

`prebuild` führt `prisma contract emit` bereits aus. Der Build benötigt eine
gesetzte, aber nicht zwingend erreichbare `DATABASE_URL`; die öffentlichen
Seiten werden als statische Shell mit dynamischen Datenlücken gerendert.

## 3. Umgebungsvariablen (Namen, keine Werte)

| Variable | Development | Preview | Production | Zweck |
|---|---|---|---|---|
| `DATABASE_URL` | lokale DB `127.0.0.1:5433` | eigene Preview-DB | eigene Prod-DB | PostgreSQL |
| `TEST_DATABASE_URL` | `_test`-DB | nicht nötig | nicht nötig | nur Integrationstests |
| `NEXTAUTH_SECRET` | Pflicht | Pflicht | Pflicht | JWT-/Cookie-Signierung |
| `NEXTAUTH_URL` | `http://localhost:3000` | z. B. `https://<preview-host>` | `https://<produktions-domain>` | Cookies, E-Mail-Links, Origin |
| `NEXT_PUBLIC_SITE_URL` | optional | optional | Produktionsdomain | Canonical, OG, Sitemap |
| `GITHUB_TOKEN` | optional | optional | optional | serverseitiger GitHub-API-Token; niemals `NEXT_PUBLIC_*` |
| `TRUST_PROXY` | leer | automatisch via `VERCEL=1` | automatisch via `VERCEL=1` | IP-Limits/Audit-IP |
| `EMAIL_FROM` | optional | Pflicht für Versand | Pflicht für Versand | Absender |
| `EMAIL_SERVER_HOST` | optional | Pflicht für Versand | Pflicht für Versand | SMTP |
| `EMAIL_SERVER_PORT` | `587` | `587`/`465` | `587`/`465` | SMTP |
| `EMAIL_SERVER_USER` | optional | meist Pflicht | meist Pflicht | SMTP |
| `EMAIL_SERVER_PASSWORD` | optional | geheim | geheim | SMTP |

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

`vercel.json` enthält nur Build-/Framework-Konfiguration. Die früheren
`@secret`-Referenzen wurden entfernt, weil Secrets über die Vercel-
Projekteinstellungen verwaltet werden.

**Offene Regionsentscheidung:** `vercel.json` pinnt derzeit `regions: ["iad1"]`
(US). Für eine deutschsprachige Website mit EU-Datenverarbeitung sind
Datenresidenz, Latenz und die Angaben in der Datenschutzerklärung zu prüfen;
`fra1` wäre eine naheliegende Alternative. Die Region wurde in Phase 4.6
**nicht** eigenmächtig geändert, weil sie von Betreiber- und Rechtsentscheidungen
abhängt.

## 10. Build, Migration und Produktionsschutz

- `npm run build` führt **keine** Datenbankmigration und keinen
  `prisma db migrate`-Aufruf aus. Der `prebuild`-Schritt ist ausschließlich
  `prisma contract emit` (Contract-Artefakte, kein Datenbankzugriff).
- `vercel.json` setzt nur `installCommand`, `buildCommand`, `devCommand`,
  `framework` und `regions`; dort ist kein Migrationsbefehl verdrahtet.
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
