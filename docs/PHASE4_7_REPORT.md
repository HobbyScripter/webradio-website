# Phase 4.7 — Reale GitHub-Actions-CI und Lockfile-Reparatur

**Projekt:** `F:\Dev\webradio-website`  
**Datum:** 2026-10-24  
**Branch:** `master`  
**Status:** Der reale CI-Lauf wurde gefunden und ausgewertet. Die Ursache ist
lokal reproduziert und behoben; **der reparierte Stand ist noch nicht gepusht
und es gibt noch keinen grünen GitHub-Actions-Lauf**. Es wurde kein Deployment,
kein SYSTEM_ADMIN-Bootstrap und keine Änderung am Electron-Repository
durchgeführt.

Dieser Bericht unterscheidet durchgehend zwischen:

- **lokal ausgeführt**
- **real auf GitHub ausgeführt**
- **lokal reproduziert, extern noch nicht bestätigt**
- **offen / benötigt Freigabe**

---

## 1. Zusammenfassung

| Bereich | Ergebnis |
|---|---|
| Git | `master`, HEAD `66edd34` (lokal, ein Commit vor `origin/master` `6e5a5e3`), Arbeitsbaum vor der Reparatur sauber |
| Workflow | `.github/workflows/ci.yml` unverändert; identisch in `6e5a5e3` und `66edd34` |
| Realer CI-Lauf | Run `40125408700` für `6e5a5e3`: **failure**, alle fünf Jobs |
| Ursache | `npm ci` scheitert mit `EUSAGE`: Lockfile enthält für npm 10 zwei fehlende Peer-Pakete |
| Reparatur | `package-lock.json` mit npm 10.9.4 neu erzeugt; **8 Pakete ergänzt, 0 Versionsänderungen** |
| Lokale Validierung | `npm ci` mit npm 10.9.4 erfolgreich; Type-Check, Lint, 134 Unit-Tests, 54 Integrationstests, `db:verify`, Build erfolgreich |
| Audit | 0 critical; 10 high / 5 moderate gesamt, davon 2 high in Production |
| Externe Bestätigung | **offen** — neuer Push/Run ohne ausdrückliche Freigabe nicht ausgeführt |

---

## 2. Git- und Remote-Zustand

```text
Branch:          master
HEAD:            66edd346acea9965abc54f3b739f965bbe02bef0
HEAD-Titel:      Refactor code structure for improved readability and maintainability
origin/master:   6e5a5e3bbff292d087e6d5e6df3a9240ade30f65
Abstand:         HEAD ist 1 Commit vor origin/master
Remote:          https://github.com/HobbyScripter/webradio-website.git
```

Vor der Reparatur war der Arbeitsbaum sauber. Der lokale Commit `66edd34`
enthält die zuvor erarbeiteten Website-/Dokumentationsänderungen und war nicht
gepusht. Er wurde in dieser Phase nicht verändert, nicht amendiert und nicht
gepusht.

Der Workflow ist in beiden Commits byte-gleich:

```text
SHA-256 .github/workflows/ci.yml
7644b764210b0eb6a0b4fcd10d321b71638cc2cf491f7fbca4131de79db95420
```

Nach der Reparatur ist ausschließlich `package-lock.json` geändert; die
Dokumentationsdateien dieses Berichts und die aktualisierten README/TESTING-
Hinweise liegen zusätzlich als Arbeitsbaumänderungen vor.

---

## 3. Geprüfter Workflow

Datei: `.github/workflows/ci.yml`

| Prüfpunkt | Befund |
|---|---|
| Trigger | `push` und `pull_request` für `main`, `master`, `develop` |
| Manueller Trigger | **nicht vorhanden** (`workflow_dispatch` fehlt) |
| Tokenrechte | `permissions: contents: read` |
| Checkout | `actions/checkout@v4`, `persist-credentials: false` |
| Node | `actions/setup-node@v4`, `node-version: '22'`, npm-Cache |
| PostgreSQL | `postgres:18.4-alpine` mit `pg_isready`-Healthcheck |
| Datenbank | isolierte `webradio_ci_test` auf Loopback, keine produktiven Werte |
| Reihenfolge | `npm ci` → `prisma skills sync` → Contract Emit → Prisma-Migration → `db:verify` → Integrationstests |
| Weitere Jobs | Lint, Type Check, Unit Tests mit `npm audit --audit-level=critical`, Build |
| Build | Platzhalter-`DATABASE_URL`, kein Zugriff auf eine Produktionsdatenbank |
| Schreibzugriffe | keine Release-, Artifact- oder Registry-Veröffentlichung |
| Timeouts | 10–15 Minuten pro Job |
| Nebenwirkung | `concurrency` bricht ältere Läufe derselben Branch/PR ab |

Der Workflow ist inhaltlich geeignet. Die fehlenden `workflow_dispatch`-Option
ist kein Fehler, verhindert aber einen manuellen Start ohne neuen Commit/Push.

Warnungen des realen Laufs, die **nicht** die Ursache waren:

- `actions/checkout@v4` und `actions/setup-node@v4` werden auf Node 24
  ausgeführt; GitHub meldet die Node-20-Deprecation dieser Action-Versionen.
- `ubuntu-latest` wird laut GitHub künftig auf Ubuntu 26 migrieren.

Beide Warnungen sind nicht fatal und wurden nicht durch ungeprüfte Action-
Upgrades „behoben“.

---

## 4. Realer GitHub-Actions-Lauf

### 4.1 Lauf

| Feld | Wert |
|---|---|
| Workflow | `CI` |
| Run-ID | `40125408700` |
| Ereignis | `push` |
| Commit | `6e5a5e3bbff292d087e6d5e6df3a9240ade30f65` |
| Status | `completed` |
| Ergebnis | **failure** |
| Erstellt | 2026-10-24T19:27:53Z |
| URL | <https://github.com/HobbyScripter/webradio-website/actions/runs/40125408700> |

### 4.2 Jobs

| Job | Ergebnis | Fehlgeschlagener Schritt |
|---|---|---|
| Build | failure | `Install dependencies` (`npm ci`) |
| Lint | failure | `Install dependencies` (`npm ci`) |
| Unit Tests | failure | `Install dependencies` (`npm ci`) |
| Integration (PostgreSQL) | failure | `Install dependencies` (`npm ci`) |
| Type Check | failure | `Install dependencies` (`npm ci`) |

**Wichtig:** Kein Test-, Lint-, Type-Check- oder Build-Schritt wurde in diesem
Lauf ausgeführt. Die fünf Job-Ergebnisse sind keine Aussage über die
Projektqualität; sie zeigen ausschließlich den Installationsfehler.

### 4.3 Fehlerlog (Auszug)

Der Log des Type-Check-Jobs wurde über die GitHub-API gelesen:

```text
npm error code EUSAGE
npm error `npm ci` can only install packages when your package.json and
npm error package-lock.json or npm-shrinkwrap.json are in sync. Please update
npm error your lock file with `npm install` before continuing.
npm error Missing: @types/node@26.6.5 from lock file
npm error Missing: undici-types@8.9.0 from lock file
```

Alle anderen Jobs scheiterten am selben Schritt mit demselben Muster.

### 4.4 Ursache

Der Lockfile wurde lokal mit einem neueren npm (npm 12) erzeugt. npm 10, das
mit der CI-Node-22-Version ausgeliefert wird, löst die optionalen Peer-
Abhängigkeiten von `@prisma/composer` strenger auf und erwartet zwei Einträge,
die im Lockfile fehlten:

- `node_modules/@prisma/composer/node_modules/@types/node@26.6.5`
- `node_modules/@prisma/composer/node_modules/undici-types@8.9.0`

Der Fehler ist damit ein **Reproduzierbarkeitsfehler des Lockfiles**, kein
Anwendungs-, Typ- oder Testfehler. Lokal mit npm 12 war er unsichtbar; mit npm
10.9.4 ist er reproduzierbar.

---

## 5. Reparatur

### 5.1 Vorgehen

In einer isolierten Kopie unter `.local-db/ci-install` wurde der Lockfile mit
npm 10.9.4 neu erzeugt:

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
```

Der neue Lockfile wurde anschließend nach `package-lock.json` übernommen.

### 5.2 Umfang

Programmatischer Vergleich der `packages`-Einträge vor/nach der Reparatur:

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

Zusätzlich hat npm 10 Metadaten wie `dev`-Flags, `engines` und `libc` im
Lockfile normalisiert. Es wurden **keine Paketversionen angehoben, gesenkt oder
entfernt**. `package.json` blieb unverändert.

### 5.3 Validierung

| Prüfung | Ergebnis |
|---|---|
| `npx npm@10.9.4 ci --dry-run` im Projekt | **Exit 0** |
| Node 22.14 + npm 10.9.4, `ci --dry-run` | **Exit 0** |
| Vollständiges `npm ci` mit npm 10.9.4 in isolierter Kopie | **Exit 0**, 1016 Pakete |
| `npm ci --dry-run` mit lokalem npm 12 | **Exit 0** |
| `npx prisma skills sync` | Exit 0, keine Änderung |
| `npm run prisma:contract:emit` | Exit 0 |

Damit ist die Installationsstufe, an der alle fünf CI-Jobs scheiterten, lokal
mit der CI-npm-Hauptversion reproduziert und behoben.

---

## 6. Lokale Prüfkette

Alle Befehle wurden nach der Lockfile-Reparatur im Projekt ausgeführt.

| Befehl | Ergebnis |
|---|---|
| `npm run type-check` | **Exit 0**, keine Fehler |
| `npm run lint` | **Exit 0**, 0 Fehler, 116 Warnungen |
| `npm test` | **134/134** Tests, 16 Suiten, alle bestanden |
| `npm run test:integration` | **54/54** PostgreSQL-Tests, 1 Suite, alle bestanden |
| `npm run db:verify` | **Exit 0**, Marker und Schema passen zum Contract |
| `npm run build` | **Exit 0**, 38 Seiten generiert |
| `npm audit --audit-level=critical` | **Exit 0**, keine kritischen Findings |
| `npx prisma skills sync` | **Exit 0** |
| `npm run prisma:contract:emit` | **Exit 0** |

Der Build enthält weiterhin die erwarteten generischen Fehlerausgaben für die
geschützten Routen `/api/admin/audit-logs` und `/api/developer/status`, die
Next.js während der statischen Analyse ohne Session aufruft. Der Build selbst
endet erfolgreich; es werden keine Stacktraces oder Zugangsdaten ausgegeben.

---

## 7. Sicherheitsprüfung

### 7.1 `npm audit`

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
| `nodemailer` | 7.0.13 | ja | mehrere SMTP-/Parser-/TLS-Advisories, u. a. CRLF-Injection und Adressparser-DoS | Fix wäre `nodemailer@10.2.1` (Major). `next-auth@4.24.15` deklariert Peer `nodemailer ^7.0.7`; ein Upgrade wurde deshalb **nicht** ungeprüft durchgeführt. |
| `next-auth` | 4.24.15 | ja | wird über die optionale `nodemailer`-Peer-Abhängigkeit gemeldet | Der von npm angebotene „Fix“ `1.12.1` ist ein unsinniger Downgrade; kein Upgrade ohne separaten NextAuth-Migrationsentscheid. |

Die übrigen 13 Findings sind **Dev-/Toolchain-Findings**, überwiegend
transitiv über `prisma@8.0.0-rc.27` (`@prisma/composer`, `@prisma/dev`,
`alchemy`, `hono`, `lodash`, `chevrotain`, `valibot`). npm bietet als einzigen
„Fix“ `prisma@7.10.1` an — einen Major-Downgrade, der die Contract-Architektur
brechen würde und daher nicht zulässig ist.

**Keine `npm audit fix --force`-Ausführung, keine pauschalen Major-Upgrades.**

### 7.2 Token- und Secret-Prüfung

- `GITHUB_TOKEN` wird ausschließlich in `src/lib/github.ts` serverseitig
  gelesen und als `Authorization`-Header verwendet.
- Es gibt keine `NEXT_PUBLIC_*`-Variable für GitHub-Tokens.
- Beim Lesen der Actions-Logs wurde ein bereits in der Umgebung vorhandenes
  Token nur für einen **lesenden** API-Aufruf verwendet; Tokenwerte wurden
  weder ausgegeben noch gespeichert.
- `.env` ist nicht versioniert; `.env.example` enthält nur leere Platzhalter.
- Der Workflow verwendet ausschließlich Wegwerf-Testwerte und schreibt keine
  Artefakte oder Releases.

---

## 8. Änderungen nach Datei

| Datei | Änderung | Zweck |
|---|---|---|
| `package-lock.json` | mit npm 10.9.4 regeneriert; 8 fehlende Peer-Einträge, keine Versionsänderungen | `npm ci` in CI reproduzierbar machen |
| `README.md` | CI-Abschnitt nennt den realen fehlgeschlagenen Lauf und den Lockfile-Fix | keine falsche „CI noch nie gelaufen“-Aussage |
| `docs/TESTING.md` | CI-Status und offene erfolgreiche Ausführung aktualisiert | ehrlicher Teststatus |
| `docs/PHASE4_7_REPORT.md` | dieser Bericht | Nachweis und Übergabe |

`.github/workflows/ci.yml` wurde **nicht** geändert, weil der Workflow selbst
korrekt ist und der Fehler im Lockfile lag.

---

## 9. Was implementiert, getestet und extern bestätigt ist

| Status | Inhalt |
|---|---|
| **Implementiert** | Lockfile-Reparatur für npm 10; Dokumentation des realen Laufs |
| **Lokal getestet** | `npm ci` (npm 10.9.4), Type-Check, Lint, 134 Unit-Tests, 54 Integrationstests, `db:verify`, Build, Contract Emit |
| **Real auf GitHub ausgeführt** | CI-Run `40125408700` für `6e5a5e3`; Ergebnis failure, Ursache dokumentiert |
| **Extern noch nicht bestätigt** | Ein grüner CI-Lauf des reparierten Stands |
| **Offen / Freigabe nötig** | Commit und Push des Lockfile-Fixes (und ggf. der Dokumentation), damit GitHub Actions erneut läuft |
| **Nicht durchgeführt** | Deployment, Vercel-Test, SYSTEM_ADMIN-Bootstrap, Änderungen am Electron-Repository, Dependency-Major-Upgrades |

---

## 10. Nächste Schritte

1. **Freigabe für Commit und Push** des Lockfile-Fixes erteilen. Der Push würde
   den lokalen Commit `66edd34` und die Lockfile-Reparatur nach
   `origin/master` bringen und CI automatisch starten.
2. Den neuen Run beobachten und die fünf Jobs einzeln prüfen. Der Lauf ist erst
   bestätigt, wenn alle fünf Jobs `success` melden.
3. Bei einem weiteren Fehler die Logs des konkreten Jobs auswerten; keine
   Erfolgsmeldung aus dem lokalen Lauf ableiten.
4. `nodemailer`/`next-auth` erst in einer separaten, getesteten Änderung
   adressieren. Ein Upgrade auf Nodemailer 10 ist wegen des NextAuth-4-Peers
   `^7.0.7` nicht als reine Patch-Maßnahme geeignet.
5. Optional `workflow_dispatch` ergänzen, damit künftige Läufe ohne neuen
   Commit manuell gestartet werden können; das ist keine Voraussetzung für
   diesen Lauf.

---

## 11. Abnahmekriterien

| Kriterium | Status |
|---|---|
| Bestehende Änderungen nicht verloren | erfüllt; `66edd34` unverändert, nur Lockfile ergänzt |
| Keine Änderung am Electron-Repository | erfüllt; nur lesende GitHub-API-Aufrufe |
| Keine Produktionsdatenbank verändert | erfüllt; lokale Dev-/Test-DB |
| Kein Bootstrap, kein Deployment | erfüllt |
| Keine Commits/Pushes ohne Freigabe | erfüllt; Lockfile-Fix liegt uncommitted |
| Keine erfundenen CI-Ergebnisse | erfüllt; realer Fehler und fehlender grüner Lauf sind ausdrücklich benannt |
| Verständlicher Bericht mit nächsten Schritten | erfüllt |
