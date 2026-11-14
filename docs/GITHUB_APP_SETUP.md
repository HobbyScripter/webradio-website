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
10. Notiere auf der App-Seite **App ID** und **Client ID** getrennt voneinander:
    Die **Client ID** (`Iv1.…` / `Iv23li…`) ist der JWT-Issuer, die numerische
    **App ID** dient nur der Anzeige. Beide Werte sind nicht austauschbar.
11. **Private Key erzeugen:**
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
# GitHub App Identifikatoren — App ID und Client ID sind zwei verschiedene Werte
GITHUB_APP_ID="123456"                    # nur Anzeige/Diagnose
GITHUB_CLIENT_ID="Iv23li..."             # JWT-Issuer (`iss`)
GITHUB_CLIENT_SECRET="xxxxxx"            # wird für die App-Authentifizierung nicht verwendet
GITHUB_INSTALLATION_ID="12345678"        # wählt die Installation beim Token-Tausch

# Privater RSA-Schlüssel (.pem Inhalt oder base64-kodiert), signiert das JWT
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"

# Webhook-Secret zur HMAC-Signaturprüfung
GITHUB_WEBHOOK_SECRET="dein_sicheres_webhook_secret"

# Optionaler Schutz für Cron-/Maintenance-Endpunkte (/api/admin/downloads/sync)
CRON_SECRET="dein_cron_bearer_token"
```

`GITHUB_APP_ID` und `GITHUB_CLIENT_ID` sind **nicht** austauschbar: Die App ID
ist die numerische Kennung der App, die Client ID der davon getrennte
OAuth-/JWT-Identifikator (`Iv1.…` oder `Iv23li…`). Für die JWT-Erzeugung wird
ausschließlich `GITHUB_CLIENT_ID` gelesen. Fehlt sie, fordert die Anwendung
bewusst **kein** Installation Token an und verwendet auch die App ID nicht als
Ersatz-Issuer; sie fällt dann auf `GITHUB_TOKEN` zurück (falls gesetzt) und
protokolliert eine Warnung.

---

## 5. JWT- und Installation-Token-Erzeugung

Maßgeblich ist die GitHub-Dokumentation
[„Generating a JSON Web Token (JWT) for a GitHub App“](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app).
Die Implementierung liegt in `src/lib/github-app.ts`.

### Ablauf

1. `getGitHubAppConfig()` liest `GITHUB_CLIENT_ID`, `GITHUB_APP_PRIVATE_KEY` und
   `GITHUB_INSTALLATION_ID` (App ID separat, nur Anzeige).
2. `generateGitHubAppJwt(clientId, privateKey)` baut Header und Payload und
   signiert `header.payload` mit `RSA-SHA256` über den privaten PEM-Schlüssel.
3. `POST https://api.github.com/app/installations/<installation_id>/access_tokens`
   mit `Authorization: Bearer <JWT>` tauscht das JWT gegen ein Installation
   Access Token. Die **Installation ID** bestimmt dabei die Installation; das
   JWT beweist nur die App-Identität.
4. Das Token wird im Prozess zwischengespeichert und erst neu angefordert, wenn
   weniger als zwei Minuten Restlaufzeit bleiben.

### JWT-Claims

| Claim | Wert | Begründung |
|---|---|---|
| `alg` (Header) | `RS256` | von GitHub zwingend vorgeschrieben |
| `typ` (Header) | `JWT` | Standard |
| `iss` | **Client ID** der GitHub App | GitHub empfiehlt die Client ID; sie wird zum Auffinden des passenden Public Key verwendet |
| `iat` | jetzt − 60 s | Schutz gegen Clock Drift (GitHub-Empfehlung) |
| `exp` | jetzt + 9 min | `exp` darf maximal 10 Minuten in der Zukunft liegen; das Fenster `exp − iat` beträgt exakt 10 Minuten |

Die Signatur erfolgt über `header.payload` mit dem privaten Schlüssel der App
(`GITHUB_APP_PRIVATE_KEY`, PEM oder base64-kodiert). Schlüssel und Tokens werden
weder geloggt noch an den Browser ausgeliefert.

### SDK-Kompatibilität

Das Projekt verwendet **kein** Octokit-/GitHub-SDK für die App-Authentifizierung:
JWT und Token-Tausch laufen über `node:crypto` und `fetch`. Damit gibt es keine
SDK-Version, die die App ID als Issuer erzwingen könnte. Die `@octokit/*`-Pakete
im Lockfile sind ausschließlich transitive Abhängigkeiten der Prisma-CLI und
werden von der Anwendung nicht importiert. Wird später ein SDK eingesetzt, muss
es die Client ID als `iss` akzeptieren (z. B. `@octokit/auth-app` ab v8, das
`clientId` explizit unterstützt) und die Claims `iat`/`exp` selbst setzen.

### Verbindungsprüfung im Adminbereich

Der Status unter `/admin/settings/integrations/github` ist keine reine
Konfigurationsanzeige mehr. `checkGitHubAppConnection()` führt bei jedem
Seitenaufruf einen **rein lesenden** Dreistufen-Test aus:

1. JWT mit der Client ID signieren (ohne Netzwerkzugriff).
2. `POST /app/installations/{installation_id}/access_tokens` – Installation Token holen.
3. `GET /repos/YourEliteSystems/WebRadio` mit diesem Token – Lesezugriff prüfen.

Erst wenn alle drei Schritte gelingen, zeigt das Dashboard „Verbunden“. Zurückgegeben
und angezeigt werden nur ein stabiler Code, der fehlgeschlagene Schritt, der
HTTP-Status und eine deutsche Meldung – niemals JWT, Token, Private Key oder
Response-Body.

| Code | Schritt | Bedeutung |
|---|---|---|
| `OK` | `repository` | Token erhalten, Repository lesbar |
| `NOT_CONFIGURED` | `config` | Variablen fehlen; die Meldung nennt ihre Namen |
| `INVALID_PRIVATE_KEY` | `config` | Key ist kein PEM oder das JWT lässt sich nicht signieren |
| `INVALID_JWT` | `token` | GitHub lehnt das JWT ab (HTTP 401): Client ID/Key passen nicht |
| `INSTALLATION_NOT_FOUND` | `config`/`token` | Installation ID nicht numerisch, unbekannt oder App dort nicht installiert (HTTP 404) |
| `FORBIDDEN` | `token`/`repository` | Installation gesperrt oder Lesezugriff fehlt (HTTP 403) |
| `REPOSITORY_NOT_ACCESSIBLE` | `repository` | Repository für die Installation nicht sichtbar oder falsches Repo |
| `API_ERROR` | `token`/`repository` | Netzwerk, Timeout, Rate Limit oder sonstiger HTTP-Fehler |

### Fehlerverhalten der Datenabrufe

- Fehlt `GITHUB_CLIENT_ID`, wird kein JWT erzeugt und kein Token angefordert;
  es greift der optionale `GITHUB_TOKEN`-Fallback.
- Ein abgelehnter Token-Request (HTTP ≠ 2xx) wird als Warnung mit Statuscode
  protokolliert; danach greift ebenfalls der Fallback. Die Verbindungsprüfung
  im Adminbereich macht diese Fälle sichtbar, ohne Logs zu benötigen.

---

## 6. Webhook- & Download-Endpunkte

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

### Webhook-Einrichtung und Verifikation

- **URL:** `POST https://<origin>/api/webhooks/github`
- **Secret:** identisch mit `GITHUB_WEBHOOK_SECRET`. Jede Lieferung wird über
  `X-Hub-Signature-256` (HMAC-SHA256, `timingSafeEqual`) geprüft. Ohne Secret
  antwortet der Endpunkt `503`, bei ungültiger Signatur `401`.
- **Ereignisse:** `release`, `installation`, `installation_repositories`.
- **Idempotenz:** `X-GitHub-Delivery` wird vor der Verarbeitung gespeichert. Eine
  Wiederholung liefert `{ "ok": true, "duplicate": true }` und verarbeitet nichts
  erneut (Replay-Schutz).
- **Repository-Bindung:** Ereignisse für andere Repositories werden mit `403`
  abgelehnt.
- **Gespeicherte Zeitstempel:** `lastWebhookAt` an der Installation sowie Event,
  Action und `processedAt` (UTC) je Delivery. Ein erfolgreicher API-Aufruf setzt
  `lastApiCallAt` (UTC), sobald JWT, Token-Tausch und Lesezugriff auf Repository
  und Releases gelungen sind.

> Hinweis: `processedAt` wird beim Annehmen der Lieferung geschrieben (Signatur
> gültig, noch nicht doppelt). Die Handler laufen synchron im selben Request;
> ein Fehler dort führt zu HTTP 500 und nicht zu einem Erfolgszeitstempel.

---

## 7. Adminbereich

- **Download Analytics:** Unter `/admin/downloads`
  - Anzeige aller kumulativen GitHub-Downloads, getrennt von Website-Aufrufen.
  - Zeitlicher Verlauf mit Filter nach 7, 30 oder 90 Tagen.
  - Aufschlüsselung nach Versionen, Release-Kanal, Plattform und Dateigröße.
  - Datenschutzkonforme Länderstatistik für Website-Downloads.
  - Manuelle Synchronisierung auf Knopfdruck.
- **GitHub Integrationsstatus:** Unter `/admin/settings/integrations/github`
  - Status der Verbindung (Verbunden, Ausgesetzt, Deinstalliert, Verbindung fehlgeschlagen).
  - Name der App, verbundener Account und autorisiertes Repository.
  - Getrennt: letzter erfolgreicher API-Aufruf, letzter empfangener Webhook,
    letztes verarbeitetes Webhook-Ereignis (Event/Action) und Webhook-Secret-Status.
  - Fehlerzustand inklusive Fehlercode, Schritt und HTTP-Status der read-only
    Verbindungsprüfung.

