# Deployment & Vercel-Readiness

**Stand:** 2026-10-24  
**Status:** vorbereitet, **nicht deployt** und **nicht gegen Vercel verifiziert**.

Dieses Dokument beschreibt, was für einen späteren Vercel-Betrieb geprüft wurde.
Es ersetzt keinen Deployment-Test. Es wurden keine produktiven Ressourcen,
Datenbanken oder Zugangsdaten angelegt oder verändert.

## 1. Laufzeit und Framework

| Komponente | Befund |
|---|---|
| Next.js | 16.4.3, App Router, `cacheComponents: true` |
| Node.js | Projekt verlangt `>=22.18.0`; lokal 26.8.2, CI 22.x |
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
| `TRUST_PROXY` | leer | automatisch via `VERCEL=1` | automatisch via `VERCEL=1` | IP-Limits/Audit-IP |
| `EMAIL_FROM` | optional | Pflicht für Versand | Pflicht für Versand | Absender |
| `EMAIL_SERVER_HOST` | optional | Pflicht für Versand | Pflicht für Versand | SMTP |
| `EMAIL_SERVER_PORT` | `587` | `587`/`465` | `587`/`465` | SMTP |
| `EMAIL_SERVER_USER` | optional | meist Pflicht | meist Pflicht | SMTP |
| `EMAIL_SERVER_PASSWORD` | optional | geheim | geheim | SMTP |

`ADMIN_BOOTSTRAP_*` gehört **nicht** in Vercel. Der Bootstrap ist ein einmaliger,
lokaler CLI-Vorgang mit Datenbankzugriff.

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
ersten Request ist nicht implementiert.

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
- Bekannte Einschränkung: Next.js 16.4 setzt bei einer gerenderten `404`-
  Antwort (Proxy-Rewrite auf `/404`) `s-maxage=31536000`, obwohl der Proxy
  `no-store` setzt. Der Inhalt eines zurückgezogenen Eintrags wird dadurch
  **nicht** ausgeliefert (die 200-Antwort und die API sind `no-store`), aber
  eine negative 404-Antwort kann eine spätere Veröffentlichung überlagern.
  `vercel.json`-Header überschreiben Funktions-Header nicht; eine spätere
  Prüfung mit einer aktuellen Next.js-Version oder eine CDN-Regel ist nötig.
- Auth-, Session- und personalisierte Antworten senden ebenfalls `no-store`.
- Session-Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, in Produktion
  `Secure` und `__Secure-`-Präfix.
- Kein `Domain`-Attribut wird gesetzt; Cookies bleiben hostgebunden. Preview
  und Production teilen daher keine Cookie-Domain.

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
