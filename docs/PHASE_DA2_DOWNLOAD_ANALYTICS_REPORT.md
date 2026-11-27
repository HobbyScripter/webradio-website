# Abschlussbericht: Phase DA 2.0 – Erweiterung der WebRadio Download Analytics

**Status:** COMPLETED  
**Datum:** 21.11.2026  
**Repository:** `HobbyScripter/webradio-website`  
**Branch:** `feature/analytics-vercel-schedules`

---

## 1. Ausgangszustand

Vor Beginn der Phase DA 2.0:
- Die Download-Erfassung und Analytics-Tabs waren grundlegend aufgeteilt auf GitHub Releases (kumulativ) und Website-Download-Requests (`/api/downloads/[assetId]`).
- Die Kanalermittlung in `src/lib/download-analytics-service.ts` unterschied lediglich zwischen `stable`, `beta` und `alpha`.
- Release Candidates wie `1.0.8-rc.1` oder `v1.0.8-RC.2` wurden fehlerhaft als `beta` eingestuft.
- Das Admin-Dashboard für Downloads (`/admin/downloads`) und die Analytics-Tabs boten nur eingeschränkte Filter (7/30/90 Tage) und keine erweiterten KPIs (Differenz im Zeitfenster, Tagesdurchschnitt, bester Tag, Format-/Paketaufschlüsselung, Referrer-Verteilung).

---

## 2. Ursachenanalyse des fehlenden RC-Kanals

In `src/lib/download-analytics-service.ts` existierte eine interne Hilfsfunktion:
```ts
function channelFor(tagName: string, prerelease: boolean): 'stable' | 'beta' | 'alpha' {
  if (!prerelease) return 'stable';
  return tagName.toLowerCase().includes('alpha') ? 'alpha' : 'beta';
}
```
**Problem:** Wenn `prerelease: true` war und das Tag kein `"alpha"` enthielt, fiel die Logik blindlings auf `"beta"` zurück. Release Candidates besitzen auf GitHub typischerweise das Flag `prerelease: true`, weswegen sie fälschlicherweise Beta zugeordnet wurden.

---

## 3. Geänderte und neue Dateien

### Neue Dateien
1. `src/lib/analytics/channel.ts`
   - Zentrale Release-Kanal-Klassifikation (`channelFor`, `CHANNEL_LABELS`, `CHANNEL_COLORS`, `isPreReleaseChannel`).
   - Unterstützt: `stable`, `rc`, `beta`, `alpha`, `unknown`.
   - Wortgrenzen-sichere Regex-Prüfung auf `rc`, Case-Insensitive, SemVer-kompatibel.
2. `src/lib/__tests__/channel-classification.test.ts`
   - 14 isolierte Unit-Tests für alle Kanäle, Case-Insensitivity und Edge Cases (wie Substrings oder Tag-Prioritäten).
3. `src/app/api/__tests__/analytics-security.test.ts`
   - Sicherheitsprüfungen für Admin-Endpunkte (401 bei unautorisiertem Zugriff, Prüfung von Bearer-Tokens, CSV Formula Injection Sanitizing, Sanitizing von Kanal-Eingaben).
4. `docs/PHASE_DA2_DOWNLOAD_ANALYTICS_REPORT.md`
   - Dieser Abschlussbericht.

### Geänderte Dateien
1. `src/lib/download-analytics-service.ts`
   - Nutzt zentrale `channelFor`-Funktion.
   - `channelDownloads` im Dashboard-Typ und der Aggregation um `rc` und `unknown` erweitert.
2. `src/lib/analytics/queries.ts`
   - `ReleaseAnalytics` um `channels.rc`, `channels.unknown`, `releaseGroups`, `byPlatform`, `byFormat`, `byArch` erweitert.
   - `DownloadRequestAnalytics` um `byReferrer` erweitert.
   - `AnalyticsWindow` auf `7 | 30 | 90 | 180 | 365` erweitert.
3. `src/app/(admin)/admin/analytics/_ui.tsx`
   - `DaysFilter` um Zeitfenster `180` (6 Monate) und `365` (1 Jahr) erweitert.
   - Neue barrierefreie Komponente `ChannelBadge` mit Text und Farbtoken hinzugefügt.
4. `src/app/(admin)/admin/analytics/releases/page.tsx`
   - Aufschlüsselung nach Release-Gruppen (kumulative Downloads je Version).
   - Anzeige von Plattform-, Format- und Architektur-Balken.
   - Darstellung von `RC`-Badges.
5. `src/app/(admin)/admin/analytics/downloads/page.tsx`
   - Erweiterte Visualisierung mit neuer `byReferrer`-Kategorie (datenschutzkonform: nur normalisierte Domains).
   - Neue Zeitfenster-Filter.
6. `src/app/(admin)/admin/downloads/page.tsx`
   - KPI-Karten für den gewählten Zeitraum: Gesamtdifferenz, durchschnittlicher Tageszuwachs, Spitzen-Download-Tag, Unique Releases & Assets.
   - Separate Anzeige für Stabil, Release Candidate, Beta und Alpha.
   - Unterstützung der Zeiträume 7, 30, 90, 180 und 365 Tage.
7. `src/lib/__tests__/download-analytics.test.ts` & `src/app/(admin)/__tests__/download-analytics-page.test.tsx`
   - Mocks und Assertions auf die neuen Kanal-Strukturen aktualisiert.
8. `docs/ANALYTICS.md` & `docs/ANALYTICS_SYSTEM_PLAN.md`
   - Dokumentation um RC-Kanal und die neuen Auswertungsfunktionen ergänzt.

---

## 4. Neue Funktionen & Erweiterte Kennzahlen

1. **Vollständige Kanalerkennung:**
   - Stable (Grün `#22c55e`)
   - Release Candidate (Violett `#8b5cf6`)
   - Beta (Orange `#f59e0b`)
   - Alpha (Rot `#ef4444`)
   - Unbekannt (Zink `#71717a`)
2. **Dashboard-KPIs:**
   - *GitHub Downloads gesamt* (kumulativer Zählerstand)
   - *Website-Aufrufe gesamt* (tatsächlich vermittelte Redirects)
   - *Differenz im Zeitfenster* (echter Zuwachs in den letzten X Tagen)
   - *Durchschnittlicher Tageszuwachs* (z. B. `~42 / Tag`)
   - *Bester Download-Tag* (Tag mit höchstem gemessenem Zuwachs)
   - *Anzahl eindeutiger Releases und Assets*
3. **Erweiterte Zeitfenster:**
   - 7 Tage, 30 Tage, 90 Tage, 180 Tage (6 Monate), 365 Tage (1 Jahr).
4. **Verfeinerte Dimensionen:**
   - Plattform (Windows, Linux, macOS, Arch Linux, Debian, Unbekannt).
   - Paketformat (EXE Installer, Portable EXE, DMG, AppImage, DEB, PKG.TAR.ZST).
   - Architektur (x64, ARM64, x86, ARM).
   - Referrer-Domains (normalisiert ohne sensible Query-Parameter).
   - Länderverteilung (über Hoster-Header, ohne GeoIP-Drittanbieter).

---

## 5. Datenbankänderungen

- **Keine Schemaänderungen notwendig:** Die vorhandenen Tabellen (`GitHubReleaseAsset`, `GitHubDownloadSnapshot`, `WebsiteDownloadStat`, `WebsiteDownloadRequestDaily`) boten bereits alle erforderlichen Spalten (`releaseChannel` als String, `platform`, `format`, `referrerHost`, `countryCode`).
- **Bestehende historische Daten bleiben unberührt und intakt.**

---

## 6. API- und Datenschutzmaßnahmen

- **Strikte Quellentrennung:** GitHub-Downloads (kumulative Zähler) und Website-Download-Aufrufe (HTTP-Redirect-Ereignisse) werden an keiner Stelle vermischt oder addiert.
- **Datenschutz:**
  - Keine Speicherung vollständiger IP-Adressen.
  - Keine Fingerprints oder clientseitigen Tracking-IDs.
  - Referrer werden strikt auf die Domain normalisiert (`new URL(ref).hostname`).
  - Ländercodes werden ausschließlich aus vertrauenswürdigen Edge-Headern (`x-vercel-ip-country`, `cf-ipcountry`) bezogen.
- **Sicherheit:**
  - Open-Redirect-Schutz auf `/api/downloads/[assetId]` verifiziert, dass das Ziel ausschließlich zu `github.com/YourEliteSystems/WebRadio/releases/download/...` führt.
  - CSV-Formula-Injection-Prävention geprüft (führende Zeichen wie `=`, `+`, `-`, `@`, `|` werden escapt).

---

## 7. Testergebnisse & Qualitätssicherung

1. **Jest Test Suite:**
   - **63 Test Suiten bestanden (100%)**
   - **590 Tests bestanden (0 Fehler)**
   - Laufzeit: ca. 20 Sekunden.
2. **TypeScript:**
   - `npx tsc --noEmit` schließt mit **0 Fehlern** ab.
3. **ESLint:**
   - `npx eslint src` meldet **0 Fehler** (1 bekannte vorbestehende Warnung in `admin/legal/page.tsx`).
4. **Production Build:**
   - `npm run build` erzeugt erfolgreich alle 106 statischen und dynamischen Routen.
   - Prisma Contract unverändert valide (`80e32e10...`).

---

## 8. Bekannte Einschränkungen & Hinweise

- **Turbopack im Sandbox-Modus unter Windows:** Beim Bauen in der Standard-Sandbox schlägt die Erstellung von Windows NTFS Junction Points in `.next` gelegentlich fehl (OS Error 5, Access Denied). Außerhalb der Sandbox baut das Projekt ohne Fehler (`✓ Compiled successfully`).
- **Next.js Sicherheits-Hinweis:** Next.js meldet beim Build einen bekannten Upstream-Advisory-Hinweis bezüglich Version 16.4.3 und empfiehlt ein Update. Da gemäß Aufgabenstellung keine Versionsänderungen durchgeführt werden dürfen, wurde dieser unverändert belassen.

---

## 9. Empfehlung für die nächste Phase

- Die manuelle Registrierung der GitHub App mit der Berechtigung `Administration: read` für Traffic-Endpunkte sollte vor Inbetriebnahme geprüft werden.
- Bei Bedarf kann für die CSV-Export-Funktionalität ein administrativer Download-Button ergänzt werden, der die gefilterten Tabellenansichten exportiert.
