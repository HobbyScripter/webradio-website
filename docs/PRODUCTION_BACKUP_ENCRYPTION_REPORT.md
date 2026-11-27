# Produktions-Backup: verschlüsselte Zweitkopie

**Datum:** 2026-11-26
**Repository:** YourEliteSystems/WebRadio-Website
**Bezug:** `docs/PRODUCTION_BACKUP_REPORT.md` (Original-Backup vom 2026-11-26 19:56:35 CET)
**Art der Aufgabe:** Verschlüsselte Zweitkopie des bestehenden Backups erstellen und verifizieren
**Ergebnis:** **ENCRYPTED COPY CREATED – KEY STORAGE OPEN**

> Es wurde **keine** Datenbankverbindung aufgebaut, kein neues Backup gezogen, keine Migration ausgeführt, nichts an Produktion, Vercel oder Prisma geändert, nichts committet, gepusht oder deployt und keine Datei gelöscht. Das Original-Backup ist unverändert erhalten (Prüfsumme vor und nach der Aufgabe identisch, Zeitstempel und Größe unverändert).

---

## 1. Verwendetes Verschlüsselungsverfahren

| Eigenschaft | Wert |
| --- | --- |
| Verfahren | **AES-256-GCM** (authentifizierte Verschlüsselung, AEAD) |
| Schlüssellänge | 256 Bit (32 zufällige Bytes, `RandomNumberGenerator` des Betriebssystems) |
| IV / Nonce | 96 Bit, für jede Verschlüsselung neu zufällig erzeugt |
| Authentifizierungs-Tag | 128 Bit (GCM-Standard) |
| Implementierung | Node.js `crypto` (`createCipheriv('aes-256-gcm', …)`), geprüft gegen OpenSSL 3.5.9 |
| Archivformat | `WRBK1` (5 Byte Magie) ‖ IV (12 Byte) ‖ Tag (16 Byte) ‖ Ciphertext |
| Overhead | 33 Byte (379.888 → 379.921 Byte) |
| Integritätsschutz | Manipulation an IV, Tag oder Ciphertext führt zu einem harten Fehler; es wird **kein** Klartext ausgegeben (siehe 3.3) |

Ein Passwort-basiertes Verfahren (z. B. `gpg --symmetric` mit Passphrase oder `age -p`) wurde bewusst **nicht** gewählt: Es hätte eine Passphrase erfordert, die in diesem Lauf nur über Kommandozeile, Umgebungsvariable oder Datei hätte bereitgestellt werden können – genau die Wege, die der Auftrag ausschließt. Der symmetrische Schlüssel wird stattdessen zufällig erzeugt und über eine Pipeline (stdin) übergeben, nie über Argumente.

**Nicht verwendet:** keine Cloud-KMS, kein externer Dienst, keine Übertragung an Dritte, kein Cloud-Upload.

---

## 2. Speicherort der verschlüsselten Kopie

| Feld | Wert |
| --- | --- |
| Pfad | `E:\webradio-backups-encrypted\webradio-production-backup-20261126-195635.dump.aes256gcm` |
| Prüfsummendatei | `E:\webradio-backups-encrypted\webradio-production-backup-20261126-195635.dump.aes256gcm.sha256` |
| Größe | **379.921 Bytes** |
| Datenträger | Volume `E:` → physische Disk **1** (`ST4000DM004-2CV104`, HDD, Seriennr. `WFN0555T`) |
| Original liegt auf | Volume `F:` → physische Disk **3** (`CT1000P2SSD8`, SSD) |

Damit liegen Original und verschlüsselte Kopie auf **zwei unterschiedlichen physischen Datenträgern** – der Ausfall einer Disk betrifft nicht beide Kopien. Das Verzeichnis ist nicht versioniert, liegt außerhalb des Repositories und ist per `icacls` auf `DFark`, `Administratoren` und `SYSTEM` beschränkt (Vererbung entfernt).

---

## 3. Integrität und Verschlüsselungstest

### 3.1 SHA-256 der verschlüsselten Datei

```
b530406cdd692349df4f7077f11e7b1f482efc56f980df6a56af16c69085aec1
```

`sha256sum -c webradio-production-backup-20261126-195635.dump.aes256gcm.sha256` → **OK**.

### 3.2 Entschlüsselungstest

| Schritt | Ergebnis |
| --- | --- |
| Ziel | temporäres Verzeichnis außerhalb des Repositories (`%TEMP%\tmp.xVBPaqq4xO`) |
| Befehl | `backup-key-pipe.ps1` (Schlüssel via stdout) → `backup-decrypt.mjs` (liest Schlüssel aus stdin) |
| GCM-Authentifizierung | `authenticated=true` |
| Entschlüsselte Größe | 379.888 Bytes |
| **SHA-256 der entschlüsselten Datei** | **`dd6b7ad02ca69fd5bd2e7b44878541e6c4f8d9896520a82b68ade23f8be8fdca`** |
| Vergleich mit Original | ✅ **identisch** |
| Zusätzliche Nutzungsprüfung | `pg_restore --list` auf der entschlüsselten Datei → Exit 0, 56 `TABLE DATA`-Einträge |

Die entschlüsselte Kopie war also nicht nur bitgleich, sondern auch als PostgreSQL-Archiv unmittelbar verwendbar.

### 3.3 Negativtest (Manipulationsschutz)

Eine Kopie des Archivs wurde an Byte 100 verändert und mit demselben Schlüssel entschlüsselt:

```
authentication FAILED: Unsupported state or unable to authenticate data
Exit-Code 3 – keine Ausgabedatei geschrieben
```

Damit ist bestätigt, dass GCM Veränderungen erkennt und nicht stillschweigend beschädigten Klartext liefert.

### 3.4 Entsorgung der temporären Klartextdatei

Die temporäre entschlüsselte Datei wurde mit Zufallsdaten überschrieben (`dd if=/dev/urandom`, 93 × 4 KiB über die volle Länge, `conv=notrunc`), synchronisiert und anschließend gelöscht; das temporäre Verzeichnis wurde entfernt (Nachprüfung: nicht mehr vorhanden).

**Einschränkung:** Auf SSDs/NVMe mit Wear-Leveling sowie auf Dateisystemen mit Copy-on-Write ist ein physisch garantiertes Überschreiben einzelner Blöcke nicht möglich. Das Überschreiben ist eine Best-Effort-Maßnahme, kein forensisch garantierter Löschvorgang. Verbleibendes Risiko ist gering (kein Zugriff auf Rohblöcke ohne Administratorrechte), aber vorhanden; für höchste Anforderungen wäre ein Datenträger mit `TRIM`/`BLKSECDISCARD` oder vollständige Verschlüsselung des Ziels zu verwenden.

---

## 4. Übereinstimmung der Original-Prüfsumme

| Prüfung | Wert |
| --- | --- |
| Soll (aus dem ersten Backup) | `dd6b7ad02ca69fd5bd2e7b44878541e6c4f8d9896520a82b68ade23f8be8fdca` |
| **Vor** der Verschlüsselung geprüft (`sha256sum -c`) | ✅ OK |
| Beim Verschlüsseln erneut berechnet | ✅ identisch (`--expect-sha` hätte sonst abgebrochen) |
| **Nach** allen Schritten geprüft (`sha256sum -c`) | ✅ OK |
| Größe / Zeitstempel | 379.888 Bytes / 2026-11-26 19:56 – unverändert |
| Entschlüsselte Kopie | ✅ identisch mit dem Original |

Das Original wurde ausschließlich gelesen (kein Schreibzugriff, keine Umbenennung, keine Löschung).

---

## 5. Schlüssel: Speicherort und Schutzkonzept

| Feld | Wert |
| --- | --- |
| **Key ID** (zur Identifikation, aus dem Schlüssel abgeleitet) | **`7849fd2a03f295b7`** (erste 8 Byte des SHA-256 des Schlüssels) |
| Schlüsselform | 32 zufällige Bytes |
| Ablage | `C:\Users\DFark\AppData\Local\webradio-backup-keys\webradio-backup-20261126-195635.key.dpapi` |
| Dateigröße | 262 Bytes (nur der verschlüsselte DPAPI-Blob, **kein** Klartextschlüssel) |
| Schutzmechanismus | **Windows DPAPI**, Scope `CurrentUser`: Der Blob ist an das Windows-Benutzerprofil gebunden und lässt sich nur nach Anmeldung dieses Benutzers auf diesem System entpacken |
| Zugriffsrechte | `icacls` ohne Vererbung, nur `DFark`, `Administratoren`, `SYSTEM` |
| Ablage außerhalb | ✅ nicht im Repository, nicht im Backup-Verzeichnis (`F:\…`), nicht im Verzeichnis der verschlüsselten Kopie (`E:\…`) |
| Übergabe an den Prozess | ausschließlich über **stdin-Pipeline**; nie in `argv`, nie in einer Umgebungsvariable, nie in einer Datei, nie in einem Log |
| Anzeige | nur `key_id`, nie der Schlüssel oder Teile davon |
| Speicherhygiene | Schlüssel- und Klartextpuffer werden nach Gebrauch im Prozess überschrieben |

**Was dieses Konzept leistet:** Ein kopierter Datenträger oder ein Zugriff auf `E:` allein genügt nicht zur Entschlüsselung; der Angreifer bräuchte zusätzlich das Windows-Profil samt Anmeldeinformationen. Der Schlüssel liegt nicht neben dem Ciphertext und nicht im Repository.

**Was dieses Konzept nicht leistet (deshalb „KEY STORAGE OPEN“):**

1. Der Schlüssel ist an **diesen Rechner und dieses Benutzerprofil** gebunden. Gehen Rechner oder Profil verloren (Diebstahl, Defekt, Neuinstallation, Profil-Reset), ist der Schlüssel **nicht wiederherstellbar** – und damit werden **beide** Kopien unbrauchbar. Genau der Katastrophenfall, gegen den ein Backup schützt, wäre nicht abgedeckt.
2. Schlüssel und verschlüsselte Kopie befinden sich auf **demselben Gerät** (unterschiedliche Datenträger, aber derselbe Rechner). Das ist besser als „Schlüssel neben Ciphertext“, aber keine unabhängige Verwahrung.
3. Auf diesem System ist **kein** passender externer Verwahrungsort verfügbar: kein Passwortmanager mit CLI (`op`, `bw`, `keepassxc-cli` nicht vorhanden), kein externer Datenträger angeschlossen, kein GPG-Schlüsselpaar im Keyring (`gpg --list-secret-keys` leer), kein HSM. Eine Cloud-/KMS-Ablage ist ohne ausdrückliche Freigabe ausgeschlossen.

**Erforderlicher nächster Schritt (durch den Betreiber, nicht durch den Agenten):** Den Schlüssel zusätzlich in einen **vom Rechner unabhängigen** Speicher übernehmen – Passwortmanager-Eintrag und/oder ein sicher verwahrter Datenträger an einem zweiten Ort. Der Klartextschlüssel lässt sich dafür kontrolliert auf der Konsole ausgeben und sofort in den Passwortmanager eintragen:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .acceptance/backup-key-pipe.ps1 `
  -Path "C:\Users\DFark\AppData\Local\webradio-backup-keys\webradio-backup-20261126-195635.key.dpapi"
```

Die Ausgabe ist Base64 (44 Zeichen) und darf **nicht** in eine Datei, ein Terminal-Log oder den Chat geschrieben werden. Nach der Übernahme ist die Key ID `7849fd2a03f295b7` gegenzuprüfen und ein Probelauf gemäß Abschnitt 5 der Wiederherstellungsanleitung durchzuführen.

---

## 6. Aufbewahrungsstrategie

**Grundprinzip 3-2-1:** mindestens 3 Kopien, auf 2 verschiedenen Medien, davon 1 an einem anderen Ort.

| Kopie | Medium | Status |
| --- | --- | --- |
| 1 – Original (unkomprimiert, PostgreSQL-Custom-Format) | `F:\Dev\webradio-backups\` (SSD, Disk 3) | ✅ vorhanden |
| 2 – Verschlüsselte Kopie | `E:\webradio-backups-encrypted\` (HDD, Disk 1) | ✅ vorhanden |
| 3 – Auslagerung an einen zweiten Ort (Offsite) | noch nicht vorhanden | ❌ **offen**, benötigt Freigabe und Medium |

**Empfohlener Rhythmus**

| Anlass | Aktion |
| --- | --- |
| Vor **jeder** Migration oder jedem Schema-Eingriff | vollständiges `pg_dump -Fc`, verschlüsselte Kopie, Prüfsummen dokumentieren |
| Während aktiver Entwicklung | wöchentlich ein vollständiges Backup |
| Nach einer abgenommenen Migration | neues Referenzbackup als „letzter bekannter guter Stand“ |
| Ohne Änderungen an Schema/Daten | monatlich ein Backup zur Absicherung gegen schleichende Datenfehler |

**Aufbewahrungsdauer (Empfehlung)**

| Kopie | Dauer |
| --- | --- |
| Pre-Migration-Backup (dieses) | bis **30 Tage nach** erfolgreicher Migration **und** Abnahme, mindestens jedoch 90 Tage |
| Laufende Wochen-/Monatsbackups | 90 Tage rollierend (Monatsstände 12 Monate) |
| Referenzbackup nach Abnahme | 12 Monate |

**Wiederherstellungstest**

- nach **jeder** Änderung der Backup-Strategie (Medium, Werkzeug, Verschlüsselung, Aufbewahrung),
- nach jedem neuen Referenzbackup,
- mindestens **quartalsweise**,
- immer gegen eine **isolierte** PostgreSQL-Instanz, niemals gegen Produktion (Verfahren: `docs/PRODUCTION_BACKUP_REPORT.md`, Abschnitt 6).

**Bewusst nicht eingerichtet:** keine automatische Löschung, keine Rotation, kein Cronjob. Bestehende Backups werden nicht angetastet; eine Automatisierung erst nach Festlegung der Aufbewahrungsfristen durch den Betreiber.

---

## 7. Offene Voraussetzungen und Empfehlungen

| # | Offene Voraussetzung | Bewertung |
| --- | --- | --- |
| 1 | **Schlüssel-Verwahrung unabhängig vom Rechner** (Passwortmanager und/oder Offsite-Medium) | ❌ blockierend für „VERIFIED“ – ohne diesen Schritt ist die Zweitkopie bei Rechner-/Profilverlust wertlos |
| 2 | **Offsite-Kopie** der verschlüsselten Datei | ❌ offen – erfordert Medium und ausdrückliche Freigabe; keine Cloud ohne Zustimmung |
| 3 | **Aufbewahrungsfristen formal bestätigen** | ⚠️ Empfehlung in Abschnitt 6, noch nicht betreiberseitig beschlossen |
| 4 | **Automatisierung** (geplanter Dump + Verschlüsselung + Prüfsummenprüfung) | ⚠️ bewusst nicht eingerichtet; sinnvoll nach Festlegung der Fristen |
| 5 | **Wiederherstellungstest auf PostgreSQL 17** | ⚠️ Der Restore-Test lief auf PG 18.4; Produktion ist PG 17.2. Lesbarkeit ist belegt, ein Restore auf einem PG-17-Server nicht |
| 6 | **Restverschlüsselung des Backup-Datenträgers** (BitLocker o. ä.) | ⚠️ Empfehlung: schützt auch das unverschlüsselte Original auf `F:` bei Geräteverlust |
| 7 | **Plattform-Backups (Prisma)** weiterhin ungeprüft | ⚠️ unverändert: `prisma auth login` erforderlich (siehe `docs/PRODUCTION_BACKUP_REPORT.md`, Abschnitt 1) |
| 8 | **Schlüsselrotation** | ⚠️ nicht implementiert; bei Verdacht auf Kompromittierung: neu verschlüsseln, alte Kopie löschen – erst nach Freigabe |
| 9 | **Hilfsskripte ungetrackt** | ℹ️ `.acceptance/backup-encrypt.mjs`, `backup-decrypt.mjs`, `backup-key-create.ps1`, `backup-key-pipe.ps1`, `dpapi-probe.ps1` – nicht committet, enthalten keine Schlüssel |

---

## Bewertung

> ## ENCRYPTED COPY CREATED – KEY STORAGE OPEN

**Erreicht:**

- Zweite Kopie mit **AES-256-GCM** (256-Bit-Schlüssel, zufälliger 96-Bit-IV, 128-Bit-Auth-Tag) erstellt: 379.921 Bytes, SHA-256 `b530406c…aec1`.
- Ablage auf einem **anderen physischen Datenträger** als das Original (`E:` HDD vs. `F:` SSD), Verzeichniszugriff auf Benutzer/Administratoren/SYSTEM beschränkt.
- Entschlüsselungstest erfolgreich: authentifiziert, bitgleich zum Original (`dd6b7ad0…fdca`), zusätzlich als PostgreSQL-Archiv lesbar (56 `TABLE DATA`-Einträge).
- Manipulationsschutz nachgewiesen (verändertes Byte → harte Ablehnung, kein Klartext).
- Temporäre Klartextdatei best-effort überschrieben und entfernt.
- Original unverändert: Prüfsumme, Größe und Zeitstempel identisch; keine neue Datenbankabfrage, keine Migration, keine Schreiboperation.

**Nicht erreicht:**

- Der Schlüssel liegt DPAPI-geschützt im Benutzerprofil **desselben Rechners**. Das schützt den Schlüssel at rest, deckt aber den Verlust von Rechner oder Profil nicht ab. Ein unabhängiger Verwahrungsort (Passwortmanager, Offsite-Medium, HSM) ist auf diesem System **nicht vorhanden** und durfte nicht improvisiert werden.
- Solange der Schlüssel nicht extern gesichert ist, ist die verschlüsselte Kopie **kein belastbarer Katastrophenschutz** – nur eine gehärtete Zweitkopie gegen Datenträgerausfall und unberechtigten Dateizugriff.

**Unverändert gesperrt:** Produktionsmigration, Schreiboperationen auf Produktion, Änderungen an Vercel-/Prisma-Konfiguration, Commit, Push, Deployment, Löschung des Originals, Übertragung an externe Dienste ohne Freigabe. Aus diesem Bericht folgt **keine** Migrationsfreigabe.

---

## Anhang: Wiederherstellung aus der verschlüsselten Kopie

```powershell
# 1) Entschlüsseln (Schlüssel ausschließlich über die Pipeline, nie als Argument)
powershell -NoProfile -ExecutionPolicy Bypass -File .acceptance/backup-key-pipe.ps1 `
  -Path "C:\Users\DFark\AppData\Local\webradio-backup-keys\webradio-backup-20261126-195635.key.dpapi" `
  | node .acceptance/backup-decrypt.mjs `
      "E:\webradio-backups-encrypted\webradio-production-backup-20261126-195635.dump.aes256gcm" `
      "D:\restore\webradio-production-backup.dump"

# 2) Prüfen: muss dd6b7ad02ca69fd5bd2e7b44878541e6c4f8d9896520a82b68ade23f8be8fdca ergeben
sha256sum "D:\restore\webradio-production-backup.dump"

# 3) In eine ISOLIERTE Instanz einspielen – niemals gegen DIRECT_URL
pg_restore --no-owner --no-privileges -h 127.0.0.1 -p 5436 -U postgres `
  -d webradio_prod_restore_test "D:\restore\webradio-production-backup.dump"
```

Erwartete Kennzahlen nach dem Restore: 53 Tabellen, 192 Indizes, 154 Constraints, Marker `e54862c5…`, 15 Ledger-Zeilen, 2 Benutzer, 7 Sessions.
