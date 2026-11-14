# Datenschutz – anonyme Website-Analytics

Stand: 14.11.2026 · Technische Dokumentation, keine Rechtsberatung.
Die öffentliche Datenschutzerklärung wird aus `src/lib/legal.ts`
(`privacySections`) erzeugt; eine in der Datenbank veröffentlichte Fassung
(`LegalDocument`, Typ `DATENSCHUTZ`) hat Vorrang und muss separat gepflegt
werden.

## 1. Verarbeitete Daten

| Feld | Quelle | Beispiel |
|---|---|---|
| Tag (UTC) | Serverzeit | `2026-11-14` |
| Pfad | normalisierte Route | `/downloads` |
| Referrer-Host | `document.referrer`, nur Origin | `github.com` |
| Land | `x-vercel-ip-country` / `cf-ipcountry` | `DE` |
| Geräteklasse | grobe User-Agent-Auswertung | `desktop` |
| Betriebssystem | grobe User-Agent-Auswertung | `windows` |
| Zähler | Aggregation | `42` |
| Download-Dimensionen | Asset-Datensatz | Kanal, Plattform, Architektur |

Zusätzlich für Download-Anfragen: Asset-ID, Release-Tag, Kanal, Plattform und
Architektur (aus dem Dateinamen). Alle Werte werden tageweise aggregiert.

## 2. Nicht verarbeitet

- IP-Adressen (auch nicht gekürzt oder gehasht in Analytics-Tabellen)
- Cookies oder localStorage-IDs
- vollständige User-Agents
- Query-Strings, Fragmente, Formularinhalte
- geräteübergreifende oder dauerhafte Kennungen
- Fingerprints, Canvas-/Font-Signale
- Konto- oder E-Mail-Bezug
- externe GeoIP-Abfragen

Der Rate-Limiter speichert ausschließlich einen SHA-256-Prüfwert aus Zweck,
normalisierter IP und Zeitfenster – nicht die IP selbst.

## 3. Filter

| Filter | Verhalten |
|---|---|
| `DNT: 1` | keine Zählung (Client und Server) |
| `Sec-GPC: 1` | keine Zählung (Client und Server) |
| Bot-/Headless-UA | keine Zählung |
| `/admin`, `/auth`, `/account`, `/api`, `/_next` | keine Zählung |
| Pfad > 200 Zeichen | verworfen |
| absolute/fremde URLs als Pfad | verworfen |
| Prefetch | keine Zählung |

## 4. Zweck und Rechtsgrundlage

Zweck ist die datensparsame Messung der Reichweite und der Nachfrage nach
Release-Assets. Es werden keine Profile gebildet und keine Werbung
ausgespielt. Die öffentliche Erklärung nennt Art. 6 Abs. 1 lit. f DSGVO
(berechtigtes Interesse); die endgültige rechtliche Bewertung liegt beim
Betreiber.

Eine Einwilligung ist für diese Form der anonymen, aggregierten Zählung nach
der hier gewählten Gestaltung nicht vorgesehen. Sobald Cookies, dauerhafte IDs,
Cross-Site-Tracking oder personenbezogene Profile hinzukommen, wäre eine
Einwilligung erforderlich und diese Dokumentation zu ändern.

## 5. Aufbewahrung und Löschung

- Granulare Pageview- und Download-Anfrage-Aggregate: **90 Tage**.
- Löschung: `cleanupAnalyticsRetention()` im täglichen Sync.
- Traffic-/Release-/Repo-Aggregate: dauerhaft, ohne Personenbezug.
- Referrer-/Pfad-Snapshots und Sync-Läufe: derzeit ohne automatische Löschung.

## 6. Empfänger und Übermittlung

Die Daten liegen in der Anwendungsdatenbank beim konfigurierten
Datenbankanbieter. Es gibt keine Weitergabe an Analyse-, Werbe- oder
GeoIP-Dienste. Der Hoster liefert das Land als Header; eine zusätzliche
Übermittlung der IP an Dritte findet nicht statt.

## 7. Betroffenenrechte

Da keine personenbezogenen Kennungen gespeichert werden, ist eine Zuordnung
aggregierter Zeilen zu einer Person nicht möglich. Anfragen nach Auskunft oder
Löschung können sich dennoch an die im Impressum genannte Adresse richten.

## 8. Prüfpunkte vor Veröffentlichung

1. Öffentliche Datenschutzerklärung enthält den Abschnitt zur
   Reichweitenmessung (Code oder veröffentlichtes `LegalDocument`).
2. `Administration: read` ist bewusst dokumentiert und freigegeben.
3. Retention-Job läuft täglich und ist im Sync-Status sichtbar.
4. Keine Protokolle enthalten IP-Adressen oder User-Agents aus
   Analytics-Anfragen.
5. Bei Änderungen an Beacon, Download-Route oder Dimensionen diese Datei und
   `docs/ANALYTICS.md` aktualisieren.
