# Übersetzungs-Engine und DeepL-Integration

**Stand:** 24. November 2026
**Bereich:** `src/lib/translation/**`, `/admin/translations`, `POST /api/cron/translations`
**Migration:** `migrations/app/20261124T1840_i18n_translation_engine` (erzeugt, **nicht angewendet**)

---

## 1. Überblick

Die Engine übersetzt **dynamische Inhalte** (Plugin- und Theme-Beschreibungen,
Partner- und Werbetexte, News, Roadmap, Rechtstexte) von Deutsch in die übrigen
sechs Sprachen. Sie ist bewusst von den Interface-Katalogen
(`src/i18n/messages/*.json`) getrennt: UI-Texte werden im Repository gepflegt,
Inhalte aus der Datenbank über Anbieter oder Redaktion.

```
Admin-Klick  ─┐
Cron/Worker  ─┴─► runTranslationBatch()
                    │
                    ├─ 1. Quellen laden (nur veröffentlichte Inhalte)
                    ├─ 2. Ziele bestimmen (fehlend / veraltet)
                    ├─ 3. Datenschutzprüfung  ── blockiert ──► Job SKIPPED + Ereignis BLOCKED
                    ├─ 4. Idempotenz (jobKey) ── erledigt ───► kein API-Aufruf
                    ├─ 5. Provider-Aufruf (DeepL oder Mock)
                    ├─ 6. Status schreiben: MACHINE_TRANSLATED / REVIEW_REQUIRED
                    └─ 7. Verbrauch + Verlauf protokollieren
```

### Dateien

| Datei | Aufgabe |
|---|---|
| `provider/types.ts` | Provider-Schnittstelle, Fehlercodes |
| `providers/deepl.ts` | DeepL-Transport: Auth-Header, Zod-Validierung, Retries, Quota, Sprachen |
| `providers/mock.ts` | Deterministischer Testanbieter ohne Netzwerk |
| `registry.ts` | Zentrale Konfiguration, Provider-Auswahl, Kosten, Quota-Zustand |
| `languages.ts` | Locale ↔ DeepL-Code, Schnittmenge der Zielsprachen |
| `protect.ts` | Schutz von Produktnamen, Versionen, Code, URLs, Platzhaltern |
| `privacy.ts` | Sperre bei personenbezogenen Daten und Zugangsdaten |
| `source.ts` | Liest ausschließlich veröffentlichte Quellinhalte |
| `jobs.ts` | Persistente, idempotente Job-Warteschlange |
| `history.ts` | Verlauf (append-only) und Verbrauchs-/Kostenaggregation |
| `engine.ts` | Ablaufsteuerung, Statusregeln, Freigabeschutz, Worker |
| `content-translations.ts` | Auslieferung an die Website (nur `APPROVED` + aktuell) |
| `testing/fake-db.ts` | In-Memory-Datenbank für Tests |

---

## 2. DeepL konfigurieren

1. DeepL-Konto erstellen und einen API-Key erzeugen
   (Free oder Pro, <https://www.deepl.com/pro-api>).
2. Schlüssel **ausschließlich** als Server-Umgebungsvariable setzen —
   lokal in `.env`, auf Vercel in *Project → Settings → Environment Variables*,
   selbst gehostet in der Dienstkonfiguration. Der Schlüssel gehört nie in
   `NEXT_PUBLIC_*`, nie in eine Datei im Repository und nie in ein Formular.
3. Neu deployen/neu starten; die Engine liest die Konfiguration pro Prozess.

Der Endpunkt wird aus dem Schlüssel abgeleitet: Keys mit der Endung `:fx`
nutzen `https://api-free.deepl.com`, alle anderen `https://api.deepl.com`.
`DEEPL_API_URL` überschreibt das (z. B. für einen eigenen Proxy).

**Ohne Schlüssel passiert nichts.** `createTranslationProvider()` liefert `null`,
der Batch endet mit `NOT_CONFIGURED`, der Cron-Endpunkt antwortet mit HTTP 503,
und die Admin-Seite zeigt „Nicht konfiguriert“. Es wird kein Request gebaut.

### Umgebungsvariablen

| Variable | Pflicht | Standard | Bedeutung |
|---|---|---|---|
| `DEEPL_API_KEY` | für DeepL | — | Server-API-Key |
| `TRANSLATION_PROVIDER` | nein | `deepl` | `deepl` oder `mock` |
| `DEEPL_API_URL` | nein | aus Key abgeleitet | eigener Endpunkt |
| `DEEPL_PRICE_PER_MILLION_EUR` | nein | `20` | Preis für die Kostenanzeige |
| `TRANSLATION_BATCH_LIMIT` | nein | `20` | Zeilen pro Lauf (max. 200) |
| `TRANSLATION_MAX_CHARS_PER_FIELD` | nein | `10000` | Zeichenobergrenze pro Feld (max. 30000) |
| `TRANSLATION_ALLOW_MOCK` | nein | `false` | Mock in Produktion erlauben |
| `TRANSLATION_QUOTA_WARN_PERCENT` | nein | `80` | Warnschwelle für das Kontingent |
| `CRON_SECRET` | für Cron | — | Bearer-Token für `/api/cron/translations` |

---

## 3. Unterstützte Sprachkombinationen

Quelle ist immer Deutsch. Ziel sind die sechs übrigen Plattformsprachen:

| Plattform-Locale | DeepL-Zielcode | DeepL-Quellcode |
|---|---|---|
| `de` | `DE` | `DE` |
| `en` | `EN-GB` | `EN` |
| `nl` | `NL` | `NL` |
| `fr` | `FR` | `FR` |
| `es` | `ES` | `ES` |
| `it` | `IT` | `IT` |
| `pl` | `PL` | `PL` |

DeepL unterstützt alle sieben Sprachen. Die Liste wird zusätzlich zur Laufzeit
mit `GET /v2/languages?type=target` abgeglichen (`syncLanguages`), **gecacht für
24 Stunden** und nur vom Worker aufgerufen — nie beim Rendern einer Seite. Bis
zum ersten Abgleich gilt die statische Tabelle. Eine Sprache, die der Anbieter
nicht anbietet, wird im Admin-Formular deaktiviert und vom Batch abgelehnt
(`UNSUPPORTED_PAIR`).

Ein weiterer Anbieter braucht nur eine neue Datei unter
`providers/`, einen Eintrag in `PROVIDER_IDS` und einen Zweig in
`createTranslationProvider()`. Routing, Datenmodell, Status und Admin-Oberfläche
bleiben unverändert.

---

## 4. Status und Freigabe

| Status | Bedeutung | Öffentlich sichtbar |
|---|---|---|
| `MISSING` | kein Wert vorhanden (berechnet oder als Zeile angelegt) | nein (deutscher Fallback) |
| `MACHINE_TRANSLATED` | vom Anbieter erzeugt, **nicht geprüft** | nein |
| `REVIEW_REQUIRED` | maschinell erzeugt, Prüfung verpflichtend (Rechtstexte) | nein |
| `APPROVED` | von einem Administrator freigegeben | **ja** |
| `REJECTED` | geprüft und abgelehnt | nein (deutscher Fallback) |

Regeln, die im Code erzwungen werden:

1. **Freigaben werden nie automatisch überschrieben.** Ein `APPROVED`-Ziel ist
   kein Kandidat für einen Batch; auch ein erzwungener Lauf überspringt es. Der
   Button „Neu übersetzen“ ist für freigegebene Zeilen deaktiviert und die
   Server-Action antwortet mit `APPROVED_PROTECTED`. Zusätzlich prüft die Engine
   den Status unmittelbar vor dem Schreiben erneut (Race bei paralleler Freigabe).
2. **Änderungen am Original markieren Übersetzungen als veraltet.** Jede Zeile
   speichert den SHA-256 des deutschen Textes (`sourceHash`). Weicht er ab, gilt
   die Zeile als veraltet: `markOutdatedTranslations()` setzt `outdated = true`
   und schreibt ein `MARKED_OUTDATED`-Ereignis. Der Wert bleibt erhalten.
3. **Veraltete Zeilen werden nicht ausgeliefert.** `getApprovedTranslations()`
   ignoriert `outdated`-Zeilen, und `localizeRecord()` prüft zusätzlich den Hash
   gegen den aktuellen Quelltext. Selbst wenn ein Cron-Lauf aussteht, erscheint
   kein veralteter Text — es greift der deutsche Fallback.
4. **Rechtstexte brauchen eine gesonderte Prüfung.** Für `LegalDocument` wird
   immer `REVIEW_REQUIRED` gesetzt, nie `MACHINE_TRANSLATED` und nie direkt
   `APPROVED`.
5. **Fehlende oder fehlerhafte Ergebnisse fallen auf Deutsch zurück.** Ein
   fehlgeschlagener Aufruf schreibt keine Zeile; eine Zeile mit leerem Wert wird
   ignoriert; ein verlorener Platzhalter führt zu `PLACEHOLDER_LOST` statt zu
   einer lückenhaften Übersetzung.

### Ablauf für Redaktion

1. `/admin/translations` → Abschnitt „Übersetzungen starten“: Zielsprachen und
   Inhalte wählen, optional „auch aktuelle maschinelle Übersetzungen erneuern“.
2. Ergebnisbanner zeigt übersetzt / übersprungen / blockiert / fehlgeschlagen und
   die Anzahl der Zeichen.
3. In der Tabelle stehen Original und Übersetzung nebeneinander. Bearbeiten →
   Status `REVIEW_REQUIRED` oder direkt `APPROVED`; „Ablehnen“ setzt `REJECTED`.
4. „Veraltete markieren“ prüft alle Quellen gegen die gespeicherten Hashes.
5. Der Abschnitt „Verlauf“ zeigt jede Entscheidung mit Akteur, Statuswechsel,
   Anbieter und Zeitpunkt.

---

## 5. Verbrauch und Kosten

- Jeder **angenommene** API-Aufruf erzeugt eine Zeile in `TranslationUsage`
  (Anbieter, Zielsprache, Zeichen, Anfragen, `costMicros`, optional Quota).
- `costMicros` wird beim Schreiben aus `Zeichen / 1 Mio. × Preis` berechnet und
  danach nie neu bewertet — eine spätere Preisänderung verändert die Historie
  nicht.
- Die Admin-Seite zeigt Zeichen und Kosten für heute, diesen Monat und gesamt,
  aufgeschlüsselt nach Sprache, sowie das vom Anbieter gemeldete Monatskontingent
  (`GET /v2/usage`, gespeichert bei jedem Aufruf, der es liefert).
- `DEEPL_PRICE_PER_MILLION_EUR` (Standard 20 €) ist die einzige Stellschraube für
  die Anzeige. Der Free-Tarif kostet nichts, hat aber ein Zeichenkontingent —
  Status `warning` ab `TRANSLATION_QUOTA_WARN_PERCENT`, `exhausted` bei 100 %.
- Kostenbremse: `TRANSLATION_BATCH_LIMIT` begrenzt jeden Lauf, die Idempotenz
  verhindert Doppelzahlungen, und ein unveränderter Text wird nie erneut gesendet.

---

## 6. Fehler- und Fallback-Verhalten

| Code | Ursache | Wiederholbar | Verhalten |
|---|---|---|---|
| `NOT_CONFIGURED` | kein Schlüssel/Provider | nein | Batch endet, nichts gesendet |
| `UNSUPPORTED_PAIR` | Sprache nicht verfügbar | nein | Ziel wird übersprungen |
| `RATE_LIMITED` | HTTP 429 | ja | Retry mit `Retry-After` (max. 2), dann Job `FAILED` |
| `QUOTA_EXCEEDED` | HTTP 456 | nein | kein Retry, Admin-Hinweis |
| `UNAUTHORIZED` | HTTP 401/403 | nein | kein Retry, Konfiguration prüfen |
| `INVALID_RESPONSE` | Antwort entspricht nicht dem Schema | nein | keine Zeile geschrieben |
| `NETWORK` / `TIMEOUT` | Verbindung, Abbruch | ja | Retry mit Backoff (max. 2) |
| `PROVIDER_ERROR` | sonstige 5xx/4xx | 5xx ja | Retry, dann `FAILED` |
| `TEXT_TOO_LONG` | > Zeichenlimit | nein | Feld muss manuell übersetzt werden |
| `NOTHING_TO_TRANSLATE` | leerer Text | nein | übersprungen |
| `PRIVACY_BLOCKED` | E-Mail, Zugangsdaten, Telefon | nein | nichts gesendet, Ereignis `BLOCKED` |
| `PLACEHOLDER_LOST` | geschützter Begriff fehlt in der Antwort | nein | Übersetzung verworfen |

Ein fehlgeschlagener Job bleibt mit Fehlercode in der Warteschlange; der nächste
Lauf versucht ihn erneut, weil das Feld weiterhin fehlt. Protokolliert werden nur
Ereignisname, Anbieter, Status und Fehlercode — **nie** der Text, nie der
Schlüssel, nie der Upstream-Body.

---

## 7. Datenschutz

Vor jedem Aufruf prüft `inspectForPrivateData()` den Text und **blockiert** ihn
bei:

- E-Mail-Adressen, IBAN, Telefonnummern,
- `password=`, `secret=`, `token:`, `api_key=`,
- Bearer-Tokens, JWTs, private Schlüssel, bekannte Key-Formate
  (`sk-…`, `ghp_…`, `AKIA…`, `xox…-…`, `AIza…`).

Blockierte Felder werden **nicht redigiert gesendet**, sondern gar nicht. Zusätzlich
lädt `source.ts` ausschließlich veröffentlichte, öffentliche Inhalte:
unveröffentlichte Plugins/Themes/News, inaktive Partner und Werbetreibende sowie
nicht veröffentlichte Rechtstextversionen erreichen die Engine nie. Interne
Notizen (`internalNotes`), Kontaktdaten und IDs stehen nicht in der
Feld-Allowlist (`TRANSLATABLE_FIELDS`).

Weitere Schutzmaßnahmen:

- **Termschutz:** Produkt-/Markennamen (`WebRadio`, `GitHub`, `Icecast`, …),
  Versionsnummern, URLs, Dateinamen, Inline-Code, CLI-Flags, `{placeholders}` und
  Akronyme werden vor dem Senden durch Platzhalter ersetzt (`<ph id="n"/>` bzw.
  `⟦n⟧`) und danach zurückgesetzt.
- **Keine Speicherung von Zugangsdaten:** der Schlüssel existiert nur im
  Prozessspeicher der Serverfunktion.
- **Keine Übersetzungsdaten im Client:** die Admin-Seite zeigt sie nur
  serverseitig gerendert, `robots: noindex`.

---

## 8. Warteschlange und Hintergrundverarbeitung

Das Projekt hat keine externe Queue. Vorhanden sind Vercel-Funktionen,
Vercel Schedules und `CRON_SECRET`. Die Engine nutzt deshalb die Datenbank als
Warteschlange:

- `TranslationJob` ist die persistente Warteschlange
  (`PENDING → RUNNING → SUCCEEDED | FAILED | SKIPPED`).
- `jobKey = SHA-256(entityType, entityId, locale, field, sourceHash)` ist
  **unique**: derselbe Text in dieselbe Sprache wird nie zweimal bezahlt.
- `claimJob()` setzt `RUNNING` nur, wenn der Job nicht bereits läuft — in
  PostgreSQL entscheidet damit die Datenbank über den Gewinner zweier Worker.
- Ein abgebrochener Lauf hinterlässt `PENDING`/`RUNNING`; der nächste Worker
  nimmt ihn wieder auf. Der Batch plant zusätzlich aus den Quellen, sodass ein
  verlorener Job keine Lücke hinterlässt.

### Auslöser

| Auslöser | Aufruf | Grenze |
|---|---|---|
| Admin-Button | `startTranslationAction` → `runTranslationBatch` | `TRANSLATION_BATCH_LIMIT` |
| Vercel Schedule | `POST /api/schedules/translations` (`handleSchedule`, private URL; Eintrag `translations-worker`, täglich 05:30 UTC) | `TRANSLATION_BATCH_LIMIT` |
| Cron/systemd | `curl -X POST /api/cron/translations -H "Authorization: Bearer $CRON_SECRET"` | `?limit=` ≤ 100 |

```bash
# selbst gehostet, täglich 05:30
30 5 * * * curl -fsS -X POST "https://<host>/api/cron/translations?limit=20" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Der Endpunkt antwortet mit Zählern (`translated`, `skipped`, `blocked`, `failed`,
`characters`, `durationMs`) und HTTP 500, sobald ein Feld fehlschlägt — damit ein
Monitoring den Lauf sieht, ohne Inhalte zu protokollieren.

---

## 9. Datenmodell

```prisma
model ContentTranslation {   // erweitert
  … value, status, provider, sourceHash, outdated, translatedById, reviewedAt
  @@unique([entityType, entityId, locale, field])
}

model TranslationJob   { jobKey @unique, status, attempts, errorCode, sourceHash, characters, … }
model TranslationEvent { action, fromStatus, toStatus, provider, actorId, note, createdAt }  // append-only
model TranslationUsage { provider, locale, characters, requests, costMicros, quotaUsed, quotaLimit }
```

Migration: `migrations/app/20261124T1840_i18n_translation_engine`
(`from 20261124T1823_i18n_content_translations`, rein additiv: 3 neue Tabellen,
5 neue Spalten, Indizes — kein `DROP`, kein Datenverlust).

> **Nicht angewendet.** Vor dem ersten Einsatz in einer Testumgebung anwenden und
> danach prüfen: Anmeldung, `/de/admin/translations`, ein Batch mit
> `TRANSLATION_PROVIDER=mock`, ein Batch ohne Schlüssel (`NOT_CONFIGURED`).

---

## 10. Tests

`npm test -- src/lib/translation` (53 Testfälle, kein Netzwerkzugriff):

- **Termschutz:** Maskierung und Wiederherstellung, XML- vs. Klartext-Modus,
  Erkennung verlorener Platzhalter.
- **Datenschutz:** E-Mail, Passwort, API-Key, IBAN, Bearer-Token werden blockiert;
  normale Marketingtexte mit Versionsnummer und Datum nicht.
- **DeepL-Transport:** Auth-Header und Request-Body, `tag_handling=xml`, Retry bei
  429 mit `Retry-After`, kein Retry bei 456/401, Schemafehler, Netzwerkfehler,
  Platzhalterverlust, Sprachcache, Quota, Kostenberechnung.
- **Registry:** fehlender Schlüssel → kein Provider, Mock nur außerhalb der
  Produktion, keine Schlüssel in Metadaten, Grenzwerte.
- **Engine (In-Memory-DB):** `MACHINE_TRANSLATED` statt `APPROVED`, Freigabe
  unangetastet, zweiter Batch ohne API-Aufruf, `REVIEW_REQUIRED` für Rechtstexte,
  blockierte Felder werden nicht gesendet, Fehlercode im Job, Veraltet-Markierung,
  öffentlicher Fallback bei Hash-Abweichung, Matrix nur aus veröffentlichten
  Quellen, Idempotenzschlüssel.

Echte DeepL-Aufrufe erfolgen in keinem Test. Sie sind erst sinnvoll, wenn ein
gültiger Schlüssel konfiguriert ist; ein manueller Smoke-Test mit
`TRANSLATION_PROVIDER=deepl` und einem einzelnen Feld genügt.

---

## 11. Bekannte Einschränkungen

- Ein API-Aufruf pro Feld (keine Sammel-Anfrage). Das kostet dieselben Zeichen,
  liefert aber einen exakten Status pro Feld und hält Fehler lokal.
- Es gibt keinen Rich-Text-Editor für Übersetzungen; Markdown/HTML wird als Text
  übersetzt und unverändert gespeichert.
- Die Qualität der maschinellen Übersetzung wird nicht bewertet — deshalb ist
  `APPROVED` ausschließlich eine menschliche Entscheidung.
- Die Redaktionsoberfläche zeigt die ersten 80 Ziele; die vollständige Liste
  bleibt über Filter und die Datenbank erreichbar.
- Das Monatskontingent wird nur so genau angezeigt, wie der Anbieter es meldet
  (bei DeepL erst nach dem ersten Aufruf eines Prozesses). In der Abnahme zeigte die Karte
auch mit konfiguriertem DeepL „Nicht verfügbar“, weil die Seite `usage()` nie aufruft
(Befund B3 im Abnahmebericht).

---

## 12. Abnahme (24. November 2026)

Vollständiger Bericht: [`docs/TRANSLATION_ENGINE_ACCEPTANCE_REPORT.md`](./TRANSLATION_ENGINE_ACCEPTANCE_REPORT.md).

**Bestanden:**

- Migration ab leerer Datenbank (8/8) und Upgrade einer bestehenden Datenbank,
  `db verify --strict` jeweils Exit 0; freigegebene Zeile beim Upgrade unverändert.
- Schema: 57 Tabellen, 19 Indizes, Unique `ContentTranslation_entityType_entityId_locale_field_key`
  und `TranslationJob_jobKey_key`, Defaults und Nullability wie dokumentiert.
- `/admin/translations`: Anbieterstatus, sieben Zielsprachen, Verbrauch/Kosten, Warteschlange,
  Abdeckung, Oberflächentext-Prüfung, Inhaltstabelle, Verlauf; Batch, Bearbeiten, Freigeben,
  Ablehnen, Neu übersetzen, „Veraltete markieren“ und Verlauf im Browser durchgeführt.
- Sicherheit: kein Schlüssel im HTML oder in Logs (Canary), PII-Felder blockiert (6/6, kein
  Anbieteraufruf), Freigaben unangetastet (auch bei erzwungenem Lauf), Cron-Auth 405/401/200,
  Rolle USER → 403, 429/456/5xx/Netzwerk korrekt mit Retry, Fehlercode und ohne Kosten.
- Hintergrundverarbeitung: Job → Claim → Übersetzung → Validierung → Speicherung → Status →
  Ereignis; Wiederholungen ohne neue Jobs, keine doppelten `jobKey`s oder Zeilen.
- Vercel-Schedule `translations-worker`, `30 5 * * *`, `timezone: UTC` (05:30 UTC).

**Nicht bestanden / offen:**

- **B1 (hoch):** Freigegebene Inhaltsübersetzungen werden öffentlich nicht ausgeliefert —
  `localizeRecord()` hat außerhalb von Engine, Admin und Tests keinen Aufrufer.
- **B2 (hoch):** `claimJob()` ist nicht atomar; zwei parallele Cron-Läufe erzeugten
  `SqlQueryError`-Zeilenfehler, HTTP 500 und mögliche doppelte Anbieteraufrufe.
- **B3 (mittel):** DeepL-Kontingent wird nie abgerufen und daher nie angezeigt.
- **B4 (niedrig):** i18n-Schlüssel `admin.translationsErrorApprovedProtected` fehlt.
- **Offen:** echter DeepL-Smoke-Test (kein gültiger Schlüssel vorhanden; nicht angefordert).

Keine produktive Migration, kein Commit, kein Push, kein Deployment, keine Änderung an
freigegebenen Übersetzungen.
