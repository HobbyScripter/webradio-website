# Phase 4.6 — Produktionsvorbereitung, CI und Vercel-Readiness

**Datum:** 2026-10-24  
**Projekt:** `F:\Dev\webradio-website`  
**Status:** lokal geprüft und dokumentiert; **kein Commit, kein Push, kein
Deployment, keine produktive Datenbankänderung und kein SYSTEM_ADMIN-Bootstrap
durch diese Phase** (außerhalb der isolierten Testdatenbank). Ein bereits
vorhandener, extern per CLI angelegter SYSTEM_ADMIN in `webradio_dev` wurde
nicht verändert.

Dieser Bericht trennt durchgehend zwischen *implementiert*, *lokal getestet*,
*in CI vorbereitet*, *extern verifiziert* und *offen*. Es werden keine
Ergebnisse behauptet, die nicht tatsächlich ausgeführt wurden.

---

## 1. Zusammenfassung

| Bereich | Ergebnis |
|---|---|
| 404-Cache | Unbekannte/unveröffentlichte Detail-Slugs beantwortet der Proxy jetzt direkt mit HTTP 404 und `no-store` auf Browser-, CDN- und Vercel-Ebene. Kein Framework-404-Rewrite mehr. Lokal inklusive Veröffentlichung nach einem 404 geprüft. |
| CI | Workflow auf `master`/`main`/`develop`, `contents: read`, `persist-credentials: false`, Timeouts. Die vollständige Datenbankkette wurde lokal auf einer frischen PostgreSQL-Datenbank reproduziert; GitHub Actions selbst wurde nicht ausgeführt. |
| Vercel | Dokumentation für Env, Pooling, Migration, Rollback, Preview-Prüfmatrix, Logs und Datenschutz erweitert. **Kein Deployment** und keine Vercel-Ressource verändert. |
| Abhängigkeiten | 15 `npm audit`-Findings (0 critical, 10 high, 5 moderate) bewertet; davon nur 2 high in Produktionsabhängigkeiten. Keine `--force`-Upgrades, keine Major-Wechsel. |
| Legal/Launch | Checkliste um Cookies/Sessions, Logs, Inhalte, Lizenzen, Takedown, Sicherheitskontakt und klar markierte Textvorlagen erweitert. Keine Anbieter- oder Rechtsangaben erfunden. |
| SYSTEM_ADMIN | Bestehende Implementierung statisch und über die Integrationssuite geprüft; Phase 4.6 hat keinen Bootstrap ausgeführt. In `webradio_dev` existiert ein extern per CLI angelegter SYSTEM_ADMIN (Audit-Log), der nicht verändert wurde. |
| Qualität | Type-Check, Lint, 111 Unit-Tests, 54 PostgreSQL-Integrationstests, `db:verify` und Produktions-Build bestanden. |

---

## 2. Änderungen nach Datei

### Neu

- `src/lib/__tests__/proxy.test.ts` — Regressionstests für den uncachebaren
  404, `HEAD`, DB-Ausfall und „Veröffentlichung nach 404“.
- `docs/PHASE4_6_REPORT.md` — dieser Bericht.

### Geändert

- `src/proxy.ts` — direkte 404-HTML-Antwort mit `Cache-Control: no-store`,
  `CDN-Cache-Control: no-store`, `Vercel-CDN-Cache-Control: no-store`,
  `X-Robots-Tag` und `X-Content-Type-Options`; kein Rewrite auf `/404` mehr.
- `src/app/(public)/404/page.tsx` — Kommentar an das neue Verhalten angepasst;
  die Route bleibt für direkte `/404`-Aufrufe erhalten.
- `.github/workflows/ci.yml` — `permissions: contents: read`, Trigger inkl.
  `master`, `persist-credentials: false`, Timeouts, aktualisierte Jobnamen und
  Kommentare.
- `docs/DEPLOYMENT.md` — 404-Cache-Befund, Build-/Migrationsschutz, Rollback,
  Preview-Prüfmatrix, Health-Check/Logs/Datenschutz.
- `docs/SECURITY.md` — konkrete `npm audit`-Bewertung und
  Nodemailer-Mitigation.
- `docs/LEGAL_LAUNCH_CHECKLIST.md` — erweiterte Launch-Checkliste und
  Platzhaltervorlagen.
- `docs/TESTING.md` — Proxy-Tests, CI-Härtung und lokale Reproduktion.
- `README.md` — 404-Verhalten, CI-Trigger und Phase-4.6-Verweis.
- `docs/PHASE4_5_REPORT.md` — Nachtrag, dass der dort dokumentierte
  404-Rewrite in Phase 4.6 ersetzt wurde.

Es wurden keine Dateien gestaged oder committet. Die bereits vor dieser Phase
vorhandenen Arbeitsbaumänderungen wurden nicht zurückgesetzt.

---

## 3. Behobene Probleme und Sicherheitsauswirkungen

### 3.1 Negativer 404-Cache

**Befund:** Der bisherige Proxy rewrite'te unbekannte Detail-Slugs auf `/404`
und setzte am Rewrite `Cache-Control: no-store`. Eine gerenderte
Framework-404-Antwort kann jedoch eigene/CDN-Cache-Header tragen. In Phase 4.5
wurde `s-maxage=31536000` dokumentiert; mit dem finalen Stand von 4.5 war dieser
Header lokal auf Next.js 16.4.3 nicht mehr reproduzierbar, die Antwort enthielt
aber weiterhin `x-middleware-rewrite`/`x-nextjs-prerender`. Die Abhängigkeit
von Framework- und Provider-Cacheverhalten blieb damit unnötig.

**Lösung:** Der Proxy liefert für `/plugins/[slug]`, `/themes/[slug]` und
`/news/[slug]` bei fehlendem oder nicht freigegebenem Eintrag direkt eine
kleine, eigenständige HTML-404-Antwort. Sie wird nicht durch den App Router
gerendert und trägt explizit:

- `Cache-Control: no-store, max-age=0`
- `CDN-Cache-Control: no-store`
- `Vercel-CDN-Cache-Control: no-store`
- `X-Robots-Tag: noindex, nofollow`
- `X-Content-Type-Options: nosniff`

`HEAD` liefert dieselben Header ohne Body. Ein Datenbankausfall wird weiterhin
**nicht** zu einem 404, damit ein temporärer Fehler nicht als „nicht
vorhanden“ gespeichert wird. Unveröffentlichte Einträge werden bereits durch
die Datenbankabfrage (`isPublished`, `status`, `product`) ausgeschlossen.

**Lokaler Nachweis (HTTP, `next start`):**

1. Unveröffentlichter Plugin-Slug → HTTP 404, alle drei `no-store`-Header,
   kein `x-nextjs-prerender`, kein Slug im HTML.
2. `/api/plugins?q=…` → leere Liste.
3. Slug veröffentlicht → derselbe Slug sofort HTTP 200 mit Inhalt.
4. API → Eintrag erscheint.
5. Fixture anschließend aus der `_test`-Datenbank entfernt.

**Grenze:** Die Vercel-CDN-Semantik ist ohne Deployment nicht verifiziert. Die
expliziten Header sind die providerübergreifende Absicherung; der Preview-Test
steht in `docs/DEPLOYMENT.md`.

### 3.2 CI-Härtung

- Workflow läuft jetzt auch auf dem tatsächlichen Branch `master`.
- Token ist auf `contents: read` beschränkt; Checkout persistiert keine
  Credentials.
- Jobs haben Timeouts; der Build benötigt keine erreichbare Datenbank.
- Integrationstests verwenden ausschließlich eine Wegwerf-Datenbank auf
  Loopback mit Namen `webradio_ci_test`.

### 3.3 Abhängigkeiten

`npm audit` meldet **15 Findings: 0 critical, 10 high, 5 moderate**.
`npm audit --omit=dev` reduziert dies auf **2 high**, beide über
`nodemailer@7.0.13` (direkt und als `next-auth`-Abhängigkeit).

- Die 13 Dev-Findings stammen aus der Prisma-8-RC-Werkzeugkette
  (`@prisma/dev`, `@prisma/composer-cli`, `hono`, `lodash`, `chevrotain`,
  `valibot`). Der angebotene Fix ist ein Downgrade auf `prisma@7.10.1`, also
  ein Major-Wechsel weg vom Contract-Workflow; **nicht ausgeführt**.
- `nodemailer` 7.0.13 wird derzeit von `next-auth@4.24.15` als Peer
  `^7.0.7` erwartet. Ein Upgrade auf 10.2.1 wäre ein Major-Sprung und ist
  ohne Anpassung von NextAuth nicht sauber.
- Der Code nutzt nur `createTransport`/`sendMail` mit festen Texten und
  serverseitig erzeugten Empfängern. `raw`, `envelope.size`, benutzerdefinierte
  Header, OAuth2, DKIM, `jsonTransport`, Datei-/URL-Zugriff und
  `resolveContent` werden nicht verwendet. Das reduziert die erreichbaren
  Vektoren, beseitigt die Advisories aber nicht.

Details und die vollständige Tabelle stehen in
[`SECURITY.md`](SECURITY.md#stand-der-prüfung-phase-46).

---

## 4. Tatsächlich ausgeführte Befehle und Ergebnisse

| Befehl / Prüfung | Ergebnis |
|---|---|
| `npm run prisma:contract:emit` | bestanden; `contract.json`/`contract.d.ts` emittiert |
| `npm run type-check` | bestanden (Exit 0) |
| `npm run lint` | bestanden (Exit 0) |
| `npm test` | **13 Suites, 111 Tests — alle bestanden** |
| `npm run test:integration` | **1 Suite, 54 Tests — alle bestanden** |
| `npm run db:verify` (Entwicklungs-DB) | bestanden; Marker/Schema passen zum Contract |
| `npm run build` | bestanden (Exit 0) |
| Build mit nicht erreichbarer Platzhalter-`DATABASE_URL` | bestanden (CI-Buildform) |
| 404-HTTP-Smoke (`next start`, `_test`-DB) | 404 → 200 nach Veröffentlichung; API konsistent; Fixture entfernt |
| `npm audit` / `npm audit --omit=dev` | 15 Findings (0 critical) / 2 high (nodemailer-Pfad) |
| YAML-Validierung `ci.yml` | gültig; 5 Jobs, `contents: read`, Trigger main/master/develop |

### Bewusst nicht ausgeführt

- **GitHub-Actions-Lauf:** kein Push und kein Remote-Lauf. Der Workflow ist
  lokal mit derselben Datenbankkette reproduziert, aber nicht auf GitHub
  bestätigt.
- **`npm ci` in einer komplett frischen Umgebung:** nicht lokal ausgeführt,
  um die vorhandene Installation nicht zu ersetzen. Der Workflow verwendet
  `npm ci`; Lockfile und `package.json` sind konsistent.
- **Node.js 22 lokal:** lokal lief Node 26.8.2. Der Workflow nutzt Node 22.x,
  das die Prisma-8-Anforderung `^22.18.0` erfüllt; ein lokaler Lauf mit Node 22
  wurde nicht durchgeführt.
- **Vercel-Deployment und CDN-Prüfung:** keine Freigabe, keine Ressourcen.
- **SMTP-Zustellung:** keine Zugangsdaten; nur Outbox/Testpfad.
- **SYSTEM_ADMIN-Bootstrap durch diese Phase** außerhalb der automatisierten
  `_test`-Fixtures. (Ein externer CLI-Vorgang ist in `webradio_dev` sichtbar;
  er wurde nicht von Phase 4.6 ausgelöst und nicht verändert.)

---

## 5. Datenbank- und Integrationsteststatus

Auf einer **neu erzeugten, leeren** PostgreSQL-Datenbank
`webradio_phase46_ci_<timestamp>_test` wurden nacheinander ausgeführt:

1. `prisma contract emit`
2. `prisma db migrate` (alle vier Migrationen)
3. `prisma db verify`
4. `npm run test:integration`

Ergebnis: Contract-Emit erfolgreich, alle vier Migrationen angewendet,
`db:verify` erfolgreich (`storageHash 2eaf80b7…`), **54/54 Integrationstests
bestanden**. Die Datenbank wurde anschließend gezielt gelöscht.

| Migration | Ops |
|---|---|
| `20261024T1407_init_schema` | 75 |
| `20261024T1651_phase45_auth_security` | 8 |
| `20261024T1700_phase45_product_scope_v2` | 9 |
| `20261024T1815_system_admin_role` | 2 |

Die Entwicklungsdatenbank `webradio_dev` und die Testdatenbank
`webradio_test` wurden nicht gelöscht. Die neue Migration war bereits
angewendet; `db:verify` und `db:status` melden den aktuellen Stand. Die lokale
DB auf `127.0.0.1:5433` ist ausdrücklich **keine** Produktionsdatenbank.

---

## 6. CI-Status

**Lokal reproduziert:** Contract-Emit, Migration auf leerer DB, `db:verify`,
Integrationstests, Unit-Tests, Type-Check, Lint und Build.

**In CI vorbereitet:**

- Trigger: Push/PR auf `main`, `master`, `develop`
- `permissions: contents: read`, `persist-credentials: false`
- Node 22.x, `npm ci`, Prisma-Contract-Emit
- PostgreSQL-18.4-Service, Wegwerf-DB `webradio_ci_test`
- `db:migrate` → `db:verify` → `test:integration`
- separater Unit-Test-/Audit-Job und Build-Job
- keine produktiven URLs oder Secrets in gewöhnlichen PR-Läufen

**Extern noch unbestätigt:** Der Workflow wurde **nicht auf GitHub Actions**
ausgeführt. Ob der Service-Container, die Node-22-Version und die
Prisma-RC-CLI dort exakt gleich laufen, muss der erste Remote-Lauf zeigen.

---

## 7. Vercel-Status

**Nur vorbereitet, nicht verifiziert.** Es wurde kein Vercel-Projekt angelegt
und kein Deployment ausgeführt. `docs/DEPLOYMENT.md` beschreibt jetzt
insbesondere:

- Node-Anforderung `>=22.18.0` und Build-/Startbefehle
- getrennte Development-/Preview-/Production-Datenbanken und Secrets
- `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`,
  SMTP-Variablen (Namen und Zweck, keine Werte)
- Prisma-Contract-Emit und den separaten, freizugebenden Migrationsschritt
- ausdrücklichen Schutz: der normale Build führt keine Migration aus
- Connection Pooling (`pg`-Pool pro Instanz, noch kein
  `attachDatabasePool`), Prisma-8-RC-Grenzen
- Rollback/Wiederherstellung, Preview-Prüfmatrix, Health-Check, Logs und
  Datenschutz bei der Diagnose

**Offene technische Unsicherheiten:**

- Vercel-Unterstützung für exakt Next.js 16.4.3 ist nicht offiziell bestätigt.
- Prisma 8 RC ist nicht als Vercel-kompatibel verifiziert; die Runtime nutzt
  `pg` und den Node-Runtime-Pfad, kein Edge-Runtime.
- Die Vercel-CDN-Behandlung der neuen 404-Header ist nicht getestet.
- Ohne gepoolte Verbindung kann jede Function-Instanz eigene
  PostgreSQL-Verbindungen öffnen.
- `vercel.json` pinnt `regions: ["iad1"]` (US). Für eine deutschsprachige
  Website sind Datenresidenz und Latenz zu prüfen; `fra1` wäre eine
  Alternative. Die Region wurde nicht eigenmächtig geändert.

---

## 8. Offene Risiken und benötigte Betreiberangaben

1. **GitHub Actions extern unbestätigt** — erster Lauf auf einem Branch/PR
   steht aus.
2. **Vercel/CDN unbestätigt** — Preview-Deployment, HTTPS/`NEXTAUTH_URL`,
   Cookies, 404-Header und Verbindungsverhalten müssen dort geprüft werden.
3. **Prisma 8 RC** — APIs können sich bis GA ändern; kein eigenmächtiger
   Versionswechsel wurde vorgenommen.
4. **Nodemailer-Advisories** — 2 high im Produktionspfad; Upgrade hängt an
   NextAuth-Peer-Kompatibilität. Vor Launch neu bewerten.
5. **SMTP** — ohne Anbieter keine Zustellung von Reset-/Verifizierungsmails.
6. **Administrator-Bestand in `webradio_dev`:** Es existiert ein extern per
   CLI angelegter SYSTEM_ADMIN (`SYSTEM_ADMIN_BOOTSTRAPPED`, 20:42:52,
   `system-admin-bootstrap-cli`), der **nicht** von Phase 4.6 angelegt oder
   verändert wurde. Ein regulärer ADMIN ist nicht vorhanden. Für Preview und
   Production sind die Bootstraps weiterhin bewusst und manuell auszuführen.
7. **Rechtliche Angaben fehlen** — Anbieter, Anschrift, Hosting/DB/SMTP,
   Aufbewahrungsfristen, Projektlizenz und Lizenzbedingungen für
   Plugins/Themes. Vorlagen enthalten nur Platzhalter.
8. **Health-Check ist nur Liveness** — kein Datenbank-Readiness-Check.
9. **Rate-Limit-/Token-Cleanup** ist nicht als Cron eingeplant.
10. **Node 22** wurde lokal nicht ausgeführt; CI nutzt 22.x.
11. **Globale Browser-Sicherheitsheader fehlen** für HTML-Seiten (CSP, HSTS,
    `X-Frame-Options`, `Permissions-Policy`). API-Antworten und der direkte
    404 setzen bereits `nosniff`; eine globale CSP muss mit Next.js und HTTPS
    getestet werden und wurde deshalb nicht ungeprüft aktiviert.

---

## 9. Empfohlene nächste Schritte (Priorität)

1. Workflow auf einem Branch/PR tatsächlich auf GitHub Actions ausführen und
   den PostgreSQL-Service, Node 22 und die Prisma-RC-Kette bestätigen.
2. Preview-Deployment mit eigener Datenbank und HTTPS-`NEXTAUTH_URL` testen;
   dabei die 404-Header (inkl. `Vercel-CDN-Cache-Control`) und die
   Veröffentlichung nach einem 404 auf der echten Origin prüfen.
3. `attachDatabasePool` bzw. einen gepoolten Connection-String evaluieren und
   die Verbindungsgrenzen unter Last messen.
4. Nodemailer-/NextAuth-Abhängigkeit bewerten; SMTP-Anbieter konfigurieren und
   die Zustellung von Reset und Verifizierung testen.
5. Betreiberangaben, Datenschutz, Impressum und Projektlizenz anhand der
   erweiterten Checkliste beschließen und rechtlich prüfen lassen.
6. Initialen ADMIN und SYSTEM_ADMIN in der Zielumgebung über die
   dokumentierten CLI-Wege anlegen und die Audit-Einträge prüfen.
7. Periodischen Cleanup für `RateLimitBucket` und `AuthToken` einplanen.

**Phase 4.6 endet mit diesen lokalen Ergebnissen. Phase 5 wurde nicht
begonnen.**
