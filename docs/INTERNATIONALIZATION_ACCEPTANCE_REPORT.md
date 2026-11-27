# WebRadio – Abnahme der vollständigen Internationalisierung (2. Durchgang)

**Datum:** 25. November 2026, 21:10 Uhr
**Gegenstand:** Behebung der Blocker K-1/H-2, N-1, N-2 und erneute Gesamtabnahme
**Vorgänger:** 1. Durchgang (nicht freigegeben, 972 deutsche Literale)

---

## 0. Ergebnis

| Bereich | Stand |
| --- | --- |
| Sprachkataloge (7 × 392 Schlüssel) | **bestanden** – synchron, keine Lücken, keine leeren Werte, Platzhalter gleich |
| Startseite | **vollständig lokalisiert**, in allen sieben Sprachen geprüft |
| Footer / Navigation | **wieder lokalisiert** (Regression aus paralleler Bearbeitung behoben) |
| robots.txt (N-1) | **behoben** – alle Sprachpräfixe ausgeschlossen |
| Logo-Seitenverhältnis (N-2) | **behoben** – keine `next/image`-Warnung mehr |
| Build, Typen, Unit-Tests | **grün** (Build 0, `tsc` 0 Fehler, 826/826 Tests) |
| ESLint | **4 Fehler offen** in der neu hinzugekommenen Admin-Seite für Custom Links |
| **Übrige Oberflächen (K-1/H-2)** | **NICHT abgeschlossen** – 945 deutsche Literale in 152 Dateien (780 einzigartige Texte) |

**Freigabe: weiterhin nicht erteilt.** Der kritische Blocker K-1 ist für die Startseite behoben, für die übrigen Bereiche jedoch offen. Zusätzlich ist in diesem Durchgang ein **fremder, paralleler Bearbeitungsstand** im Arbeitsbaum aufgetreten, der Build, Typen und Tests blockierte; er wurde repariert (Abschnitt 1), die zugehörige Admin-Oberfläche ist aber noch deutsch und nicht lint-frei.

---

## 1. Parallele Bearbeitung des Arbeitsbaums (wesentlicher Vorgang)

Während der Migration wurden zwischen 20:25 und 20:31 Uhr mehrere Dateien von einem anderen Prozess geschrieben:

- neu: `src/lib/custom-links/service.ts`, `src/app/api/custom-links/route.ts`, `src/app/api/admin/custom-links/route.ts`, `src/components/admin/IconSelector.tsx`, `src/app/(admin)/admin/settings/custom-links/page.tsx`
- überschrieben: `src/components/public/Footer.tsx` (‑174 Zeilen, lokalisierte Footer-Gruppen entfernt, ersetzt durch fest englische Gruppen und einen internen HTTP-Aufruf), `Header.tsx`, `MobileMenu.tsx`

Folgen und Reparaturen (auf Anweisung „übernehmen und vorwärts reparieren“):

| Problem | Behebung |
| --- | --- |
| 13 TypeScript-Fehler (`insert`, `.all().first()`, `IncludeScalar`, `session.user`, `labelKey`) | Service gegen die Prisma-8-API neu geschrieben (`create`, `where().update()`, `aggregate`), Routen typisiert, Menü-Props korrigiert |
| `lucide-react` importiert, aber nicht installiert | installiert (`^1.80.0`), `IconSelector` ohne `any` typisiert |
| Seite unter `src/app/(admin)/…` ohne Root-Layout → **alle Seiten HTTP 500** | in die lokalisierte Struktur `src/app/[locale]/(admin)/…` verschoben |
| Footer komplett entlokalisiert, `t` falsch aufgerufen (`footer.rights` existiert nicht) | Footer neu geschrieben: alle Gruppen aus `footer.*`, redaktionelle Links über eigene Suspense-Grenze |
| Footer-Datenbankzugriff brach das Prerendering (`crypto.randomUUID()`) | DB-Zugriff in `FooterCustomLinks` mit `connection()` + `Suspense` ausgelagert |
| interne HTTP-Aufrufe (`${NEXTAUTH_URL}/api/custom-links`) in Header/Footer | ersetzt durch direkten `CustomLinkService`-Aufruf, Locale-korrekte Beschriftung |
| `export const dynamic` inkompatibel mit `cacheComponents` | durch `await connection()` ersetzt |
| offener Redirect-Risikopfad in Custom-Link-URLs | interne Links müssen `/…` sein (kein `//`, kein `\`), externe nur `http(s)` |

**Hinweis:** Die Datei `src/app/[locale]/(admin)/admin/settings/custom-links/page.tsx` (fremde Oberfläche, komplett deutsch) ist unverändert übernommen und verursacht die 4 verbleibenden ESLint-Fehler (`any`, Hook-Reihenfolge).

---

## 2. In diesem Durchgang abgeschlossene Internationalisierung

### Startseite (`src/app/[locale]/(public)/page.tsx`)

Vollständig auf `t()` umgestellt: Hero (Titel, Untertitel, Buttons, Kennzahlen), sechs Funktionskarten, drei Zielgruppen, Release-Panel (Version, Datum, Download-Buttons inkl. `aria-label`, Nichtverfügbarkeits-Hinweis), Katalog-Vorschau (Titel, Leer- und Fehlerzustände, „von {name}“), Release-Vorschau (stabil/beta, Datum, Stale-Hinweis), Partner-Spotlight, Dokumentations- und Open-Source-Block, Linkzeile und macOS-Hinweis.

- 86 neue Schlüssel im Namensraum `home.*` sowie `footer.more`
- Unterkomponenten erhalten `t` per Prop (Server-Komponenten, keine Hydration-Unterschiede)
- Katalogumfang: **306 → 392 Schlüssel**, in allen sieben Dateien synchron

Geprüft über HTTP: `/de`, `/en`, `/pl`, `/nl`, `/fr`, `/es`, `/it` liefern 200, keine rohen Schlüssel im HTML (0 Treffer für `home.*`/`footer.*`), englische bzw. polnische Überschriften („Listen. Customise. Extend.“, „Słuchaj. Dostosuj. Rozszerzaj.“), übersetzte Footer-Gruppen.

Verbleibende deutsche Textstellen auf `/en` (2–4 Wörter) stammen aus der **404-Komponente** (`not-found.tsx`: „Seite nicht gefunden“), die noch nicht lokalisiert ist.

### N-1: robots.txt

`src/app/robots.ts` erzeugt die Ausschlüsse jetzt aus `LOCALES`:

```
Disallow: /api/ · /admin · /developer · /auth/
Disallow: /de/api/ · /de/admin · /de/developer · /de/auth/
… ebenso en, nl, fr, es, it, pl
```

### N-2: Logo-Seitenverhältnis

`/brand/webradio-logo.png` wird mit `h-28 w-auto` gerendert; die Dimensionen `112 × 112` bleiben erhalten, keine Verzerrung, keine `next/image`-Warnung mehr.

---

## 3. Sprachkataloge (sieben Locales)

| Prüfung | Ergebnis |
| --- | --- |
| Schlüssel | **392** in allen sieben Dateien |
| fehlend / überzählig / doppelt / leer | 0 / 0 / 0 / 0 |
| Platzhalter (`{date}`, `{name}`, `{platform}`, `{version}`, `{terms}`, `{projectDocs}`) | identisch über alle Sprachen |
| nicht referenzierte Schlüssel | 78 (Heuristik) – überwiegend `account.*`, `auth.*`, `admin.*`, die erst mit der jeweiligen Oberfläche genutzt werden |
| Englisch | neue Schlüssel natürlich formuliert, nicht wörtlich übertragen |
| bestehende Freigaben | nicht überschrieben (`merge-keys.mjs` schreibt nur neue Schlüssel) |

---

## 4. Literal-Scan (Stand jetzt)

`node .acceptance/i18n-literal-scan.mjs`: **945 Literale in 152 Dateien** (vorher 972/150; Startseite ‑37, Footer/Header +Neuzugänge aus der Fremdbearbeitung).

Einzigartige Texte (`node .acceptance/i18n-unique.mjs`): **780**, Verteilung:

| Bereich | einzigartig |
| --- | --- |
| `lib` (API-/Service-Meldungen) | 319 |
| `admin` | 206 |
| `public` | 123 |
| `components` | 47 |
| `account` | 41 |
| `auth` | 26 |
| `developer` | 16 |
| `system-admin` | 2 |

Damit sind **etwa 11 %** der einzigartigen Texte migriert (Startseite + Footer vollständig), rund **89 % offen**.

---

## 5. Testergebnisse

| Prüfung | Befehl | Ergebnis |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | **0 Fehler** |
| ESLint | `npx eslint .` | **4 Fehler** (nur `…/admin/settings/custom-links/page.tsx`, Fremdstand) |
| Unit-Tests | Jest | **75 Suites / 826 Tests grün** |
| Build | `npm run build` | **Exit 0** (`✓ Compiled successfully`) |
| Katalogprüfung | `.acceptance/i18n-catalog-check.mjs` | 392 Schlüssel, 0 Lücken/Leerwerte/Duplikate |
| Literal-Scan | `.acceptance/i18n-literal-scan.mjs` | 945 / 152 Dateien |
| HTTP-Smoke | `/de`, `/en`, `/pl`, `/nl`, `/fr`, `/es`, `/it` | 200, keine Schlüssel-Leaks |
| Integrationstests | `scripts/run-integration-tests.mjs` | in diesem Durchgang **nicht erneut ausgeführt** (keine Änderung an Datenzugriff außer Custom Links) |
| Migrationsprüfung | `scripts/translation-acceptance-db.mjs` | in diesem Durchgang **nicht erneut ausgeführt**; Stand 1. Durchgang: 24/24 |

---

## 6. Offene Blocker

### K-1 (kritisch, offen): öffentliche Oberflächen

Noch deutsch: Releases (17), Docs (21), Advertising (16), Plugin-Einreichung (18), Partner (8), Plugins/Themes (13/13), News (6), Rechtsseiten-Rahmen, Leer-/Fehlerzustände (`EmptyState`, `ErrorState`, `CatalogueSkeleton`), `not-found.tsx`, `ReportForm`, `ReleaseAssets`, `ReleaseNotes`, `DownloadButton`.

### H-2 (hoch, offen): Account, Admin, Developer, System-Admin

206 + 41 + 26 + 16 + 2 einzigartige Texte. Die Shell (Navigation/Footer) ist lokalisiert, die Formulare und Tabellen sind deutsch. Neu hinzugekommen: die Admin-Seite für Custom Links (rein deutsch, ESLint-Fehler).

### H-1 (hoch, offen): ungenutzte Schlüssel

78 Schlüssel werden derzeit von keiner Komponente gelesen; sie gehören zu den noch nicht migrierten Bereichen und dürfen erst nach deren Migration bewertet/entfernt werden.

### Neuer Befund N-3 (mittel): 404-Seite

`src/app/[locale]/not-found.tsx` rendert deutschen Text in allen Sprachen (`Seite nicht gefunden`, Beschreibung, Buttons).

---

## 7. Nächste Schritte (Reihenfolge)

1. `not-found.tsx`, `EmptyState`, `ErrorState`, `CatalogueSkeleton` (Basiszustände, wirken auf allen Seiten).
2. Releases, Docs, Advertising, Plugin-Einreichung, Partner, Plugins/Themes, News.
3. Auth (Registrierung, Passwort zurücksetzen) und Account (Profil, Sicherheit, Sitzungen).
4. Developer und System-Admin.
5. Admin (206 Texte) inklusive Custom-Link-Seite; dabei `lib`-Meldungen über Codes statt deutscher Texte an die Oberfläche geben.
6. Danach: vollständige Prüfkette (`tsc`, `eslint`, Jest, Integration, Migration, Build, Literal-Scan, Browsertests je Sprache) und erneute Abnahme.

---

## 8. Freigabeempfehlung

**Keine Freigabe.** Die technische Grundlage ist intakt und nach der Reparatur der Fremdbearbeitung wieder build- und testfähig; die Startseite und der Footer sind in allen sieben Sprachen korrekt. Für die übrigen rund 89 % der Texte ist die Internationalisierung nicht umgesetzt, und eine fremde Admin-Oberfläche ist noch deutsch und nicht lint-frei. K-1 und H-2 bleiben damit offen; das Abnahmekriterium „alle vorgesehenen Oberflächen in allen sieben Locales vollständig und konsistent“ ist nicht erfüllt.

Kein Commit, kein Push, kein Deployment, keine produktive Migration, keine echten E-Mails, keine DeepL-Aufrufe.
