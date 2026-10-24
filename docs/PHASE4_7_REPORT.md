# Phase 4.7 — Reale GitHub-Actions-CI und zwei CI-Reparaturen

**Projekt:** `F:\Dev\webradio-website`  
**Datum:** 2026-10-24  
**Branch:** `master`  
**Status:** Drei reale CI-Läufe wurden ausgewertet. Der dritte Lauf
(`40130062502`, Commit `542fd87`) ist **vollständig erfolgreich**: alle fünf
Jobs `success`, einschließlich 134 Unit-Tests, 54 PostgreSQL-Integrationstests
und Produktions-Build. Es gab kein Deployment, keinen SYSTEM_ADMIN-Bootstrap
und keine Änderung am Electron-Repository.

Dieser Bericht unterscheidet durchgehend zwischen **lokal ausgeführt**, **real
auf GitHub ausgeführt**, **lokal reproduziert, extern noch nicht bestätigt** und
**offen / benötigt Freigabe**.

---

## 1. Zusammenfassung

| Bereich | Ergebnis |
|---|---|
| Git | `master`, erfolgreicher CI-Commit `542fd87`; `origin/master` enthält den Fix |
| Workflow | `.github/workflows/ci.yml`; Trigger, Rechte und PostgreSQL-Service geprüft |
| Lauf 1 | `40125408700` für `6e5a5e3`: failure in allen fünf Jobs an `npm ci` |
| Ursache 1 | npm-10-Lockfile unvollständig (zwei fehlende Peer-Einträge) |
| Fix 1 | Lockfile mit npm 10.9.4 neu erzeugt; 8 Einträge ergänzt, 0 Versionsänderungen; gepusht als `8e0f549` |
| Lauf 2 | `40128763959` für `8e0f549`: Lint, Type Check und Build **success**; Unit Tests und Integration **failure** |
| Ursache 2 | Jest 30 kann unter Node 22 ESM-Pakete (`temporal-polyfill`, `@prisma/orm-postgres`) nicht per `require` laden |
| Fix 2 | CI auf Node 24 umgestellt, Projekt-Engine auf `>=24.11.0`; gepusht als `542fd87` |
| Lauf 3 | `40130062502` für `542fd87`: **success in allen fünf Jobs** |
| Aktueller Stand | CI ist extern bestätigt grün; keine weitere CI-Reparatur offen |
| Audit | 0 critical; 10 high / 5 moderate gesamt, davon 2 high in Production |

---

## 2. Git- und Remote-Zustand

```text
Branch:          master
CI-Commit:       542fd8716ac7d63746d82dc162963fefa84e6e22
Commit-Titel:    fix(ci): run checks on Node 24
Erfolgreicher Run: 40130062502
```

Der Lockfile-Fix (`8e0f549`) und der Node-24-Fix (`542fd87`) wurden nach
ausdrücklicher Freigabe committet und gepusht. Der erste Push enthielt den
bereits vorhandenen lokalen Commit `66edd34`; das war Bestandteil der Freigabe.

**Wichtig:** Im Arbeitsbaum existieren zusätzlich umfangreiche, nicht von dieser
Phase stammende Änderungen anderer Bearbeiter (u. a. Account-, Admin- und
Entwicklerbereiche). Sie wurden nicht verändert, nicht gestaged und nicht
gepusht. Der Clean-Test dieser Phase lief deshalb in einer separaten Kopie von
`8e0f549` plus ausschließlich den CI-Dateien, nicht im gemeinsam genutzten
Arbeitsbaum.

---

## 3. Geprüfter Workflow

Datei: `.github/workflows/ci.yml`

| Prüfpunkt | Befund |
|---|---|
| Trigger | `push` und `pull_request` für `main`, `master`, `develop` |
| Manueller Trigger | nicht vorhanden (`workflow_dispatch` fehlt) |
| Tokenrechte | `permissions: contents: read` |
| Checkout | `actions/checkout@v4`, `persist-credentials: false` |
| Node | zunächst `node-version: '22'`, jetzt auf `'24'` umgestellt |
| PostgreSQL | `postgres:18.4-alpine` mit `pg_isready`-Healthcheck |
| Datenbank | isolierte `webradio_ci_test` auf Loopback, keine produktiven Werte |
| Reihenfolge | `npm ci` → `prisma skills sync` → Contract Emit → Migration → `db:verify` → Integrationstests |
| Weitere Jobs | Lint, Type Check, Unit Tests mit `npm audit --audit-level=critical`, Build |
| Build | Platzhalter-`DATABASE_URL`, kein Zugriff auf eine Produktionsdatenbank |
| Schreibzugriffe | keine Release-, Artifact- oder Registry-Veröffentlichung |
| Timeouts | 10–15 Minuten pro Job |
| Concurrency | ältere Läufe derselben Branch/PR werden abgebrochen |

Der Workflow selbst war nicht die Ursache der Fehler. Die Node-Version war
allerdings für die installierte Jest-Version zu alt.

Warnungen der realen Läufe, die **nicht** die Ursache waren:

- `actions/checkout@v4` und `actions/setup-node@v4` werden auf Node 24
  ausgeführt; GitHub meldet die Node-20-Deprecation dieser Action-Versionen.
- `ubuntu-latest` wird laut GitHub künftig auf Ubuntu 26 migrieren.

Beide Warnungen sind nicht fatal und wurden nicht durch ungeprüfte Action-
Upgrades „behoben“.

---

## 4. Reale GitHub-Actions-Läufe

### 4.1 Lauf 1 — Lockfile

| Feld | Wert |
|---|---|
| Workflow | `CI` |
| Run-ID | `40125408700` |
| Ereignis | `push` |
| Commit | `6e5a5e3bbff292d087e6d5e6df3a9240ade30f65` |
| Ergebnis | **failure** |
| URL | <https://github.com/HobbyScripter/webradio-website/actions/runs/40125408700> |

Alle fünf Jobs scheiterten im Schritt `Install dependencies` an `npm ci`.
Kein Test-, Lint-, Type-Check- oder Build-Schritt wurde ausgeführt.

Log-Auszug:

```text
npm error code EUSAGE
npm error `npm ci` can only install packages when your package.json and
npm error package-lock.json or npm-shrinkwrap.json are in sync.
npm error Missing: @types/node@26.6.5 from lock file
npm error Missing: undici-types@8.9.0 from lock file
```

Ursache: Der Lockfile war mit npm 12 erzeugt worden. npm 10, das mit der
CI-Node-22-Version ausgeliefert wird, erwartet zwei optionale Peer-Einträge
unter `@prisma/composer`, die im Lockfile fehlten.

### 4.2 Lauf 2 — Jest und Node 22

| Feld | Wert |
|---|---|
| Run-ID | `40128763959` |
| Ereignis | `push` |
| Commit | `8e0f549ed27eea377fe65830f313f42cc8f14882` |
| Ergebnis | **failure** (3 von 5 Jobs erfolgreich) |
| URL | <https://github.com/HobbyScripter/webradio-website/actions/runs/40128763959> |

| Job | Ergebnis | Fehlgeschlagener Schritt |
|---|---|---|
| Lint | **success** | – |
| Type Check | **success** | – |
| Build | **success** | – |
| Unit Tests | failure | `Run tests` |
| Integration (PostgreSQL) | failure | `Run PostgreSQL integration tests` |

Die Installation, der Contract-Emit, die Migration, `db:verify`, Lint, Type
Check und Build funktionierten. Die Test-Suiten scheiterten beim Laden von
ESM-Paketen:

```text
● Test suite failed to run
  Must use import to load ES Module:
  .../node_modules/temporal-polyfill/index.js

● Test suite failed to run
  Must use import to load ES Module:
  .../node_modules/@prisma/orm-postgres/dist/orm-client.mjs
```

Jest 30 weist selbst auf die Lösung hin: Node 24.9+ unterstützt
`require(esm)` nativ. Unter Node 22.14 schlägt auch das Setzen von
`--experimental-require-module` fehl; das wurde lokal geprüft.

### 4.3 Lauf 3 — Node 24, erfolgreich

| Feld | Wert |
|---|---|
| Run-ID | `40130062502` |
| Ereignis | `push` |
| Commit | `542fd8716ac7d63746d82dc162963fefa84e6e22` |
| Ergebnis | **success** |
| URL | <https://github.com/HobbyScripter/webradio-website/actions/runs/40130062502> |

| Job | Ergebnis |
|---|---|
| Lint | **success** |
| Type Check | **success** |
| Unit Tests | **success** (16 Suiten, 134 Tests) |
| Integration (PostgreSQL) | **success** (54 Tests) |
| Build | **success** (38 Seiten) |

Damit ist die CI-Kette auf einem echten GitHub-Runner bestätigt. Die im
Unit-Test-Job ausgeführte `npm audit --audit-level=critical` endete trotz der
15 bekannten Findings mit Exit 0, weil keine kritischen Findings vorhanden
sind.

---

## 5. Reparaturen

### 5.1 Lockfile für npm 10

In einer isolierten Kopie wurde der Lockfile mit npm 10.9.4 neu erzeugt:

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
```

Programmatischer Vergleich der `packages`-Einträge:

```text
added:   8
removed: 0
changed: 0   (keine Versionsänderung)
```

Neu sind ausschließlich fehlende Peer-/Optional-Einträge:

- `@prisma/composer/node_modules/@types/node@26.6.5`
- `@prisma/composer/node_modules/undici-types@8.9.0`
- sechs WASI-Peer-Pakete unter
  `@tailwindcss/oxide-wasm32-wasi/node_modules/…`

npm 10 normalisierte zusätzlich Metadaten wie `dev`-Flags und `libc`.
**Keine Paketversion wurde angehoben, gesenkt oder entfernt.** `package.json`
blieb bei diesem Fix unverändert.

Validierung:

| Prüfung | Ergebnis |
|---|---|
| `npx npm@10.9.4 ci --dry-run` | Exit 0 |
| Vollständiges `npm ci` mit npm 10.9.4 in isolierter Kopie | Exit 0, 1016 Pakete |
| `npm ci --dry-run` mit lokalem npm 12 | Exit 0 |

### 5.2 Node 24 für Jest und Prisma

Der Workflow verwendet jetzt in allen fünf Jobs `node-version: '24'`. Das
Projekt-Engine-Feld wurde auf `>=24.11.0` angehoben, weil Prisma 8 für Node 24
`^24.11.0` verlangt und Jest 30 `require(esm)` erst ab Node 24.9 nativ
unterstützt. Der Lockfile-Engine-Eintrag wurde entsprechend aktualisiert.

Node 24.22.1 wurde lokal installiert und in einer separaten Kopie von
`8e0f549` plus ausschließlich den CI-Änderungen geprüft:

| Prüfung unter Node 24 | Ergebnis |
|---|---|
| `npm test` | **134/134** Tests, 16 Suiten |
| `npm run test:integration` | **54/54** Tests |
| `npm run type-check` | Exit 0 |
| `npm run lint` | Exit 0, 0 Fehler, 116 Warnungen |
| `npm run build` | Exit 0, 38 Seiten |
| `npm ci` (npm 10.9.4, isoliert) | Exit 0, 1016 Pakete |
| `npm audit --audit-level=critical` | Exit 0 |
| `npx prisma skills sync` | Exit 0 |
| `npm run prisma:contract:emit` | Exit 0 |

Die saubere Kopie war notwendig, weil parallel andere, nicht zu dieser Phase
gehörende Änderungen im Arbeitsbaum entstanden. Dadurch ist ausgeschlossen,
dass deren unfertige Komponenten das Ergebnis verfälschen.

---

## 6. Sicherheitsprüfung

### 6.1 `npm audit`

```text
Gesamt:       15 Findings
  critical:    0
  high:       10
  moderate:    5
Production:    2 high (npm audit --omit=dev)
```

**Production-Findings:**

| Paket | Version | Direkt | Befund | Fix-Situation |
|---|---|---|---|---|
| `nodemailer` | 7.0.13 | ja | mehrere SMTP-/Parser-/TLS-Advisories, u. a. CRLF-Injection und Adressparser-DoS | Fix wäre `nodemailer@10.2.1` (Major). `next-auth@4.24.15` deklariert Peer `nodemailer ^7.0.7`; Upgrade wurde deshalb **nicht** ungeprüft durchgeführt. |
| `next-auth` | 4.24.15 | ja | wird über die optionale `nodemailer`-Peer-Abhängigkeit gemeldet | Der angebotene „Fix“ `1.12.1` ist ein unsinniger Downgrade; kein Upgrade ohne separate NextAuth-Migration. |

Die übrigen 13 Findings sind **Dev-/Toolchain-Findings**, überwiegend
transitiv über `prisma@8.0.0-rc.27` (`@prisma/composer`, `@prisma/dev`,
`alchemy`, `hono`, `lodash`, `chevrotain`, `valibot`). npm bietet als einzigen
„Fix“ `prisma@7.10.1` an — einen Major-Downgrade, der die Contract-Architektur
brechen würde und daher nicht zulässig ist.

**Keine `npm audit fix --force`-Ausführung, keine pauschalen Major-Upgrades.**

### 6.2 Token- und Secret-Prüfung

- `GITHUB_TOKEN` wird ausschließlich in `src/lib/github.ts` serverseitig
  gelesen und als `Authorization`-Header verwendet.
- Es gibt keine `NEXT_PUBLIC_*`-Variable für GitHub-Tokens.
- Actions-Logs wurden nur lesend über die API abgerufen. Ein bereits in der
  Umgebung vorhandenes Token wurde dabei nicht ausgegeben oder gespeichert.
- `.env` ist nicht versioniert; `.env.example` enthält nur leere Platzhalter.
- Der Workflow verwendet ausschließlich Wegwerf-Testwerte und schreibt keine
  Artefakte oder Releases.

---

## 7. Änderungen nach Datei

| Datei | Änderung | Status |
|---|---|---|
| `package-lock.json` | npm-10-kompatibel; 8 fehlende Peer-Einträge; Engine `>=24.11.0` | gepusht |
| `.github/workflows/ci.yml` | alle fünf Jobs auf Node 24 | gepusht |
| `package.json` | `engines.node: >=24.11.0` | gepusht |
| `README.md` | CI-Historie, Node-Version | gepusht |
| `docs/DEPLOYMENT.md` | CI-Node-Version | gepusht |
| `docs/TESTING.md` | CI-Status und Node-24-Validierung | gepusht |
| `docs/PHASE4_7_REPORT.md` | dieser Bericht | gepusht |

`.github/workflows/ci.yml` wurde erst geändert, nachdem Lauf 2 den
Node-22/Jest-Fehler nachgewiesen hatte.

---

## 8. Was implementiert, getestet und extern bestätigt ist

| Status | Inhalt |
|---|---|
| **Implementiert** | npm-10-Lockfile-Fix; CI auf Node 24; Engine-Anpassung |
| **Lokal getestet** | `npm ci` mit npm 10.9.4, Type-Check, Lint, 134 Unit-Tests, 54 Integrationstests, `db:verify`, Build, Contract Emit — alles unter Node 24 |
| **Real auf GitHub ausgeführt** | Run `40125408700` (Lockfile-Failure), Run `40128763959` (Node-22/Jest-Failure) und Run `40130062502` (alle fünf Jobs success) |
| **Extern bestätigt** | CI-Lauf `40130062502` für Commit `542fd87` ist vollständig grün |
| **Offen / Freigabe nötig** | nichts für diese CI-Reparatur; Audit-Maßnahmen bleiben separat |
| **Nicht durchgeführt** | Deployment, Vercel-Test, SYSTEM_ADMIN-Bootstrap, Änderungen am Electron-Repository, Dependency-Major-Upgrades |

---

## 9. Nächste Schritte

1. CI ist für diesen Stand bestätigt; kein weiterer Push für die Reparatur
   erforderlich.
2. `nodemailer`/`next-auth` erst in einer separaten, getesteten Änderung
   adressieren. Ein Upgrade auf Nodemailer 10 ist wegen des NextAuth-4-Peers
   `^7.0.7` nicht als reine Patch-Maßnahme geeignet.
3. Optional `workflow_dispatch` ergänzen, damit künftige Läufe ohne neuen
   Commit manuell gestartet werden können.
4. Optional die Actions-Versionen prüfen, um die Node-20-Deprecation-Warnungen
   zu beseitigen; das ist kein CI-Fehler.
5. Die parallelen Account-/Admin-/Entwickleränderungen separat prüfen und
   erst nach deren Fertigstellung in die CI aufnehmen — sie waren nicht Teil
   dieses Auftrags.

---

## 10. Abnahmekriterien

| Kriterium | Status |
|---|---|
| Bestehende Änderungen nicht verloren | erfüllt; fremde Arbeitsbaumänderungen blieben unangetastet |
| Keine Änderung am Electron-Repository | erfüllt; nur lesende GitHub-API-Aufrufe |
| Keine Produktionsdatenbank verändert | erfüllt; lokale Dev-/Test-DB |
| Kein Bootstrap, kein Deployment | erfüllt |
| Keine Commits/Pushes ohne Freigabe | erfüllt; beide Fixes wurden erst nach ausdrücklicher Freigabe gepusht |
| Keine erfundenen CI-Ergebnisse | erfüllt; zwei Fehlschläge und der erfolgreiche Lauf sind mit Run-IDs belegt |
| Verständlicher Bericht mit nächsten Schritten | erfüllt |
