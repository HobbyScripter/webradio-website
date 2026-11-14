# GitHub App Integration — Einrichtung & Betrieb

Dieses Dokument beschreibt die Einrichtung und Konfiguration der nativen **GitHub App Integration** für das Repository `YourEliteSystems/WebRadio` auf der WebRadio-Website.

---

## 1. Übersicht & Sicherheitsprinzipien

- **Keine Personal Access Tokens als Dauerlösung:** Die Kommunikation erfolgt server-zu-server über eine GitHub App mit asymmetrischer Kryptografie (RS256 JWT) und zeitlich begrenzten Installation Access Tokens.
- **Minimale Rechte (Least Privilege):** Die GitHub App benötigt ausschließlich **Leserechte** (Read-only) für Releases und Repository-Metadaten. Es werden niemals Schreibrechte angefordert oder gewährt.
- **Repository-Bindung:** Die App wird ausschließlich für das autorisierte Repository `YourEliteSystems/WebRadio` freigegeben.
- **Sichere Webhook-Verarbeitung:** Eingehende Webhooks werden kryptografisch per HMAC-SHA256 validiert. Jede Delivery-ID wird idempotent gespeichert, um Replay-Angriffe oder doppelte Ausführungen abzufangen.
- **Schutz von Geheimnissen:** Private Schlüssel und Installationstokens werden niemals an den Browser übermittelt oder in Logs ausgegeben.

---

## 2. Erstellung der GitHub App

1. Gehe in die GitHub-Organisation `YourEliteSystems` (oder unter `Settings -> Developer settings -> GitHub Apps`).
2. Klicke auf **New GitHub App**.
3. **App-Name:** z. B. `WebRadio Release Analytics`
4. **Homepage URL:** `https://webradio.example.com`
5. **Webhook URL:** `https://webradio.example.com/api/webhooks/github`
6. **Webhook Secret:** Generiere ein sicheres 32-Byte-Secret (z. B. mit `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
7. **Berechtigungen (Permissions):**
   - **Repository Permissions:**
     - `Contents`: **Read-only** (für Release-Informationen und Assets)
     - `Metadata`: **Read-only** (wird von GitHub automatisch vorausgesetzt)
   - Alle anderen Berechtigungen auf **No access** belassen.
8. **Ereignisse abonnieren (Subscribe to events):**
   - Hake `Release` an.
   - Optional: `Installation` und `Installation repositories` zur automatischen Statusaktualisierung.
9. Speichere die App mit **Create GitHub App**.
10. **Private Key erzeugen:**
    - Scrolle in den App-Einstellungen nach unten zu **Private keys**.
    - Klicke auf **Generate a private key**. Lade die `.pem`-Datei herunter und bewahre sie sicher auf.

---

## 3. Installation auf dem Repository

1. Klicke im linken Menü der GitHub App auf **Install App**.
2. Wähle die Organisation / das Konto `YourEliteSystems`.
3. Wähle **Only select repositories** und wähle **ausschließlich** `YourEliteSystems/WebRadio`.
4. Schließe die Installation ab.
5. Notiere die **Installation ID** aus der Adresszeile des Browsers (z. B. `https://github.com/organizations/YourEliteSystems/settings/installations/12345678` -> `12345678`).

---

## 4. Konfiguration der Umgebungsvariablen

Trage die Werte in die Server-Umgebungsvariablen (`.env` lokal oder im Hosting-Dashboard) ein:

```env
# GitHub App Identifikatoren
GITHUB_APP_ID="123456"
GITHUB_CLIENT_ID="Iv1.xxxxxx"
GITHUB_CLIENT_SECRET="xxxxxx"
GITHUB_INSTALLATION_ID="12345678"

# Privater RSA-Schlüssel (.pem Inhalt oder base64-kodiert)
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"

# Webhook-Secret zur HMAC-Signaturprüfung
GITHUB_WEBHOOK_SECRET="dein_sicheres_webhook_secret"

# Optionaler Schutz für Cron-/Maintenance-Endpunkte (/api/admin/downloads/sync)
CRON_SECRET="dein_cron_bearer_token"
```

---

## 5. Webhook- & Download-Endpunkte

- **Webhook-Empfänger:** `POST /api/webhooks/github`
  - Validiert `x-hub-signature-256` mit HMAC-SHA256.
  - Prüft `x-github-delivery` auf Einmaligkeit (idempotent).
  - Triggert bei `release`-Ereignissen automatisch die Synchronisierung der Asset- und Download-Zähler.
- **Kontrollierter Download-Endpunkt:** `GET /api/downloads/[assetId]`
  - Validiert die Asset-ID gegen die Datenbank.
  - Verhindert Open Redirects durch strikte Prüfung des Weiterleitungsziels auf die offizielle GitHub-URL.
  - Wendet IP-basiertes Rate-Limiting an (Schutz vor Missbrauch).
  - Ermittelt datensparsam das Herkunftsland über vertrauenswürdige Hoster-Header (keine Speicherung von IP-Adressen).
  - Leitet den Nutzer mit HTTP 307 zur offiziellen Datei auf GitHub weiter.
- **Wartungs- & Synchronisierungs-Endpunkt:** `POST /api/admin/downloads/sync`
  - Geschützt über Administrator-Sitzung oder `Authorization: Bearer <CRON_SECRET>`.
  - Kann als regelmäßiger Cronjob (z.B. 1x täglich) aufgerufen werden.

---

## 6. Adminbereich

- **Download Analytics:** Unter `/admin/downloads`
  - Anzeige aller kumulativen GitHub-Downloads, getrennt von Website-Aufrufen.
  - Zeitlicher Verlauf mit Filter nach 7, 30 oder 90 Tagen.
  - Aufschlüsselung nach Versionen, Release-Kanal, Plattform und Dateigröße.
  - Datenschutzkonforme Länderstatistik für Website-Downloads.
  - Manuelle Synchronisierung auf Knopfdruck.
- **GitHub Integrationsstatus:** Unter `/admin/settings/integrations/github`
  - Status der Verbindung (Verbunden, Ausgesetzt, Deinstalliert).
  - Name der App, verbundener Account und autorisiertes Repository.
  - Zeitstempel des letzten erfolgreichen API-Aufrufs und des letzten empfangenen Webhooks.

