# Custom Links – Abschlussbericht (Nachbesserung, 3. Durchgang)

**Datum:** 2026-11-25
**Repository:** YourEliteSystems/WebRadio-Website
**Status:** ACCEPTANCE READY (lokal vollständig geprüft)

---

## Zusammenfassung

Die Custom-Link-Verwaltung ist vollständig implementiert, migriert, getestet, lokalisiert und im Browser abgenommen.

| Bereich | Ergebnis |
| --- | --- |
| Migration (leere DB) | ✅ 18 Migrationen, `db verify --strict` grün |
| Migration (bestehende Test-DB) | ✅ Upgrade mit erhaltenen Daten und Freigaben, `db verify --strict` grün |
| Unit-/Komponenten-/API-Tests | ✅ 78 Suites, 846 Tests grün |
| Integrationstests (echte PostgreSQL) | ✅ 15 Tests grün |
| i18n | ✅ 40 neue Schlüssel × 7 Sprachen, Katalogprüfung 0 fehlend/leer |
| Cache/Performance | ✅ 2 Abfragen pro Position, Tag-Invalidierung, locale-korrekter Schlüssel |
| Browser-Abnahme | ✅ Desktop, 390 px, Footer, Admin-CRUD, Icon-Suche, 7 Locales |
| TypeScript | ✅ 0 Fehler |
| ESLint | ✅ 0 Fehler (12 bestehende Warnungen, u. a. `<img>`) |
| Production-Build | ✅ Exit 0 |

Kein Commit, kein Push, kein Deployment, keine produktive Migration, keine Änderung produktiver Umgebungsvariablen.

---

## 1. Datenbankmigration

### Neue Migration

`migrations/app/20261125T1957_add_custom_links` (+ Snapshot `763e3b57…`)

- Umfang: **2 `createTable`-Operationen** (`CustomLink`, `CustomLinkLabel`), 10 Operationen insgesamt, **keine** `dropTable`/`dropColumn`.
- Vorgänger: `20261124T1840_i18n_translation_engine` (`e8dc0773…`), Ziel: aktueller Contract (`763e3b57…`).

**Wichtig – Planungskorrektur:** Der erste Planungslauf hing an `80e32e10…` (Analytics-Head) und hätte Advertising- und i18n-Tabellen erneut angelegt (80 Operationen, Fork im Graph). Ursache war der veraltete Ref `migrations/app/refs/db.json`, der noch `80e32e10…` nannte. Der Ref wurde auf den tatsächlich angewendeten Head `e8dc0773…` gesetzt; danach enthält die Migration ausschließlich die beiden Custom-Link-Tabellen. Dieser Ref ist eine Projektmetadatei („zuletzt angewendeter Stand“) und wurde bewusst korrigiert, nicht umgangen.

### Test 1 – leere Datenbank

```
createdb webradio_cl_empty (isolierter Cluster, Trust-Auth, Port 5434)
db migrate  → Exit 0, 18 Migrationen angewendet
db verify --strict → "✔ Database marker and schema match contract"
```

### Test 2 – bestehende Test-Datenbank (Upgrade)

```
createdb webradio_cl_upgrade
db migrate --to 20261124T1840_i18n_translation_engine   → Stand vor Custom Links
Seed: 1 User, 1 News, 1 ContentTranslation APPROVED, 1 MACHINE_TRANSLATED
db migrate (Custom-Link-Migration)                       → Exit 0
```

Ergebnis nach dem Upgrade:

| Prüfung | Vorher | Nachher |
| --- | --- | --- |
| `User` | 1 | 1 |
| `News` | 1 | 1 |
| `ContentTranslation` APPROVED | 1 | 1 (unverändert) |
| `ContentTranslation` MACHINE_TRANSLATED | 1 | 1 (unverändert) |
| `CustomLink` / `CustomLinkLabel` | nicht vorhanden | vorhanden |

`db verify --strict` → „✔ Database marker and schema match contract“.

### Voraussetzung für die lokale Entwicklungsdatenbank (5432)

Die `.env` zeigt auf `postgresql://postgres@127.0.0.1:5432/webradio_dev`. Das entspricht der tatsächlich laufenden lokalen PostgreSQL-18-Instanz (Windows-Dienst, Port **5432**), die **Passwort-Authentifizierung** verlangt (`fe_sendauth: no password supplied`). Die Zugangsdaten liegen nicht im Repository und wurden nicht erraten.

**Offene Voraussetzung:** Passwort für den Benutzer `postgres` der lokalen 5432-Instanz bereitstellen (oder `DATABASE_URL` auf eine isolierte DB zeigen lassen), dann dort `npm run db:migrate` und `npm run db:verify -- --strict` ausführen. Die Migration selbst ist auf zwei isolierten Datenbanken vollständig nachgewiesen.

---

## 2. Automatisierte Tests

### Neue Testdateien

| Datei | Umfang | Ergebnis |
| --- | --- | --- |
| `src/lib/__tests__/custom-links.integration.test.ts` | 15 Tests gegen echtes PostgreSQL | ✅ |
| `src/app/api/__tests__/custom-links-routes.test.ts` | 10 Tests (Routen, Rechte, Fehlercodes) | ✅ |
| `src/components/admin/__tests__/IconSelector.test.tsx` | 6 Tests | ✅ |
| `src/components/public/__tests__/MobileMenu.test.tsx` | 4 Tests | ✅ |

### Abgedeckte Anforderungen

**Service (Integration, echte DB):**
- CRUD inkl. Label-Ersetzung (entfernte Sprache verschwindet) und Löschen der Labels mit dem Link
- Aktivieren/Deaktivieren: deaktivierter Link verschwindet sofort aus der öffentlichen Ausgabe
- Sortierung: Ausgabe in `sortOrder`-Reihenfolge
- Trennung Header (`MAIN_NAVIGATION`) / Footer
- Limit: 11. aktiver Link → `LIMIT_REACHED`; inaktive Drafts unbegrenzt; Reaktivieren über dem Limit → `LIMIT_REACHED`
- Mehrsprachige Labels je Locale; Link ohne Label in der Zielsprache wird ausgelassen (kein Sprachmix)
- Ungültige interne URLs (`https://…`, `//evil.example`, `news`)
- Unsichere Schemata (`javascript:`, `data:`, `vbscript:`, `file:`, relative Pfade bei Typ „extern“)
- Gültige `http`/`https`-Links
- Serverseitige Icon-Validierung (unbekannter Name → `INVALID_ICON`, gültiger Lucide-Name wird gespeichert)
- Leere Label-Liste und `sortOrder` außerhalb 0–100 → `INVALID_DATA`
- URL-Änderung ohne Typangabe wird gegen den gespeicherten Typ geprüft
- Nicht vorhandener Link → `NOT_FOUND`

**Admin-API:**
- 401 ohne Session (GET und POST, Service wird nicht aufgerufen)
- Besitzerzuordnung ausschließlich aus der Session
- Manipulierter Body (zusätzliche `id`/`createdBy`-Felder) wird an den Service weitergereicht und dort erneut validiert
- PATCH ohne `id` → 400 vor jedem Datenbankzugriff
- `LIMIT_REACHED` → 409, `NOT_FOUND` → 404, `INVALID_DATA` → 400
- DELETE ohne `id` → 400; Liste mit `Cache-Control: private, no-store`

**Öffentliche API:**
- Unbekannte Position → 400 `unknown_position`
- Ungültige Locale → Rückfall auf `de`
- Antwort enthält ausschließlich `id, url, type, openInNewTab, iconName, label` – **kein** `position`, `sortOrder`, `createdBy`
- `Cache-Control: public, max-age=60`
- Lesefehler → `{ links: [] }` statt Fehlerseite

**IconSelector:** Suche/Filterung, leeres Ergebnis, Auswahl, Entfernen über „Kein Icon“, Markierung des aktiven Icons, unbekannter gespeicherter Icon-Name rendert ohne Absturz.

**MobileMenu:** Reihenfolge (eingebaute + Custom Links), interne Links bleiben in der App, externe Links mit `target="_blank"` nur bei gesetztem `openInNewTab`, keine Custom Links wenn keine aktiv sind.

### Gesamtstand

```
Jest:        78 Suites, 846 Tests – alle grün
Integration: 15 Tests – alle grün (TEST_DATABASE_URL = isolierte DB)
tsc --noEmit: 0 Fehler
ESLint:      0 Fehler, 12 bestehende Warnungen
```

Ausgeführt mit `node --experimental-vm-modules node_modules/jest/bin/jest.js` bzw. `npm run test:integration -- src/lib/__tests__/custom-links.integration.test.ts` gegen `webradio_customlinks_test` (isolierter Cluster, Port 5434).

Hinweis: Die Integrationssuite leert die `CustomLink`-Tabellen vor jedem Test. Wird sie gegen dieselbe Datenbank ausgeführt, die der lokale Dev-Server nutzt, verschwinden die dortigen Demo-Links – die Abnahme-Daten wurden danach über `.acceptance/seed-links.sql` und `.acceptance/seed-labels.sql` neu eingespielt. Für einen dauerhaften Parallelbetrieb empfiehlt sich eine separate `_test`-Datenbank für die Suite.

---

## 3. Internationalisierung

- **40 neue Schlüssel** unter `admin.customLinks.*` (Formular, Tabelle, Fehlercodes, Icon-Auswahl) in allen sieben Sprachen (`de, en, nl, fr, es, it, pl`).
- Eingetragen über das bestehende Werkzeug `.acceptance/merge-keys.mjs`; vorhandene (auch APPROVED) Werte werden nie überschrieben.
- Katalogprüfung: 0 fehlende, 0 leere, 0 doppelte Schlüssel je Locale.
- Admin-Oberfläche nutzt ausschließlich den vorhandenen `useI18n()`-Provider; kein eigener Resolver, keine neue Übersetzungsarchitektur.
- **Fehlercodes statt Sätze:** Service und API liefern stabile Codes (`INVALID_DATA`, `LIMIT_REACHED`, `NOT_FOUND`, `INVALID_INTERNAL_URL`, `INVALID_EXTERNAL_URL`, `INVALID_ICON`); die Admin-Seite übersetzt sie. Damit ist keine deutsche Meldung im Servercode sichtbar.
- **Deutscher Fallback:** Der Provider mischt das Locale-Bundle über die deutsche Quelle; fehlende Schlüssel erscheinen als deutscher Text, nie als Key.
- **Linkbezeichnungen:** pro Link beliebig viele der sieben Sprachen; die öffentliche Ausgabe liefert nur die Bezeichnung der Besuchersprache und lässt Links ohne diese Sprache weg.
- **Translation Engine:** Custom-Link-Labels sind redaktionelle Navigationstexte und laufen nicht durch die Content-Translation-Pipeline (`ContentTranslation` für News/Legal/Katalog). Es wurden keine APPROVED-Inhalte angefasst und keine MACHINE_TRANSLATED-Inhalte freigegeben.
- Keine unkoordinierten Änderungen an Dateien des i18n-Projekts: geändert wurden nur die Kataloge (additiv) und die Custom-Link-eigenen Dateien.

---

## 4. Cache und Performance

**Gebündeltes Laden**

- Öffentliche Ausgabe: **2 Abfragen pro Position** – ein `CustomLink`-Query (`position`, `isActive`, sortiert) und ein `CustomLinkLabel`-Query für die Sprache. Keine Abfrage pro Link.
- Admin-Liste: 2 Abfragen (Links + alle Labels), Labels werden im Speicher gruppiert.

**Cache**

- `getPublicCustomLinks(position, locale)` ist mit `'use cache'` + `cacheTag('custom-links')` + `cacheLife('minutes')` markiert. Der Cache-Schlüssel enthält Position **und** Locale, ein Sprachwechsel liefert daher nie fremde Labels.
- Jede Mutation (Create/Update/Delete) ruft `revalidateTag('custom-links', 'max')` auf, gekapselt, damit Skripte und Tests außerhalb eines Request-Scopes nicht brechen.

**Eine Quelle für Desktop und Mobil**

- `Header` (Desktop-Navigation) und `MobileMenu` lesen über dieselbe Funktion `getPublicCustomLinks('MAIN_NAVIGATION', locale)`; der Footer nutzt dieselbe Funktion mit `FOOTER`. Es gibt keine zweite Datenquelle.

**Im Browser verifiziert**

- Neu erstellter Link erscheint nach dem Neuladen sofort in Desktop- und Mobilnavigation.
- Deaktivierter Link verschwindet aus der öffentlichen Ausgabe und aus der API.
- Gelöschter Link und seine Labels sind aus Tabelle, API und Navigation verschwunden (DB: 4 Links / 23 Labels nach dem Löschen).

**Hinweis (Framework, kein Custom-Link-Fehler):** Ein bereits geöffneter Tab kann Inhalte aus dem Next-Client-Router-Cache (ca. 30 s) zeigen. Nach Reload bzw. mit cache-bustender URL ist der Stand korrekt; die serverseitige Invalidierung greift sofort.

---

## 5. Browser-Abnahme

Durchgeführt im lokalen Dev-Server (`127.0.0.1:3002`) mit isolierter Test-DB, echter Anmeldung als Test-Administrator und echten Klicks/Formulareingaben.

| Prüfung | Ergebnis |
| --- | --- |
| Desktop-Navigation (1280 px) | ✅ Eingebaute Links + „Aktuelles“ (intern, `/de/news`) + „Partner-Radio“ (extern, `target="_blank"`), inaktiver Link „Versteckt“ nicht sichtbar |
| Mobile Navigation (390 px) | ✅ Menü öffnet, Custom Links erscheinen, intern lokalisiert (`/de/podcasts`), extern `_blank` |
| Footer Desktop | ✅ Eigene Gruppe „Mehr“ mit Custom Link „Dokumentation“ (`/docs`) |
| Footer Mobil (390 px) | ✅ Gleiche Gruppe, gleiche Links |
| Alle sieben Locales | ✅ de „Aktuelles/Partner-Radio“, en „Latest/Partner radio“, nl „Nieuws/Partnerradio“, fr „Actualités/Radio partenaire“, es „Novedades/Radio asociada“, it „Novità/Radio partner“, pl „Aktualności/Radio partnerskie“ |
| Admin-Verwaltung (de) | ✅ Titel, Hinweis „Maximal 10 aktive Links…“, Formular, Tabelle mit Position/Typ/Sortierung/Status |
| Admin-Verwaltung (en) | ✅ Vollständig englisch, keine deutschen Reste im Seiteninhalt |
| Icon-Suche und -Auswahl | ✅ Suche „mic“ filtert, Auswahl „Mic“ wird übernommen, Button zeigt „Mic“, gespeichert (`iconName: Mic`) |
| Erstellen | ✅ `/podcasts`, Sortierung 15, Labels DE/EN, Icon → Zeile erscheint zwischen 10 und 20 |
| Bearbeiten | ✅ Formular lädt URL, Sortierung, Labels, Icon, Status; Label geändert → „Podcasts & Shows“ |
| Aktivieren/Deaktivieren | ✅ Toggle in der Tabelle, Status wechselt, öffentliche Ausgabe folgt |
| Löschen | ✅ Bestätigung, Zeile und Labels entfernt |
| Sortierung | ✅ Reihenfolge 1, 5, 10, 15, 20 in Tabelle und Navigation |
| Interne/externe Links | ✅ Intern lokalisiert, extern mit einstellbarem neuen Tab |
| Unsichere URL | ✅ `javascript:alert(1)` als extern → englische Meldung „External links must start with http:// or https://.“, kein Datensatz |

Nicht geprüft: Darstellung in echten Safari/Firefox-Browsern (nur Chromium) und Verhalten hinter einem CDN.

---

## 6. Geänderte Dateien (3. Durchgang)

**Datenbank**
- `migrations/app/20261125T1957_add_custom_links/*` (neu)
- `migrations/snapshots/763e3b57…/*` (neu)
- `migrations/app/refs/db.json` (Head korrigiert: `80e32e10…` → `e8dc0773…`)

**Backend**
- `src/lib/custom-links/service.ts` – Fehlercodes (`CustomLinkError`), Limit auch bei Update/Reaktivierung, inaktive Drafts unbegrenzt, Labels in einer Abfrage, Cache + Invalidierung, Locale-Whitelist für Labels, URL-Prüfung gegen gespeicherten Typ
- `src/app/api/admin/custom-links/route.ts` – stabile Fehlercodes, Status 400/404/409, `private, no-store`, `id`-Prüfung bei PATCH
- `src/app/api/custom-links/route.ts` – nutzt den gecachten Reader

**Frontend**
- `src/app/[locale]/(admin)/admin/settings/custom-links/page.tsx` – neu geschrieben: typisiert, vollständig über `t()`, Labels beim Bearbeiten geladen, Fehlercodes übersetzt, Status-Toggle, Löschen mit Bestätigung
- `src/components/admin/IconSelector.tsx` – über `useI18n()`, `aria-label`/`aria-pressed`, Schutz gegen unbekannte Icon-Namen
- `src/components/public/Header.tsx` – gecachter Reader, `openInNewTab` respektiert
- `src/components/public/MobileMenu.tsx` – `openInNewTab` respektiert

**i18n**
- `src/i18n/messages/{de,en,nl,fr,es,it,pl}.json` – 40 Schlüssel `admin.customLinks.*` additiv

**Tests**
- `src/lib/__tests__/custom-links.integration.test.ts` (neu)
- `src/app/api/__tests__/custom-links-routes.test.ts` (neu)
- `src/components/admin/__tests__/IconSelector.test.tsx` (neu)
- `src/components/public/__tests__/MobileMenu.test.tsx` (neu)

---

## 7. Offene Punkte

1. **Lokale 5432-Datenbank:** Passwort für `postgres` bereitstellen, dann `npm run db:migrate` und `npm run db:verify -- --strict` gegen `webradio_dev` ausführen. Kein Passwort erraten, keine Sicherheitsmechanismen umgangen.
2. **Breadcrumb „Custom-links“:** Der Pfadname im Admin-Breadcrumb stammt aus dem automatisch erzeugten Pfadsegment, nicht aus einer Übersetzung. Bei Bedarf als eigenen Navigationspunkt mit Schlüssel aufnehmen.
3. **Icon-Liste:** Lucide exportiert Aliasnamen (`Mic`, `MicIcon`, `LucideMic`), die alle als gültig akzeptiert werden. Funktional unkritisch; bei Bedarf auf kanonische Namen filtern.
4. **Client-Cache:** Bis zu ~30 s alte Navigation in bereits geöffneten Tabs (Next-Client-Router-Cache). Serverseitig ist die Invalidierung sofort wirksam.

---

## 8. Freigabegrenzen

- Kein Commit, kein Push, kein Deployment.
- Keine produktive Datenbankmigration; alle Prüfungen liefen auf isolierten lokalen Datenbanken (Port 5434) bzw. der bestehenden Test-DB.
- Keine Änderung produktiver Vercel-Umgebungsvariablen, keine echten E-Mails, keine echten DeepL-Aufrufe.

**Abschlussstatus:** ACCEPTANCE READY – alle Anforderungen des Auftrags sind lokal nachgewiesen; einzig die Migration der passwortgeschützten lokalen 5432-Datenbank benötigt die oben genannte Zugangsdaten-Voraussetzung.
