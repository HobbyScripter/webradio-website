# Internationalisierung (i18n) – Implementierungsbericht

**Projekt:** WebRadio Website (`YourEliteSystems/WebRadio-Website`)
**Stand:** 24. November 2026
**Geltungsbereich:** Next.js 16 (App Router), React, TypeScript, Prisma 8 / PostgreSQL
**Status:** Grundsystem, Routing, Erkennung, Speicherung, Übersetzungsverwaltung, SEO, E-Mails und Datenmodell sind implementiert und geprüft. Die vollständige Übersetzung **aller** Bestandsseiten ist noch nicht abgeschlossen (siehe [Abschnitt 10](#10-offene-übersetzungen-und-bekannte-einschränkungen)).

---

## 1. Zusammenfassung

Die Plattform hat jetzt ein echtes, mehrsprachiges Routensystem (`/de/…`, `/en/…`, …), eine
automatische Spracherkennung mit dokumentierter Prioritätsreihenfolge, eine dauerhafte
Speicherung (Cookie **und** Benutzerkonto), einen ohne JavaScript funktionierenden
Sprachumschalter, eine zentrale, typisierte Übersetzungsverwaltung, ein normalisiertes
Datenmodell für dynamische Inhalte mit Freigabestatus, sprachabhängige SEO-Angaben
(`hreflang`, Canonical, Sitemap), mehrsprachige Transaktions-E-Mails sowie eine
Administrationsseite für Übersetzungsabdeckung und Freigaben.

**Deutsch bleibt Standard- und Quellsprache.** Alle Übersetzungen fallen auf Deutsch zurück,
wenn ein Schlüssel fehlt; kein Besucher sieht einen leeren Text oder einen Schlüsselnamen.

### Kennzahlen

| Kennzahl | Wert |
|---|---|
| Unterstützte Locales | 7 (`de`, `en`, `nl`, `fr`, `es`, `it`, `pl`) |
| Übersetzungsschlüssel je Sprache | 256 (alle 7 Kataloge strukturgleich) |
| Neu angelegte i18n-Module | 10 (`src/i18n/*`) |
| Neu angelegte Tests | 1 Suite mit 55 Testfällen (Detection, Routing, Kataloge, Formatierung, Redirect-Schutz) |
| Test-Gesamtergebnis | **70 Suites / 726 Tests, 0 Fehler** |
| TypeScript | **0 Fehler** (`npx tsc --noEmit`) |
| ESLint | **0 Fehler**, 10 bestehende Warnungen (`<img>`-Hinweise u. ä.) |
| Build | **erfolgreich**, alle 7 Locales statisch vorgerendert |
| Datenbankmigration | 1 addititative Migration erzeugt, **nicht angewendet** |

---

## 2. Technische Architektur

### 2.1 Routensegment `[locale]` statt Middleware-Rewrite

Alle Route-Groups wurden nach `src/app/[locale]/` verschoben:

```
src/app/
├── [locale]/                    ← alle Seiten, 7-fach vorgerendert
│   ├── layout.tsx               ← <html lang/dir>, Metadaten, Provider
│   ├── error.tsx, not-found.tsx
│   ├── (public)/ (auth)/ (account)/ (admin)/ (developer)/ (system-admin)/
├── api/                         ← unverändert, sprachneutral
├── robots.ts, sitemap.ts, global-error.tsx, opengraph-image.tsx
```

**Begründung:** Ein Rewrite in der Middleware hätte zwar URLs wie `/plugins` erhalten, aber

- kein statisches Prerendering pro Sprache erlaubt (`generateStaticParams`),
- kein korrektes `<html lang="…">` im Root-Layout ermöglicht (`headers()` ist unter
  `cacheComponents` im Layout unzulässig),
- keine verlässlichen `hreflang`-Alternates aus den Routen erzeugt.

Die sichtbare URL-Struktur ist damit konsistent, cachebar und SEO-freundlich:

```
/de/plugins   /en/plugins   /nl/plugins   /fr/plugins
/es/themes    /it/releases  /pl/docs
```

`/` wird von `src/proxy.ts` per **307** auf die erkannte Sprache umgeleitet (nicht 308, damit
die Erkennung bei einer späteren Änderung von Cookie/`Accept-Language` erneut greifen kann).

### 2.2 Eigene, abhängigkeitsfreie i18n-Engine

Bewusst **kein** `next-intl`/`i18next`: Die Engine ist ~200 Zeilen, vollständig typisiert und
nutzt nur `Intl`. Vorteile: kein zusätzliches Runtime-Paket, keine doppelte Routing-Logik,
volle Kontrolle über Fallback und Cookie-Verhalten.

| Datei | Zweck |
|---|---|
| `src/i18n/config.ts` | Locale-Liste, Metadaten (Endonym, Flagge, OpenGraph, Richtung), Cookie-/Header-Namen, `localizePath`, `stripLocale`, `localeFromPath`, `matchLocaleTag`, `languageForCountry` |
| `src/i18n/translate.ts` | `lookupPath`, `interpolate`, `createTranslator`, `collectKeys`, `compareMessages` |
| `src/i18n/messages.ts` | Statische Imports aller Kataloge, `getMessages`, `getMergedMessages` (gecacht) |
| `src/i18n/provider.tsx` | `I18nProvider`, `useI18n`, `useLocale` |
| `src/i18n/server.ts` | `createServerI18n`, `getLocaleFromParams`, `getRequestLocale`, `getI18n` |
| `src/i18n/detect.ts` | `detectLocale`, `parseAcceptLanguage`, `shouldPersistDetection` |
| `src/i18n/format.ts` | `createFormatters` (Datum, Zeit, Zahl, Währung, relative Zeit, Dateigröße) |
| `src/i18n/navigation.tsx` | Locale-bewusster `Link`, `usePathname` (ohne Präfix), `useRouter` |
| `src/i18n/safe-next.ts` | `safeNextPath` – Schutz vor offenen Redirects |
| `src/i18n/__tests__/i18n.test.ts` | Testabdeckung der Engine |

**Typisierung:** `TranslationKey` wird aus `de.json` abgeleitet; `t()` akzeptiert nur
existierende Pfade. Fehlende Schlüssel werden zur Laufzeit auf Deutsch aufgelöst und im
Entwicklungsmodus protokolliert (`[i18n] missing key "…" for locale "…"`).

**Hydration:** Der Client-Provider erhält vom Server bereits die **mit Deutsch gemergten**
Messages. Client und Server rendern damit identisch – kein Hydration-Mismatch, kein
zusätzlicher Netzwerk-Request.

### 2.3 Kataloge

```
src/i18n/messages/{de,en,nl,fr,es,it,pl}.json
```

256 Schlüssel in 15 Namespaces:

| Namespace | Schlüssel | Inhalt |
|---|---|---|
| `common` | 13 | Ja/Nein, laden, speichern, zurück, Status |
| `meta` | 7 | Seitentitel/Beschreibungen |
| `nav` | 8 | Hauptnavigation |
| `header` | 13 | Header, Suche, Konto-Menü |
| `footer` | 31 | Footer inkl. Rechtliches |
| `roles` | 4 | Rollenbezeichnungen |
| `language` | 10 | Sprachumschalter |
| `account` | 40 | Konto, Profil, Sicherheit, Einstellungen |
| `auth` | 38 | Registrierung, Login, Passwort, Verifizierung |
| `developer` | 19 | Developer-Bereich |
| `admin` | 42 | Admin-Navigation und -Funktionen |
| `errors` | 12 | Fehlerseiten |
| `legal` | 3 | Rechtlicher Hinweis, Übersetzungsstatus |
| `emails` | 15 | Transaktions-E-Mails |
| `translate` | 1 | Hinweis im Sprachumschalter |

---

## 3. Unterstützte Locales

| Sprache | Locale | Endonym | OpenGraph | Status |
|---|---|---|---|---|
| Deutsch | `de` | Deutsch | `de_DE` | Standard, rechtlich maßgeblich |
| Englisch | `en` | English | `en_GB` | vollständig übersetzt |
| Niederländisch | `nl` | Nederlands | `nl_NL` | vollständig übersetzt |
| Französisch | `fr` | Français | `fr_FR` | vollständig übersetzt |
| Spanisch | `es` | Español | `es_ES` | vollständig übersetzt |
| Italienisch | `it` | Italiano | `it_IT` | vollständig übersetzt |
| Polnisch | `pl` | Polski | `pl_PL` | vollständig übersetzt |

„Vollständig übersetzt“ bezieht sich auf die **Oberflächenkataloge** (alle 256 Schlüssel in
allen 7 Sprachen, durch Test abgesichert). Die fachliche und rechtliche Prüfung der
Übersetzungen steht aus (siehe Abschnitt 12).

Alle Sprachen sind links-nach-rechts; `direction` ist im Metadatenmodell vorhanden, damit
später z. B. Arabisch ohne Umbau ergänzt werden kann.

---

## 4. Spracherkennung und Speicherung

### 4.1 Prioritätsreihenfolge (implementiert in `src/i18n/detect.ts`)

| Priorität | Quelle | Verhalten |
|---|---|---|
| 1 | URL-Präfix | Explizite Wahl des Besuchers. **Wird nie überschrieben.** |
| 2 | Benutzerkonto | `User.locale`, nur bei angemeldeten Nutzern |
| 3 | Cookie `webradio-locale` | Manuelle Auswahl, 1 Jahr gültig |
| 4 | `Accept-Language` | Browsersprache, nach `q`-Wert sortiert, `q=0` wird verworfen |
| 5 | Land | **Nur** bei eindeutig einsprachigen Ländern (`DE→de`, `NL→nl`, `GB→en`, …) |
| 6 | Fallback | `de` |

Mehrsprachige Länder (`CH`, `BE`, `CA`, `LU`, …) liefern bewusst **kein** Ergebnis – das Land
darf niemals allein entscheiden. Es wird keine Geo-IP-Abfrage und kein Drittanbieter
verwendet; die Länderinformation stammt ausschließlich aus einem optionalen, von der
Plattform gesetzten Header und ist damit rein additiv.

`shouldPersistDetection()` unterscheidet: erkannte Sprachen (`header`, `country`, `default`,
`account`) werden gespeichert, eine explizite Navigation (`explicit`) und eine bestehende
Cookie-Wahl (`cookie`) nicht – eine manuelle Wahl bleibt also dauerhaft erhalten.

### 4.2 Speicherung

- **Cookie** `webradio-locale`, `Path=/`, `SameSite=Lax`, `HttpOnly`, `Secure` in Produktion,
  `Max-Age` 1 Jahr. Nur validierte Locale-Codes werden geschrieben.
- **Benutzerkonto** `User.locale` (nullable `text`). Wird beim Wechsel über
  `POST /api/locale` gespeichert, wenn eine Sitzung existiert.
- **Login-Synchronisierung** `POST /api/locale/sync`: Beim Anmelden wird die Kontosprache in
  den Cookie gespiegelt. Der Proxy bleibt dadurch DB-frei (keine Prisma-Abfrage pro Request).

### 4.3 Ohne JavaScript

Die Erkennung läuft vollständig serverseitig (Proxy + Layout). Der Sprachumschalter ist ein
normales `POST`-Formular auf `/api/locale` mit `303`-Redirect auf denselben Pfad in der neuen
Sprache; ein `<noscript>`-Fallback-Button ist enthalten. Es funktioniert also auch mit
deaktiviertem JavaScript.

---

## 5. Sprachumschalter

`src/components/i18n/LanguageSelector.tsx`

| Anforderung | Umsetzung |
|---|---|
| Im öffentlichen Header sichtbar | eingebunden in `Header` |
| Zusätzlich im Footer | eingebunden in `Footer` |
| Im Benutzerkonto | `/account/settings` (neuer Navigationspunkt „Sprache“) |
| Im Admin-/Developer-Bereich | über die Layouts von Header/Account-Menü erreichbar |
| Sprachname + Flagge | Endonym (`Nederlands`) + Flaggen-Emoji, Name ist immer sichtbar (Flagge nie alleiniges Merkmal) |
| Bleibt auf derselben Unterseite | verstecktes Feld `next` mit dem aktuellen Pfad, serverseitig über `safeNextPath` validiert |
| Nicht vorhandene Sprachversionen | jede Seite existiert in allen 7 Sprachen; ein fehlender Katalog würde auf Deutsch zurückfallen statt 404 zu liefern |
| Dauerhafte Speicherung | Cookie + Konto (siehe 4.2) |

**Sicherheit:** `next` wird ausschließlich als site-relativer Pfad akzeptiert
(`/account/profile`); absolute URLs, `//host`, Backslash-Tricks und Steuerzeichen werden
verworfen und durch `/` ersetzt (`safeNextPath`, durch Tests abgesichert).

---

## 6. Internationalisierte Bereiche

### 6.1 Vollständig umgestellt

| Bereich | Dateien |
|---|---|
| Root-Layout | `<html lang>`, `<html dir>`, Metadaten, `og:locale`, `alternateLocale`, Skip-Link |
| Public Chrome | `Header`, `Footer`, `FooterNav`, `Brand`, `MobileMenu`, `AccountDropdown` |
| Auth | Layout, Login, Registrierung, Passwort vergessen/zurücksetzen, E-Mail-Verifizierung (+ Resend) |
| Konto | Konto-Layout, Konto-Übersicht, Profil, Sicherheit, **neue Seite `/account/settings`** |
| Admin | Admin-Layout + Navigation, Benutzerliste (Rollenlabels), **neue Seite `/admin/translations`** |
| Developer | Developer-Layout |
| System-Admin | Layout |
| Fehlerseiten | `error.tsx`, `not-found.tsx`, eigener 404 in 7 Sprachen im Proxy |
| E-Mails | Passwort-Reset, E-Mail-Verifizierung |
| Formulare/Feedback | `AccessDenied`, `DashboardNav`, `DashboardBreadcrumbs`, `CatalogCard`, `CatalogPagination`, `CatalogToolbar`, `CatalogDetail`, `LegalConsentNotice`, `LegalDocument`, `MarkdownText` |

### 6.2 Navigation

`src/i18n/navigation.tsx` exportiert einen `Link`-Wrapper, der `href` automatisch mit der
aktiven Locale präfixiert (`/plugins` → `/de/plugins`). **73 Dateien** wurden von
`next/link` auf diesen Wrapper umgestellt; `usePathname` liefert den Pfad **ohne** Präfix,
damit aktive Navigationszustände unverändert funktionieren.

---

## 7. Dynamische Inhalte (Datenbank)

### 7.1 Modell `ContentTranslation`

Normalisiert, eine Zeile pro Feld und Sprache – **keine** `name_de`/`name_en`-Spalten:

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | `text` (PK) | technische ID |
| `entityType` | `text` | z. B. `plugin`, `theme`, `partner`, `advertising`, `doc` |
| `entityId` | `text` | ID des Originaldatensatzes |
| `locale` | `text` | Zielsprache |
| `field` | `text` | Feldname, z. B. `name`, `description`, `summary` |
| `value` | `text` | übersetzter Text |
| `status` | `text`, Default `DRAFT` | `DRAFT` \| `IN_REVIEW` \| `APPROVED` |
| `reviewedAt` | `timestamptz?` | Zeitpunkt der Freigabe |
| `createdAt`/`updatedAt` | `timestamptz` | Audit |

Eindeutigkeit: `(entityType, entityId, locale, field)`. Indizes auf `(entityType, entityId)`,
`(locale, status)` und `status`.

**Originalinhalte bleiben unverändert.** Eine Übersetzung ergänzt den Datensatz; sie ersetzt
ihn nie. Fehlt eine `APPROVED`-Übersetzung, wird automatisch der Originalwert ausgeliefert
(`localizeRecord` in `src/lib/content-translations.ts`).

**Nur `APPROVED` wird öffentlich ausgeliefert.** `getApprovedTranslations()` filtert
serverseitig; ein Entwurf kann nicht versehentlich im Frontend erscheinen. Übersetzungen
werden als Text (nicht als HTML) gerendert – `MarkdownText` bereinigt wie bisher.

### 7.2 Benutzer-Modell

`User.locale String?` – nullable, damit bestehende Datensätze ohne Migration unverändert
gültig bleiben. `NULL` bedeutet „keine Kontosprache gewählt“ → Erkennung greift.

### 7.3 Prisma-8-Migration

```
migrations/app/20261124T1823_i18n_content_translations/
├── migration.ts
├── migration.json
└── ops.json
```

- Erzeugt **offline** mit `npx prisma migration plan --from 20261122T2030_advertising_partner_portal --name i18n_content_translations`
  (kein Datenbankkontakt).
- `from`-Contract: `e54862c5d731…` (Produktionsmarker), `to`-Contract: `43914ff3…`.
- Operationen: `CREATE TABLE "ContentTranslation"`, `ALTER TABLE "User" ADD COLUMN "locale"`,
  Unique-Index + 3 Indizes. **Rein additiv** – kein `DROP`, kein `ALTER … TYPE`, kein
  `DELETE`.
- Snapshot: `migrations/snapshots/43914ff3…/`.
- `prisma/contract.prisma` enthält `User.locale` und `model ContentTranslation`;
  `npm run prisma:contract:emit` ist erfolgreich gelaufen (`contract.json`, `contract.d.ts`).

> **Status: NICHT ANGEWENDET.** Es wurde keine lokale Testdatenbank verifiziert und keine
> produktive Migration ausgeführt. Die Anwendung ist mit dem aktuellen Schema lauffähig; die
> neuen Seiten (`/account/settings`, `/admin/translations`) greifen erst nach dem Anwenden der
> Migration auf die neuen Spalten zu.
>
> **Anwenden (erst nach ausdrücklicher Freigabe):**
> ```bash
> # 1. Testumgebung: Backup/Snapshot der Datenbank
> # 2. Dry-Run der Operationen prüfen
> npx prisma migrate diff --from-migrations migrations/app --to-contract prisma/contract.prisma
> # 3. Anwenden (lokal/Test zuerst)
> npx prisma migrate deploy
> # 4. Smoke-Test: Anmeldung, /de/account/settings, /de/admin/translations
> ```

---

## 8. Datum, Uhrzeit, Zahlen, Währungen

`src/i18n/format.ts` (Client und Server) und `src/lib/format.ts` (bestehende Aufrufer) nutzen
ausschließlich `Intl`:

| Funktion | Beispiel `de` | Beispiel `en` |
|---|---|---|
| `date` | `12. März 2026` | `12 March 2026` |
| `dateTime` | `12. März 2026, 16:30` | `12 March 2026, 16:30` |
| `number(1536.5)` | `1.536,5` | `1,536.5` |
| `currency(12.5,'EUR')` | `12,50 €` | `€12.50` |
| `relative` | `vor 3 Tagen` | `3 days ago` |
| `fileSize(1536)` | `1,5 KB` | `1.5 KB` |

**Wichtig:** Die **Zeitzone** ist eine feste Anwendungsentscheidung (Datum in UTC,
Datum+Zeit in `Europe/Berlin`), und die **Währung** wird immer explizit übergeben. Ein
Sprachwechsel verändert also weder die Uhrzeit eines Releases noch den Währungscode.
Ungültige oder fehlende Werte liefern `null` statt `Invalid Date`.

---

## 9. SEO, Rechtliches und E-Mails

### 9.1 SEO

- **Sprachabhängige URLs** (`/de/…`, `/en/…`, …) als einzige kanonische Form.
- **`hreflang`**: `alternates.languages` mit allen 7 Locales plus `x-default` → Deutsch,
  zentral erzeugt in `src/lib/seo.ts` (`buildLanguageAlternates`).
- **Canonical**: pro Sprache selbstreferenziell (`/en/plugins` → `canonical: /en/plugins`),
  keine widersprüchlichen Angaben.
- **Titel/Beschreibungen**: aus dem Katalog (`meta.*`), pro Sprache unterschiedlich.
- **OpenGraph**: `og:locale` + `og:locale:alternate` für die übrigen Sprachen.
- **`src/app/sitemap.ts`**: alle Locales × öffentliche Pfade, jeweils mit
  `alternates.languages`; nichtöffentliche Bereiche (Konto, Admin, Developer) bleiben
  ausgeschlossen.
- **Nicht übersetzte Seiten**: Es gibt keine 404-Fälle pro Sprache – fehlt ein Katalogwert,
  wird Deutsch ausgeliefert. Damit entstehen keine leeren Sprachversionen und keine
  Duplicate-Content-Fallen.

### 9.2 Rechtliche Inhalte

- Deutsche Rechtstexte (`/impressum`, `/datenschutz`, `/nutzungsbedingungen`) bleiben
  unverändert und **maßgeblich**.
- `legal.translationNotice` und der Freigabestatus im `ContentTranslation`-Modell machen
  sichtbar, ob eine Fassung nur „Übersetzung, nicht rechtlich geprüft“ ist.
- Übersetzungen werden **nie** automatisch als rechtlich geprüft gekennzeichnet; die
  Freigabe ist ein expliziter Admin-Schritt (`APPROVED` + `reviewedAt`).

### 9.3 E-Mails

`src/lib/email.ts` erzeugt Passwort-Reset- und Verifizierungs-Mails jetzt in der
**Kontosprache** (`User.locale`), Fallback Deutsch:

- Betreff und Text aus `emails.*` (7 Sprachen).
- Der Link zeigt auf die lokalisierte Seite (`/nl/auth/reset-password`), damit der Empfänger
  in seiner Sprache weiterarbeitet.
- Weiterhin reiner Text (kein HTML, kein Tracking-Pixel, keine externen Assets).

---

## 10. Offene Übersetzungen und bekannte Einschränkungen

### 10.1 Noch nicht auf Katalogschlüssel umgestellt (ehrliche Bestandsaufnahme)

Die Oberflächenkataloge sind vollständig – aber **nicht jede Seite liest bereits daraus**.
Ein heuristischer Audit (`npm run i18n:audit`) findet derzeit **171 fest eingebaute deutsche
UI-Texte in 70 Dateien**:

| Bereich | Dateien mit Fundstellen |
|---|---|
| Admin-Seiten | 28 |
| Öffentliche Seiten | 15 |
| Gemeinsame Komponenten | 12 |
| Developer-Seiten | 8 |
| Konto-Seiten | 4 |

Betroffen sind insbesondere Detailseiten und Tabelleninhalte, z. B.
`src/app/[locale]/(public)/page.tsx`, `docs/page.tsx`, `releases/page.tsx`,
`(admin)/admin/page.tsx`, `(admin)/admin/downloads/page.tsx`,
`(account)/account/page.tsx`, `(developer)/developer/page.tsx`.

**Konsequenz:** Ein Sprachwechsel ändert auf diesen Seiten bereits Routing, Chrome
(Header/Footer/Navigation), Datums- und Zahlenformate und alle verlinkten Ziele – aber die
Seiteninhalte selbst erscheinen weiterhin auf Deutsch. Diese Seiten funktionieren
unverändert; es wurde nichts entfernt oder vereinfacht.

**Vorgehen für die restlichen Seiten** (mechanisch, pro Datei):

1. `const t = await createServerI18n(params)` bzw. `useI18n()` im Client.
2. Text durch `t('namespace.key')` ersetzen, neue Schlüssel in `de.json` ergänzen.
3. `npm test` (Katalogtest schlägt fehl, solange eine Sprache einen Schlüssel nicht hat) →
   Übersetzungen in allen 6 weiteren Katalogen ergänzen.
4. `npm run i18n:audit` – die Datei verschwindet aus der Liste.

Der Audit ist so gebaut, dass er mit `--strict` fehlschlägt, sobald noch Fundstellen
existieren; damit lässt sich die Fertigstellung in CI erzwingen.

### 10.2 Weitere Einschränkungen

| Einschränkung | Auswirkung |
|---|---|
| Migration nicht angewendet | `/account/settings` und `/admin/translations` benötigen die neuen Spalten; vor dem Anwenden sind sie nicht nutzbar |
| Übersetzungsqualität | Die 7 Kataloge wurden redaktionell erstellt; eine muttersprachliche/fachliche Prüfung (besonders `nl`, `fr`, `es`, `it`, `pl`) ist **nicht** erfolgt und wird ausdrücklich empfohlen |
| Rechtstexte | Nur Deutsch ist rechtlich geprüft; Übersetzungen sind als ungeprüft zu behandeln |
| Dynamic-Content-Übersetzung | Modell, Fallback und Admin-Freigabe stehen; die Redaktionsoberfläche bietet Abdeckung + Statuswechsel, aber noch keinen Rich-Text-Editor pro Feld |
| Sprache der API-Fehler | `AuthError`-Meldungen sind weiterhin deutsche Servertexte; die APIs sind sprachneutral und liefern Codes, die UI übersetzt die Anzeige |
| Bilder/Screenshots | Enthalten teils deutsche Beschriftungen; nicht Teil der Textinternationalisierung |

---

## 11. Qualitätssicherung – tatsächlich ausgeführt

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **0 Fehler** |
| ESLint | `npx eslint .` | **0 Fehler**, 10 Warnungen (bestehend: `<img>`, unbenutzte Variablen in Skripten) |
| Unit-/Integrationstests | `npm test` | **70 Suites, 726 Tests, 0 Fehler** |
| Build | `npm run build` | **erfolgreich** |
| i18n-Audit | `npm run i18n:audit` | Kataloge 7×256 Schlüssel vollständig; 171 offene Fundstellen |

### 11.1 Neu abgedeckte Testfälle (`src/i18n/__tests__/i18n.test.ts`)

- Locale-Konfiguration: 7 Sprachen, vollständige Metadaten, strikte Validierung.
- Tag-Matching: `de-DE`/`de_AT` → `de`, unbekannte Sprachen → `null`.
- Länderhinweise: `DE`/`NL`/`GB` aufgelöst, `CH`/`BE`/`CA` bewusst nicht.
- `Accept-Language`: Sortierung nach `q`, `q=0` verworfen, Duplikate entfernt.
- Erkennungspriorität: alle 6 Stufen inkl. ungültiger gespeicherter Werte.
- Persistenzregeln: explizite Wahl und Cookie werden nicht überschrieben.
- URL-Logik: Präfix genau einmal, `stripLocale`, `localeFromPath`.
- Offener-Redirect-Schutz: `https://`, `//`, Backslash, Steuerzeichen.
- Katalogvollständigkeit: alle Sprachen strukturgleich, keine leeren Werte, gleiche
  Platzhalternamen.
- Translator: Fallback auf Deutsch, Interpolation, unbekannte Platzhalter bleiben sichtbar.
- Formatierung: Datum/Zeit/Zahl/Währung/Dateigröße pro Sprache, feste Zeitzone.

### 11.2 Bestehende Tests, die angepasst wurden

Angepasst wurden **nur Erwartungen an neue, korrekte Ausgaben** (Locale-Präfix in Links,
zusätzlicher Navigationspunkt „Sprache“):

- `src/lib/__tests__/proxy.test.ts` → Anfragen jetzt mit `/de/…` (vorher `/plugins/…`), weil
  `/…` korrekt auf die erkannte Sprache umleitet.
- `src/lib/__tests__/roles.test.ts` → erwartete Navigationsschlüssel enthalten `language`.
- `src/components/__tests__/public-ui.test.tsx`, `account-navigation.test.tsx`,
  `legal-pages.test.tsx`, `catalog-entry-form.test.tsx`,
  `src/app/[locale]/(auth)/__tests__/auth-forms.test.tsx`,
  `src/app/[locale]/(public)/__tests__/plugin-submit-page.test.tsx` → Locale-Präfix in
  Link-Erwartungen.

Es wurde **keine** Assertion abgeschwächt, kein Test übersprungen und keine Fehlerbehandlung
entfernt, um einen Fehler zu kaschieren.

### 11.3 Build-Nachweis

`npm run build` listet die Routen unter `/[locale]/…` und rendert **alle sieben** Locales
statisch vor. Beleg im Build-Artefakt:

```
.next/server/app/de   .next/server/app/en   .next/server/app/nl   .next/server/app/fr
.next/server/app/es   .next/server/app/it   .next/server/app/pl
```

(Das Konsolen-Summary kürzt die Baumausgabe auf zwei Kinder pro Knoten; das Artefakt enthält
alle sieben Verzeichnisse mit `*.html`, `*.meta`, `*.segments`.)

---

## 12. Geänderte und neue Dateien

### 12.1 Neu (i18n-Kern)

```
src/i18n/config.ts
src/i18n/translate.ts
src/i18n/detect.ts
src/i18n/format.ts
src/i18n/messages.ts
src/i18n/provider.tsx
src/i18n/server.ts
src/i18n/navigation.tsx
src/i18n/safe-next.ts
src/i18n/messages/{de,en,nl,fr,es,it,pl}.json
src/i18n/__tests__/i18n.test.ts
src/components/i18n/LanguageSelector.tsx
src/lib/locale-preference.ts
src/lib/content-translations.ts
src/lib/seo.ts
src/app/api/locale/route.ts
src/app/api/locale/sync/route.ts
src/app/[locale]/(account)/account/settings/page.tsx
src/app/[locale]/(admin)/admin/translations/page.tsx
src/app/[locale]/(admin)/admin/translations/actions.ts
scripts/i18n-audit.mjs
migrations/app/20261124T1823_i18n_content_translations/
migrations/snapshots/43914ff3…/
```

### 12.2 Verschoben (kein Funktionsverlust, `git mv`)

```
src/app/layout.tsx                  → src/app/[locale]/layout.tsx
src/app/error.tsx                   → src/app/[locale]/error.tsx
src/app/not-found.tsx               → src/app/[locale]/not-found.tsx
src/app/(public)/**                 → src/app/[locale]/(public)/**            (21 Dateien)
src/app/(auth)/**                   → src/app/[locale]/(auth)/**              (8 Dateien)
src/app/(account)/**                → src/app/[locale]/(account)/**           (6 Dateien)
src/app/(admin)/**                  → src/app/[locale]/(admin)/**             (33 Dateien)
src/app/(developer)/**              → src/app/[locale]/(developer)/**         (18 Dateien)
src/app/(system-admin)/**           → src/app/[locale]/(system-admin)/**      (2 Dateien)
```

Unverändert an ihrem Ort: `src/app/api/**`, `robots.ts`, `sitemap.ts` (inhaltlich erweitert),
`global-error.tsx`, `opengraph-image.tsx`, `icon.png`, `favicon.ico`.

### 12.3 Geändert

| Datei | Änderung |
|---|---|
| `src/proxy.ts` | Locale-Redirect (307), Cookie setzen, Auth-Redirect mit Präfix, lokalisierter 404 in 7 Sprachen, Matcher ohne `api` |
| `src/app/[locale]/layout.tsx` | `generateStaticParams`, Locale-Validierung, `lang`/`dir`, Provider, `og:locale` |
| `src/app/sitemap.ts` | Locales × Pfade mit `alternates.languages` + `x-default` |
| `src/lib/roles.ts` | `ROLE_LABELS` → `ROLE_LABEL_KEYS`, `roleLabel(t, role)`, Navigationspunkt `language` |
| `src/lib/format.ts` | Formatierung über `Intl` mit optionaler Locale, feste Zeitzone/Währung |
| `src/lib/email.ts` | E-Mails in Kontosprache, Text-Layout, lokalisierte Links |
| `src/lib/account-service.ts` | übergibt `User.locale` an die E-Mail-Erzeugung |
| `prisma/contract.prisma` | `User.locale`, `model ContentTranslation` |
| `prisma/contract.json`, `contract.d.ts` | neu generiert (`storageHash 43914ff3…`) |
| 73 Dateien mit `next/link` | auf `@/i18n/navigation` umgestellt |
| Admin-Layout | Navigationseintrag „Übersetzungen“ |
| `package.json` | Skript `i18n:audit` |
| 8 Testdateien | Locale-Präfixe und Navigationsschlüssel |

---

## 13. Sicherheit und Datenschutz

| Anforderung | Umsetzung |
|---|---|
| Locale-Eingaben validieren | `parseLocale`/`isLocale` gegen die Whitelist; unbekannte Werte → `null`, nie in Cookie/Pfad übernommen |
| Keine offenen Redirects | `safeNextPath` akzeptiert nur site-relative Pfade; getestet gegen `//host`, `https://`, Backslash, CRLF |
| Cookie-Attribute | `HttpOnly`, `SameSite=Lax`, `Secure` in Produktion, `Path=/`, 1 Jahr |
| Keine Standortdaten | Land nur aus einem optionalen Header, wird **nicht** gespeichert; keine Geo-IP-Dienste |
| Kein Tracking | keine neuen Analyse- oder Drittanbieter-Aufrufe |
| Auth/Berechtigungen unverändert | Rollen und Guards unverändert; Admin-Seiten prüfen weiterhin serverseitig `hasRole` |
| Keine ungeprüfte HTML-Ausgabe | Übersetzungen werden als Text gerendert; `MarkdownText` bereinigt unverändert |
| Keine Secrets im Client | Kataloge enthalten nur UI-Text; `User.locale` ist kein Geheimnis |

Ein neuer Berechtigungstyp wurde **nicht** eingeführt: `/admin/translations` nutzt die
bestehende Admin-Rolle.

---

## 14. Hinweise für spätere Erweiterungen

### 14.1 Eine weitere Sprache hinzufügen

1. `src/i18n/config.ts` → Code in `LOCALES` eintragen, `LOCALE_META` ergänzen
   (Endonym, englischer Name, Flagge, `openGraph`, `direction`).
2. `src/i18n/messages/<code>.json` anlegen (Struktur von `de.json` übernehmen).
3. `src/i18n/messages.ts` → statischen Import ergänzen.
4. `npm test` → der Katalogtest meldet sofort jeden fehlenden Schlüssel.
5. Fertig: Routing, Proxy-Umleitung, Sprachumschalter, Formatierung, `hreflang`, Sitemap,
   `generateStaticParams` und Cookie-Validierung leiten alles aus `LOCALES` ab.

### 14.2 Eine Seite internationalisieren

```tsx
// Server Component
import { createServerI18n } from '@/i18n/server';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { t } = await createServerI18n(locale);
  return <h1>{t('nav.plugins')}</h1>;
}
```

```tsx
// Client Component
'use client';
import { useI18n } from '@/i18n/provider';

export function Toolbar() {
  const { t } = useI18n();
  return <button>{t('common.save')}</button>;
}
```

### 14.3 Einen neuen übersetzbaren Entitätstyp ergänzen

```ts
// src/lib/content-translations.ts
export const TRANSLATABLE_FIELDS = {
  plugin: ['name', 'description', 'summary'],
  theme: ['name', 'description'],
  doc: ['title', 'body'],        // ← ergänzen
} as const;
```

Anschließend `localizeRecord('doc', record, locale)` verwenden; nur `APPROVED`-Einträge
werden ausgeliefert.

### 14.4 Prüfen, was noch fehlt

```bash
npm run i18n:audit            # Übersicht + Arbeitsliste
npm run i18n:audit -- --json  # maschinenlesbar
npm run i18n:audit -- --strict  # Exit-Code 1, solange Fundstellen existieren (CI-Gate)
```

---

## 15. Checkliste vor dem Produktivbetrieb

1. [ ] Übersetzungen fachlich/muttersprachlich prüfen (insb. `nl`, `fr`, `es`, `it`, `pl`).
2. [ ] Rechtliche Übersetzungen separat juristisch freigeben, erst dann `APPROVED` setzen.
3. [ ] Migration in einer Testumgebung anwenden (`npx prisma migrate deploy`) und
       Smoke-Tests ausführen: Login, `/de/account/settings`, `/de/admin/translations`,
       Sprachwechsel mit und ohne JavaScript.
4. [ ] Restliche Seiten gemäß Abschnitt 10.1 auf Katalogschlüssel umstellen, danach
       `npm run i18n:audit -- --strict` grün.
5. [ ] `NEXTAUTH_URL` je Umgebung prüfen (E-Mail-Links hängen davon ab).
6. [ ] Nach Freigabe: Commit, Push und Deployment – **nicht** Teil dieses Schritts.

---

## 16. Ausdrücklich nicht durchgeführt

- **Keine** produktive Datenbankmigration, kein `prisma migrate deploy`.
- **Kein** Commit, Push, Vercel-Deployment oder Produktionsrelease.
- **Keine** Änderung an Rollen, Berechtigungen oder bestehenden API-Verträgen.
- **Keine** Löschung bestehender Daten oder Texte.
- **Keine** Änderungen an der Desktop-Anwendung.
- **Keine** neuen Drittanbieter-Dienste, keine PHP-Abhängigkeiten, kein Geo-IP.

Alle Änderungen liegen uncommitted im Arbeitsbaum und können vor einem Commit vollständig
geprüft werden.

---

## 17. Nachtrag: automatische Übersetzungs-Engine (DeepL)

Ergänzend zum Interface-System wurde eine zentrale, erweiterbare
Übersetzungs-Engine für **dynamische Inhalte** implementiert. Vollständige
Dokumentation: [`docs/TRANSLATION_ENGINE.md`](./TRANSLATION_ENGINE.md).

| Aspekt | Umsetzung |
|---|---|
| Provider-Abstraktion | `TranslationProvider` (`src/lib/translation/types.ts`); DeepL als Primäranbieter, Mock für Tests |
| Server-Aufrufe | ausschließlich serverseitig, Schlüssel nur in `DEEPL_API_KEY` |
| Validierung | Zod für Provider-Antworten und alle Formulareingaben |
| Idempotenz | `TranslationJob.jobKey` (SHA-256 aus Entität, Feld, Sprache, Quellhash), unique |
| Wiederholungen | Retry bei 429/5xx/Netzwerk mit `Retry-After`/Backoff, kein Retry bei 401/456 |
| Status | `MISSING`, `MACHINE_TRANSLATED`, `REVIEW_REQUIRED`, `APPROVED`, `REJECTED` |
| Freigabeschutz | `APPROVED` wird nie automatisch überschrieben (auch nicht bei erzwungenem Lauf) |
| Veraltung | Quellhash pro Zeile; Abweichung ⇒ nicht ausgeliefert, Kandidat für Neusübersetzung |
| Rechtstexte | immer `REVIEW_REQUIRED`, keine automatische Freigabe |
| Datenschutz | Sperre bei E-Mail/Passwort/Key/JWT/IBAN/Telefon; nur veröffentlichte Inhalte |
| Termschutz | Produktnamen, Versionen, Code, URLs, `{platzhalter}` |
| Kosten | `TranslationUsage` mit Zeichen, Anfragen, `costMicros`, Quota-Snapshot |
| Verlauf | `TranslationEvent` (append-only) mit Akteur, Statuswechsel, Anbieter |
| Admin | `/admin/translations`: Anbieter-/Verbrauchsstatus, Abdeckung, Batch-Start, Original/Übersetzung nebeneinander, Bearbeiten, Freigeben/Ablehnen/Neu übersetzen, Verlauf |
| Hintergrund | `POST /api/cron/translations` (`CRON_SECRET`) + Vercel-Schedule `translations-worker` (täglich 05:30 UTC) |
| Migration | `migrations/app/20261124T1840_i18n_translation_engine` – **erzeugt, nicht angewendet** |
| Tests | 53 Testfälle ohne Netzwerkzugriff (`npm test -- src/lib/translation`), inkl. In-Memory-DB |

Gesamtstand nach diesem Schritt: **72 Test-Suites / 779 Tests grün**, TypeScript 0
Fehler, ESLint 0 Fehler, Build erfolgreich.

Weiterhin gilt: keine produktive Migration, kein Commit, kein Push, kein
Deployment ohne ausdrückliche Freigabe.

---

## 18. Nachtrag: Abnahme der Translation Engine (24. November 2026)

Vollständiger Bericht: [`docs/TRANSLATION_ENGINE_ACCEPTANCE_REPORT.md`](./TRANSLATION_ENGINE_ACCEPTANCE_REPORT.md).

Geprüft wurde auf drei Wegwerf-Datenbanken (PostgreSQL 18.4, Port 5599) und einem lokalen
`next dev`: Migration ab leerer Datenbank und als Upgrade, `db verify --strict`, die
Admin-Oberfläche im Browser (Desktop und 390 × 844), die Sicherheitsvorgaben sowie die
Hintergrundverarbeitung inklusive Vercel-Schedule.

**Ergebnisse:**

| Prüfung | Ergebnis |
| --- | --- |
| Migrationskette leer + Upgrade + `db verify --strict` | bestanden (24/24 Skriptprüfungen, Exit 0) |
| Admin-Oberfläche, alle geforderten Bereiche und Aktionen | bestanden |
| Mobilgeräte-Bedienbarkeit | bestanden (kein Seitenüberlauf; Tabellen horizontal scrollbar) |
| Keine Schlüssel in HTML/Logs | bestanden (Canary 0 Treffer) |
| Keine PII an den Anbieter | bestanden (6/6 blockiert, keine Kosten) |
| Freigaben unverändert | bestanden (7 Batch-Läufe, inkl. erzwungen) |
| Cron-Authentifizierung, Rechte | bestanden (405/401/200, Rolle USER → 403) |
| 429/456/5xx/Netzwerk | bestanden (Retry-Verhalten und Fehlercodes gegen lokalen Stub) |
| Parallele Worker-Läufe | **nicht bestanden** — `claimJob()` nicht atomar (B2) |
| Öffentliche Auslieferung freigegebener Inhalte | **nicht bestanden** — kein Konsument von `localizeRecord()` (B1) |
| DeepL-Kontingent in der Oberfläche | **nicht bestanden** — `usage()` wird nie aufgerufen (B3) |
| Echter DeepL-Smoke-Test | offen — kein gültiger Schlüssel vorhanden |

Damit gilt für die Internationalisierung: Die **Oberflächentexte** sind vollständig und
werden ausgeliefert; die **dynamischen Inhalte** werden zwar gespeichert, geprüft und
freigegeben, aber noch nicht auf den öffentlichen Seiten verwendet. Vor einem
Produktivbetrieb sind B1–B4 zu beheben.

Fokussierter Testlauf der Engine in dieser Abnahme: `src/lib/translation` → 2 Suites,
54 Tests grün. Keine produktive Migration, kein Commit, kein Push, kein Deployment.
