# Legal & Licensing Launch Checklist

**Stand:** 2026-10-24 (Phase 4.6)

**Status:** offen. Dieses Dokument ist **keine Rechtsberatung** und enthält
bewusst keine erfundenen Anbieter-, Adress- oder Lizenzangaben.

Die Routen `/impressum`, `/datenschutz` und `/nutzungsbedingungen` sind
dauerhaft Teil der Website: Sie sind ohne Anmeldung erreichbar, im Footer sowie
auf Login-, Registrierungs- und Fehlerseiten verlinkt und werden durch keine
Umgebungsvariable, Rolle oder Feature-Flag aktiviert oder deaktiviert. Die
Sitemap enthält sie nicht.

Ob die Texte selbst erscheinen, hängt allein davon ab, ob die Pflichtangaben
aus `LEGAL_OPERATOR_*` / `LEGAL_HOSTING_*` / `LEGAL_DATABASE_*` /
`LEGAL_MAIL_*` / `LEGAL_RETENTION_*` / `LEGAL_SUPERVISORY_AUTHORITY` gesetzt
sind (Platzhalter in `.env.example`). Fehlt eine Angabe, zeigt die Seite einen
Hinweis mit der Liste der fehlenden Angaben statt eines erfundenen
Platzhalters.

`noindex` allein ist keine Zugriffssperre; die Seiten sind erreichbar, aber
inhaltlich noch nicht fertig. Das ist für einen öffentlichen Launch weiterhin
nicht ausreichend — die Angaben und die rechtliche Prüfung fehlen.

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
| Passwort-Reset / E-Mail-Verifikation | SHA-256-Token-Hash, Ablauf, User-ID. **Versand ist derzeit pausiert** (`EMAIL_DELIVERY_ENABLED` ≠ `"true"`): kein Anbieteraufruf, keine Outbox-Datei, kein Token für unzustellbare Links | PostgreSQL (kein Versand) |
| Entwickleranträge | User-ID, Begründung, optionale Portfolio-URL, Status, entscheidender Admin, Zeitpunkt | PostgreSQL |
| Meldungen | meldende Person, Zieltyp/-ID, Grund, optionaler Freitext, Status, entscheidender Admin | PostgreSQL |
| Kontosperren | Status, Zeitpunkt, Ablauf, Begründung, handelnder Admin | PostgreSQL |
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
- [ ] tatsächlicher E-Mail-Anbieter und dessen Auftragsverarbeitung (Versand derzeit pausiert)
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

Bis dahin zeigen Impressum und Datenschutz den Hinweis auf fehlende
Pflichtangaben; erreichbar und verlinkt bleiben sie in jedem Fall.

## 7. Erweiterte Launch-Checkliste

### Impressum und Anbieter

- [ ] Anbieter-/Firmenname, Rechtsform und ladungsfähige Anschrift
- [ ] Vertretungsberechtigte Person
- [ ] Kontakt-E-Mail und ggf. Telefon
- [ ] Registereintrag, Registernummer, zuständiges Register
- [ ] Umsatzsteuer-/Wirtschafts-ID, falls einschlägig
- [ ] Verantwortliche Person für journalistisch-redaktionelle Inhalte
- [ ] Aufsichtsbehörde, falls eine Zulassung erforderlich ist
- [ ] Impressum von jeder Seite mit maximal zwei Klicks erreichbar

### Datenschutz und Cookies

- [ ] Verzeichnis aller Verarbeitungen mit Zweck, Rechtsgrundlage,
      Empfängern, Drittlandtransfer und Löschfrist
- [ ] Hosting-/Datenbank-/SMTP-Anbieter und Auftragsverarbeitungsverträge
- [ ] Session-Cookie: technisch notwendig, `HttpOnly`, `SameSite=Lax`,
      `Secure` unter HTTPS; keine Werbe-/Tracking-Cookies implementiert
- [ ] Entscheidung, ob für das Session-Cookie ein Einwilligungsbanner nötig
      ist — rechtlich prüfen, nicht pauschal annehmen
- [ ] Server-/Fehlerlogs: Rechtsgrundlage, Inhalt, Aufbewahrung, Zugriff
- [ ] Audit-Log: Zweck (Sicherheit/Nachvollziehbarkeit), Felder, Löschfrist
- [ ] Rate-Limit-Daten: nur Hashes, Löschfrist und Zweck beschreiben
- [ ] E-Mail-Versand: Empfänger, Anbieter, Aufbewahrung, Reset-/Token-Links
- [ ] Analytics: **derzeit keine** implementiert; falls später, vorher
      Datenschutz und Einwilligung klären
- [ ] Betroffenenrechte und Beschwerdestelle benennen
- [ ] Lösch-/Sperrverfahren für Konten, Sessions, Audit- und Rate-Limit-Daten
- [ ] Keine echten personenbezogenen Daten in Logs, Tickets oder Screenshots

### Inhalte, Plugins, Themes und Haftung

- [ ] Lizenzbedingungen für eingereichte Plugins und Themes festlegen
      (Erlaubnis, Weitergabe, Änderung, Haftungsausschluss)
- [ ] Nachweis/Erklärung, dass Einreichende die erforderlichen Rechte besitzen
- [ ] Urheberrechtshinweise und Lizenztexte je Download bereitstellen
- [ ] Keine geschützten Logos, Screenshots oder Namen ohne Erlaubnis
- [ ] Prüfprozess für Einreichungen (Malware, Rechte, Funktion, WebRadio-Bezug)
- [ ] Melde- und Entfernungsprozess für rechtswidrige Inhalte mit
      Bearbeitungsfristen und Ansprechpartner
- [ ] Sperr-/Widerrufsprozess für bereits veröffentlichte Einträge
- [ ] Haftungsausschluss für Plugins/Themes Dritter, rechtlich geprüft
- [ ] Sicherheitskontakt und Responsible-Disclosure-Verfahren veröffentlichen

### Technischer Launch

- [ ] Produktionsdatenbank, Backups und Wiederherstellung getestet
- [ ] SMTP-Zustellung für Reset und Verifizierung getestet
- [ ] `NEXTAUTH_URL`/`NEXT_PUBLIC_SITE_URL` auf der echten Domain
- [ ] Health-Check, Fehlerlogs und Alarmierung eingerichtet
- [ ] 404-/Cache-Verhalten auf der echten CDN-Origin geprüft
- [ ] Keine Secrets in Repository, Logs oder Client-Bundle
- [ ] Rechtstexte und Lizenz von qualifizierter Person geprüft

## 8. Vorlagen mit Platzhaltern (nicht veröffentlichen)

Die folgenden Texte sind **Vorlagen**. Sie dürfen erst veröffentlicht werden,
nachdem alle Platzhalter durch geprüfte Angaben ersetzt und die Texte
rechtlich geprüft wurden.

### Impressum — Vorlage

```text
Angaben gemäß § 5 DDG

[VOLLSTÄNDIGER NAME / FIRMA]
[STRASSE UND HAUSNUMMER]
[PLZ UND ORT]
[LAND]

Vertreten durch: [VERTRETUNGSBERECHTIGTE PERSON]
Kontakt: [TELEFON] · [E-MAIL]
Register: [REGISTERGERICHT] · [REGISTERNUMMER]
Umsatzsteuer-ID: [UST-ID, falls vorhanden]
Verantwortlich für den Inhalt: [NAME, ANSCHRIFT]
```

### Datenschutzerklärung — Mindestgliederung

```text
1. Verantwortlicher: [NAME, ANSCHRIFT, KONTAKT]
2. Hosting: [ANBIETER, REGION, AV-VERTRAG, Drittlandtransfer]
3. Datenbank: [ANBIETER, REGION, AV-VERTRAG, BACKUPS]
4. Konto und Anmeldung: [DATEN, ZWECK, RECHTSGRUNDLAGE, LÖSCHFRIST]
5. Sessions und Cookies: [COOKIE-NAME, DAUER, ZWECK, EINWILLIGUNG?]
6. Audit- und Sicherheitslogs: [FELDER, ZWECK, AUFBEWAHRUNG]
7. Rate-Limiting: [GEHASHTE KENNUNGEN, ZWECK, LÖSCHFRIST]
8. E-Mail-Versand: [ANBIETER, EMPFÄNGERDATEN, AUFBEWAHRUNG]
9. Betroffenenrechte: [AUSKUNFT, BERICHTIGUNG, LÖSCHUNG, …]
10. Beschwerdestelle: [ZUSTÄNDIGE AUFSICHTSBEHÖRDE]
11. Stand: [DATUM], Fassung [VERSION]
```

Diese Gliederung ist keine fertige Datenschutzerklärung und ersetzt keine
rechtliche Prüfung.

## 9. Offene Betreiberangaben (Sammelliste)

- [ ] Name/Firma, Anschrift, Kontakt, Vertretung
- [ ] Hosting-, Datenbank- und SMTP-Anbieter inkl. Region und AV-Vertrag
- [ ] Aufbewahrungsfristen für Sessions, Audit-Logs, Rate-Limit-Daten und Logs
- [ ] Projektlizenz und Lizenzbedingungen für Plugins/Themes
- [ ] Melde-/Entfernungsprozess und Sicherheitskontakt
- [ ] Entscheidung zu Cookie-Hinweis und Rechtsgrundlagen

Bis diese Angaben vorliegen, weisen Impressum und Datenschutz auf die fehlenden
Pflichtangaben hin. Es wurden keine Ersatzangaben erfunden.
