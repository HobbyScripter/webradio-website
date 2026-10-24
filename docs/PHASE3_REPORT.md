# WebRadio Website — Phase 3 Report: Datenmodell & Authentifizierung

**Datum:** 2026-10-24  
**Status:** Phase 3 erfolgreich vorbereitet und implementiert  
**Verzeichnis:** `F:\Dev\webradio-website`  

---

## 1. Überprüfung der Datenbankschicht (Prisma 8 RC vs. Stabile Version)

### 1.1 Abhängigkeiten & Status

* **Installierte Versionen:**
  * `prisma`: `8.0.0-rc.27`
  * `@prisma/orm-postgres`: `8.0.0-rc.20`
  * `temporal-polyfill`: `1.0.6`
  * Kein `@prisma/client` vorhanden (Prisma 8 nutzt `@prisma/orm-postgres` als direkte Laufzeit-Bibliothek).

### 1.2 Vergleich: Prisma 8 RC vs. Prisma 6 (Stabiles LTS)

| Aspekt | Prisma 8 RC (Aktuell) | Prisma 6 (LTS) |
|---|---|---|
| **Schema-Format** | `contract.prisma` (Contract-Based IR) | `schema.prisma` (Flat Schema) |
| **UUIDv7-Unterstützung** | Nativ (`@onCreate(uuid(7))`) | Nur über DB-Funktion / CUID |
| **Client-Architektur** | Namespace-basiert (`db.orm.public.User`) | Modell-basiert (`prisma.user`) |
| **Ökosystem-Adapter** | Keine offiziellen 3rd-Party-Adapter | Volle Adapter-Unterstützung (`@auth/prisma-adapter`) |
| **Audit-Befunde** | 13 Lücken in CLI-Tooling (`@prisma/composer-cli`) | Keine Lücken im Core-Client |
| **Produktionsreife** | Release Candidate (RC) | Produktionsstabil |

### 1.3 Technische Entscheidung & Begründung

**Entscheidung:** Wir behalten die **Prisma 8 RC-Architektur** bei und setzen auf eine **robuste, anwendungseigene Authentifizierungs- und Sessionschicht** (`src/lib/auth-service.ts` & `src/lib/server-auth.ts`), anstatt blind Pakete auszutauschen.

**Gründe & Risikominimierung:**
1. Das gesamte Projekt (Architekturdokumentation, Skill-Definitionen, `prisma.config.ts`, Schema) ist auf Prisma 8 Contract-Architecture ausgelegt.
2. Prisma 8 RC generiert mit `prisma contract emit` saubere, strikt typisierte Artefakte (`contract.json`, `contract.d.ts`).
3. Da Drittanbieter-Adapter wie `@auth/prisma-adapter` für NextAuth 4 nicht mit Prisma 8 kompatibel sind, kapseln wir alle Datenbankoperationen in `src/lib/auth-service.ts`. Dies bietet maximale Flexibilität, striktere Typsicherheit und vollständige Kontrolle über Passwörter, Sessions und Audit-Logs.

---

## 2. Finalisiertes Datenmodell (`prisma/contract.prisma`)

Folgende Anpassungen und Bereinigungen wurden am Datenmodell vorgenommen:

1. **Rollenmodell (RBAC):**
   * Neues Enum `Role` mit `USER`, `DEVELOPER`, `ADMIN`.
   * Attribut `role Role @default(USER)` zum `User`-Modell hinzugefügt mit Index `@@index([role])`.
2. **Bereinigung fehlerhafter Doppelrelationen:**
   * Bei `Plugin` und `Theme` wurde die fehlerhafte zweite Relation `user User @relation(fields: [developerId], references: [id])` entfernt.
   * `Plugin` und `Theme` referenzieren jetzt sauber und kaskadierend ausschließlich `developer DeveloperProfile @relation(fields: [developerId], references: [id], onDelete: Cascade)`.
   * Auf `User` wurden die redundanten Felder `pluginPlugins` und `themeThemes` entfernt.
3. **Veröffentlichungs- und Freigabeworkflow (`PublicationReview`):**
   * Neues Modell `PublicationReview` mit Enums `ReviewTarget` (`PLUGIN`, `THEME`) und `ReviewResult` (`APPROVED`, `REJECTED`, `CHANGES_REQUESTED`).
   * Speichert Reviewer-ID, Zieltyp, Ziel-ID, Status, Prüfnotizen und Zeitstempel.
4. **Indizes & Constraints:**
   * Eindeutige Constraints auf `email`, `slug`, `token`, `(pluginId, version)`, `(themeId, version)`.
   * Check-Constraints auf Status-Feldern und Rollen.
   * Kaskadierende Löschregeln (`onDelete: Cascade` bzw. `SetNull` bei Audit-Logs).

---

## 3. Authentifizierungs- und Autorisierungsarchitektur

### 3.1 Komponenten

* **`src/lib/auth-service.ts`**:
  * Passwort-Hashing mit `bcryptjs` (Cost Factor: 12).
  * `registerUser`: E-Mail-Normalisierung, Duplikatsprüfung, Hashing, Default-Rolle `USER`, Audit-Log-Eintrag.
  * `authenticateUser`: Sichere Überprüfung von E-Mail und Passwort-Hash.
  * `createDatabaseSession` & `validateDatabaseSession`: Erzeugung kryptographischer Session-Tokens (`crypto.randomBytes(32)`), Ablaufprüfung und automatisches Aufräumen abgelaufener Tokens.
  * `hasRole` & `assertRole`: Hierarchische Rollenprüfung (`ADMIN > DEVELOPER > USER`).
* **`src/lib/auth.ts`**:
  * NextAuth.js 4 Credentials-Provider angebunden an `auth-service.ts`.
  * Erweiterte TypeScript-Typen für `Session` und `JWT` zur Bereitstellung der typisierten Rolle (`session.user.role`).
* **`src/lib/server-auth.ts`**:
  * Server-seitige Prüfungen für Server Components und Route Handlers:
    * `requireUserSession()` (erfordert Anmeldung, wirft 401).
    * `requireDeveloperSession()` (erfordert `DEVELOPER` oder `ADMIN`, wirft 403).
    * `requireAdminSession()` (erfordert `ADMIN`, wirft 403).
* **API-Routen:**
  * `POST /api/auth/register`: Registrierung mit Zod-Validierung und Duplikatsmeldung (409 Conflict).
  * `GET /api/developer/status`: Geschützter Endpunkt für Entwickler/Admins.
  * `GET /api/admin/audit-logs`: Streng geschützter Endpunkt für Administratoren.
* **Seiten-Schutz:**
  * Client-seitiges Formular für Registrierung und Login.
  * Server-seitige Rollenprüfung in `/developer` und `/admin` (integriert mit Next.js 16 Partial Prerendering via `<Suspense>`).

---

## 4. Datenbank-Vorbereitung & Migrationsstatus

* **Sicherheit:** Es existiert keine Verbindung zur alten Datenbank, keine Datenübernahme und keine Zugangsdaten im Git-Repository.
* **Initial-Migration erstellt:**
  * Mittels `prisma migration plan --from '@empty' --name init_schema` wurde eine vollständige, content-gehashte Baseline-Migration generiert:
    * `migrations/app/20261024T1407_init_schema/migration.json`
    * `migrations/app/20261024T1407_init_schema/migration.ts`
    * `migrations/app/20261024T1407_init_schema/ops.json`
* **Status `DATABASE_URL`:**
  * `.env` enthält aktuell `DATABASE_URL=""` mit generiertem `NEXTAUTH_SECRET`.
  * Der Client in `src/lib/db.ts` ist so konfiguriert, dass Builds und statische Analysen ohne Live-Datenbank durchlaufen.
  * Sobald die Zugangsdaten für eine leere PostgreSQL-Entwicklungsdatenbank vorliegen, kann die Migration mit `npx prisma db migrate` unmittelbar angewendet werden.

---

## 5. Abnahmekriterien & Testergebnisse

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| **Contract-Generierung** | `npx prisma contract emit` | ✅ Erfolgreich (`contract.json` + `contract.d.ts`) |
| **Migration-Planung** | `npx prisma migration plan --from '@empty'` | ✅ Erfolgreich (Baseline erstellt) |
| **TypeScript-Typprüfung** | `npm run type-check` | ✅ 0 Fehler |
| **ESLint** | `npm run lint` | ✅ 0 Fehler |
| **Unit- & Integrationstests** | `npm test` | ✅ 29/29 Tests bestanden |
| **Produktionsbuild** | `npm run build` | ✅ Erfolgreich (17 Routen inkl. PPR kompiliert) |

### Abgedeckte Tests (`src/lib/__tests__/auth-service.test.ts` & `validations.test.ts`)
1. **Passwort-Hashing:** Korrekte Erzeugung von bcrypt-Hashes ($2a$) und Verifikation.
2. **Doppelte E-Mail-Adressen:** Zuverlässige Erkennung und Ablehnung mit `DuplicateEmailError` (409 Conflict).
3. **Ungültige Anmeldedaten:** Ablehnung nicht existierender Nutzer und falscher Passwörter (`InvalidCredentialsError`).
4. **Session-Verwaltung:** Erzeugung sicherer Zufalls-Tokens (43 Zeichen Base64URL), Abweisung abgelaufener Sessions, Validierung aktiver Sessions inkl. Rollenladung.
5. **Rollenbasierte Autorisierung (RBAC):** Verifikation der Rollenhierarchie, Verweigerung unberechtigter Aktionen für normale Nutzer und Entwickler bei Admin-Aktionen (`ForbiddenError`), Gewährung vollständiger Admin-Rechte.
