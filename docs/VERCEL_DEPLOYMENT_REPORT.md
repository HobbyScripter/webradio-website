# Phase 5.2 — Vercel-Deployment-Konfiguration

**Stand:** 2026-10-25
**Status:** vorbereitet — **kein Deployment**, keine Vercel-Kontoaktion, keine
Produktionsdatenbank, keine Secrets.
**Commit:** `c116952` (Branch `master`, Remote `origin` →
`github.com/HobbyScripter/webradio-website`).

---

## 1. Ausgangszustand

| Prüfpunkt | Befund vor den Änderungen |
|---|---|
| `vercel.json` | vorhanden, mit `$schema`, `buildCommand: "npm run build"`, `devCommand: "npm run dev"`, `installCommand: "npm install"`, `framework: "nextjs"`, `regions: ["iad1"]` |
| `next.config.ts` | `cacheComponents: true`, `partialPrefetching: true`, Tailwind-Turbopack-Regel |
| `package.json` | `engines.node: ">=24.11.0"`; `prebuild` = `prisma contract emit`; `build` = `next build` |
| Lockfile | `package-lock.json` vorhanden (621 kB) und versioniert |
| `.env.example` | vollständige Vorlage mit Platzhaltern, keine echten Werte |
| `src/lib/env.ts` | deklariert Pflichtvariablen, `validateEnv()` wird jedoch **nirgends aufgerufen** |
| `src/lib/auth.ts` | prüft in Produktion `NEXTAUTH_SECRET` und eine HTTPS-`NEXTAUTH_URL` beim Modulimport |
| `src/lib/db.ts` | fiel bei fehlender `DATABASE_URL` **still** auf `postgresql://placeholder:placeholder@localhost:5432/…` zurück — auch zur Laufzeit |
| `.github/workflows/ci.yml` | 5 Jobs (Lint, Type-Check, Unit, Integration mit PostgreSQL-Service, Build), `permissions: contents: read` |
| Git-Arbeitsbaum | 5 **fremde**, noch nicht committete Änderungen (A11y-/Rollenarbeit), die unangetastet blieben |

Relevante Vercel-Doku-Befunde (recherchiert, mit Quelle):

- Vercel nutzt bei vorhandenem `package-lock.json` standardmäßig **`npm install`**
  (<https://vercel.com/docs/package-managers>).
- Vercel verwendet das `build`-Script aus `package.json`, wenn es existiert;
  nur ohne Script fällt es auf `next build` zurück
  (<https://vercel.com/docs/builds/configure-a-build>).
- Vercel wertet `engines.node` aus; verfügbar sind die Majors **22.x und 24.x**
  (<https://vercel.com/docs/functions/runtimes/node-js/node-js-versions>).
- Eine ausdrückliche Bestätigung für **Next.js 16.4** ist der geprüften
  Vercel-Dokumentation nicht zu entnehmen.

---

## 2. Vorgenommene Änderungen

| Datei | Änderung | Zweck |
|---|---|---|
| `vercel.json` | auf `$schema`, `framework: "nextjs"`, `installCommand: "npm ci"` reduziert | reproduzierbare Installation; `buildCommand`/`devCommand`/`regions` entfernt (siehe §3) |
| `src/lib/db.ts` | Build-Phase wird von der Laufzeit getrennt; fehlende `DATABASE_URL` bricht in Produktion mit klarer Meldung ab | verhindert stillen Verbindungsversuch auf einen lokalen Platzhalter |
| `docs/DEPLOYMENT.md` | Env-Matrix mit Zweck/Build/Runtime/Umgebungen/Geheim-Status/Format; `vercel.json`-Begründung; Node-Version; Build-ohne-DB-Nachweis | Betreiber-Dokumentation |
| `docs/VERCEL_DEPLOYMENT_REPORT.md` | neu (dieses Dokument) | Nachweis und offene Punkte |

`package.json` und `package-lock.json` wurden **nicht** verändert (`git status`
zeigt beide als unverändert).

### 2.1 `src/lib/db.ts` im Detail

```ts
const hasDatabaseUrl = Boolean(rawUrl && rawUrl.trim() !== '');
const isBuildPhase = process.env['NEXT_PHASE'] === 'phase-production-build';

if (!hasDatabaseUrl && process.env['NODE_ENV'] === 'production' && !isBuildPhase) {
  throw new Error('DATABASE_URL must be set at runtime in production. …');
}
```

`next build` läuft mit `NODE_ENV=production`; Next setzt während des Builds
selbst `NEXT_PHASE=phase-production-build` (`node_modules/next/dist/build/index.js`).
Damit bleibt der Build ohne Datenbank möglich, während eine falsch
konfigurierte Produktionsinstanz sofort und verständlich scheitert statt mit
einer irreführenden `ECONNREFUSED 127.0.0.1:5432`-Meldung.

---

## 3. Begründung der Vercel-Einstellungen

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "npm ci"
}
```

- **`installCommand: "npm ci"`** — Vercel würde sonst `npm install` verwenden und
  das Lockfile nur als Hinweis behandeln. `npm ci` erzwingt den exakten Stand,
  ist identisch zur CI und schlägt bei einer Abweichung zwischen
  `package.json` und Lockfile laut fehl, statt sie still aufzulösen.
- **kein `buildCommand`** — Vercel führt das `build`-Script aus; damit läuft
  `prebuild` → `prisma contract emit` automatisch. Ein Override würde genau
  diesen Schritt duplizieren oder verlieren.
- **kein `devCommand`** — nur für `vercel dev` relevant; das Next.js-Preset
  liefert `next dev`.
- **keine `regions`** — der bisherige Pin `["iad1"]` (US-East) war eine
  unbelegte Produktionsannahme. Für eine deutschsprachige Website mit
  EU-Datenverarbeitung gehören Datenresidenz und Latenz zum Betreiber- und
  Rechtsentscheid (`fra1` wäre naheliegend). Der Wert wird daher bewusst im
  Vercel-Projekt gesetzt und nicht im Repository vorweggenommen.
- **keine `headers`/`redirects`/`rewrites`/`crons`** — die bestehenden
  Schutzmechanismen (404-`no-store` im Proxy, `no-store` auf öffentlichen APIs,
  Session-Cookies, Origin-Prüfung) bleiben unangetastet.
- **keine Secrets, Domains oder Datenbankwerte** in der Datei.

**Schema-Validierung:** `vercel.json` wurde gegen
<https://openapi.vercel.sh/vercel.json> geprüft (HTTP 200, 46 dokumentierte
Properties): alle verwendeten Schlüssel sind dokumentiert, `nextjs` ist ein
gültiger `framework`-Wert.

---

## 4. Erforderliche Environment Variables

Vollständige Matrix mit Zweck, Build-/Runtime-Relevanz und sicherem Format:
[`DEPLOYMENT.md` §3](DEPLOYMENT.md). Kurzfassung:

| Variable | Build | Runtime | Vercel-Umgebungen | Geheim |
|---|---|---|---|---|
| `DATABASE_URL` | optional | **zwingend** | Production + Preview (getrennt) | ja |
| `NEXTAUTH_SECRET` | **zwingend** | **zwingend** | Production + Preview (getrennt) | ja |
| `NEXTAUTH_URL` | **zwingend** | **zwingend** | Production + Preview (getrennt) | nein, aber exakt |
| `NEXT_PUBLIC_SITE_URL` | wirksam | gelesen | Production (Preview optional) | nein |
| `TRUST_PROXY` | – | gelesen | **nicht setzen** (Vercel setzt `VERCEL=1`) | nein |
| `EMAIL_FROM`, `EMAIL_SERVER_*` | – | gelesen | Production | Passwort: ja |
| `GITHUB_TOKEN` | – | gelesen | Production (optional) | ja |
| `TEST_DATABASE_URL`, `*_BOOTSTRAP_*`, `SYSTEM_ADMIN_*` | – | – | **nicht auf Vercel** | ja |

`STORAGE_*`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`
sind in `src/lib/env.ts` deklariert, werden aber von **keinem** Codepfad gelesen
— sie sollten erst gesetzt werden, wenn eine Funktion sie tatsächlich nutzt.

Sicherheitsregeln, die eingehalten wurden: keine Werte aus lokaler `.env`
übernommen, keine Secrets in versionierte Dateien, keine `NEXT_PUBLIC_`-Variable
für Geheimnisse, `.env.example` enthält ausschließlich Platzhalter.

---

## 5. Noch fehlende Domain- und Datenbankkonfiguration

- **Domain:** Es existiert keine verifizierte Produktionsdomain. `NEXTAUTH_URL`
  und optional `NEXT_PUBLIC_SITE_URL` müssen auf die tatsächliche HTTPS-Origin
  zeigen; die Anwendung leitet sie bewusst **nicht** aus dem Request-Host ab.
  Ohne diesen Wert bricht der Produktionsstart ab (`src/lib/auth.ts`).
- **Preview:** Preview-Deployments haben dynamische URLs. Ein fest
  eingetragenes `NEXTAUTH_URL` würde Preview-Cookies und Reset-Links auf die
  falsche Origin zeigen. Für Login-Tests in Preview ist daher ein **stabiler
  Preview-/Branch-Alias** nötig, dessen Origin als `NEXTAUTH_URL` gesetzt wird.
  Nicht verifiziert (kein Deployment).
- **Datenbank:** Es existiert keine Preview- oder Produktionsdatenbank. Die
  lokale Instanz auf `127.0.0.1:5433` ist ausdrücklich **keine**
  Produktionsdatenbank und wurde nirgends als Wert hinterlegt.
- **Region, Node-Version, Projektzuordnung:** offene Betreiberentscheidungen im
  Vercel-Dashboard (Region z. B. `fra1`, Node.js **24.x**).
- **Verbindungspooling:** `attachDatabasePool` aus `@vercel/functions` ist nicht
  installiert und nicht verdrahtet; für Serverless mit vielen Instanzen ist ein
  gepoolter Connection-String vorzusehen (siehe `DEPLOYMENT.md` §4).
- **Aufräumjob für Rate-Limit-Buckets:** `cleanupExpiredRateLimits()` ist
  implementiert, aber nicht als Cron eingeplant. Ein Vercel-Cron wäre eine
  bewusste `vercel.json`-Erweiterung und wurde hier nicht vorweggenommen.
- **Sicherheits-Header:** keine globale CSP/HSTS/`X-Frame-Options`-Konfiguration;
  bewusst nicht ungeprüft ergänzt.

---

## 6. Testergebnisse

Alle Befehle wurden in `F:\Dev\webradio-website` ausgeführt. Logs liegen unter
`.local-db/` (git-ignoriert).

| Prüfung | Ergebnis | Anmerkung |
|---|---|---|
| `npm ci` | **Exit 0** | sauberer Neuaufbau aus dem versionierten Lockfile; `package-lock.json` danach unverändert |
| `npm run type-check` | **Exit 0** | |
| `npm run lint` | **Exit 1** | ausschließlich wegen einer **fremden, nicht committeten** Änderung in `src/components/public/AccountDropdown.tsx` (`react-hooks/set-state-in-effect` bei 95:5, Warnung `exhaustive-deps` bei 154:6). Gegenprobe `npx eslint . --ignore-pattern "src/components/public/AccountDropdown.tsx"` → **Exit 0** |
| `npm test` | **Exit 0** | 20 Suites, **179 Tests** bestanden |
| `npm run test:integration` | **Exit 0** | 3 Suites, **82 Tests** bestanden, 22,5 s, gegen `webradio_test` |
| `npm run db:verify` | **Exit 0** | Marker + Schema passen zum Contract; `storageHash 8116d06…`, `profileHash 3916f4…` |
| `npm run build` | **Exit 0** | kompiliert in 5,2 s, 74 Seiten generiert |
| `DATABASE_URL="" npm run build` | **Exit 0** | Contract emittiert, Build ohne Datenbankvariable erfolgreich |
| `next start` **mit** konfigurierter DB | health/home/plugins **200** | Guard greift korrekt nicht |
| `next start` **ohne** `DATABASE_URL` | **500** + `DATABASE_URL must be set at runtime in production.` | neuer Guard nachgewiesen |
| `vercel.json` gegen Vercel-Schema | gültig | HTTP 200, alle Schlüssel dokumentiert |

### Umgebungsbesonderheiten (transparent dokumentiert)

1. Der erste `npm ci`-Lauf scheiterte mit `EPERM` auf
   `lightningcss.win32-x64-msvc.node`. Ursache war ein **verwaister Next.js-Dev-Server**
   aus der vorherigen Sitzung (Port 3100), der die native Binärdatei hielt.
   Nach Beenden dieser Prozessgruppe und einem vollständigen Neuaufbau von
   `node_modules` lief `npm ci` sauber durch (Exit 0).
2. Die lokale PostgreSQL-Instanz (18.4, `D:\Program Files\PostgreSQL\18\bin`,
   Data-Dir `.local-db/data`, Port 5433, nur Loopback) lief nach dem Neustart
   der Umgebung nicht und musste neu gestartet werden. Der erste Startversuch
   brach mit `0xC0000142` (DLL-Init) bzw. `could not reserve shared memory region
   … error code 487` ab; nach einem sauberen `pg_ctl stop` + Neustart
   funktionierten `db:verify` und die Integrationstests. Die Instanz wurde
   anschließend wieder gestoppt. Es handelte sich um ein Umgebungsproblem, nicht
   um einen Projektfehler.
3. `npm ci` meldet weiterhin **15 Advisories (5 moderate, 10 high)** — der
   bekannte, in Phase 4.8 analysierte Bestand (u. a. transitive
   Prisma-8-RC-Abhängigkeiten). In dieser Phase wurden **keine** Abhängigkeiten
   geändert.
4. `npm ci` blockiert 4 Installationsskripte über die `allowScripts`-Policy
   (`@parcel/watcher`, `esbuild`, `unrs-resolver`, `workerd`). Type-Check, Lint,
   Tests und Build laufen damit fehlerfrei; die CI verhält sich identisch.

---

## 7. Verbleibende Blockaden

| Blockade | Art | Nötig |
|---|---|---|
| Kein Vercel-Projekt / keine Kontoaktion | extern | Betreiber legt Projekt an, wählt **Node 24.x** und die Region |
| Keine Produktions-/Preview-Datenbank | extern | Anbieter + gepoolter Connection-String, getrennt je Umgebung |
| `NEXTAUTH_URL` für Preview unbestätigt | offen | stabiler Preview-Alias oder Branch-Domain festlegen |
| Next.js 16.4 auf Vercel nicht belegt | offen | erster Preview-Build muss das bestätigen |
| Fremde `AccountDropdown.tsx`-Änderung lässt `npm run lint` fehlschlagen | offen (fremd) | von der bearbeitenden Person beheben; nicht Teil dieser Phase |
| Keine Security-Header, kein Rate-Limit-Cron | offen | vor öffentlichem Launch |
| SMTP, Impressum, Datenschutz, Lizenz | offen | siehe `LEGAL_LAUNCH_CHECKLIST.md` |

**Was ausdrücklich nicht ausgeführt wurde:** kein `vercel`-CLI-Aufruf, kein
Deployment, kein Commit, kein Push, kein `system-admin:bootstrap`, keine
Migration gegen eine produktive Datenbank, keine Änderung an
`YourEliteSystems/WebRadio`.

---

## 8. Finaler Git-Status

```
 M docs/DEPLOYMENT.md                        (diese Phase)
 M src/lib/db.ts                             (diese Phase)
 M vercel.json                               (diese Phase)
?? docs/VERCEL_DEPLOYMENT_REPORT.md          (diese Phase, neu)

 M src/app/(developer)/developer/profile/create/page.tsx   (fremd, unangetastet)
 M src/app/(developer)/developer/profile/edit/page.tsx     (fremd, unangetastet)
 M src/app/(developer)/layout.tsx                          (fremd, unangetastet)
 M src/components/public/AccountDropdown.tsx               (fremd, unangetastet)
 M src/components/public/MobileMenu.tsx                    (fremd, unangetastet)
```

Nichts gestaged, nichts committet, nichts gepusht. Die fremden Änderungen
wurden weder verändert noch verworfen.

---

## 9. Nächste Schritte (Priorität)

1. Fremde `AccountDropdown.tsx`-Änderung fertigstellen, damit `npm run lint`
   wieder grün ist (blockiert sonst die CI).
2. Vercel-Projekt anlegen, Node **24.x** und Region festlegen, Preview- und
   Produktionsdatenbank bereitstellen; Variablen je Environment setzen.
3. Migration kontrolliert gegen die Preview-Datenbank ausführen, `db:verify`
   prüfen — niemals automatisch im Build.
4. Preview deployen und die Prüfmatrix aus `DEPLOYMENT.md` §12 abarbeiten
   (Login, Cookies, Reset-Link, 404-`no-store`, fremde Origin).
5. Erst danach Production; Security-Header, Rate-Limit-Cron und rechtliche
   Seiten vor dem öffentlichen Start nachziehen.
