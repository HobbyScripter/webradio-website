# Phase 4.5 — Sicherheit, Cache, CI und Vercel-Readiness

**Datum:** 2026-10-24  
**Projekt:** `F:\Dev\webradio-website`  
**Status:** lokal umgesetzt und getestet; **nicht committet, nicht deployt, nicht auf GitHub Actions ausgeführt**.

Dieser Bericht unterscheidet durchgehend zwischen *implementiert*, *lokal
getestet*, *in CI vorbereitet*, *extern verifiziert* und *offen*. Er enthält
keine erfundenen Testergebnisse und keine erfundenen Zugangsdaten.

---

## 1. Zusammenfassung

Phase 4.5 hat die in Phase 4 offenen Sicherheits- und Betriebsthemen bearbeitet:

| Bereich | Ergebnis |
|---|---|
| Rate-Limiting | Dauerhaft in PostgreSQL, serverseitig für Login, Registrierung, Reset, Verifizierung und Token-Endpunkte; lokal getestet |
| Passwort-Reset | Implementiert mit Hash-only-Token, Ablauf, Einmalverwendung, Session-Widerruf und Audit-Log; E-Mail-Versand lokal über Outbox getestet, SMTP nicht extern verifiziert |
| E-Mail-Verifizierung | Implementiert mit Hash-only-Token, 24 h Gültigkeit, Einmalverwendung und Audit-Log; SMTP nicht extern verifiziert |
| Cache-Sicherheit | Öffentliche APIs und erfolgreiche Detail-/Katalogseiten sind `no-store`; zurückgezogene Inhalte verschwinden nachweislich aus API und HTML. Eine Framework-Einschränkung bei gerenderten 404-Antworten bleibt dokumentiert |
| CI | PostgreSQL-Service, Contract-Emit, Migration, `db:verify` und Integrationstests sind im Workflow verdrahtet; lokal mit einer frischen Datenbank simuliert, auf GitHub nicht ausgeführt |
| Vercel | Laufzeit-, Pooling-, Env- und Cookie-Fragen dokumentiert; **kein Deployment** und keine produktive Ressource verändert |
| Produktgrenze | `Product`-Enum mit ausschließlich `WEBRADIO`, DB-Check-Constraints, serverseitige Filter in Katalog und Proxy, Integrationstest gegen ein anderes Produkt |
| SYSTEM_ADMIN | Höchste reguläre Stufe; ausschließlich per CLI, kein HTTP-Weg, Schutz des letzten Systemadministrators, Audit-Log; lokal gegen echtes PostgreSQL getestet |
| Datenschutz/Impressum/Lizenz | Lücken und benötigte Angaben dokumentiert; keine Rechts- oder Lizenzangaben erfunden |

Am Ende dieser Phase existiert weiterhin **kein initialer ADMIN und kein
SYSTEM_ADMIN** in der Entwicklungsdatenbank, es gibt **kein E2E-Testpaket**,
und die Anwendung wurde **nicht auf Vercel bereitgestellt**. Der
SYSTEM_ADMIN-Bootstrap wurde bewusst **nicht** mit echten Zugangsdaten
automatisch ausgeführt; er ist vorbereitet und über die CLI dokumentiert.

---

## 2. Sicherheits-Baseline

Geprüft wurden vor den Änderungen insbesondere:

- Git-Status und bestehende, nicht von mir stammende Änderungen (Arbeitsbaum
  war bereits umfangreich verändert; es wurde nichts zurückgesetzt, gestasht
  oder committet),
- NextAuth-Konfiguration (`src/lib/auth.ts`), Session-Erzeugung und
  -Widerruf (`src/lib/auth-service.ts`), serverseitige Autorisierung
  (`src/lib/server-auth.ts`),
- Registrierungs- und Login-Routen, Same-Origin-Prüfung,
  Passwort-Hashing (bcrypt, Kostenfaktor 12),
- öffentliche API-Routen und ihre Cache-Header,
- Prisma-Contract, Migrationsstand, `db:verify`,
- `.gitignore` (`.env`, `.local-db/`),
- bestehende Tests und Sicherheitsdokumentation.

Die vorhandene Architektur wurde beibehalten: NextAuth-JWT dient nur als
Transport; die autoritative Session ist die Zeile in `Session`. Rollen werden
bei jedem geschützten Zugriff aus PostgreSQL gelesen. Es wurde kein zweites,
unabhängiges Session-System eingeführt.

---

## 3. Rate-Limiting

### Implementierung

- Modell `RateLimitBucket` (Migration `20261024T1651_phase45_auth_security`).
- Schlüssel: SHA-256 aus `scope + normalisiertem Identifier + Fensterstart`.
  E-Mail-Adressen und IP-Adressen werden **nicht im Klartext** gespeichert.
- Atomarer Zähler über ein einzelnes
  `INSERT … ON CONFLICT DO UPDATE … RETURNING count`; kein Read-then-Write.
- Feste Fenster; abgelaufene Buckets können mit
  `cleanupExpiredRateLimits()` entfernt werden.

| Scope | Limit | Fenster |
|---|---|---|
| `loginIp` | 20 | 15 min |
| `loginAccount` | 8 | 15 min |
| `registerIp` | 5 | 60 min |
| `registerAccount` | 3 | 60 min |
| `passwordResetRequestIp` | 10 | 15 min |
| `passwordResetRequestAccount` | 3 | 15 min |
| `authTokenIp` | 20 | 15 min |
| `emailVerificationResend` | 3 | 15 min |

### HTTP-Verhalten

- Überschreitung → HTTP `429` mit generischer Meldung,
  `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`,
  `RateLimit-Reset`; `Cache-Control: no-store`.
- Keine Auskunft darüber, ob ein Konto existiert.
- IP-basierte Buckets nur bei vertrauenswürdigem Proxy
  (`VERCEL=1` oder `TRUST_PROXY=1`). Ohne diese Konfiguration wird
  `x-forwarded-for` **nicht** verwendet; es greifen weiterhin die
  kontobezogenen Limits.
- Ein Datenbankfehler des Limiters führt bewusst zu *fail open*; die
  Authentifizierung selbst benötigt ohnehin PostgreSQL. Der Fehler wird ohne
  Identifier geloggt.

### Grenzen

- Die Aufräumfunktion ist **nicht** als Cron/Job eingeplant. Die Korrektheit
  hängt nicht davon ab, aber die Tabelle wächst pro Fenster und Identifier.
- Ein verteilter Angriff über sehr viele unterschiedliche Konten wird nur
  durch die IP-Limits gebremst, sofern ein vertrauenswürdiger Proxy
  konfiguriert ist. Ein CDN/WAF-Limit bleibt für einen öffentlichen Start
  empfehlenswert.

### Tests

- `src/lib/__tests__/auth-rate-limit.test.ts` (Unit, inkl. Body-Erhalt für
  NextAuth, IP-/Konto-Buckets, 429-Weitergabe).
- `src/lib/__tests__/db.integration.test.ts` §9 (echtes PostgreSQL):
  exaktes Limit, atomare Parallelität, neues Fenster, Hash-only-Schlüssel,
  Ablaufbereinigung.
- `src/app/api/__tests__/auth-security-routes.test.ts` (HTTP-Verhalten der
  Auth-Endpunkte).

---

## 4. Passwort-Reset

### Implementierung

- `POST /api/auth/password-reset/request` und
  `POST /api/auth/password-reset/confirm`.
- Antwort auf die Anfrage ist **immer** identisch, unabhängig davon, ob das
  Konto existiert; die Antwort enthält kein Token.
- Token: 32 Byte aus `crypto.randomBytes`, base64url (43 Zeichen).
- Datenbank speichert nur den SHA-256-Hash (`AuthToken.tokenHash`).
- Gültigkeit: **60 Minuten**; vorherige unbenutzte Reset-Tokens werden
  invalidiert.
- Verbrauch ist transaktional und sperrt die Token-Zeile (`FOR UPDATE`).
  Passwort-Hash-Ersetzung, Token-Entwertung, Löschung **aller** DB-Sessions
  und Audit-Log (`PASSWORD_RESET_COMPLETED`) erfolgen in einer Transaktion.
- Einmalige Verwendung: ein zweiter Versuch mit demselben Token schlägt fehl.
- Neues Passwort wird mit dem bestehenden bcrypt-Verfahren (Kostenfaktor 12)
  gehasht.
- Rate-Limits für Anfrage und Token-Endpunkt.
- Keine Tokens, Passwörter oder Hashes in Antworten oder Logs.

### E-Mail-Abhängigkeit

- SMTP über die vorhandenen `EMAIL_SERVER_*`-Variablen (Nodemailer). Es wurde
  kein neuer Anbieter und kein Zugangsdatum erfunden.
- Ohne SMTP schreibt Development/Test die Nachricht nach
  `.local-db/outbox/` (git-ignoriert, Dateimodus 0600). Der Token wird **nicht**
  geloggt.
- In Produktion ohne SMTP bleibt die API-Antwort generisch, es wird aber keine
  Mail zugestellt. Das ist eine offene Konfigurationsaufgabe, kein getesteter
  Versand.

### Tests

- Integration: unbekannte Adresse erzeugt kein Token; Hash-only-Speicherung;
  genau eine erfolgreiche Verwendung; abgelaufenes Token wird abgelehnt;
  Session-Widerruf; Audit-Eintrag.
- Unit/HTTP: generische Antwort, Same-Origin-Schutz (fremde Origin → 403),
  Validierung, Rate-Limit.

---

## 5. E-Mail-Verifizierung

### Implementierung

- `GET/POST /api/auth/verify-email` und
  `POST /api/auth/verify-email/resend` (nur mit gültiger Session).
- Token: 32 Byte CSPRNG, nur als SHA-256-Hash gespeichert.
- Gültigkeit: **24 Stunden**; Einmalverwendung; ältere unbenutzte
  Verifizierungstokens werden invalidiert.
- Transaktion setzt `usedAt`, `User.emailVerified` und schreibt
  `EMAIL_VERIFIED` ins Audit-Log.
- Resend ist rate-limitiert (3 pro 15 Minuten) und funktioniert nur für
  unbestätigte Konten.
- Privilegierte Rollen (`DEVELOPER`, `ADMIN`) werden nur an Konten mit
  bestätigter E-Mail-Adresse vergeben (`changeUserRole`). Die Registrierung
  selbst kann keine Rolle setzen.
- Bestehende Funktionen werden nicht allein wegen einer unbestätigten Adresse
  gesperrt; die Einschränkung gilt gezielt für privilegierte Rollen und
  administrative Aktionen.

### Grenzen

- SMTP ist nicht konfiguriert; die Zustellung wurde nur über die lokale
  Outbox verifiziert.
- Es gibt keine periodische Löschung abgelaufener `AuthToken`-Zeilen.

---

## 6. Cache-Analyse und Verhalten nach Veröffentlichungsentzug

### Umgesetzte Strategie

- `src/lib/public-api.ts`: `PUBLIC_CACHE_CONTROL = 'no-store'` für alle
  öffentlichen APIs und Fehlerantworten.
- Erfolgreiche Katalog- und Detailseiten lesen PostgreSQL pro Request und
  liefern `Cache-Control: private, no-cache, no-store, max-age=0,
  must-revalidate`.
- Der Proxy prüft Detail-Slugs vor dem Rendern und rewrite't unbekannte oder
  zurückgezogene Einträge auf `/404` mit Status `404`; ein Datenbankausfall
  wird **nicht** zu einem 404.
- Produktfilter (`WEBRADIO`) gilt auch im Proxy.

### Nachgewiesenes Verhalten (lokaler Produktionsserver, `next start`)

Mit einem temporären, ausschließlich lokalen Fixture (danach vollständig
entfernt) wurde folgender Ablauf geprüft:

1. Freigegebenes Plugin (`APPROVED`, `isPublished=true`, `product=WEBRADIO`)
   ist über `/plugins/<slug>` sichtbar (HTTP 200) und erscheint in
   `/api/plugins`.
2. Nach `isPublished=false` + `status=REJECTED`:
   - Detailseite → HTTP `404`, der alte Inhalt ist **nicht** mehr im HTML,
   - `/api/plugins?q=…` → `{"data":[],…}`,
   - Katalogseite → kein Treffer.
3. Header der erfolgreichen Detailseite:
   `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`.
4. Header der öffentlichen APIs: `Cache-Control: no-store`.

Damit ist die zentrale Anforderung erfüllt: **zurückgezogene Inhalte werden
nicht aus einem Shared Cache weiter ausgeliefert.**

### Bekannte Framework-Einschränkung bei 404

Next.js 16.4.3 setzt auf die **gerenderte 404-Antwort** des Proxy-Rewrites
weiterhin `Cache-Control: s-maxage=31536000`, obwohl der Proxy `no-store`
setzt. Geprüft und ausgeschlossen wurden:

- `connection()` und `headers()` in der 404-Route,
- `instant = false`,
- `headers()` in `next.config.ts` für Detail- und 404-Pfade,
- Rewrite auf einen nicht existierenden Pfad,
- `CDN-Cache-Control`/`Vercel-CDN-Cache-Control` im Proxy,
- `vercel.json`-Header (laut Vercel-Doku haben Funktions-Header Vorrang).

**Auswirkung:** Es wird kein zurückgezogener Inhalt ausgeliefert — die
200-Antwort und die API sind `no-store`. Es kann aber eine *negative*
404-Antwort für einen zunächst unbekannten Slug im CDN liegen bleiben und eine
spätere Veröffentlichung überlagern.

> **Nachtrag Phase 4.6:** Der in diesem Abschnitt beschriebene Rewrite wurde
> entfernt. Unbekannte Detail-Slugs beantwortet der Proxy jetzt direkt mit
> einer `no-store`-Antwort inklusive `CDN-Cache-Control` und
> `Vercel-CDN-Cache-Control`; es wird keine gerenderte 404-Seite mehr
> verwendet. Siehe [`PHASE4_6_REPORT.md`](PHASE4_6_REPORT.md).

---

## 7. CI-Workflow und Integrationstests

`.github/workflows/ci.yml` enthält jetzt zusätzlich zum bestehenden
Lint-/Type-/Unit-/Build-Job einen Job **Integration (PostgreSQL)**:

- Service-Container `postgres:18.4-alpine` mit Healthcheck,
- ausschließlich die Wegwerf-Datenbank `webradio_ci_test`,
- `DATABASE_URL` und `TEST_DATABASE_URL` zeigen auf diese Datenbank,
- `npm ci` → `prisma skills sync` → `prisma contract emit` →
  `npm run db:migrate` → `npm run db:verify` →
  `npm run test:integration`,
- keine produktiven Zugangsdaten, keine Verbindung zur lokalen
  Entwicklungsdatenbank.

### Lokale Simulation (tatsächlich ausgeführt)

Auf einer **neu erzeugten, leeren** PostgreSQL-Datenbank
`webradio_phase45_<timestamp>_test` wurden alle drei Migrationen angewendet:

| Migration | Ops | Ergebnis |
|---|---|---|
| `20261024T1407_init_schema` | 75 | angewendet |
| `20261024T1651_phase45_auth_security` | 8 | angewendet |
| `20261024T1700_phase45_product_scope_v2` | 9 | angewendet |

Nach der SYSTEM_ADMIN-Erweiterung wurde dieselbe Prüfung auf einer weiteren
**neu erzeugten, leeren** Datenbank `webradio_sysadmin_fresh_<timestamp>_test`
wiederholt, diesmal mit der vollständigen Kette:

| Migration | Ops | Ergebnis |
|---|---|---|
| `20261024T1407_init_schema` | 75 | angewendet |
| `20261024T1651_phase45_auth_security` | 8 | angewendet |
| `20261024T1700_phase45_product_scope_v2` | 9 | angewendet |
| `20261024T1815_system_admin_role` | 2 | angewendet |

`prisma db verify` meldete danach:

```
✔ Database marker and schema match contract
storageHash: 2eaf80b7361587d3661b4d4e4f329dc8ce6242623010563378fe4871023dacab
profileHash: 3916f444a8a17ad749191acf9e08dad97d1a327b88c2f1d45d12f240296aa8b2
```

Gegen genau diese frische Datenbank liefen anschließend **alle 54**
Integrationstests erfolgreich (1 Suite, 0 Fehler). Danach wurde die
Wegwerf-Datenbank gezielt gelöscht. Die Entwicklungsdatenbank `webradio_dev`
und die Testdatenbank wurden dabei nicht verändert; auf beide wurde die neue
Migration zuvor separat und nicht destruktiv angewendet.

Wichtig für den Workflow: `prisma db migrate` setzt den Live-Marker, aber
nicht den `db`-Ref in `migrations/app/refs/db.json`. Der Ref wurde deshalb
nach dem Anwenden explizit auf die neue Spitze
`2eaf80b7361587d3661b4d4e4f329dc8ce6242623010563378fe4871023dacab` gesetzt;
sonst würde der nächste `migration plan` wieder von `4f1f3b3` ausgehen und die
Constraint-Änderung doppelt planen. `npm run db:status` meldet danach
„Up to date“.

### Nicht verifiziert

- Der Workflow wurde **nicht auf GitHub Actions** ausgeführt (kein Push, kein
  Remote-Lauf). Die YAML-Struktur und die lokale Datenbankkette wurden
  geprüft, der gehostete Lauf bleibt offen.
- `npm audit --audit-level=critical` wurde ausgeführt (Exit 0), meldet aber
  15 bekannte Findings ohne Critical (siehe §13, Punkt 11).

---

## 8. Vercel-Readiness

Details stehen in [`DEPLOYMENT.md`](DEPLOYMENT.md). Kernbefunde:

| Thema | Status |
|---|---|
| Next.js 16.4.3 / Node 22+ | Build lokal erfolgreich; Vercel-Unterstützung für exakt 16.4 nicht offiziell bestätigt, muss im Preview geprüft werden |
| Prisma 8 RC | Contract-basiert, kein `migrate deploy`; Migration muss als kontrollierter Deploy-Schritt laufen |
| PostgreSQL-Pooling | Modulweiter Client pro Instanz; `attachDatabasePool` aus `@vercel/functions` **nicht** installiert/verdrahtet; externer Pooler empfohlen |
| Env-Trennung | Development/Preview/Production getrennt dokumentiert; keine Werte im Repository |
| `NEXTAUTH_URL` | Muss je Environment die tatsächliche HTTPS-Origin sein; steuert Cookies und E-Mail-Links |
| Cookies | `HttpOnly`, `SameSite=Lax`, `Secure` + `__Secure-` bei HTTPS |
| Cache | APIs/Seiten `no-store`; 404-Einschränkung siehe §6 |
| Deployment | **Nicht ausgeführt**; keine produktiven Ressourcen verändert |

Die lokale Datenbank auf `127.0.0.1:5433` ist ausdrücklich **keine**
Produktionsdatenbank. `vercel.json` enthält nur Build-/Framework-Konfiguration
und keine Secrets.

---

## 9. Verbindliche WebRadio-Produktgrenze

Die Plattform ist strukturell auf das WebRadio-Desktop-Programm beschränkt:

- Neues Enum `Product` mit genau einem Wert `WEBRADIO`.
- `Plugin`, `Theme` und `Release` besitzen `product` (Default `WEBRADIO`,
  NOT NULL).
- Migration `20261024T1700_phase45_product_scope_v2` ist rein additiv:
  Spalten, Check-Constraints und Indizes; keine Datenlöschung.
- Öffentliche Abfragen in `src/lib/catalog.ts` filtern auf
  `product = WEBRADIO`; der Proxy prüft denselben Wert.
- Validierung und UI kennzeichnen Inhalte als ausschließlich für WebRadio.
- Ein Integrationstest versucht, ein Plugin mit `product='OTHER'` anzulegen;
  die Datenbank lehnt das über die Check-Constraint ab.
- Releases werden ebenfalls auf `WEBRADIO` gefiltert.

Damit ist die Grenze nicht nur Text oder ein clientseitiger Filter, sondern
serverseitig und auf Datenbankebene abgesichert. Ein weiteres Produkt würde
eine bewusste Contract-/Migrationsänderung erfordern.

---

## 9.1 SYSTEM_ADMIN als höchste reguläre Stufe

### Modell und Hierarchie

- `Role` im Contract enthält jetzt `USER`, `DEVELOPER`, `ADMIN` und
  `SYSTEM_ADMIN`. Die Datenbank-Check-Constraint wurde in der Migration
  `20261024T1815_system_admin_role` rein erweiternd ersetzt (alte Constraint
  gelöscht, neue mit vier Werten hinzugefügt; keine Datenänderung).
- `ROLE_RANK` in `src/lib/auth-service.ts` ist die einzige Hierarchiequelle:
  `USER=0`, `DEVELOPER=1`, `ADMIN=2`, `SYSTEM_ADMIN=3`. Damit erfüllt
  `SYSTEM_ADMIN` jede bestehende ADMIN-Prüfung, ohne dass Admin-Routen
  umgeschrieben werden mussten.
- `roleSchema` liest alle vier Werte; `assignableRoleSchema` enthält bewusst
  nur `USER`, `DEVELOPER`, `ADMIN`.

### Kein HTTP-Weg zur höchsten Rolle

- `registerSchema` entfernt jede vom Client gesendete Rollenangabe;
  `registerUser` legt Konten immer als `USER` an.
- `POST /api/admin/users/role` validiert gegen `assignableRoleSchema`; ein
  Body mit `role: "SYSTEM_ADMIN"` endet mit HTTP 400, bevor eine Datenbank-
  oder Rollenoperation stattfindet.
- Ein normaler Administrator kann ein SYSTEM_ADMIN-Konto weder herabstufen
  noch dessen Rolle ändern (`changeUserRole` prüft die Rolle des Akteurs aus
  der Datenbank). Es existiert kein Lösch-Endpunkt.
- UI und Login-Weiterleitung behandeln `SYSTEM_ADMIN` wie einen
  Administrator; die Admin-Seite liest die Rolle weiterhin aus der
  Datenbank-Session, nicht aus dem JWT-Claim.

### Bootstrap und Recovery (CLI)

`src/lib/system-admin.ts` und `scripts/system-admin-bootstrap.mts`:

- **Create** (`npm run system-admin:bootstrap`): legt ein neues Konto mit
  operatorgewähltem Passwort (mindestens 16 Zeichen, bcrypt Kosten 12) direkt
  als SYSTEM_ADMIN an. Verweigert, sobald irgendein SYSTEM_ADMIN existiert.
- **Promote** (gleicher Befehl mit `SYSTEM_ADMIN_TARGET_ID` und
  `SYSTEM_ADMIN_TARGET_EMAIL`): befördert ein bestehendes Konto nur, wenn
  User-ID und E-Mail-Adresse übereinstimmen und die Adresse bereits bestätigt
  ist. Verweigert ebenfalls, sobald ein SYSTEM_ADMIN existiert.
- **Recovery** (`npm run system-admin:recover`): verlangt
  `SYSTEM_ADMIN_RECOVERY=1` **und** die Bestätigungsphrase
  `RECOVER_SYSTEM_ADMIN_CONTROL`. Fügt ausschließlich ein weiteres,
  verifiziertes Konto als SYSTEM_ADMIN hinzu; stuft niemanden herab und
  löscht niemanden. Damit kann ein gesperrter Betreiber die Kontrolle
  wiedererlangen, ohne den bestehenden Zugang zu entfernen.
- Beide Wege verlangen zusätzlich eine explizite Bestätigungsphrase
  (`BOOTSTRAP_SYSTEM_ADMIN`) und laufen nur mit Shell- und Datenbankzugriff.
  Es gibt kein festes Passwort, kein Secret im Repository und keinen
  HTTP-Endpunkt.
- Jeder erfolgreiche Vorgang schreibt `SYSTEM_ADMIN_BOOTSTRAPPED` bzw.
  `SYSTEM_ADMIN_RECOVERED` mit Methode und vorheriger Rolle ins Audit-Log —
  ohne Passwort, Hash oder Token.

### Nebenläufigkeit und Schutz des letzten Systemadministrators

- Jede Rollenänderung und jeder Bootstrap/Recovery-Vorgang sperrt zuerst alle
  ADMIN- und SYSTEM_ADMIN-Zeilen mit `FOR NO KEY UPDATE`. Damit sind
  Rollenänderungen serialisiert.
- Zusätzlich serialisiert ein transaktionsgebundener Advisory Lock
  (`pg_advisory_xact_lock`) die Bootstrap-Vorgänge. Das schließt den Fall ab,
  dass zwei gleichzeitige Bootstraps auf einer Datenbank **ohne** privilegierte
  Zeilen starten und beide ein SYSTEM_ADMIN-Konto anlegen würden.
- Die Zählung des letzten SYSTEM_ADMIN erfolgt innerhalb derselben
  Transaktion wie die Änderung. Ein einzelner SYSTEM_ADMIN kann sich nicht
  selbst herabstufen; zwei Systemadministratoren können sich auch bei
  parallelen, reziproken Anfragen nicht gegenseitig entfernen.
- Die Prüfung und das Audit-Log werden in derselben Transaktion geschrieben.

### Grenzen

- Es wurde **kein** SYSTEM_ADMIN in der Entwicklungsdatenbank angelegt; der
  Betreiber muss den Befehl bewusst selbst ausführen.
- Die Identitätsprüfung stützt sich auf Shell-/Datenbankzugriff und (beim
  Befördern) auf eine bestätigte E-Mail-Adresse. Wer bereits Datenbank-Admin
  ist, kann die Rolle ohnehin per SQL setzen; der CLI-Weg ist der auditierte,
  dokumentierte und reproduzierbare Weg.
- Es gibt weiterhin keinen Lösch-Endpunkt für Konten. Sollte einer entstehen,
  muss er dieselbe SYSTEM_ADMIN-Schutzprüfung erhalten.
- Ein Recovery für ein Konto ohne bestätigte E-Mail-Adresse ist nicht möglich;
  der Betreiber muss dann über die normale Registrierung und den
  E-Mail-Verifizierungslink ein verifiziertes Konto schaffen. Ohne SMTP ist
  dieser Schritt in Produktion nicht möglich.

---

## 10. Datenschutz, Impressum und Lizenz

Siehe [`LEGAL_LAUNCH_CHECKLIST.md`](LEGAL_LAUNCH_CHECKLIST.md). Kurzfassung:

- Es gibt **keine** Datenschutzerklärung und **kein** Impressum; der Footer
  kennzeichnet beides als noch nicht veröffentlicht und verlinkt keine leeren
  Seiten.
- Benötigt werden u. a. Anbietername/-anschrift, Kontakt, Hosting-/DB-/SMTP-
  Anbieter, Aufbewahrungsfristen, Rechtsgrundlagen und AV-Verträge.
- Es gibt **keine** `LICENSE`-Datei und keine bestätigte Projektlizenz.
  `package.json` ist `"private": true`. Die Aussage „Open Source“ auf der
  Website ist derzeit nicht durch eine Lizenz belegt.
- Lizenzen der direkten Abhängigkeiten wurden aus den installierten
  `package.json`-Dateien gelesen (MIT/Apache-2.0/ISC/BSD-3-Clause/MIT-0);
  ein vollständiger Lizenz-Scan der transitiven Abhängigkeiten fehlt.
- Es wurden keine Anschriften, Namen, Rechtsgrundlagen oder
  Lizenzzuordnungen erfunden.

---

## 11. Neu erstellte und geänderte Dateien (Auswahl)

### Neu

- `src/lib/rate-limit.ts`, `src/lib/rate-limit-http.ts`,
  `src/lib/auth-rate-limit.ts`
- `src/lib/auth-tokens.ts`, `src/lib/account-service.ts`, `src/lib/email.ts`
- `src/lib/product.ts`
- `src/lib/system-admin.ts` (SYSTEM_ADMIN-Bootstrap/Recovery, Audit, Sperren)
- `scripts/system-admin-bootstrap.mts`
- `src/app/api/auth/password-reset/request/route.ts`,
  `src/app/api/auth/password-reset/confirm/route.ts`
- `src/app/api/auth/verify-email/route.ts`,
  `src/app/api/auth/verify-email/resend/route.ts`
- `src/app/(auth)/auth/forgot-password/page.tsx`,
  `src/app/(auth)/auth/reset-password/page.tsx`,
  `src/app/(auth)/auth/verify-email/page.tsx`
- `src/app/api/__tests__/auth-security-routes.test.ts`
- `src/lib/__tests__/auth-rate-limit.test.ts`,
  `src/lib/__tests__/email.test.ts`
- `migrations/app/20261024T1651_phase45_auth_security/`,
  `migrations/app/20261024T1700_phase45_product_scope_v2/`,
  `migrations/app/20261024T1815_system_admin_role/` und zugehörige
  Snapshots
- `docs/DEPLOYMENT.md`, `docs/LEGAL_LAUNCH_CHECKLIST.md`,
  `docs/PHASE4_5_REPORT.md`

### Geändert

- `prisma/contract.prisma` (+ generierte `contract.json`/`contract.d.ts`):
  `AuthToken`, `RateLimitBucket`, `Product`, `product`-Spalten,
  `Role.SYSTEM_ADMIN`
- `src/lib/auth.ts`, `src/lib/auth-service.ts` (Rollenrang, Schutz des letzten
  Systemadministrators), `src/lib/db.ts`,
  `src/lib/server-auth.ts`, `src/lib/validations.ts`
  (`roleSchema`/`assignableRoleSchema`),
  `src/lib/api-response.ts`, `src/lib/public-api.ts`, `src/lib/catalog.ts`
- `src/proxy.ts` (Produktfilter, 404-Verhalten)
- `src/app/api/auth/register/route.ts`,
  `src/app/api/auth/[...nextauth]/route.ts`,
  `src/app/api/admin/users/role/route.ts`
- Auth-Seiten (u. a. Login-Weiterleitung für `SYSTEM_ADMIN`), Admin-Seite,
  öffentliche Kataloge/Detailseiten/404-Seite
- `package.json` (`system-admin:bootstrap`, `system-admin:recover`),
  `.env.example`
- `.github/workflows/ci.yml`, `.env.example`, `vercel.json`, `README.md`,
  `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`,
  `docs/env.example`, `scripts/bootstrap-admin.mts`
- `src/lib/__tests__/db.integration.test.ts` (neuer Abschnitt 5b für
  SYSTEM_ADMIN-Bootstrap, Recovery und Schutz),
  `src/app/api/__tests__/public-api-routes.test.ts`,
  `src/app/api/__tests__/auth-security-routes.test.ts` (Rollenroute),
  `src/lib/__tests__/server-auth.test.ts`,
  `src/lib/__tests__/validations.test.ts`,
  `src/lib/__tests__/auth-service.test.ts` (`@jest-environment node` und
  SYSTEM_ADMIN-Rang)

Es wurden **keine** Dateien committet, gestasht oder gepusht. Bestehende
Benutzeränderungen im Arbeitsbaum wurden nicht zurückgesetzt.

---

## 12. Tatsächlich ausgeführte Prüfungen

| Prüfung | Ergebnis |
|---|---|
| `npm test` | **12 Suites, 104 Tests — alle bestanden** |
| `npm run test:integration` | **1 Suite, 54 Tests — alle bestanden** (echtes PostgreSQL) |
| Frische Datenbank mit allen 4 Migrationen | angewendet, `db:verify` erfolgreich, anschließend 54/54 Integrationstests gegen genau diese DB, danach gelöscht |
| SYSTEM_ADMIN-CLI | Create, Promote, zweiter Bootstrap verweigert, Recovery-Phrase erzwungen, Audit-Einträge geprüft |
| SYSTEM_ADMIN-Schutz | normaler ADMIN darf nicht ändern, letzter SYSTEM_ADMIN geschützt, reziproke Paralleländerung hinterlässt genau einen SYSTEM_ADMIN |
| Zwei gleichzeitige SYSTEM_ADMIN-Bootstraps | genau ein Erfolg, ein abgelehnter Lauf, anschließend genau ein SYSTEM_ADMIN |
| SYSTEM_ADMIN-Session | Login liefert die Rolle aus der DB; Session-Validierung liefert `SYSTEM_ADMIN`; Widerruf macht sie ungültig |
| Rollenroute | `SYSTEM_ADMIN` im Body → 400; Akteur aus Session, nicht Body; fremde Origin → 403 |
| `npm run type-check` | bestanden (Exit 0) |
| `npm run lint` | bestanden (Exit 0) |
| `npm run build` | bestanden (Exit 0) |
| `npm run db:verify` (Entwicklungs-DB) | bestanden; Marker und Schema stimmen mit dem Contract überein |
| Migration auf leerer Wegwerf-DB | bestanden: 3 Migrationen, 20 Tabellen, `db:verify` erfolgreich, DB anschließend gelöscht |
| HTTP-Smoke-Test (`next start`) | APIs 200 + `no-store`; unbekannte Detail-Slugs 404; `/admin` und `/developer` 307 zum Login; Admin-/Developer-API ohne Session 401 |
| Fremde Origin | Registrierung und Reset-Anfrage → 403 |
| Generische Reset-Antwort | unbekannte Adresse → 200 mit identischer Meldung, kein Token |
| Zurückgezogener Eintrag | Detail 404 ohne alten Inhalt; API-Liste leer; Katalog ohne Treffer |
| Rollen/Produktgrenze | Integrationstests: USER/DEVELOPER erhalten keine Admin-Rechte; `product='OTHER'` wird von der DB abgelehnt |
| `npm audit --audit-level=critical` | Exit 0; gemeldet werden 15 Findings (5 moderate, 10 high, **0 critical**) |

### Bewusst nicht ausgeführt

- **GitHub-Actions-Lauf:** kein Push/Remote-Lauf.
- **Vercel-Deployment:** keine Freigabe, keine produktiven Ressourcen.
- **SMTP-Zustellung:** keine Zugangsdaten vorhanden; nur Outbox getestet.
- **E2E (Playwright/Cypress):** nicht im Projekt vorhanden.
- **Last-/Parallelitätstest über mehrere Instanzen:** nur die atomare
  DB-Parallelität des Limiters wurde getestet.

---

## 13. Verbleibende Risiken und nicht verifizierte Punkte

1. **404-Cache-Header (Next.js 16.4.3).** Gerenderte 404-Antworten konnten
   `s-maxage=31536000` erhalten. Kein zurückgezogener Inhalt wurde dadurch
   ausgeliefert, aber eine negative Antwort konnte eine spätere
   Veröffentlichung überlagern. **In Phase 4.6 behoben:** direkte,
   uncachebare 404-Antwort aus dem Proxy (siehe `PHASE4_6_REPORT.md`).
2. **Prisma 8 RC.** CLI 8.0.0-rc.27, Runtime 8.0.0-rc.20; APIs können sich
   bis GA ändern.
3. **Kein initialer ADMIN und kein SYSTEM_ADMIN.** Die CLI-Bootstraps wurden
   nicht mit echten Zugangsdaten gegen die Entwicklungsdatenbank ausgeführt;
   es existiert kein ADMIN- und kein SYSTEM_ADMIN-Konto. Der Betreiber muss
   den dokumentierten Befehl bewusst selbst ausführen.
4. **SMTP nicht konfiguriert.** Reset- und Verifizierungsmails werden
   produktiv nicht zugestellt, bis ein Anbieter konfiguriert ist.
5. **Rate-Limit-Cleanup nicht geplant.** Tabelle wächst ohne periodischen Job.
6. **Vercel nicht verifiziert.** Next.js 16.4, Prisma-RC, Pooling und
   `NEXTAUTH_URL` müssen im Preview-Deployment geprüft werden.
7. **CI nicht extern gelaufen.** Der Workflow ist vorbereitet, aber nicht auf
   GitHub Actions ausgeführt.
8. **Datenschutz, Impressum, Lizenz offen.** Ohne Anbieterangaben und
   Lizenzentscheidung kein öffentlicher Launch.
9. **Bestehende JWTs** aus der Zeit vor dem Datenbank-Sessionmodell können
   ungültig sein; betroffene Nutzer müssen sich neu anmelden.
10. **Rate-Limiting ist fail-open** bei Datenbankfehlern. Das ist bewusst,
    bedeutet aber, dass ein DB-Ausfall die Limits aussetzt.
11. **High-Findings in `npm audit`.** `nodemailer@7.0.13` ist die letzte
    7.x-Version und wird von NextAuth als optionale Peer-Abhängigkeit
    (`^7.0.7`) erwartet; ein Upgrade auf 10.x würde die Peer-Vorgabe
    verletzen. Die gemeldeten Vektoren (u. a. `envelope.size`, `raw`,
    benutzerdefinierte Header, OAuth2-TLS) werden im aktuellen Code nicht
    verwendet. Zusätzlich meldet Prisma 8 RC transitive High-Findings in
    Entwicklungsabhängigkeiten. Beides ist vor einem Produktivbetrieb erneut
    zu bewerten; `npm audit fix --force` würde Prisma auf 7.x zurückstufen und
    wurde deshalb nicht ausgeführt.

---

## 14. Empfohlene nächste Schritte

1. 404-Cache-Verhalten mit einer aktuellen Next.js-Version erneut prüfen oder
   eine CDN-Regel/Invalidierung für negative Detail-Antworten umsetzen.
2. GitHub-Actions-Workflow auf einem Branch tatsächlich ausführen und den
   PostgreSQL-Service sowie `db:migrate`/`db:verify` dort bestätigen.
3. Vercel-Preview mit eigener Datenbank, HTTPS-`NEXTAUTH_URL`, SMTP und
   gepoolter Verbindung testen; danach Production separat freigeben.
4. In der Zielumgebung zuerst den initialen ADMIN über `npm run admin:bootstrap`
   und danach den SYSTEM_ADMIN über `npm run system-admin:bootstrap` anlegen
   (jeweils mit selbst erzeugten Zugangsdaten) und die Audit-Einträge prüfen.
   Recovery nur im tatsächlichen Sperrfall und mit der expliziten Phrase
   verwenden.
5. Periodischen Cleanup für `RateLimitBucket` und abgelaufene `AuthToken`
   einplanen.
6. Datenschutz, Impressum und Projektlizenz anhand der Checkliste vervollständigen.
7. E2E-Tests für Registrierung → Verifizierung → Login → Reset ergänzen.

**Phase 4.5 ist damit lokal abgeschlossen. Phase 5 wurde nicht begonnen.**
