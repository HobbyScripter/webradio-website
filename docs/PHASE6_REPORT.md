# Phase 6 – Entwicklerfreischaltung, Kontosperren, Meldungen und Rechtstexte

**Stand:** 2026-10-25
**Branch:** `master` · **HEAD:** `99a426c` (unverändert)
**Datenbank:** ausschließlich lokale Testdatenbank `webradio_test` (127.0.0.1:5433)

## 1. Ausgangszustand und Grenzen

- Die 13 vorhandenen Working-Tree-Änderungen aus der E-Mail-/DB-Arbeit wurden
  gelesen, nicht zurückgesetzt und an den betroffenen Stellen nur minimal
  ergänzt.
- Keine Migration gegen Produktion, keine Änderung an Umgebungsvariablen oder
  Vercel, keine echte E-Mail, kein Commit, Push oder Deployment.
- Die Migration `migrations/app/20261025T1842_phase6_dev_access_reports_suspension`
  wurde ausschließlich gegen `webradio_test` geplant und angewendet. Die
  Zielprüfung erfolgte vor dem Befehl anhand von Hostname (Loopback) und
  Datenbankname (`_test`); die Wrapper-Ausgabe zeigte
  `→ Prisma CLI connection: DATABASE_URL (local development fallback) (127.0.0.1)`.

## 2. Implementierte Funktionen

### 2.1 Entwicklerantrag (D1 = A)

- `DeveloperApplication` mit `PENDING / APPROVED / REJECTED / WITHDRAWN`.
- Antragstellung, Statuseinsicht und Rückzug über `/account/developer` und die
  geschützte API `/api/account/developer-application` (GET/POST/DELETE).
- Motivation 50–2000 Zeichen (Pflicht), Portfolio-URL optional und nur
  `http(s)` über das vorhandene `urlSchema`.
- Rate-Limit: 3 Anträge pro Tag und Konto.
- Doppelte offene Anträge werden über eine Transaktion mit
  `pg_advisory_xact_lock` plus Existenzprüfung verhindert (ein leeres
  Result-Set sperrt keine Zeile, deshalb reicht ein `SELECT` allein nicht).
- Admin-Queue `/admin/developer-applications` mit Genehmigen/Ablehnen.
  Eine Ablehnung erfordert eine Begründung.
- Die Genehmigung ruft `applyRoleChangeInTransaction()` auf — denselben
  zentralen Rollenwechsel wie jede andere Rollenänderung. Antrag und Rolle
  werden in **einem** Commit gesetzt; eine zweite Entscheidung wird mit
  `APPLICATION_ALREADY_DECIDED` abgelehnt.
- **E-Mail-Ausnahme:** `DEVELOPER` darf ohne bestätigte Adresse vergeben werden,
  `ADMIN` und `SYSTEM_ADMIN` bleiben verifizierungspflichtig. Bei der Ausnahme
  entsteht ein eigener Audit-Eintrag `DEVELOPER_GRANTED_UNVERIFIED_EMAIL`. Es
  gibt kein Client-Flag und keinen übertragbaren Parameter: die Ausnahme ist an
  die zu vergebende Rolle gebunden.

### 2.2 E-Mail-Pause

- `EMAIL_DELIVERY_ENABLED` (Default: alles außer exakt `"true"` = pausiert).
- Pausiert bedeutet: kein Resend-Aufruf, keine SMTP-Verbindung, **keine**
  Outbox-Datei, kein vorgetäuschter Erfolg
  (`{ delivered: false, mode: 'paused', failure: 'delivery_paused' }`).
- `requestEmailVerification` und `requestPasswordReset` erzeugen in der Pause
  **kein** Token für einen unzustellbaren Link.
- Bestehende Verifizierungs- und Reset-Funktionen bleiben vollständig erhalten;
  Reaktivierung ist ein Variablenwechsel (`docs/EMAIL_SETUP.md`).
- Irreführende UI-Texte („Bestätige sie, um alle Funktionen nutzen zu können“)
  wurden auf den tatsächlichen Zustand umgestellt.

### 2.3 Kontosperren

- `User.status` (`ACTIVE`/`SUSPENDED`), `suspendedAt`, `suspendedUntil`,
  `suspendedReason`, `suspendedById` mit `ON DELETE SET NULL`.
- Semantik als reine Funktion in `src/lib/roles.ts`:
  `SUSPENDED` + `null` = dauerhaft, `SUSPENDED` + Zeitpunkt in der Zukunft =
  befristet, `SUSPENDED` + Zeitpunkt in der Vergangenheit = effektiv zugänglich.
  Der Ablauf wird **nie zurückgeschrieben**; parallele Requests am
  Ablaufzeitpunkt liefern dasselbe Ergebnis ohne Schreibvorgang.
- Status und Ablaufdatum werden immer im selben `UPDATE` geschrieben. Eine
  dauerhafte Sperre besitzt deshalb gar keinen Zeitstempel, der sie aufheben
  könnte.
- Sperren löscht alle `Session`-Zeilen des Kontos in derselben Transaktion.
  Entsperren stellt keine Session wieder her.
- Die Prüfung greift an beiden Stellen: `authenticateUser()` (nach der
  Passwortprüfung, damit kein Konto-Orakel entsteht) und `resolveSession()`
  (zentrale Auflösung für jede Serverprüfung).
- Transaktionssichere Admin-Regeln über den aus `changeUserRole` ausgelagerten
  `lockPrivilegedUsers()`: keine Selbstsperre, kein niedriger privilegierter
  Admin gegen `SYSTEM_ADMIN`, kein letzter `ADMIN`, kein letzter
  `SYSTEM_ADMIN`, keine Rollenvergabe an gesperrte Konten.
- Audit: `ACCOUNT_SUSPENDED`, `ACCOUNT_SUSPENSION_LIFTED`. Der Ablauf erzeugt
  bewusst keinen künstlichen Admin-Eintrag.

### 2.4 Meldungen, Takedown und Verwarnungen (D3 = A)

- `ContentReport` mit Zieltypen `PLUGIN | THEME | PLUGIN_VERSION |
  THEME_VERSION`, sechs serverseitig validierten Gründen, optionalem Freitext
  (max. 2000 Zeichen) und Status
  `OPEN | DISMISSED | CONTENT_REMOVED | WARNING_ISSUED | ACCOUNT_SUSPENDED`.
- Meldeweg: `/report` (Session erforderlich) und `POST /api/reports`;
  Rate-Limit 10 Meldungen pro Tag und Konto.
- Doppelte Meldung desselben Nutzers zum selben Ziel: Unique-Constraint plus
  advisory-lock-gesicherte Prüfung → `409`.
- `REMOVED` als terminaler Status für Plugin und Theme: unsichtbar in allen
  öffentlichen Queries (dort gilt weiterhin `APPROVED` **und** `isPublished`),
  nicht erneut einreichbar (`canSubmitForReview`), nicht mehr bearbeitbar und
  ohne neue Versionen (`ENTRY_REMOVED`).
- Takedown schreibt `PublicationReview` mit `ReviewResult.REMOVED` **und**
  `AuditLog` `CATALOG_ENTRY_REMOVED`; Inhalt und Report werden in einer
  Transaktion behandelt.
- Verwarnung erzeugt `USER_WARNED` mit `"emailSent":false`; es gibt kein
  zusätzliches Benachrichtigungsmodell.
- Meldungen selbst ändern nichts. Jede Entscheidung verlangt eine Begründung
  (min. 10 Zeichen) und wird mit Admin, Zeitpunkt und Ziel auditiert.

### 2.5 Rechtstexte (D2 = A)

- `/impressum`, `/datenschutz`, `/nutzungsbedingungen` mit zentraler
  Konfiguration in `src/lib/legal.ts`.
- Zwei Gates: eingecheckte Konstante `LEGAL_RELEASE_APPROVED = false` **und**
  vollständige Betreiberangaben. Solange eines fehlt, rendert jede Route für
  **alle** Besucher den Zustand „Freigabe ausstehend“ mit Liste der fehlenden
  Pflichtangaben — keine Platzhalter, keine erfundenen Angaben.
- Vor Freigabe: kein Footer-Link (der bestehende „noch nicht veröffentlicht“-
  Hinweis bleibt), kein Sitemap-Eintrag, `robots: index:false`.
- `noindex` wird ausdrücklich nicht als Zugriffsschutz behandelt.
- Die Datenschutzgliederung beschreibt den realen Betrieb inklusive pausiertem
  E-Mail-Versand, Sitzungs-Cookie, Audit- und Rate-Limit-Daten sowie Meldungen
  und Sperren. `docs/LEGAL_LAUNCH_CHECKLIST.md` wurde fortgeschrieben (inkl.
  Korrektur, dass kein SMTP-Versand aktiv ist).

## 3. Datenmodell und Migration

Additiv, ohne Drop, Rename oder Backfill (29 `additive`, 3 `widening`):

| Änderung | Inhalt |
|---|---|
| `DeveloperApplication` + `DeveloperApplicationStatus` | Anträge, Entscheider, Begründung, Zeitstempel |
| `ContentReport` + `ReportTargetType`, `ReportReason`, `ContentReportStatus` | Meldungen inkl. `@@unique([reporterId, targetType, targetId])` |
| `User` | `status`, `suspendedAt`, `suspendedUntil`, `suspendedReason`, `suspendedById`, Index auf `status` |
| `PluginStatus` / `ThemeStatus` | `REMOVED` (Check-Constraints erweitert) |
| `ReviewResult` | `REMOVED` |

Benannte Selbst-Relationen zu `User` (`UserSuspensions`,
`DeveloperApplicationApplicant`, `DeveloperApplicationDecisions`,
`ReportReporter`, `ReportResolver`) mit echten Fremdschlüsseln; optionale
Referenzen verwenden `ON DELETE SET NULL`. Der Prisma-8-RC-Contract hat alle
Relationen emittiert und validiert — der in der Planung befürchtete Fallback auf
FK-lose Spalten war **nicht** nötig.

Ein Planungslauf mit dem Standard-`--from` hätte eine zweite Kante von
`2eaf80b7` erzeugt (Fork), weil die lokale Entwicklungsdatenbank noch auf diesem
Stand war. Dieser Zwischenstand wurde verworfen und mit explizitem
`--from 8116d069` neu geplant; der Graph ist linear.

## 4. Tatsächlich ausgeführte Prüfungen

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| Typecheck | `npm run type-check` | **bestanden** (0 Fehler) |
| Lint | `npm run lint` | **bestanden** |
| Unit-Tests | `npm test` | **bestanden**, 24 Suiten / 239 Tests |
| Integrationstests | `npm run test:integration` | **bestanden**, 4 Suiten / 105 Tests |
| Contract + Schema | `prisma db verify --strict` gegen `webradio_test` | **bestanden**: „Database marker and schema match contract“ |
| Build | `npm run build` | **bestanden** (u. a. `/impressum`, `/datenschutz`, `/nutzungsbedingungen`, `/report`, `/admin/reports`, `/admin/developer-applications`) |

### Neue Tests

- `src/lib/__tests__/account-status.test.ts` — aktive, befristete, abgelaufene
  und dauerhafte Sperre; abgelaufener Zeitstempel hebt keine dauerhafte Sperre
  auf; Determinismus am Ablaufzeitpunkt.
- `src/lib/__tests__/phase6.integration.test.ts` (echte PostgreSQL-Tests):
  Antrag → Genehmigung → `DEVELOPER` ohne verifizierte Adresse inkl.
  `DEVELOPER_GRANTED_UNVERIFIED_EMAIL`; `ADMIN` bleibt `EMAIL_NOT_VERIFIED`;
  doppelte Entscheidung; Ablehnung ohne Begründung; Nicht-Admin darf nicht
  entscheiden; Sperre löscht Sessions und blockiert Login; abgelaufene Sperre
  greift wieder; dauerhafte Sperre bleibt; Entsperren belebt keine alte
  Session; Selbstsperre; Admin gegen `SYSTEM_ADMIN`; Rollenvergabe an gesperrtes
  Konto; Meldung unbekanntes Ziel; Duplikat; Meldung ändert nichts; Takedown
  entfernt aus dem öffentlichen Katalog und ist nicht erneut einreichbar;
  Verwarnung mit `emailSent:false`.
- `src/lib/__tests__/catalog-workflow.test.ts` — `REMOVED` terminal,
  nicht einreichbar, nie öffentlich (bestehende Tests erhalten).
- `src/lib/__tests__/email.test.ts` — Pause als Default: kein Provider-Aufruf,
  keine Outbox-Datei, keine Empfänger-/Token-Werte im Log. Die bestehenden
  Provider-Tests setzen `EMAIL_DELIVERY_ENABLED=true` explizit.

### Angepasste Tests (bewusste Regeländerung, keine Abschwächung)

- `db.integration.test.ts`: Der Test „privilegierte Rolle vor Verifizierung“
  prüft jetzt **beides** — `ADMIN` wird weiterhin mit `EMAIL_NOT_VERIFIED`
  abgelehnt, `DEVELOPER` ist die dokumentierte Ausnahme und erzeugt den
  Audit-Eintrag. Der Outbox-Flow setzt `EMAIL_DELIVERY_ENABLED=true`.
- `roles.test.ts`: Navigations-Erwartungen enthalten den neuen Eintrag
  `developer-access` (USER-erreichbar, vergibt keine Rechte).

## 5. Offene Punkte und bekannte Einschränkungen

1. **Betreiberangaben fehlen weiterhin vollständig** (Name, Anschrift, Kontakt,
   Register/USt, Hosting-/DB-Anbieter inkl. Region und AVV, Aufbewahrungsfristen,
   Aufsichtsbehörde). Die drei Rechtsseiten sind deshalb nicht freigebbar;
   `LEGAL_RELEASE_APPROVED` bleibt `false`. Eine juristische Prüfung hat nicht
   stattgefunden und wird durch die Implementierung nicht ersetzt.
2. **Externe Release-URLs sind nicht widerrufbar.** Es gibt keinen
   Download-Proxy; `fileUrl` wird als externes `href` gerendert. `REMOVED`
   entfernt Detailseite, Versionsliste und Download-Button, kann eine bereits
   bekannte externe URL aber nicht sperren. Ein Download-Endpunkt mit
   Statusprüfung wäre ein separates Vorhaben.
3. **Keine Kontolöschung** (wie vereinbart ausgeklammert). Sperren ersetzen keine
   Löschung; Löschkonzept, Datenexport und Aufbewahrung der Audit-Historie
   bleiben offen.
4. **Verwarnungen erreichen Nutzer nur über das Konto/Audit-Protokoll**, weil der
   E-Mail-Versand pausiert ist. Kein Nachrichtenmodell, keine Behauptung einer
   Zustellung.
5. **Abgelaufene Sperren bleiben als `SUSPENDED` gespeichert** und werden
   abgeleitet als zugänglich behandelt. Die Admin-Ansicht zeigt „Sperre
   abgelaufen“; es existiert bewusst kein automatischer Unsuspend-Audit-Eintrag.
6. **Meldungen beziehen sich auf Katalogeinträge und Versionen**, nicht auf
   einzelne Tags oder Screenshots (kein stabiler fachlicher Bezug); sie werden im
   Freitext benannt.
7. **E-Mail-Verifizierung bleibt pausiert.** Solange sie pausiert, ist eine
   Adresse nie „nachgewiesen“; die Entwicklerfreigabe hängt deshalb an der
   Admin-Prüfung des Antrags.

## 6. Bestätigungen

- Keine Produktionsdatenbank, keine Produktionsdaten und keine produktiven
  Umgebungsvariablen wurden gelesen oder verändert.
- Keine echte E-Mail wurde versendet; alle Mail-Tests laufen gegen Mocks bzw. die
  lokale Outbox und sind jetzt standardmäßig pausiert.
- Keine Commits, Pushes, Merges, Tags oder Deployments; `HEAD` ist unverändert
  `99a426c`.
- Alle 13 ursprünglichen Working-Tree-Änderungen sind weiterhin vorhanden
  (`.env.example`, `.gitignore`, `prisma.config.ts`,
  `scripts/run-integration-tests.mjs`,
  `src/app/api/auth/verify-email/resend/route.ts`,
  `src/lib/__tests__/db.integration.test.ts`, `src/lib/__tests__/email.test.ts`,
  `src/lib/auth-service.ts`, `src/lib/email.ts`, `src/lib/rate-limit.ts`,
  `docs/EMAIL_SETUP.md`, `src/lib/db-error-diagnostics.ts`,
  `src/lib/__tests__/db-error-diagnostics.test.ts`).
