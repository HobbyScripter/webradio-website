# Phase 5 — Developer-Backend, Admin-Backend und rollenabhängige Navigation

**Projekt:** `F:\Dev\webradio-website`
**Datum:** 2026-10-24
**Branch:** `master`
**Status:** Die Phase-5-Funktionen sind lokal implementiert und validiert.
Der Arbeitsbaum wurde während der Bearbeitung **extern durch den
Projektinhaber** als Commit `40984e4` gespeichert; dieser Agent hat weder
committet noch gepusht. Es gab **kein Deployment, keinen
SYSTEM_ADMIN-Bootstrap** und keinen Zugriff auf eine Produktionsdatenbank.
Das Electron-Projekt `YourEliteSystems/WebRadio` wurde nicht verändert.

Die Angaben zu Tests in diesem Bericht sind echte lokale Ergebnisse. Keine
Funktion wird als fertig bezeichnet, wenn nur die Oberfläche existiert.

---

## 1. Zusammenfassung

| Bereich | Ergebnis |
|---|---|
| Navigation | Ausgeloggte und eingeloggte Navigation, Kontodropdown und Mobile-Menü rollenabhängig; kein „Anmelden“ bei gültiger Session |
| Rollen | Zentrale Hierarchie `USER < DEVELOPER < ADMIN < SYSTEM_ADMIN` in `src/lib/roles.ts`; Server prüft weiterhin die DB-Session |
| Dashboard-Rahmen | Gemeinsame Sidebar, Breadcrumbs, Seitentitel, Status- und Leerzustände für Account, Developer, Admin und System-Admin |
| Konto | Profil, Verifizierungsstatus, Passwortwechsel und Sitzungsverwaltung über bestehende Services |
| Developer | Eigene Plugins/Themes: Entwurf, Bearbeiten, Version, Einreichen, Zurückziehen, Löschen, Moderationsfeedback |
| Admin | Benutzer (nur lesen + Rollenwechsel), Moderation, News, Audit-Protokoll, echte Kennzahlen |
| Eigentum | Jeder Developer-Zugriff filtert serverseitig auf das eigene `DeveloperProfile`; fremde IDs liefern 404 |
| Moderation | Statusübergänge validiert, Zeile gesperrt, Entscheidung atomar mit Audit und `PublicationReview` |
| Datenmodell | **Keine neue Migration nötig**; die benötigten Status (`DRAFT`, `CHANGES_REQUESTED`, …) existierten bereits im Contract |
| Tests | `npm test`: 20 Suiten, **179 Tests grün**; `npm run test:integration`: 2 Suiten, **81 Tests grün** |
| Prüfungen | `type-check`, `lint` (0 Fehler, 0 Warnungen), `db:verify`, `build` erfolgreich |

---

## 2. Wiederverwendete bestehende Bausteine

- **Auth/Session:** `src/lib/server-auth.ts`, `src/lib/auth.ts`, DB-Sessions und
  `requireDeveloperSession` / `requireAdminSession`; keine zweite
  Authentifizierungsquelle.
- **Rollen und Rechte:** bestehende `hasRole`/`assertRole`-Logik; die neue
  Client-Navigation liest nur `src/lib/roles.ts`, die Sicherheitsgrenze bleibt
  serverseitig.
- **Rate-Limits:** bestehende PostgreSQL-Buckets in `src/lib/rate-limit.ts`,
  erweitert um `contentWrite`, `moderationDecision` und `adminUserWrite`.
- **Fehlerbehandlung:** `src/lib/api-response.ts` (`errorResponse`,
  `noStoreJson`, `readJsonObject`, `isSameOriginRequest`).
- **News:** bestehendes `src/lib/news-service.ts` und das News-Modell.
- **Katalog:** bestehende `src/lib/catalog.ts`-Filter (`APPROVED` **und**
  `isPublished`) für öffentliche Sichtbarkeit.
- **Design:** vorhandene UI-Tokens, `Button`, `Container`, Icons sowie
  `EmptyState` / `ErrorState`; kein zweites Designsystem.
- **Bestehende Seiten:** Account-, Developer- und Admin-Routen wurden
  weiterverwendet und um die fehlenden Funktionen ergänzt, nicht neu erfunden.

---

## 3. Login-abhängige Navigation

### Desktop

`src/components/public/Header.tsx` rendert die öffentlichen Links statisch und
lädt die Sessionkontrolle in einer `Suspense`-Grenze:

- **Ausgeloggt:** „Entwickler“, „Registrieren“, „Anmelden“.
- **Eingeloggt:** `AccountDropdown` statt des Anmelden-Buttons.
- **Ladezustand:** neutraler Skeleton-Platzhalter gleicher Größe. Bewusst
  **keine** ausgeloggten Buttons, damit kein „Anmelden“ aufblitzt.
- **Abmelden:** `signOut({ callbackUrl: '/' })` mit voller Navigation; dadurch
  rendert der Server-Header sofort den ausgeloggten Zustand.

`AccountDropdown` bietet:

- `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`, `role="menu"`.
- Escape schließt und gibt den Fokus an den Auslöser zurück.
- Pfeil hoch/runter, Home/End bewegen den Fokus; Tab schließt das Menü.
- Klick außerhalb schließt ohne Fokusklau.
- Rollenabhängige Einträge aus `ACCOUNT_NAV_ITEMS`.

### Mobile

`src/components/public/MobileMenu.tsx` zeigt ausgeloggt „Anmelden“,
„Registrieren“ und „Entwicklerbereich“. Eingeloggt ersetzt ein aufklappbarer
Kontobereich diese Aktionen. Escape schließt das gesamte Menü. Die
rollenabhängigen Links stammen aus derselben zentralen Tabelle.

### Rollenabhängige Links

| Rolle | Zusätzliche Einträge |
|---|---|
| `USER` | Mein Konto, Profil, Sicherheit |
| `DEVELOPER` | + Developer-Dashboard |
| `ADMIN` | + Admin-Dashboard (und Developer, da höhere Rolle) |
| `SYSTEM_ADMIN` | + Systemverwaltung |

Unbekannte oder fehlende Rollen werden wie `USER` behandelt; ein manipuliertes
Session-Objekt kann damit keine privilegierten Links erzeugen.

---

## 4. Gemeinsamer Dashboard-Rahmen

Wiederverwendete Komponenten unter `src/components/dashboard/`:

- `DashboardNav` — responsive Sidebar bzw. horizontale Navigation.
- `DashboardBreadcrumbs`, `DashboardPageHeader` — Titel und Pfad.
- `AccessDenied` — einheitliche 403-Darstellung.
- `CatalogStatusBadge` — konsistente Statusanzeige.
- `CatalogEntryForm` / `CatalogEntryEditor` / `VersionForm` —
  Formulare mit Server-Action-Anbindung.
- `ModerationDecisionForm`, `NewsForm`, `RoleChangeForm`,
  `DangerActionForm` — administrative Formulare mit Pflichtfeldern und
  Bestätigung.
- `EmptyState` / `ErrorState` aus `src/components/ui/states.tsx` für leere und
  fehlerhafte Datenzustände.

Die Layouts `(account)`, `(developer)`, `(admin)` und `(system-admin)` prüfen
die Session und Rolle bei jedem Request (`export const instant = false`).
Unangemeldete Besucher werden zur Anmeldung mit `callbackUrl` geleitet;
angemeldete Benutzer ohne ausreichende Rolle sehen `AccessDenied` und keine
geschützten Daten.

---

## 5. Benutzerkonto

- `/account` zeigt echte Kontodaten, Verifizierungsstatus und
  Rolleninformationen aus PostgreSQL.
- `/account/profile` lädt die Werte serverseitig und speichert über
  `PUT /api/account/profile`; E-Mail-Änderung verlangt das aktuelle Passwort.
- `/account/security` ändert das Passwort nur mit aktuellem Passwort und
  validierter Mindestlänge; alle anderen Sessions werden serverseitig
  widerrufen.
- Sitzungsliste und gezieltes Widerrufen fremder eigener Sessions über
  `/api/account/sessions`; die aktuelle Sitzung kann nicht über den
  Session-Endpunkt beendet werden.
- Abmelden ist in Desktop- und Mobile-Navigation verfügbar.
- Die öffentliche Profilseite gibt keine Rolle, Session-IDs oder Hashes aus.

**Einschränkung:** E-Mail-Versand (Verifizierung, Passwort-Reset) nutzt den
bestehenden Outbox-/SMTP-Pfad. Ohne konfiguriertes SMTP ist der Versand nicht
produktionsbereit; die Oberfläche darf das nicht als garantiert zustellbar
darstellen.

---

## 6. Developer-Backend

### Übersicht und Kennzahlen

`/developer` liest Plugins, Themes, Entwürfe, laufende Einreichungen und
Moderationsentscheidungen aus der Datenbank. Fehlende Daten führen zu einem
Leerzustand, nicht zu Dummy-Zahlen.

### Plugin- und Theme-Verwaltung

Folgende Seiten existieren für beide Typen:

- Liste mit Statusfilter und Suche (`/developer/plugins`, `/developer/themes`).
- Anlegen mit „Als Entwurf speichern“ oder „Zur Einreichung“.
- Detailansicht inklusive Versionen, Screenshots, Tags und Moderationsfeedback.
- Bearbeiten, Löschen, Einreichen und Zurückziehen.
- Neue Version anlegen.

Alle Schreibvorgänge laufen über Server Actions in
`src/app/(developer)/developer/actions.ts`, die ausschließlich
`src/lib/developer-catalog-service.ts` aufrufen. Die UI schreibt nie direkt in
die Datenbank.

### Status- und Moderationslogik

`src/lib/catalog-workflow.ts` ist die einzige Quelle für Übergänge:

- Einreichen nur aus `DRAFT`, `REJECTED`, `CHANGES_REQUESTED` oder `ARCHIVED`.
- Eine Einreichung benötigt mindestens eine Version.
- Während `PENDING_REVIEW` sind keine neuen Versionen und keine zweite
  Einreichung möglich.
- Bearbeiten oder neue Version eines `APPROVED`- bzw. veröffentlichten
  Eintrags setzt ihn auf `PENDING_REVIEW` und `isPublished = false`.
- Eine Ablehnung oder Änderungsanfrage verlangt eine Begründung mit mindestens
  10 Zeichen (Zod **und** Service).
- Nur `PENDING_REVIEW` kann entschieden werden; eine zweite Entscheidung wird
  mit `STALE_SUBMISSION` (409) abgelehnt.

### Eigentumsprüfung

`requireDeveloperProfile` liest die Rolle des Akteurs aus PostgreSQL und
verlangt ein eigenes `DeveloperProfile`. Jede Abfrage enthält `developerId` in
der `WHERE`-Klausel. `getOwnedEntry`, `updateCatalogEntry`, `deleteCatalogEntry`,
`submitCatalogEntry`, `withdrawCatalogEntry` und `addCatalogVersion` liefern für
fremde IDs dieselbe 404 wie für unbekannte IDs.

### Entwicklerprofil

Das Profil zeigt `displayName`, `bio`, `githubUrl` und `websiteUrl`. URLs
werden über `urlSchema` auf `http:`/`https:` beschränkt; es wird kein HTML
ausgeführt. Es gibt keine frei wählbaren Rollen- oder Eigentumsfelder.

---

## 7. Admin-Backend

### Dashboard

`/admin` zeigt serverseitig ermittelte Kennzahlen:

- Benutzer gesamt, davon verifiziert.
- Plugins/Themes je Status und offene Moderationsfälle.
- Nicht veröffentlichte News.
- Letzte Audit-Ereignisse.
- Hinweis, wenn E-Mail-Versand nicht konfiguriert ist.

Keine Fake-Statistiken, keine Passwort-Hashes, Tokens oder Secrets.

### Benutzerverwaltung

- `/admin/users`: Suche, Rollenfilter, Pagination, Verifizierungsstatus.
- `/admin/users/[id]`: Kontoübersicht, Entwicklerprofil, Anzahl Erweiterungen,
  aktive Sessions und letzte Audit-Ereignisse.
- Rollenwechsel über `changeUserRole` mit zentraler Hierarchie, Audit und
  Schutz des letzten SYSTEM_ADMIN.
- `SYSTEM_ADMIN` ist nicht über `assignableRoleSchema` wählbar; die
  Rollen-API lehnt es mit 400 ab.
- Für ein SYSTEM_ADMIN-Konto zeigt die Detailseite keine Rollenänderung für
  normale ADMINs; der Service lehnt solche Änderungen zusätzlich ab.
- **Nicht implementiert:** Sperren, Deaktivieren oder Löschen von Konten. Das
  bestehende Schema hat kein Kontostatus-Feld; die Funktion wurde bewusst nicht
  improvisiert.

### Moderation

- `/admin/moderation`: offene Plugins und Themes mit Entwickler und Datum.
- `/admin/moderation/[type]/[id]`: vollständige Einreichung, Versionen,
  bisherige Entscheidungen und Entscheidungsformular.
- Genehmigen, Ablehnen, Änderungen anfordern; Begründung ist bei Ablehnung und
  Änderungsanfrage Pflicht.
- `decideCatalogEntry` prüft die ADMIN-Rolle erneut in der Transaktion, sperrt
  die Zielzeile mit `FOR NO KEY UPDATE`, verlangt `PENDING_REVIEW` und schreibt
  `PublicationReview` plus Audit atomar.
- Offene Fälle werden nach der Entscheidung aus der Liste entfernt; veraltete
  oder doppelte Entscheidungen liefern 409.

### News

- `/admin/news`, `/admin/news/create`, `/admin/news/[slug]/edit`.
- Anlegen erzeugt **immer** einen Entwurf, auch wenn der Request
  `isPublished: true` sendet.
- Veröffentlichen und Zurückziehen sind getrennte, audited Aktionen.
- Bearbeiten ändert den Veröffentlichungsstatus nicht.
- Öffentliche Reads filtern auf `isPublished = true` **und**
  `publishedAt <= jetzt`; Entwürfe und zurückgezogene Artikel sind weder über
  Seiten noch über `/api/news` erreichbar.
- Löschen ist bestätigt und audited.

### Audit-Protokoll

- `/admin/audit` und `GET /api/admin/audit-logs` sind ausschließlich lesend.
- Filter nach Aktion, Akteur und Suchtext, Pagination.
- Rückgegeben werden ID, Akteurs-ID, Aktion, Details und Zeitpunkt; keine
  IP-Adressen, User-Agents, Passwort-Hashes oder Tokens.
- Schreib- oder Löschfunktionen für Audit-Einträge existieren in der
  Anwendung nicht.

---

## 8. Autorisierung und Sicherheitsgrenzen

| Prüfung | Umsetzung |
|---|---|
| Seiten | Layouts und Seiten rufen `requireDeveloperSession` / `requireAdminSession` bzw. prüfen `hasRole` |
| Server Actions | lösen die Session erneut auf, delegieren an Services, die Rolle und Eigentum erneut prüfen |
| JSON-APIs | `require*Session` plus Service-Prüfung; Akteur ausschließlich aus der Session |
| CSRF | `isSameOriginRequest` vor jeder JSON-Mutation, zusätzlich SameSite-Cookies und Next.js-Server-Action-Schutz |
| Eigentum | `developerId` in jeder Query; fremde IDs → 404 |
| Moderation | Rollenprüfung in der Transaktion, Zeilensperre, Statusprüfung |
| SYSTEM_ADMIN | nicht zuweisbar, nur CLI-Bootstrap/Recovery; letzter SYSTEM_ADMIN geschützt |
| Rate-Limits | pro Konto für Schreibvorgänge und Moderation, pro IP/Konto für Auth |
| Caching | alle geschützten APIs `Cache-Control: no-store`; Dashboard-Routen dynamisch |
| Fehler | `AuthError`-Codes nach außen, alles andere generisch 500 ohne Stacktrace |
| Eingaben | Zod-Schemata, Slug-/URL-Whitelists, keine clientseitigen DB-Zugriffe |
| Produktgrenze | `WEBRADIO` als Zod-Literal und DB-Constraint unverändert |

---

## 9. Routen und APIs

### Seiten

**Konto:** `/account`, `/account/profile`, `/account/security`

**Developer:** `/developer`, `/developer/plugins`, `/developer/plugins/create`,
`/developer/plugins/[slug]`, `/developer/plugins/[slug]/edit`,
`/developer/plugins/[slug]/versions/create`, entsprechende Theme-Routen,
`/developer/submissions`, `/developer/profile`

**Admin:** `/admin`, `/admin/users`, `/admin/users/[id]`,
`/admin/moderation`, `/admin/moderation/[type]/[id]`, `/admin/news`,
`/admin/news/create`, `/admin/news/[slug]/edit`, `/admin/audit`

**System:** `/system-admin`

### JSON-APIs

**Konto:** `GET/PUT /api/account/profile`, `GET /api/account/sessions`,
`DELETE /api/account/sessions/[sessionId]`, `POST /api/account/password`

**Developer:**

- `GET/POST /api/developer/plugins`
- `GET/PUT/DELETE /api/developer/plugins/[id]`
- `POST /api/developer/plugins/[id]/versions`
- `POST/DELETE /api/developer/plugins/[id]/submit`
- dieselben vier Routen für `/api/developer/themes`
- `GET/PUT /api/developer/profile`

**Admin:**

- `GET /api/admin/users`, `GET /api/admin/users/[id]`,
  `POST /api/admin/users/role`
- `GET /api/admin/moderation`, `POST /api/admin/moderation/decision`
- `GET/POST /api/admin/news`, `GET/PUT/PATCH/DELETE /api/admin/news/[id]`
- `GET /api/admin/audit-logs`

Öffentliche APIs (`/api/plugins`, `/api/themes`, `/api/news`, `/api/releases`)
wurden nicht gelockert.

---

## 10. Datenmodell und Migrationen

Es wurden **keine neuen Tabellen, Spalten oder Migrationen** hinzugefügt.
`prisma/contract.prisma` ist unverändert; die bereits vorhandenen Enums
enthalten `DRAFT` und `CHANGES_REQUESTED`, und `PublicationReview` deckt das
Moderationsfeedback ab. `npm run db:verify` bestätigt, dass Datenbank und
Contract übereinstimmen.

Damit bleibt die Anforderung „additiv und reproduzierbar“ erfüllt: Es gibt
nichts Zusätzliches zu migrieren. Eine frische Testdatenbank wird weiterhin
über die vorhandenen Prisma-8-Befehle aufgebaut.

---

## 11. Tests und Prüfergebnisse

Alle Befehle wurden lokal im Projekt ausgeführt.

| Befehl | Ergebnis |
|---|---|
| `npm run type-check` | erfolgreich, keine Fehler |
| `npm run lint` | erfolgreich, 0 Fehler, 0 Warnungen |
| `npm test` | **20 Suiten, 179 Tests, alle grün** |
| `npm run test:integration` | **2 Suiten, 81 Tests, alle grün** (echtes PostgreSQL, `_test`-DB) |
| `npm run db:verify` | „Database marker and schema match contract“ |
| `npm run build` | erfolgreich; alle geschützten Routen dynamisch |

### Neue Tests in dieser Phase

- `src/lib/__tests__/roles.test.ts` — Hierarchie und Navigation für alle Rollen.
- `src/lib/__tests__/catalog-workflow.test.ts` — Sichtbarkeit, Bearbeiten,
  Einreichen, Versionen, Entscheidungen, Begründungspflicht.
- `src/components/__tests__/account-navigation.test.tsx` — Desktop-Dropdown und
  Mobile-Menü: kein „Anmelden“ mit Session, Rollenlinks, ARIA, Escape,
  Pfeilnavigation, Abmelden.
- `src/app/api/__tests__/phase5-routes.test.ts` — 401/403, Cross-Origin, Rate
  Limit, Akteur aus Session statt Body, 404 bei fremdem Eigentum,
  Validierungsfehler, News-Veröffentlichungsflag.
- `src/lib/__tests__/phase5.integration.test.ts` — 27 echte DB-Tests:
  Developer A/B-Trennung, Rollen, Entwurf/Version/Einreichung, Zurückziehen,
  Genehmigung/Ablehnung/Änderung, veraltete Entscheidung, Re-Review nach
  Bearbeitung, News-Sichtbarkeit, Audit.

### Abdeckung der geforderten Testfälle

| Anforderung | Nachweis |
|---|---|
| Ausgeloggte Navigation | Mobile-Menü-Test (Anmelden/Registrieren/Entwicklerbereich) |
| Navigation je Rolle | `roles.test.ts` + Dropdown-Tests für USER/DEVELOPER/ADMIN/SYSTEM_ADMIN |
| Kein Anmelden-Button mit Session | Dropdown- und Mobile-Tests |
| Ungültige/abgelaufene Session | bestehende Auth-Tests (`validateDatabaseSession`, 401-Routen) |
| Developer A vs. B | Integrationstests für Lesen, Ändern, Version, Einreichen, Löschen |
| USER ohne Developer/Admin-Rechte | Routen-401/403 und Service-`ForbiddenError` |
| ADMIN-Moderation | Integration: Genehmigen, Ablehnen, Änderungen, Audit |
| Kein SYSTEM_ADMIN über Admin-Formulare | `assignableRoleSchema`- und Rollen-Routen-Test; Service-Schutz |
| Schutz des letzten SYSTEM_ADMIN | bestehende Integrationstests, unverändert grün |
| Unveröffentlichte Inhalte unsichtbar | Integration für News, Themes und Plugins |
| Ungültige Statusübergänge | `VERSION_REQUIRED`, `REVIEW_IN_PROGRESS`, `INVALID_STATUS_TRANSITION`, `STALE_SUBMISSION` |
| Audit-Einträge | Integration prüft Aktionen, Zeitstempel und fehlende Secrets |
| Lade-/Fehler-/Leerzustände | gemeinsame Komponenten; bestehende Tests für `EmptyState`/`ErrorState`; Ladezustände über Suspense |
| Desktop und Mobile bedienbar | Dropdown- und Mobile-Menü-Tests inkl. Tastatur |
| Bestehende Auth-/Rate-Limit-/DB-Tests | 54 bestehende Integrationstests weiterhin grün |

**Ehrliche Einschränkung:** Der Desktop-Header selbst ist eine asynchrone
Server-Komponente mit `next-auth` und wird nicht als React-Komponententest
gerendert; getestet sind die darin verwendeten interaktiven Teile
(`AccountDropdown`, `MobileMenu`) und der Produktions-Build. Die
Dashboard-Seiten wurden über den Build und die Service-/Routentests abgedeckt,
nicht jede Seite einzeln per Browser automatisert.

---

## 12. Offene Punkte und Infrastrukturabhängigkeiten

1. **SMTP/E-Mail:** Verifizierungs- und Reset-Mails sind ohne konfiguriertes
   SMTP nicht zustellbar. Der Outbox-Pfad ist für Tests geeignet, aber kein
   Produktionsversand.
2. **Kontosperrung/-löschung:** nicht implementiert, weil das Schema kein
   Statusfeld besitzt. Eine sichere Lösung bräuchte eine eigene, geplante
   Migration und Session-Invalidierung.
3. **Pagination:** Admin-Benutzer- und Audit-API laden die Tabelle und
   filtern/paginieren im Speicher. Für die aktuelle Größe korrekt, bei
   Millionenzeilen ein Performance-Thema (keine Sicherheitslücke).
4. **SYSTEM_ADMIN-Sichtbarkeit:** Normale ADMINs sehen SYSTEM_ADMIN-Konten in
   der schreibgeschützten Benutzerliste. Ändern, Herabstufen oder Rollenvergabe
   ist serverseitig gesperrt; eine vollständige Ausblendung wäre eine
   Produktentscheidung.
5. **Datei-Uploads:** Versionen verweisen auf extern gehostete `fileUrl`s; es
   gibt keinen Upload-/Malware-Scan in dieser Phase.
6. **Kein Deployment:** Es wurde nichts veröffentlicht; die Prüfung gegen eine
   echte Produktionsumgebung steht aus.

---

## 13. Verbleibende Sicherheitsrisiken

- **Lesbare Audit-Details:** Audit-Einträge enthalten teilweise frühere Namen
  oder Slugs. Das sind keine Secrets, aber personenbezogene/metadatenhaltige
  Informationen; die Aufbewahrungsdauer ist nicht automatisiert.
- **Admin ist mächtig:** Ein ADMIN kann alle Katalogeinträge und News
  verwalten. Das ist beabsichtigt; SYSTEM_ADMIN bleibt trotzdem geschützt.
- **Rate-Limit-Ausfall:** Schreibaktionen verwenden
  `consumeRateLimitSafely`; bei einem Datenbankfehler kann der Limiter
  ausfallen, die Session-/Rollenprüfung bleibt aber bestehen.
- **Interne Fehlerlogs:** `logServerError` schreibt Typ und Code, keine
  Stacktraces an den Client. Die Logs selbst müssen weiterhin zugriffsgeschützt
  bleiben.
- **System-Administration:** Die SYSTEM_ADMIN-Verwaltung bleibt auf den
  CLI-Bootstrap/Recovery beschränkt; es gibt keine UI zum Anlegen weiterer
  SYSTEM_ADMINs.

---

## 14. Git-Status

Aktueller Stand nach der externen Speicherung:

```text
Branch:  master
HEAD:    40984e4 feat: add VersionForm component for managing version metadata
Status:  master...origin/master (kein ahead/behind angezeigt)
Untracked: docs/PHASE5_REPORT.md
```

Der Commit `40984e4` wurde **nicht von diesem Agenten** erstellt; er enthält
die zuvor uncommitteten Phase-5-Änderungen. Dieser Agent hat weder committet
noch gepusht und nichts zurückgesetzt. Der vorliegende Bericht ist die einzige
noch nicht versionierte Datei.

**Geänderte Kernbereiche:**

- Navigation/UI: `src/components/public/Header.tsx`,
  `AccountDropdown.tsx`, `MobileMenu.tsx`, `DashboardNav.tsx`
- Account: `src/app/(account)/**`, `src/app/api/account/**`
- Developer: `src/app/(developer)/**`, `src/app/api/developer/**`,
  `src/lib/developer-catalog-service.ts`, `src/lib/catalog-workflow.ts`
- Admin: `src/app/(admin)/**`, `src/app/api/admin/**`,
  `src/lib/news-service.ts`
- Sicherheit/Infrastruktur: `src/lib/roles.ts`, `src/lib/developer-api.ts`,
  `src/lib/admin-api.ts`, `src/lib/api-response.ts`, `src/lib/rate-limit.ts`,
  `src/lib/validations.ts`
- Dashboard-Komponenten: `CatalogEntry*`, `ModerationDecisionForm`,
  `NewsForm`, `RoleChangeForm`, `DangerActionForm`, `VersionForm`,
  `CatalogStatusBadge`
- Tests: die fünf oben genannten neuen Testdateien

**Unverändert:** `prisma/**` (keine Migration), Electron-Repository,
Produktionsdatenbank, Bootstrap-Skripte.

Detaillierte Liste: `git status --short` im Projektroot.
