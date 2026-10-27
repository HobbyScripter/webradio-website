# WebRadio Cloud & Platform Infrastructure – Roadmap

> **Status:** Geplant  
> **Ziel:** Die WebRadio-Desktop-App, die Website und zukünftige Cloud-Dienste schrittweise zu einer sicheren, wartbaren und erweiterbaren Plattform verbinden.  
> **Wichtige Leitlinie:** Diese Roadmap beschreibt geplante Arbeit. Sie bedeutet nicht, dass Funktionen bereits implementiert oder produktiv aktiviert sind.

## Ziele

- Eine gemeinsame, klar dokumentierte API für die Desktop-App, Website und zukünftige Dienste schaffen.
- Konten und Berechtigungen sicher zwischen Website und Desktop-App nutzbar machen.
- Einen integrierten Store für WebRadio-Plugins und -Themes ermöglichen.
- Den Heartbeat Monitor als Grundlage für spätere, freiwillige Telemetrie planen.
- Den bestehenden Discord-Bot als dauerhaft laufenden Gateway-Dienst in die Plattform integrieren.
- Eine eigene Server- und Mail-Infrastruktur vorbereiten und die Cloud später schrittweise erweitern.
- Sicherheit, Datenschutz, Backups, Überwachung und Wiederherstellung von Anfang an berücksichtigen.

## Grundprinzipien

1. **Schrittweise statt Big Bang:** Mit einer überschaubaren Basis beginnen und nur bei Bedarf skalieren.
2. **Bestehendes wiederverwenden:** Vorhandene Authentifizierung, Rollen, Rate-Limits, Audit-Logs und Datenmodelle zuerst prüfen, bevor neue Mechanismen eingeführt werden.
3. **Klare Dienstgrenzen:** Dienste kommunizieren über dokumentierte und abgesicherte Schnittstellen. Kein pauschaler Zugriff auf die gesamte Datenbank.
4. **Sicherheitsorientiert:** Geheimnisse nicht in den Client einbetten; serverseitige Autorisierung, Eingabevalidierung, Rate-Limits und sichere Sitzungsverwaltung vorsehen.
5. **Datenschutz durch Design:** Nur notwendige Daten für einen klar definierten Zweck verarbeiten.
6. **Kontrollierte Aktivierung:** Neue produktive Funktionen erst nach Tests und ausdrücklicher Freigabe aktivieren.

## Phase 1 – Architektur und Spezifikation

**Ziel:** Die bestehende Codebasis und Infrastruktur prüfen und ein belastbares Zielbild erstellen, ohne bereits Telemetrie oder neue produktive Funktionen zu aktivieren.

- [ ] Bestehende Website-, Desktop-App- und Discord-Bot-Architektur untersuchen.
- [ ] Vorhandene Authentifizierung, Rollen, Rate-Limits, Audit-Logs, Einstellungen und Datenbankmechanismen dokumentieren.
- [ ] Zielarchitektur und Zuständigkeiten von API, Konten, Store, Mail, Heartbeat und Discord-Bot festlegen.
- [ ] API-Verträge, Fehlerverhalten, Versionierung und Kompatibilitätsstrategie definieren.
- [ ] Datenmodelle, Berechtigungen, Aufbewahrungsfristen und Lösch-/Widerrufsabläufe spezifizieren.
- [ ] Lokale Teststrategie und Abnahmekriterien definieren.
- [ ] Abhängigkeiten zum späteren eigenen Server und Mail-System dokumentieren.

**Ergebnis:** Ein überprüfbares technisches Konzept mit Schnittstellen und Tests. Noch keine produktive Aktivierung.

## Phase 2 – Eigene Server- und Mail-Infrastruktur

**Ziel:** Eine verlässliche Betriebsgrundlage für die späteren Plattformdienste schaffen.

- [ ] Anforderungen an Server, Betriebssystem, Deployment, Netzwerk und Ressourcen festlegen.
- [ ] TLS, Domain/DNS, Firewall, sichere Geheimnisverwaltung und Zugriffskontrollen planen.
- [ ] Datenbankbetrieb, Backups und regelmäßig getestete Wiederherstellung vorsehen.
- [ ] Monitoring, Protokollierung, Alarmierung und ein Verfahren für Sicherheitsupdates planen.
- [ ] Mail-Zustellung für Verifizierung, Passwortzurücksetzung und wichtige Kontomitteilungen einrichten.
- [ ] SPF, DKIM und DMARC sowie Zustellbarkeit und Missbrauchsschutz konfigurieren und prüfen.
- [ ] Entwicklungs-, Test- und Produktionsumgebung sauber trennen.
- [ ] Betriebs- und Wiederherstellungsdokumentation erstellen.

Die Website kann während der Vorbereitung zunächst weiter auf Vercel laufen. Der eigene Server muss nicht sofort eine verteilte Cloud oder viele Einzelserver umfassen. Dienste können zunächst auf einer geeigneten, abgesicherten Basis betrieben und bei Bedarf getrennt skaliert werden.

## Phase 3 – Kontoverbindung zwischen Desktop-App und Website

**Ziel:** Eine sichere, nachvollziehbare Verbindung zwischen WebRadio-Desktop-App und WebRadio-Konto ermöglichen.

- [ ] Geeigneten Anmelde- bzw. Kontoverknüpfungsablauf entwerfen.
- [ ] Serverseitige Prüfung von Identität, Rolle und Berechtigungen sicherstellen.
- [ ] Sichere Token-/Sitzungsverwaltung, Ablauf, Widerruf und Abmeldung definieren.
- [ ] Nur notwendige Kontoinformationen an die Desktop-App übertragen.
- [ ] Fehlerfälle wie abgelaufene Tokens, gesperrte Konten, Offline-Betrieb und Serverausfall testen.
- [ ] Die Kontoverknüpfung für Telemetrie ausdrücklich getrennt von der normalen Kontoanmeldung behandeln.

Die Anmeldung am WebRadio-Konto darf nicht automatisch eine Einwilligung zur Telemetrie bedeuten.

## Phase 4 – Store-Integration in der Desktop-App

**Ziel:** Plugins und Themes über einen integrierten Store auffindbar und verwaltbar machen.

- [ ] API für Store-Metadaten, Details, Versionen und Kompatibilität definieren.
- [ ] Plugins und Themes durchsuchen und Details in der Desktop-App anzeigen.
- [ ] Download- und Installationsabläufe mit verständlichen Statusmeldungen umsetzen.
- [ ] Integrität, Herkunft, Versionierung und Kompatibilität der Artefakte prüfen.
- [ ] Update-, Fehler- und Wiederherstellungsverhalten definieren.
- [ ] Moderation und Veröffentlichungsstatus serverseitig durchsetzen.
- [ ] Dateien nach Möglichkeit getrennt von Metadaten in der Datenbank speichern.
- [ ] Berechtigungen und Sicherheitsgrenzen für Store-Inhalte testen.

Die Desktop-App darf Store-Inhalte nicht allein deshalb als vertrauenswürdig behandeln, weil sie von einer API geliefert werden.

## Phase 5 – Heartbeat Monitor und optionale Telemetrie

**Ziel:** Eine datenschutzorientierte Grundlage für Statusinformationen und spätere, ausdrücklich ausgewählte Messwerte schaffen.

### Geplante Betriebsmodi

1. **Anonyme aggregierte Statistik:** Nur ausreichend aggregierte Werte, ohne dauerhafte Kennung einzelner Installationen.
2. **Pseudonymisierte Geräteüberwachung:** Zufällige Installationskennung für Status und Verlauf; keine direkte Kontoverknüpfung.
3. **Kontoverknüpfte Telemetrie:** Nur nach einer zusätzlichen, separaten ausdrücklichen Einwilligung.

Diese Modi müssen technisch getrennt werden. Eine Kennung wegzulassen, macht Daten nicht automatisch anonym: IP-Adressen, genaue Zeitstempel und seltene Merkmalskombinationen können eine Wiedererkennung ermöglichen.

### Umsetzungsschritte

- [ ] Datenvertrag, Metriknamen, Schema-Versionen und erlaubte Werte festlegen.
- [ ] Serverseitige Empfangszeit verwenden; Client-Zeitstempel nicht als maßgebliche Statuszeit behandeln.
- [ ] Zweck, Datenumfang und Aufbewahrung für jede Metrik definieren.
- [ ] Einwilligung, Einstellungen, Widerruf und Übertragungsstopp spezifizieren.
- [ ] Globale Opt-out-Möglichkeit und Verhalten bei Offline-Betrieb festlegen.
- [ ] API-Validierung, Größenlimits, Authentifizierung und Rate-Limits testen.
- [ ] Aggregierte Daten, pseudonymisierte Geräteinformationen und kontoverknüpfte Daten getrennt behandeln.
- [ ] Dashboard-Zugriff für Entwickler und Administratoren anhand der Rollen begrenzen.
- [ ] Tests für Einwilligung, Widerruf, Berechtigungen, Datenminimierung, Aufbewahrung und Ausfälle erstellen.

### Mögliche spätere Metrikfamilien

- `app.heartbeat` – Kontakt und App-Version
- `app.lifecycle` – Start und reguläres Beenden
- `app.performance` – ausgewählte Leistungskennzahlen
- `app.errors` – technische Fehlerklassen
- `app.playback` – technische Wiedergabestatus und Fehler
- `app.integrations` – technische Verfügbarkeit ausgewählter Integrationen

Keine freie Texteingabe als Metrikstandard vorsehen. Insbesondere URLs, Suchanfragen, Sendernamen und persönliche Inhalte sollen nicht standardmäßig übertragen werden.

**Standardzustand:** Telemetrie bleibt deaktiviert, bis eine entsprechende Einwilligung vorliegt und die produktive Aktivierung ausdrücklich freigegeben wurde. Updates dürfen sie nicht automatisch einschalten.

## Phase 6 – Discord-Bot als Cloud-Dienst

**Ziel:** Den bestehenden Discord-Bot als eigenständigen, dauerhaft verbundenen Gateway-Dienst in die WebRadio-Plattform integrieren.

- [ ] Vorhandene Bot-Implementierung und Funktionen prüfen; funktionierenden Code nicht ohne Grund neu schreiben.
- [ ] Bot-Prozess getrennt von kurzlebigen serverlosen Website-Funktionen betreiben.
- [ ] Dauerhafte Discord-Gateway-Verbindung, Wiederverbindung, Fehlerbehandlung und geordneten Neustart berücksichtigen.
- [ ] Bot-Kommunikation mit Website und anderen Diensten über eine abgesicherte API organisieren.
- [ ] Geheimnisse sicher verwalten und Bot-Berechtigungen auf das notwendige Minimum beschränken.
- [ ] Logs, Health Checks, Alarmierung und kontrollierte Updates vorsehen.
- [ ] Spätere Funktionen wie Release-Meldungen, Store-Informationen oder ausgewählte Heartbeat-Statusinformationen nach Bedarf ergänzen.
- [ ] Sicherstellen, dass der Bot keinen pauschalen Zugriff auf die gesamte Datenbank erhält.

Vercel kann geeignete Website-APIs und HTTP-basierte Discord-Interactions ausführen. Ein klassischer Bot mit dauerhaft verbundener Gateway-Sitzung sollte jedoch auf einem Host laufen, der langlebige Prozesse unterstützt. Bis die eigene Serverinfrastruktur bereitsteht, können Schnittstellen und Bot-Verhalten lokal entwickelt und getestet werden.

## Phase 7 – Weitere Cloud-Dienste

**Ziel:** Die Plattform bei tatsächlichem Bedarf erweitern, ohne unnötige Komplexität vorwegzunehmen.

Mögliche spätere Funktionen:

- [ ] Synchronisierung ausgewählter Einstellungen
- [ ] Synchronisierung von Favoriten oder anderen ausdrücklich ausgewählten Nutzerdaten
- [ ] Benachrichtigungen und Release-Mitteilungen
- [ ] Erweiterte Plugin-/Theme-Verteilung
- [ ] Entwicklerfunktionen und Store-Moderation
- [ ] Zusätzliche Betriebs- und Gesundheitsinformationen
- [ ] Weitere Dienste, sofern Nutzen, Datenschutz, Kosten und Wartungsaufwand geklärt sind

Jede neue Funktion erhält einen definierten Zweck, dokumentierte Schnittstellen, Berechtigungen, Tests und einen Rückbau-/Abschaltplan.

## Phase 8 – Sicherheit, Tests und kontrollierter Produktivstart

- [ ] Unit-, Integrations- und End-to-End-Tests für kritische Abläufe durchführen.
- [ ] Berechtigungen und Rollen einschließlich privilegierter Aktionen testen.
- [ ] Rate-Limits, Eingabevalidierung, Authentifizierung und Missbrauchsschutz überprüfen.
- [ ] Datenschutz, Einwilligung, Widerruf, Aufbewahrung und Löschung prüfen.
- [ ] Backups und Wiederherstellung praktisch testen.
- [ ] Verhalten bei Datenbank-, Mail-, API-, Discord- und Netzwerk-Ausfällen testen.
- [ ] Logs auf unnötige Geheimnisse oder sensible Inhalte prüfen.
- [ ] Betriebsdokumentation, Alarmierung und Rollback-Verfahren vervollständigen.
- [ ] Produktivsetzung und Telemetrieaktivierung erst nach ausdrücklicher Freigabe vornehmen.

## Abhängigkeiten und Grenzen

### Bereits vor dem eigenen Server möglich

- Architektur und Schnittstellen planen
- Bestehenden Code analysieren
- Datenverträge und Berechtigungen definieren
- Lokale Implementierungen und Test-Doubles erstellen
- Unit- und Integrationstests vorbereiten
- Store- und Bot-Abläufe in einer Testumgebung erproben
- Sicherheits- und Betriebsdokumentation erstellen

### Abhängig von Infrastruktur und Freigabe

- Produktive E-Mail-Zustellung
- Produktive Kontoverknüpfung und serverseitige Sitzungsverwaltung
- Produktiver Betrieb des dauerhaft verbundenen Discord-Gateway-Bots auf eigener Infrastruktur
- Produktive Heartbeat-Datenerfassung und Telemetrie
- Produktiver Rollout neuer Cloud-Dienste

Diese Abhängigkeiten bedeuten nicht, dass jede Komponente technisch ausschließlich auf einem eigenen Server laufen muss. Sie beschreiben die geplante Reihenfolge für den vollständigen WebRadio-Produktivbetrieb.

## Nicht-Ziele dieser Roadmap

- Keine sofortige Einführung einer komplexen Microservice-Architektur.
- Keine unnötigen zusätzlichen Datenbanken oder Analyseplattformen ohne begründeten Bedarf.
- Keine automatische Aktivierung von Telemetrie.
- Keine automatische Kontoverknüpfung nur aufgrund einer Anmeldung.
- Keine produktiven Datenbankänderungen, Deployments oder Aktivierungen allein durch die Aufnahme dieser Roadmap.

## Definition of Done

Die Roadmap gilt nicht allein deshalb als abgeschlossen, weil Code vorhanden ist. Für jeden Abschnitt müssen die dokumentierten Anforderungen, Tests, Sicherheits- und Datenschutzprüfungen erfüllt sein. Produktive Aktivierung erfolgt separat und erst nach ausdrücklicher Freigabe.

---

**Hinweis:** Diese Datei ist ein Planungsdokument. Phasen, Schnittstellen und technische Entscheidungen können nach der Prüfung der bestehenden Repositories angepasst werden.
