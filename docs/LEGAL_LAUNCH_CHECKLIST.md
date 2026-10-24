# Legal & Licensing Launch Checklist

**Stand:** 2026-10-24  
**Status:** offen. Dieses Dokument ist **keine Rechtsberatung** und enthält
bewusst keine erfundenen Anbieter-, Adress- oder Lizenzangaben.

Die Website veröffentlicht derzeit **keine** Datenschutzerklärung und **kein**
Impressum. Der Footer kennzeichnet beide als noch nicht veröffentlicht und
verlinkt keine leeren Platzhalterseiten. Das ist für einen öffentlichen Launch
nicht ausreichend.

## 1. Tatsächlich eingesetzte Verarbeitungen

Diese Liste beschreibt den geprüften Codezustand, nicht eine rechtliche
Bewertung.

| Vorgang | Daten | Speicherort / Empfänger |
|---|---|---|
| Registrierung | E-Mail, Anzeigename (optional), bcrypt-Passwort-Hash, Rolle, Zeitstempel | PostgreSQL |
| Anmeldung | E-Mail, Passwortprüfung, Session-ID, optional IP/User-Agent im Audit-Log | PostgreSQL |
| Session | verschlüsseltes NextAuth-JWT im HttpOnly-Cookie + Session-Zeile in PostgreSQL | Browser + PostgreSQL |
| Audit-Log | Aktion, optionale User-ID, optional IP/User-Agent, Details | PostgreSQL |
| Rate-Limiting | SHA-256-Digest aus Scope + normalisiertem Identifier + Zeitfenster, Zähler | PostgreSQL |
| Passwort-Reset / E-Mail-Verifikation | SHA-256-Token-Hash, Ablauf, User-ID; E-Mail-Adresse an SMTP-Anbieter | PostgreSQL + SMTP |
| Server-Logs | Fehlername/-code, keine Passwörter, Tokens oder vollständigen Verbindungs-Strings | Hosting-Logs |

Keine Analyse-, Marketing- oder Tracking-Cookies sind implementiert. Es gibt
keine Newsletter-, Zahlungs- oder Profiling-Funktion.

## 2. Vom Projektverantwortlichen benötigte Angaben

Ohne diese Angaben können Datenschutz und Impressum nicht korrekt erstellt
werden:

- [ ] Vollständiger Name / Firma des Anbieters
- [ ] ladungsfähige Anschrift
- [ ] Kontakt-E-Mail und ggf. Telefon
- [ ] Vertretungsberechtigte Person
- [ ] Handelsregister / Registernummer, falls einschlägig
- [ ] Umsatzsteuer-ID / Wirtschafts-ID, falls einschlägig
- [ ] Verantwortlicher für den Inhalt (Name, Anschrift)
- [ ] tatsächlicher Hosting-Anbieter und Region (Vercel ist geplant, nicht deployt)
- [ ] tatsächlicher E-Mail-/SMTP-Anbieter und dessen Auftragsverarbeitung
- [ ] eingesetzte Datenbank (Anbieter, Region, Backup-Aufbewahrung)
- [ ] Aufbewahrungsfristen für Audit-Logs, Sessions, Rate-Limit-Buckets
- [ ] Entscheidung, ob und wie Betroffenenrechte (Auskunft, Löschung,
      Berichtigung, Übertragbarkeit, Widerspruch) bearbeitet werden
- [ ] Rechtsgrundlagen je Verarbeitung (insbesondere Vertrag,
      berechtigtes Interesse, Einwilligung)
- [ ] Cookie-/Session-Hinweis, falls nach Rechtsprüfung erforderlich
- [ ] Auftragsverarbeitungsverträge mit Hosting, Datenbank und E-Mail
- [ ] Sicherheitsmaßnahmen für die Datenschutzerklärung (TLS, Zugriffsrechte,
      Verschlüsselung der Hashes, Backups)
- [ ] Kontakt für Sicherheitsmeldungen

## 3. Impressum

Es existiert **kein** Impressum. Benötigt werden mindestens die unter § 5 DDG
(früher § 5 TMG) fallenden Anbieterangaben, sofern die Website geschäftlich oder
typischerweise gegen Entgelt betrieben wird. Die konkrete Rechtsgrundlage und
deren Anwendbarkeit sind anwaltlich zu prüfen. Bis dahin darf keine
Impressumsseite mit erfundenen Angaben veröffentlicht werden.

## 4. Datenschutzerklärung

Eine Datenschutzerklärung muss die tatsächlich eingesetzten Dienste abbilden.
Vercel, PostgreSQL-Hosting und SMTP sind noch **nicht** produktiv gewählt.
Deshalb kann derzeit keine vollständige, wahrheitsgemäße Erklärung erstellt
werden. Insbesondere fehlen:

- Hosting-/Auftragsverarbeiter und Drittlandtransfers,
- Speicherdauer von Sessions, Audit-Logs und Rate-Limit-Daten,
- Rechtsgrundlagen,
- Betroffenenrechte und Beschwerdestelle,
- Lösch- und Sperrverfahren,
- Umgang mit IP-Adressen in Audit-Logs (nur bei vertrauenswürdigem Proxy).

## 5. Lizenzen

### Projektlizenz

`package.json` ist `"private": true`. Es gibt **keine** `LICENSE`-Datei und
**keine** vom Projektverantwortlichen bestätigte Open-Source-Lizenz. Die
Aussage „Open Source“ auf der Website ist daher derzeit eine unbelegte
Behauptung und muss vor einem Launch entweder durch eine tatsächlich
hinterlegte Lizenz gestützt oder sprachlich korrigiert werden.

Offene Entscheidung:

- [ ] Lizenz wählen und `LICENSE` hinzufügen (z. B. MIT, Apache-2.0, AGPL-3.0)
- [ ] README und Website an die gewählte Lizenz anpassen
- [ ] Beiträge-/DCO-/CLA-Regeln festlegen, falls gewünscht
- [ ] Marken-/Namensrechte für „WebRadio“ und „Your Elite Systems“ prüfen

### Geprüfte Lizenzen direkter Abhängigkeiten

Aus den installierten `package.json`-Dateien gelesen (keine Rechtsberatung):

| Paket | Version | Lizenz |
|---|---|---|
| next | 16.4.3 | MIT |
| react / react-dom | 19.3.0 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| tailwindcss | 4.3.3 | MIT |
| prisma (CLI) | 8.0.0-rc.27 | Apache-2.0 |
| @prisma/orm-postgres | 8.0.0-rc.20 | Apache-2.0 |
| next-auth | 4.24.15 | ISC |
| zod | 4.6.7 | MIT |
| bcryptjs | 3.0.3 | BSD-3-Clause |
| nodemailer | 7.0.13 | MIT-0 |
| temporal-polyfill | 1.0.6 | MIT |
| jest | 30.5.2 | MIT |

Transitive Abhängigkeiten und Lizenztexte müssen vor einem Launch mit einem
vollständigen Lizenz-Scan geprüft und die Hinweise gebündelt werden.

## 6. Freigabekriterien

- [ ] Anbieterangaben vollständig und wahr
- [ ] Datenschutzerklärung deckt alle tatsächlichen Verarbeitungen ab
- [ ] Impressum erreichbar und korrekt
- [ ] Cookie-/Session-Verhalten beschrieben
- [ ] Projektlizenz entschieden und `LICENSE` vorhanden
- [ ] Drittanbieter-Hinweise erstellt
- [ ] Auftragsverarbeitung mit Hosting/DB/E-Mail geklärt
- [ ] Rechtsprüfung durch qualifizierte Person

Bis dahin bleibt der Footer-Hinweis „noch nicht veröffentlicht“ bestehen.
