# Abnahmebericht: Translation Engine und DeepL-Integration

**Datum:** 24. November 2026
**Gegenstand:** `migrations/app/20261124T1840_i18n_translation_engine`, `src/lib/translation/**`,
`/admin/translations`, `POST /api/cron/translations`
**Art:** technische und funktionale Abnahme (keine Produktionsmigration, kein Commit, kein Push,
kein Deployment)

## 1. Ergebnis auf einen Blick

| Bereich | Ergebnis |
| --- | --- |
| Migrationskette ab leerer Datenbank | **bestanden** (8/8 Migrationen, `db verify --strict` Exit 0) |
| Upgrade einer bestehenden Datenbank | **bestanden** (freigegebene Zeile unverändert) |
| Schema: Tabellen, Indizes, Constraints | **bestanden** (57 Tabellen, 19 Indizes, 2 Unique-Constraints geprüft) |
| Admin-Oberfläche `/admin/translations` | **bestanden** (alle geforderten Bereiche vorhanden und bedienbar) |
| Batch, Bearbeiten, Freigeben, Ablehnen, Neu übersetzen, Veraltete markieren, Verlauf | **bestanden** |
| Mobilgeräte-Bedienbarkeit (390 × 844) | **bestanden mit Einschränkung** (Tabellen horizontal scrollbar) |
| Keine Schlüsselausgabe / keine Schlüssel in Logs | **bestanden** (Canary 0 Treffer in HTML und Log) |
| Keine personenbezogenen Inhalte an den Anbieter | **bestanden** (6/6 blockiert, kein Aufruf, keine Kosten) |
| Keine Überschreibung freigegebener Übersetzungen | **bestanden** (auch bei erzwungenem Lauf) |
| Cron-Authentifizierung | **bestanden** (405 bei GET, 401 ohne/falschem Token, 200 mit Token) |
| Keine unberechtigte Admin-Nutzung | **bestanden** (Rolle USER → 403) |
| 429 / 456 / 5xx / Netzwerkfehler | **bestanden** (korrekte Codes, Retries, Persistenz, keine Kosten) |
| Keine doppelten Jobs bei parallelen Anfragen | **nicht bestanden** – siehe Befund B2 |
| Auslieferung freigegebener Inhaltsübersetzungen | **nicht bestanden** – siehe Befund B1 |
| Echter DeepL-Smoke-Test | **offen** – kein gültiger Schlüssel vorhanden |

**Gesamturteil:** Die Migration, die Engine-Logik, die Oberfläche und die Sicherheitsvorgaben sind
abnahmefähig. Zwei funktionale Mängel verhindern die Freigabe in dieser Form: freigegebene
Inhaltsübersetzungen erreichen die öffentliche Website nicht (B1), und parallele Worker-Läufe
erzeugen Fehler und doppelte Anbieteraufrufe (B2). Beide sind reparierbar, ohne das Datenmodell
oder die Migration zu ändern.

## 2. Prüfumgebung

Es wurde ausschließlich mit Wegwerf-Datenbanken und lokalen Servern gearbeitet; die produktive
Datenbank wurde nicht berührt.

| Komponente | Wert |
| --- | --- |
| PostgreSQL | 18.4, temporäres Cluster in `.acceptance/pgdata`, `127.0.0.1:5599`, Auth `trust` |
| Datenbanken | `webradio_accept_empty_test` (leer), `webradio_accept_upgrade_test` (Upgrade), `webradio_accept_ui_test` (UI) |
| Anwendung | `next dev` auf `http://127.0.0.1:3000`, `DATABASE_URL` → `webradio_accept_ui_test` |
| Anbieter (UI-Lauf) | `TRANSLATION_PROVIDER=mock`, `TRANSLATION_ALLOW_MOCK=true` |
| Anbieter (Fehlerlauf) | `TRANSLATION_PROVIDER=deepl`, `DEEPL_API_KEY=<Stub-Schlüssel>`, `DEEPL_API_URL=http://127.0.0.1:5598` (lokaler Stub, kein Internetzugriff) |
| Cron-Secret | `CRON_SECRET=acceptance-cron-secret-9d2b` (nur Testserver) |
| Admin-Konto | `acceptance-admin@example.test` (Rolle ADMIN), zweites Konto `acceptance-user@example.test` (Rolle USER), nur in der Testdatenbank |
| Hilfsskripte | `scripts/translation-acceptance-db.mjs`, `scripts/translation-acceptance-ui.mjs`, `.acceptance/deepl-stub.mjs`, `.acceptance/seed-partner.mjs` |
| Logs | `.acceptance/pg.log`, `.acceptance/dev.log`, `.acceptance/dev-deepl.log`, `.acceptance/deepl-requests.log` |

Der DeepL-Stub ist ein lokaler HTTP-Server, der `/v2/translate`, `/v2/usage` und `/v2/languages`
beantwortet und pro Anfrage einen Modus (`ok`, `429`, `456`, `500`, `network`, `invalid`) aus einer
Datei liest. Damit ließen sich die Fehlerpfade der echten `DeepLProvider`-Implementierung
ausführen, ohne einen einzigen Aufruf an DeepL zu senden.

## 3. Datenbank und Migration

### 3.1 Leere Datenbank

`TEST_DATABASE_URL=… node scripts/translation-acceptance-db.mjs` — **24 von 24 Prüfungen
bestanden, Exit-Code 0**:

- vollständige Kette aller 8 Migrationen auf `webradio_accept_empty_test`,
- `prisma db verify --strict` → Exit 0, `storageHash`
  `e8dc07735da9f571e94ee9b1a8321f53913db3a2f1a8b8b18da97882efda7245`,
  `profileHash` `3916f444…`,
- 57 Tabellen, `ContentTranslation` mit allen erwarteten Spalten,
  `User.locale` nullable (`YES`), 19 Indizes,
- Unique `ContentTranslation_entityType_entityId_locale_field_key` und
  `TranslationJob_jobKey_key`,
- Defaults `outdated = false`, `status = 'MISSING'`, `value = ''`,
- keine Fremdschlüssel von den Translation-Tabellen auf Fachtabellen (bewusst: Übersetzungen
  sind additiv und überleben das Löschen einer Entität),
- `TranslationJob` ohne `updatedAt`-Trigger, aber mit `status`- und `locale`-Indizes.

### 3.2 Upgrade einer bestehenden Datenbank

`webradio_accept_upgrade_test` wurde bis `20261124T1823_i18n_content_translations` migriert,
danach wurden eine `APPROVED`-Zeile und ein Benutzer eingefügt und erst dann
`20261124T1840_i18n_translation_engine` angewendet:

- Wert, Status und `updatedAt` der freigegebenen Zeile **unverändert**,
- neue Spalten (`sourceHash`, `outdated`, `provider`, `reviewedAt`) `NULL` bzw. Default,
- `db verify --strict` erneut Exit 0.

Die Migration ist damit additiv und rückwärtsverträglich. Eine produktive Migration wurde
**nicht** ausgeführt.

## 4. Admin-Oberfläche

Geprüft in einer angemeldeten Admin-Sitzung auf `/de/admin/translations` (Desktop und 390 × 844).

| Bereich | Beobachtung |
| --- | --- |
| Anbieterstatus | Karte „ANBIETER“ mit Anbietername (Mock bzw. DeepL) und Badge „Konfiguriert“; Hinweis, dass die Konfiguration ausschließlich über Server-Umgebungsvariablen erfolgt |
| Unterstützte Sprachen | `de · en · nl · fr · es · it · pl`, identisch mit der Sprachliste der Anwendung |
| DeepL-Kontingent | „Nicht verfügbar — der Anbieter meldet kein Kontingent.“ auch bei konfiguriertem DeepL-Anbieter (siehe Befund B3) |
| Verbrauch/Kosten | Zeichen, Anfragen, „Kosten heute“, „Kosten in diesem Monat“, „Letzter Aufruf“ mit Zeitstempel; nach den Testläufen z. B. 2.420 Zeichen, 60 Anfragen, 0,0306 € |
| Warteschlange | „0 offen · 6 fehlgeschlagen“ nach den Fehlerläufen, vorher „0 offen · 0 fehlgeschlagen“ |
| Abdeckung | Tabelle je Sprache mit Freigegeben / Maschinell / In Prüfung / Abgelehnt / Fehlt; Werte änderten sich konsistent mit den Aktionen |
| Oberflächentexte | Strukturprüfung aller sieben Sprachen gegen die deutsche Quelle: „Vollständig“ |
| Dynamische Inhalte | Tabelle mit Inhalt, Sprache, Original (deutsch), Übersetzung, Freigabestatus, Aktionen; Original und Übersetzung stehen nebeneinander |
| Verlauf | Tabelle mit Zeitstempel, Aktion, Entität/Feld, Sprache, Statuswechsel, Anmerkung (19 Einträge nach den Tests) |

### 4.1 Batch-Übersetzungen

- Erster Lauf (Zielsprache `en`, alle Inhaltstypen): Banner „Ergebnis: 7 übersetzt, 0 übersprungen,
  1 blockiert, 0 fehlgeschlagen (233 Zeichen)“, URL-Parameter entsprechend.
- Erzwungener Lauf („Auch aktuelle maschinelle Übersetzungen erneuern“): „6 übersetzt, 1 blockiert
  (217 Zeichen)“.
- Datenbank danach: 7 `MACHINE_TRANSLATED`, 2 `REVIEW_REQUIRED` (Rechtstext), 1 blockiert,
  freigegebene Zeile unverändert.

### 4.2 Bearbeiten, Freigeben, Ablehnen, Neu übersetzen

| Aktion | Ergebnis in der Datenbank |
| --- | --- |
| Bearbeiten + Speichern | neuer Text gespeichert, `provider` geleert (menschliche Autorenschaft), Ereignis `EDITED` mit Akteur |
| Freigeben | Status `APPROVED`, `reviewedAt` gesetzt, Ereignis `APPROVED` (`MACHINE_TRANSLATED → APPROVED`) |
| Ablehnen | Status `REJECTED`, Wert bleibt erhalten, Ereignis `REJECTED` |
| Neu übersetzen | Status zurück auf `MACHINE_TRANSLATED`, neuer Anbieterwert, Ereignis `RETRANSLATED` (`REJECTED → MACHINE_TRANSLATED`) |
| Veraltete markieren | genau eine Zeile markiert (`outdated = true`), Status `APPROVED` bleibt, Ereignis `MARKED_OUTDATED` |
| Verlauf | alle sieben Ereignisarten sichtbar (`MACHINE_TRANSLATED`, `RETRANSLATED`, `APPROVED`, `REJECTED`, `EDITED`, `BLOCKED`, `MARKED_OUTDATED`) |

Nicht freigegebene Zeilen haben deaktivierte Freigeben/Ablehnen-Schaltflächen, freigegebene Zeilen
ein deaktiviertes „Neu übersetzen“ und ein aktives „Freigabe zurückziehen“ — die Oberfläche
verhindert die verbotenen Übergänge bereits vor dem Absenden.

### 4.3 Mobilgeräte

Bei 390 × 844 px: `document.documentElement.scrollWidth = 373` (kein horizontales Überlaufen der
Seite), Karten einspaltig, Formulare und Schaltflächen ohne Zoom bedienbar. Die breiten Tabellen
liegen in `overflow-x-auto`-Containern und werden innerhalb der Tabelle horizontal gescrollt.
Screenshot: `.acceptance/mobile-translations.png`.

## 5. Sicherheit und Datenschutz

| Prüfung | Vorgehen | Ergebnis |
| --- | --- | --- |
| Keine Ausgabe von API-Schlüsseln | Canary `DEEPL_API_KEY=deepl-canary-never-render-7f3a91` im UI-Lauf | 0 Treffer im gerenderten HTML, 0 im Serverlog, 0 in der Browser-Konsole; die Seite nennt nur den Variablennamen |
| Keine Schlüssel in Logs | Stub-Schlüssel im DeepL-Lauf | 0 Treffer in `.acceptance/dev-deepl.log`; der Stub protokolliert nur `hasAuthHeader: true`, nie den Wert |
| Keine PII an den Anbieter | privater News-Beitrag mit E-Mail-Adresse im `content` | 6 Jobs `SKIPPED / PRIVACY_BLOCKED` (alle Zielsprachen), 6 Ereignisse `BLOCKED`, kein Anbieteraufruf, keine `TranslationUsage`, keine gespeicherte Übersetzung |
| Keine Überschreibung freigegebener Übersetzungen | 7 Batch-Läufe inkl. erzwungenem Lauf und zwei Cron-Läufen | `ct_accept_approved` behält Wert, Status `APPROVED` und Anbieter; kein `RETRANSLATED`-Ereignis dafür |
| Cron-Authentifizierung | `GET`, `POST` ohne Token, mit falschem Token, mit richtigem Token | 405 (nur POST), 401, 401, 200 |
| Keine unberechtigte Admin-Nutzung | Anmeldung als Rolle USER, Aufruf von `/de/admin/translations` | 403 „Keine Berechtigung“; jede Server-Action prüft zusätzlich `requireAdminSession()` und leitet auf `?error=forbidden` |
| 429 Rate Limit | Stub-Modus `429` mit `Retry-After: 0`, 6 Ziele | 3 Versuche je Ziel (18 Anfragen), `RATE_LIMITED`, keine Zeichen, keine Kosten, HTTP 500 mit Zählern |
| 456 Kontingent | Stub-Modus `456`, 6 Ziele | genau 1 Versuch je Ziel (6 Anfragen, kein Retry), Jobs `FAILED / QUOTA_EXCEEDED` mit `attempts = 1` |
| 5xx | Stub-Modus `503`, 6 Ziele | 3 Versuche je Ziel mit Backoff (18 Anfragen, 7,4 s), `PROVIDER_ERROR`, keine Kosten |
| Netzwerkfehler | Stub schließt den Socket, 6 Ziele | 3 Versuche je Ziel (18 Anfragen), `NETWORK`, keine Kosten |
| Fehlerprotokollierung | Ereignisse und Jobs nach den Fehlerläufen | 24 Ereignisse `FAILED` mit Fehlercode in der Anmerkung; 6 Jobs bleiben `FAILED / QUOTA_EXCEEDED` |

Antwortkörper des Cron-Endpunkts enthalten ausschließlich Zähler, Anbieterkennung und Dauer — weder
übersetzten Text noch Schlüssel. Bei `failed > 0` antwortet der Endpunkt mit HTTP 500, damit ein
Schedule-Lauf als fehlgeschlagen sichtbar wird.

## 6. Befunde

### B1 — Freigegebene Inhaltsübersetzungen werden nicht ausgeliefert (hoch)

**Beobachtung:** `localizeRecord()` und `getApprovedTranslations()` werden ausschließlich von
`src/lib/translation/engine.ts`, den Admin-Actions und den Tests importiert. Keine öffentliche Seite
liest `ContentTranslation`. `src/app/[locale]/(public)/news/[slug]/page.tsx` rendert `entry.title`,
`entry.summary` und `entry.content` direkt aus dem Katalog.

**Nachweis:** `/pl/news/acceptance-normal` liefert den deutschen Titel (2 Treffer) und den
veralteten polnischen Wert nicht (0 Treffer) — der Fallback greift also, aber auch die freigegebene
englische Übersetzung desselben Beitrags erscheint auf `/en/news/acceptance-normal` nicht (0 Treffer
für „Human approved English text“). Ein `grep` über `src` zeigt keinen Konsumenten außerhalb von
Engine, Admin und Tests.

**Auswirkung:** Die gesamte Freigabe-Wertschöpfungskette endet in der Datenbank. Redakteure können
Übersetzungen prüfen und freigeben, die Website bleibt deutsch. Die Freigabe-Gates (nur `APPROVED`,
nicht `outdated`, Hash-Abgleich) sind korrekt implementiert, aber ungenutzt.

**Empfehlung:** `localizeRecord()` in den öffentlichen Detail- und Listenseiten für die acht
translatierbaren Entitäten aufrufen (Plugin, Theme, Partner, Advertiser, AdCampaign, News,
RoadmapItem, LegalDocument) und mit einem Integrationstest absichern, der eine freigegebene Zeile
auf der öffentlichen Seite erwartet. Kein Schema- oder Migrationsbedarf.

### B2 — Parallele Worker-Läufe erzeugen Fehler und doppelte Anbieteraufrufe (hoch)

**Beobachtung:** Zwei gleichzeitige `POST /api/cron/translations` antworteten beide mit HTTP 500
und `failed: 9` bzw. `failed: 8`, obwohl dieselben Ziele im selben Lauf als `translated: 10`
gezählt wurden. Im Serverlog standen 17 Zeilen
`{"event":"translation.batch.row_failed", … "reason":"SqlQueryError"}`.

**Ursache:** `claimJob()` in `src/lib/translation/jobs.ts` liest den Status und schreibt ihn danach
bedingungslos per `id`; der Kommentar verspricht ein „conditional update on status“, der Code
enthält aber keine Statusbedingung. Zwei Worker können daher denselben Job als `RUNNING` lesen,
beide den Anbieter bezahlen und beide `ContentTranslation.create()` für dieselbe
(Entität, Sprache, Feld)-Kombination versuchen. Der Verlierer scheitert an
`ContentTranslation_entityType_entityId_locale_field_key` (`SqlQueryError`), sein bezahlter Aufruf
wird nicht in `TranslationUsage` verbucht, und es entsteht kein `FAILED`-Job und kein Ereignis.

**Nachweis:** Wiederholbar mit zwei parallelen `curl -X POST` mit gültigem Bearer-Token; danach
`duplicate_jobkeys = 0` und `duplicate_rows = 0` (die Unique-Constraints halten), aber
`TranslationUsage`-Zeilen > erfolgreiche Jobs und die genannten Logzeilen.

**Auswirkung:** Kein Datenverlust und keine doppelten Zeilen, aber falsch gezählte Läufe, HTTP 500
bei einem an sich erfolgreichen Lauf, nicht nachvollziehbare Einzelfehler und das Risiko doppelt
bezahlter Zeichen. Der Vercel-Schedule und ein manuell ausgelöster Lauf können sich überlappen.

**Empfehlung:** `claimJob()` als atomares `UPDATE … WHERE id = $1 AND status <> 'RUNNING'` mit
Rückgabe der betroffenen Zeilen umsetzen (oder `SELECT … FOR UPDATE`), `ContentTranslation`-Inserts
per `ON CONFLICT DO UPDATE` bzw. Upsert ausführen, `SqlQueryError` als `FAILED`-Job mit Code
persistieren und den Lauf bei Teilfehlern nicht pauschal als HTTP 500 melden.

### B3 — DeepL-Kontingent wird nie angezeigt (mittel)

**Beobachtung:** Mit `TRANSLATION_PROVIDER=deepl` und einem funktionierenden `/v2/usage`-Endpunkt
(Stub: 4.242 / 500.000) zeigt die Karte weiterhin „Nicht verfügbar — der Anbieter meldet kein
Kontingent.“ Der Stub erhielt während des Seitenaufrufs **keine** Anfrage auf `/v2/usage`; die
Anfragen kamen nur von meinen manuellen Tests. Die Seite liest ausschließlich den gespeicherten
Verbrauch (`translationUsageSummary`) und nie `provider.usage()`.

**Auswirkung:** Die Anforderung „DeepL-Kontingent prüfen“ ist in der Oberfläche nicht erfüllt; ein
Administrator sieht das Monatslimit nicht und kann die Warnschwelle
(`TRANSLATION_QUOTA_WARN_PERCENT`) nicht wirksam nutzen.

**Empfehlung:** `usage()` in einem gecachten, vom Rendern entkoppelten Pfad aufrufen (z. B. im
Cron-Worker einmal pro Lauf, Ergebnis in `TranslationUsage.quota*` oder einem Snapshot speichern)
und die Karte daraus speisen.

### B4 — Fehlender i18n-Schlüssel `admin.translationsErrorApprovedProtected` (niedrig)

**Beobachtung:** Beim Rendern der Seite meldet die Anwendung
`[i18n] missing key "admin.translationsErrorApprovedProtected" for locale "de"` (dreimal pro
Render). Der Schlüssel existiert in keiner Sprachdatei, wird aber von `page.tsx` verwendet, wenn
eine Aktion `?error=approved_protected` zurückgibt — genau der Fall, den `retranslateField()` bei
einer freigegebenen Zeile erzeugt.

**Auswirkung:** Im Fehlerfall erscheint statt einer Erklärung der Schlüssel bzw. ein leerer Text.
Kein Sicherheitsproblem, aber eine sichtbare Lücke in einem bewusst gebauten Schutzpfad.

**Empfehlung:** Schlüssel in allen sieben Sprachdateien ergänzen und mit dem bestehenden
i18n-Audit (`scripts/i18n-audit.mjs`) prüfen.

### Beobachtung ohne Befundwert

Nach dem Neustart des Dev-Servers blieb ein bereits geöffneter Browser-Tab auf dem
Suspense-Fallback „Wird geladen …“ stehen, obwohl der Server die vollständige Seite auslieferte
(HTML enthielt alle Inhalte). Ein neuer Tab zeigte die Seite korrekt. Das ist ein
Entwicklungs-/HMR-Artefakt und trat nur nach einem Serverneustart auf; im Produktionsbuild wurde es
nicht beobachtet.

## 7. Hintergrundverarbeitung

Ablauf am Beispiel eines Feldes, vollständig in der Testdatenbank nachvollzogen:

1. **Job anlegen** — `getOrCreateJob()` erzeugt `TranslationJob` mit `jobKey` (SHA-256 aus Entität,
   ID, Sprache, Feld, Quellhash), Status `PENDING`.
2. **Job beanspruchen** — `claimJob()` setzt `RUNNING`, `attempts + 1`, `startedAt`; ein bereits
   laufender Job wird als `IN_PROGRESS` übersprungen (unter Parallelität nicht atomar, siehe B2).
3. **Übersetzen** — Text wird vorher auf PII geprüft und um Produktnamen/Platzhalter geschützt;
   erst danach geht die Anfrage an den Anbieter.
4. **Validieren** — Antwort wird gegen ein Zod-Schema geprüft, Platzhalter werden zurückgesetzt,
   ein verlorener Platzhalter führt zu `PLACEHOLDER_LOST` statt zu einer kaputten Übersetzung.
5. **Speichern** — `ContentTranslation` wird aktualisiert oder angelegt; vorher wird der Status
   erneut gelesen, damit eine zwischenzeitliche Freigabe nicht überschrieben wird.
6. **Status aktualisieren** — `markJobSucceeded()` / `markJobFailed()` / `markJobSkipped()` setzen
   `SUCCEEDED`, `FAILED` oder `SKIPPED` samt Fehlercode und `finishedAt`.
7. **Nachvollziehbarkeit** — jedes Ergebnis erzeugt ein `TranslationEvent` mit Akteur, Anbieter und
   Statuswechsel; Fehler tragen den Fehlercode in der Anmerkung.
8. **Wiederholungen** — derselbe Quelltext erzeugt denselben `jobKey`; ein zweiter Lauf findet den
   Job und überspringt ihn (`UP_TO_DATE`, `job_reused`) statt erneut zu bezahlen.

Gemessene Idempotenz: nach dem ersten Batch-Lauf erzeugte ein erzwungener Lauf 6
`RETRANSLATED`-Ereignisse, aber **keine** neuen Jobs (weiterhin 7 `SUCCEEDED`). Zwei aufeinander
folgende Cron-Läufe erzeugten keine doppelten `jobKey`s und keine doppelten
`ContentTranslation`-Zeilen.

### Vercel-Cron

`vercel.json` deklariert den Schedule `translations-worker` mit `"schedule": "30 5 * * *"`,
`"timezone": "UTC"` und `"function": "api/cron/translations"`; die Funktion ist zusätzlich über
`experimentalTriggers` (`schedule/v1beta`) für `src/app/api/cron/translations/route.ts`
freigeschaltet. Der Lauf entspricht **05:30 UTC** = 06:30 Uhr MEZ bzw. 07:30 Uhr MESZ, also
morgens vor dem Redaktionsbetrieb. Der Endpunkt akzeptiert ausschließlich POST, verlangt
`Authorization: Bearer $CRON_SECRET` und antwortet ohne konfiguriertes Secret mit 503
(`CRON_DISABLED`, fail-closed).

## 8. DeepL-Smoke-Test

**Nicht durchgeführt — offen.** Es ist kein gültiger `DEEPL_API_KEY` konfiguriert; ein Schlüssel
wurde weder erfunden noch angefordert. Um trotzdem keine Lücke zu lassen, wurde die vollständige
`DeepLProvider`-Implementierung gegen einen lokalen Stub ausgeführt: Erfolgsfall (Übersetzung wird
gespeichert, Anbieter `deepl`, Kosten 20 €/Mio. Zeichen korrekt berechnet), 429, 456, 503 und
Netzwerkfehler. Was damit **nicht** belegt ist: die tatsächliche Antwortqualität, das reale
Kontingent und das Verhalten der echten DeepL-API bei 429/456.

Empfohlener Smoke-Test, sobald ein Schlüssel vorliegt: `TRANSLATION_PROVIDER=deepl` setzen, im
Admin einen einzelnen Inhaltstyp und eine Zielsprache wählen, Batch starten, einen Aufruf und die
gespeicherte Übersetzung prüfen, danach Zeile ablehnen. Ein einzelner Lauf genügt.

## 9. Freigabegrenzen (eingehalten)

- Keine produktive Datenbankmigration: alle Migrationen liefen ausschließlich auf den drei
  Wegwerf-Datenbanken auf Port 5599.
- Kein Commit, kein Push, kein Vercel-Deployment, kein Produktionsrelease.
- Keine Änderung an bereits freigegebenen Übersetzungen: `ct_accept_approved` blieb über sieben
  Batch-Läufe, zwei Cron-Läufe und einen erzwungenen Lauf unverändert.
- Kein einziger Aufruf an die echte DeepL-API.

## 10. Reproduktion

```bash
# Wegwerf-Cluster
"/d/Program Files/PostgreSQL/18/bin/initdb.exe" -D .acceptance/pgdata -U postgres --auth=trust -E UTF8 --locale=C
"/d/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D .acceptance/pgdata -o "-p 5599 -c listen_addresses=127.0.0.1" -l .acceptance/pg.log start

# Datenbank- und Migrationsabnahme (24 Prüfungen)
TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:5599/webradio_accept_test" node scripts/translation-acceptance-db.mjs

# UI-Testdaten
node scripts/translation-acceptance-ui.mjs

# App mit Mock-Anbieter
DATABASE_URL="postgresql://postgres@127.0.0.1:5599/webradio_accept_ui_test" \
TRANSLATION_PROVIDER=mock TRANSLATION_ALLOW_MOCK=true \
DEEPL_API_KEY="deepl-canary-never-render-7f3a91" CRON_SECRET="acceptance-cron-secret-9d2b" \
npm run dev -- -H 127.0.0.1 -p 3000

# Fehlerpfade gegen den Stub
node .acceptance/deepl-stub.mjs &
DATABASE_URL="postgresql://postgres@127.0.0.1:5599/webradio_accept_ui_test" \
TRANSLATION_PROVIDER=deepl DEEPL_API_KEY="acceptance-stub-key-not-real" \
DEEPL_API_URL="http://127.0.0.1:5598" CRON_SECRET="acceptance-cron-secret-9d2b" \
npm run dev -- -H 127.0.0.1 -p 3000
curl -X POST -H "Authorization: Bearer acceptance-cron-secret-9d2b" \
  "http://127.0.0.1:3000/api/cron/translations?limit=6"
```

Die Testdaten und Logs bleiben unter `.acceptance/` liegen; die Server und das Cluster wurden nach
der Abnahme beendet.

## 11. Offene Punkte

1. **B1** – behoben, siehe §12.2.
2. **B2** – behoben, siehe §12.3.
3. **B3** – behoben, siehe §12.4.
4. **B4** – behoben, siehe §12.5.
5. Echter DeepL-Smoke-Test mit gültigem Schlüssel.
6. Produktive Migration und Deployment erst nach Freigabe der Befunde B1–B4.

## 12. Nachtrag vom 25. November 2026 — Behebung B1–B4

Dieser Nachtrag ersetzt die Ergebnisse der Befunde B1–B4 aus §6; alle übrigen Feststellungen aus §1
bis §10 bleiben unverändert gültig. Es gab **keine** Schemaänderung: die Migration vom 24. November
wurde weder geändert noch neu erzeugt.

### 12.1 Ergebnis der erneuten Abnahme

| Prüfung | Ergebnis |
| --- | --- |
| TypeScript (`npx tsc --noEmit`) | **bestanden** — 0 Fehler |
| ESLint (`npx eslint .`) | **bestanden** — 0 Fehler, 11 Warnungen (unverändert, nur `<img>` und ungenutzte Variablen in Skripten) |
| Unit-/Komponententests | **bestanden** — 75 Suites, 826 Tests |
| Integrationstests gegen echtes PostgreSQL | **bestanden** — 9 Suites, 155 Tests; vier vollständige Läufe hintereinander grün |
| Produktionsbuild (`npm run build`) | **bestanden** — Exit 0 |
| Migrationskette leer + Upgrade | **bestanden** — 24/24 Prüfungen |
| Zwei gleichzeitige `POST /api/cron/translations` | **bestanden** — beide HTTP 200, `failed 0`, keine doppelten Aufrufe/Zeilen |
| Admin `/de/admin/translations` | **bestanden** — Kontingent live vom Anbieter (4.242 / 500.000) |
| Öffentliche Seiten `/en/` und `/pl/` | **bestanden** — freigegebene Übersetzung ausgeliefert, veraltete/nicht freigegebene fällt auf Deutsch zurück |

### 12.2 B1 — Freigegebene Inhaltsübersetzungen werden ausgeliefert

**Ursache:** `localizeRecord()`/`getApprovedTranslations()` hatten außerhalb von Engine, Admin und
Tests keinen Konsumenten. Die öffentlichen Ladewege lasen ausschließlich die deutschen Felder aus
`News`, `Partner`, `LegalDocument` usw.; die Freigabe endete in der Datenbank.

**Korrektur:** Zentrale Batch-Lokalisierung `localizeRecords(entityType, locale, records)` in
`src/lib/content-translations.ts`. Sie lädt alle freigegebenen Zeilen eines Ladewegs mit **einer**
Abfrage (kein N+1), prüft je Zeile Status `APPROVED`, `outdated`, die Feld-Allowlist und den
`sourceHash` gegen den aktuellen deutschen Text und ersetzt nur Felder, die im öffentlichen Record
überhaupt vorkommen — interne Notizen, Kontaktdaten und nicht öffentliche Inhalte können dadurch
nicht in die Ausgabe gelangen. `locale` ist ein expliziter Parameter, weil `'use cache'` nur
Argumente als Cache-Schlüssel verwendet; ohne Angabe bleibt es bei `de`. Alle öffentlichen Ladewege
und API-Routen nehmen die Sprache der Seite bzw. `?locale=` an.

**Geänderte Dateien:** `src/lib/content-translations.ts`, `src/lib/catalog.ts`,
`src/lib/partner/service.ts`, `src/lib/advertising/service.ts`,
`src/lib/legal-document-service.ts`, `src/lib/cached-content.ts`; Seiten
`src/app/[locale]/(public)/page.tsx`, `news/page.tsx`, `news/[slug]/page.tsx`, `partners/page.tsx`;
Routen `src/app/api/news/route.ts`, `partners/route.ts`, `plugins/route.ts`, `themes/route.ts`,
`advertising/campaigns/route.ts`, `legal/consent/route.ts`.

**Neue Tests:** `src/lib/translation/__tests__/localization.test.ts` (17 Tests: Ersetzen je Sprache,
Fallback bei fehlender/veralteter/abweichender Zeile, Allowlist, kein Feld außerhalb des Records,
fremde Entitätstypen, leere Werte, genau eine Abfrage pro Liste, keine Abfrage bei leerer Liste) und
`src/lib/translation/__tests__/public-delivery.integration.test.ts` (7 B1-Tests gegen echtes
PostgreSQL für Liste, Detail, Partner, Impressum und nicht veröffentlichte Inhalte).

**Tatsächliches Ergebnis:** `/en/news/acceptance-normal` liefert den freigegebenen englischen Inhalt
(„Human approved English text.“); Titel und Zusammenfassung ohne Freigabe bleiben deutsch.
`/pl/news/acceptance-normal` zeigt für die freigegebene, aber veraltete polnische Übersetzung den
deutschen Titel („Stary tytuł“ 0 Treffer), die Oberfläche bleibt polnisch. Ein nicht veröffentlichter
Entwurf ist trotz freigegebener Übersetzung nicht erreichbar (Integrationstest).

### 12.3 B2 — Parallele Worker-Läufe ohne Fehler und ohne doppelte Aufrufe

**Ursache:** `claimJob()` schrieb den Status bedingungslos per `id`, obwohl der Kommentar ein
„conditional update on status“ versprach. Zwei Worker konnten denselben Job als `RUNNING` lesen,
beide bezahlen und beide `ContentTranslation.create()` versuchen; der Verlierer scheiterte an der
Unique-Constraint (`SqlQueryError`), der Lauf endete mit HTTP 500 und `failed 9/8`.

**Korrektur:**

1. `claimJob()` läuft in `db.transaction` mit `SELECT … FOR UPDATE` (`.forUpdate().first()`); das
   `UPDATE` setzt `status`, `attempts = attempts + 1`, `startedAt`, `finishedAt`, `errorCode`
   serverseitig in derselben Transaktion (kein ORM-`update()` in der Transaktion).
2. Der Aufrufer übergibt den Job-Zustand, den er geplant hat (`{status, attempts}`). Der Vergleich
   findet unter dem Row-Lock statt: Ein Job, den ein anderer Worker inzwischen abgeschlossen hat,
   wird nicht erneut beansprucht. Genau dieser Fall war die Ursache dafür, dass ein zweiter Batch
   dieselben Texte ein zweites Mal bezahlte.
3. `translateTarget()` entscheidet bei `SUCCEEDED`-Jobs und bei erzwungener Neuübersetzung anhand
   der **gespeicherten Zeile** statt am veralteten Plan-Snapshot; die Zeile wird vor
   `markJobSucceeded` geschrieben, deshalb ist die Reihenfolge eindeutig.
4. `persistTranslation()` adoptiert eine während des Anbieteraufrufs entstandene Zeile statt an der
   Unique-Constraint zu scheitern und überschreibt niemals `APPROVED`. Ein Speicherfehler nach einem
   bezahlten Aufruf wird als `FAILED` mit dem neuen Code `STORAGE_ERROR` persistiert (Job, Ereignis,
   Zähler) statt zu verschwinden.

**Geänderte Dateien:** `src/lib/translation/jobs.ts`, `src/lib/translation/engine.ts`,
`src/lib/translation/types.ts`, `src/lib/translation/testing/fake-db.ts` (Transaktions- und
Raw-Query-Unterstützung für die Engine-Tests).

**Neue/erweiterte Tests:** in `public-delivery.integration.test.ts` gegen echtes PostgreSQL: sechs
gleichzeitige Claims auf denselben Job (genau einer gewinnt, `attempts = 1`), sequenzieller zweiter
Claim, vier Jobs mit je zwei parallelen Claims, zwei vollständige Batches gleichzeitig (kein
doppelter Anbieteraufruf, keine doppelten Zeilen, `attempts = 1` je Job, keine `FAILED`-Ereignisse).
Die Engine-Suite (`engine.test.ts`, 19 Tests) läuft gegen den erweiterten In-Memory-`fake-db`, der
jetzt `forUpdate()`, `transaction`, `raw.sql` und `execute()` mit dem dokumentierten Claim-Effekt
unterstützt.

**Tatsächliches Ergebnis:** Zwei gleichzeitige `POST /api/cron/translations?limit=6` antworten beide
mit HTTP 200 (`translated 3`, `skipped 3`, `failed 0`, 108 Zeichen je Lauf). Danach: 6 Jobs, alle
`SUCCEEDED`; `attempts > 1` = 0; doppelte `ContentTranslation`-Zeilen = 0;
`translation.batch.row_failed` = 0; `FAILED`-Ereignisse = 0; `ct_accept_approved` unverändert
(`APPROVED`, Wert und Anbieter gleich). Der zuvor beobachtete HTTP-500-/`failed 9/8`-Fall ließ sich
nicht mehr reproduzieren.

**Hinweis zur Testanpassung:** Die Zusicherung „kein Text wird zweimal gesendet“ war über alle
Anfragen des Laufs formuliert. Andere Suiten hinterlassen veröffentlichte News-Fixtures, deren
Zusammenfassung denselben deutschen Text trägt; das sind verschiedene Jobs (Entität + Feld) und
deshalb legitime Aufrufe. Der Test prüft die Doppelung jetzt für den eigenen Artikel und zusätzlich
`attempts = 1` je Job — also genau die Eigenschaft, die ein doppelter Claim verletzt. Zusätzlich
wurde das Batch-Limit im Test auf 200 gesetzt, damit die eigene Meldung bei gewachsenem
Fixture-Bestand nicht aus dem Batch fällt (Standardlimit 20). Keine Zusicherung wurde entfernt oder
abgeschwächt.

### 12.4 B3 — DeepL-Kontingent wird live abgerufen

**Ursache:** Die Admin-Seite las ausschließlich den zuletzt gespeicherten Wert aus
`TranslationUsage`; `GET /v2/usage` wurde nie aufgerufen.

**Korrektur:** Neues Modul `src/lib/translation/quota.ts` mit Prozess-Cache (10 Minuten TTL,
Zusammenfassung gleichzeitiger Leser, 5 Sekunden Timeout), injizierbarem `provider` als Test-Seam und
den Zuständen `ok` / `not_configured` / `unsupported` / `error(code)`. Es wird nichts in
`TranslationUsage` geschrieben, damit die Kostenübersicht unverfälscht bleibt. Die Karte in
`/admin/translations` zeigt den Live-Wert, fällt bei Fehlern auf den gespeicherten Wert zurück und
unterscheidet „nicht konfiguriert“ von „Fehler“.

**Geänderte Dateien:** `src/lib/translation/quota.ts` (neu),
`src/app/[locale]/(admin)/admin/translations/page.tsx`, `src/lib/revalidate.ts`,
`src/app/[locale]/(admin)/admin/translations/actions.ts` (Revalidierung nach Admin-Aktionen).

**Neue Tests:** `src/lib/translation/__tests__/quota.test.ts` (11 Tests: Wert/Limit, fehlendes Limit,
Cache innerhalb des Fensters, Aktualisierung nach Ablauf, ein Aufruf für gleichzeitige Leser,
`force`, Fehlercode, unerwartete Exception, fehlender Schlüssel, Mock-Anbieter, Trennung nach
Anbieter).

**Tatsächliches Ergebnis:** Mit `TRANSLATION_PROVIDER=deepl` gegen den lokalen Stub zeigt die Seite
„Anbieter: DeepL / Konfiguriert“ und „4.242 von 500.000 Zeichen“; der Stub erhielt den Aufruf auf
`/v2/usage` beim Seitenaufruf. Fehler- und Unkonfiguriert-Pfade sind durch die Unit-Tests belegt,
nicht durch einen Browserlauf.

### 12.5 B4 — Fehlender i18n-Schlüssel

**Ursache:** `admin.translationsErrorApprovedProtected` fehlte in allen sieben Sprachdateien; die
übrigen drei Schlüssel der Fehler-/Kontingent-Anzeige (`translationsQuotaUnconfigured`,
`translationsQuotaError`, `translationsErrorNotConfigured`) fehlten ebenfalls, sodass die neuen
Zustände sonst als Schlüsselname erschienen wären.

**Korrektur:** Vier Schlüssel je Sprache in `src/i18n/messages/{de,en,nl,fr,es,it,pl}.json`.

**Neue Tests:** `src/i18n/__tests__/translation-keys.test.ts` (gleiche Platzhalter in allen
Sprachen, alle Schlüssel vorhanden, deutscher Text erklärt den Schutz freigegebener Übersetzungen).

**Tatsächliches Ergebnis:** Alle sieben Sprachdateien sind vollständig; die Admin-Seite rendert die
Karte ohne fehlende Schlüssel.

### 12.6 Prüfumgebung des Nachtrags

Der ursprüngliche Cluster `.acceptance/pgdata` (Port 5599) ließ sich nach dem unsauberen Shutdown
nicht mehr starten (`could not reserve shared memory region`, Zombie-Listener). Für den Nachtrag
wurde ein frisches Cluster `.acceptance/pgdata2` (PostgreSQL 18.4, `trust`, `127.0.0.1:5597`) mit
den unveränderten Skripten verwendet; die Datenbanken heißen weiterhin
`webradio_accept_empty_test`, `webradio_accept_upgrade_test` und `webradio_accept_ui_test`. Der
Dev-Server lief auf `127.0.0.1:3000` gegen die UI-Datenbank, der DeepL-Stub auf `127.0.0.1:5598`.
Alle Läufe blieben auf Loopback und `_test`-Datenbanken.

### 12.7 Grenzen

- Kein Aufruf der echten DeepL-API; Kontingent und Übersetzungen stammen aus dem lokalen Stub.
- Die Kontingent-Fehlerpfade sind durch Unit-Tests, nicht durch einen Browserlauf belegt.
- Geprüft wurden im Browser `/de/admin/translations`, `/en/news/acceptance-normal` und
  `/pl/news/acceptance-normal`; keine vollständige Klicktur durch alle Admin-Aktionen.
- Keine produktive Migration, kein Commit, kein Push, kein Deployment.
