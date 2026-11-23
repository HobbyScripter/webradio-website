# WebRadio – Release-Prüfbericht

**Abschnitt:** Finale Sicherheitsprüfung vor dem Release
**Datum:** 23. November 2026
**Status:** Prüfung abgeschlossen – Freigabe offen
**Basis:** Branch `feature/analytics-vercel-schedules`, HEAD `a3b757f` (keine Commits/Pushes/Deployments)
**Umgebung:** Windows, Node 26, Next.js 16.4.6, Prisma 8, wegwerfbare PostgreSQL-18-Instanz auf `127.0.0.1:5433`

---

## 1. Auftrag und Ergebnis

Geprüft wurden das Anmeldeformular, Login und Registrierung, Passwort-Reset,
Session- und Rollenprüfung, Admin-APIs, CSRF-Schutz sowie sensitive Daten in
URLs und Logs. Der dokumentierte Fehler im Anmeldeformular wurde behoben; dabei
zeigte sich dieselbe Ursache auch im Registrierungs- und im
Passwort-vergessen-Formular.

| Punkt | Ergebnis |
| --- | --- |
| GET mit Formulardaten vor Hydration | **behoben** (Login, Registrierung, Passwort vergessen, Passwort setzen) |
| Passwörter in URLs/Query/Verlauf | **nicht mehr möglich**; Browser- und SSR-Prüfung ohne Treffer |
| Sichere POST-Übermittlung | **umgesetzt**; nach Hydration weiterhin NextAuth `signIn('credentials')` |
| Bestehende NextAuth-Anmeldung | **funktioniert** (Browser-Login, Session, Redirect) |
| Passwort-Reset | generische Antwort, Einmal-Token, 60 Minuten TTL, Sessions werden widerrufen |
| Session-/Rollenprüfung | DB-gestützt; Rollenänderung wirkt sofort, widerrufene Session wird abgewiesen |
| CSRF | NextAuth-Token erforderlich; Origin-Prüfung bei Admin-Mutationen |
| TypeScript / ESLint / Tests / Build | **alle grün** (Details in Abschnitt 5) |

---

## 2. Befund und Behebung: GET vor abgeschlossener Hydration

### 2.1 Ursache

Die Formulare hatten nur `onSubmit`, aber kein `method` und kein `action`.
React hängt den Handler erst nach der Hydration an. Ein Absenden davor – etwa
durch sehr frühes Drücken von Enter, einen langsamen JavaScript-Start oder eine
fehlgeschlagene Hydration – lief deshalb als **nativer GET** auf dieselbe URL.
Die Browser-Serialisierung schrieb dabei alle benannten Felder in die Query:

- Login: `?email=…&password=…`
- Registrierung: `?name=…&email=…&password=…&confirmPassword=…`
- Passwort vergessen: `?email=…`

Damit landeten Passwörter in URL, Browser-Verlauf, Server-/Proxy-Logs und
gegebenenfalls im `Referer`. Das Passwort-Reset-Formular war zwar wegen des
Suspense-Fallbacks nicht im ersten Server-HTML, wurde aber aus demselben Grund
gehärtet.

### 2.2 Umsetzung

| Datei | Änderung |
| --- | --- |
| `src/lib/use-hydrated.ts` (neu) | `useIsHydrated()` über `useSyncExternalStore`: Server/Hydration liefern `false`, nach Hydration `true`. Kein `setState` im Effekt. |
| `src/app/(auth)/auth/login/page.tsx` | `<form method="post" action="/auth/login">`; Submit bis zur Hydration deaktiviert. |
| `src/app/(auth)/auth/register/page.tsx` | `<form method="post" action="/auth/register">`; Submit bis zur Hydration deaktiviert. |
| `src/app/(auth)/auth/forgot-password/page.tsx` | `<form method="post" action="/auth/forgot-password">`; Submit bis zur Hydration deaktiviert. |
| `src/app/(auth)/auth/reset-password/page.tsx` | `<form method="post" action="/auth/reset-password">`; Submit bis zur Hydration deaktiviert. |

Drei Schutzschichten greifen zusammen:

1. **Vor JavaScript:** Das Server-HTML enthält bereits `method="post"` und einen
   deaktivierten Submit-Button. Ohne JavaScript ist das Formular nicht
   absendbar; ein natives Absenden per Enter kann höchstens einen POST auf die
   feste Seiten-URL auslösen – niemals einen GET mit Feldwerten.
2. **Während der Hydration:** Der Button bleibt deaktiviert, bis React
   interaktiv ist. `useSyncExternalStore` liefert dafür den Server-Snapshot
   `false` und erst nach abgeschlossener Hydration `true`.
3. **Nach der Hydration:** Der bestehende Handler ruft `preventDefault()` auf
   und meldet sich unverändert über `signIn('credentials', { redirect: false,
   email, password })` bei NextAuth an. NextAuth selbst übermittelt per POST an
   `/api/auth/callback/credentials` mit CSRF-Token.

Die feste `action` enthält keinen Query-String. Selbst der native POST-Fallback
schreibt keine Formulardaten in die URL; die Werte bleiben im Request-Body.

### 2.3 Nachweis

Server-HTML (curl, also der Zustand **vor** Hydration):

```html
<form class="space-y-4" action="/auth/login" method="post">
<button type="submit" disabled="" …>
```

Gleiches Ergebnis für `/auth/register` und `/auth/forgot-password`.
`renderToStaticMarkup` im neuen Test bestätigt dies für alle vier Formulare.
Der simulierte native POST auf `/auth/login` mit E-Mail und Passwort im Body
antwortete mit HTTP 200 und enthielt **weder in der Location noch im Body** das
Passwort (0 Treffer).

Nach der Hydration im Browser: Submit-Button aktiv, Netzwerk zeigt
`POST /api/auth/callback/credentials`, danach `GET /api/auth/session` und
`router.push('/')`. Die Adresse war `http://localhost:3000/` ohne Query und
ohne Passwort; `history.length` war 2.

---

## 3. Zusätzliche Härtung: Referrer-Policy für Token-Links

Passwort-Reset- und E-Mail-Bestätigungslinks enthalten ein Einmal-Token in der
URL. Der Auth-Bereich setzt deshalb jetzt:

```ts
export const metadata: Metadata = {
  title: 'Konto',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
```

Im Browser-HTML ist `<meta name="referrer" content="no-referrer"/>` vorhanden.
Damit wird die Token-URL nicht als `Referer` an andere Origins weitergegeben.

---

## 4. Sicherheitsprüfung im Einzelnen

### 4.1 Login

| Prüfung | Ergebnis |
| --- | --- |
| Falsches Passwort | HTTP 401, generische Meldung „Ungültige Anmeldedaten“ |
| Rate Limit | 8 × 401, danach 429 mit `Retry-After`; auch das **richtige** Passwort wird während der Sperre mit 429 abgewiesen |
| Konto-Enumeration | fehlendes Konto nutzt denselben Timing-Pfad (`TIMING_EQUALISATION_HASH`) und dieselbe Fehlermeldung |
| Passwort-Hashing | bcryptjs, Cost 12; Klartextpasswort wird nie gespeichert |
| Session-Cookie | `Path=/; HttpOnly; SameSite=Lax`; unter HTTPS zusätzlich `Secure` und `__Secure-`-Präfix (aus `NEXTAUTH_URL` abgeleitet) |
| CSRF | Callback ohne Token → `?csrf=true`, **kein** Session-Cookie; mit gültigem Token erfolgreicher Login |
| Session-Invalidierung | Logout löscht das Cookie und die DB-Session; `/api/account/sessions` danach 401 |

### 4.2 Registrierung

| Prüfung | Ergebnis |
| --- | --- |
| Echte Übermittlung im Browser | `POST /api/auth/register` → **201**, Weiterleitung zur Anmeldung, keine Zugangsdaten in der URL |
| Rollen-Injektion | zusätzliches `"role":"ADMIN"` im Body wird ignoriert; DB-Rolle bleibt `USER` |
| Cross-Origin | `Origin: https://evil.example` → **403**, kein Datensatz |
| Doppelte E-Mail | Codepfad liefert `409 EMAIL_EXISTS` (bestehender Test `auth-security-routes`) |
| Passwortregeln | mindestens 12 Zeichen, höchstens 72, lokale Blockliste; serverseitig erzwungen |

### 4.3 Passwort-Reset

| Prüfung | Ergebnis |
| --- | --- |
| Bekannte vs. unbekannte E-Mail | beide HTTP 200 mit **identischer** generischer Meldung |
| Cross-Origin | `Origin: https://evil.example` → **403** |
| Token im Response | **nein**; der Link wird nur per E-Mail/Outbox zugestellt |
| Token-Eigenschaften | 32 Zufallsbytes, nur SHA-256-Hash gespeichert, einmal verwendbar, 60 Minuten gültig |
| Erfolgreicher Reset (API) | HTTP 200; altes Passwort → `CredentialsSignin`, neues Passwort → Login erfolgreich |
| Replay | derselbe Token ein zweites Mal → **400 INVALID_TOKEN** |
| Session-Widerruf | eine vor dem Reset bestehende Session liefert danach bei `/api/account/sessions` **401**; DB-Sessionanzahl 0 |
| Browser-Formular | ungültiger Token → `POST /api/auth/password-reset/confirm` **400** mit verständlicher Meldung; keine Passwörter in der URL |

### 4.4 Session- und Rollenprüfung

| Prüfung | Ergebnis |
| --- | --- |
| Anonyme Admin-API | **401** |
| `USER` an Admin-APIs | **403** (geprüft für Benutzer, Partner, Audit-Log, Moderation, Advertising-Kampagnen) |
| `ADMIN` an denselben APIs | **200** |
| Rollenänderung ohne erneuten Login | DB-Rolle `USER` → `ADMIN`: dieselbe Cookie-Session erhält **200**; zurück auf `USER`: wieder **403** |
| Autoritative Rolle | `requireAdminSession()` liest die Rolle bei jeder Anfrage aus PostgreSQL, nicht aus dem JWT |
| Widerrufene Session | `/api/auth/session` kann das JWT noch anzeigen, aber jede geschützte API/Seite validiert die DB-Session und antwortet **401/403** |
| Admin-Seiten als `USER` | „Keine Berechtigung“, keine Admin-Navigation, keine Verwaltungsdaten |
| Sync-Endpunkte | `/api/admin/analytics/sync` und `/api/admin/downloads/sync` anonym **401** |

### 4.5 Admin-APIs und CSRF

- Alle Admin-Routen verlangen eine Admin-Session; Mutationen prüfen zusätzlich
  `isSameOriginRequest` bzw. nutzen `authorizeAdminMutation`.
- Getestete Cross-Origin-Mutationen:
  `POST /api/admin/moderation/decision` → **403**,
  `PATCH /api/admin/advertising/campaigns` → **403**.
- NextAuth-Credentials-Callback verlangt ein gültiges CSRF-Token; ohne Token
  wird kein Session-Cookie gesetzt.
- Session-Cookie ist `SameSite=Lax`; zusätzlich schützt der Origin-Check vor
  Same-Site-Subdomain-Angriffen bei den geprüften Mutationen.

### 4.6 Sensible Daten in URLs und Logs

| Prüfung | Ergebnis |
| --- | --- |
| Passwort in URL/Query/History | 0 Treffer bei Login, Registrierung, Reset-Formular und nativen POST-Fallback |
| Passwort/E-Mail in Anwendungslogs | 0 Treffer für benutzte und falsche Passwörter sowie Test-E-Mail |
| Reset-Token in Anwendungslogs | 0 Treffer; `logServerError` schreibt nur Fehlername und Code |
| Token im Response | nie; Reset-Antwort enthält nur eine Meldung |
| Referrer | `no-referrer` im Auth-Bereich |

**Bewusste Restbeobachtung:** Reset- und Verifizierungslinks transportieren ihr
Einmal-Token im Query-String des E-Mail-Links. Das ist das übliche Verfahren;
der Token ist kurzlebig, einmalig und wird nie von Anwendungscode geloggt. Der
Webserver-Request-Log kann die Token-URL dennoch enthalten (im Test nur mit
einem absichtlich ungültigen Dummy-Token beobachtet). Für höchste Anforderungen
wären Log-Redaktion oder ein Token-Austausch über ein HttpOnly-Cookie nötig.

---

## 5. Qualitätssicherung

| Prüfung | Ergebnis |
| --- | --- |
| `npx tsc --noEmit` | **0 Fehler** |
| `npx eslint .` | **0 Fehler**, 10 Warnungen (9 unveränderte plus bestehender `<img>`-Hinweis) |
| `npm test` | **69 Suites / 676 Tests** grün (vorher 68/671; +5 neue Formular-Sicherheitstests) |
| `npm run test:integration` | **8 Suites / 143 Tests** grün gegen wegwerfbares `webradio_test` |
| `npm run build` | **Exit 0**; alle Auth-Routen weiterhin im Routing |

Neue Tests in `src/app/(auth)/__tests__/auth-forms.test.tsx`:

1. Login-, Registrierungs-, Passwort-vergessen- und Reset-Formular sind im
   Server-HTML `method="post"` mit fester `action` und deaktiviertem Submit.
2. Die `action` enthält keinen Query-String.
3. Nach der Hydration ist der Login-Button aktiv und ruft weiterhin
   `signIn('credentials', { redirect: false, email, password })` auf.

### 5.1 Browserprüfung mit echten Übermittlungen

Getestet mit `next dev` auf Port 3000 und einer wegwerfbaren PostgreSQL-Instanz.
Die Konten wurden über die echte Registrierungs-API angelegt; die Admin-Rolle
wurde ausschließlich in der Wegwerf-Datenbank gesetzt.

| Szenario | Ergebnis |
| --- | --- |
| Login `USER` (1440 px) | POST an NextAuth, Redirect `/`, Header zeigt das Konto, URL ohne Passwort |
| Registrierung | Formular ausgefüllt und abgesendet → 201, Erfolg, Redirect `/auth/login`; Rolle in DB `USER` |
| Passwort vergessen | Formular abgesendet → 200, generische Meldung, POST, keine E-Mail in der URL |
| Passwort setzen (ungültiger Token) | Formular abgesendet → 400, Fehlermeldung, keine Passwörter in der URL |
| Admin-Login (Inkognito) | Redirect `/admin`, Dashboard geladen, keine Zugangsdaten in der URL |
| `USER` auf `/admin` | „Keine Berechtigung“, keine Admin-Navigation |
| SSR-/Vor-Hydration-Zustand | per curl geprüft: `method="post"`, feste `action`, Submit `disabled` |
| Nativer POST-Fallback | HTTP 200, kein Passwort in Location oder Response |
| Konsole/Netzwerk | nur POST für Zugangsdaten; keine GET-Anfrage mit Formularfeldern |

**Einschränkung der Methode:** Die Browser-Werkzeuge erlauben kein Deaktivieren
oder künstliches Verzögern von JavaScript. Der Vor-Hydration-Zustand wurde
deshalb am ausgelieferten Server-HTML und durch einen nativen POST geprüft; der
Nach-Hydration-Zustand im echten Browser. Beide Zustände zusammen decken die
Anforderung ab. Screenshots wurden nicht erzeugt.

---

## 6. Beobachtungen und Restrisiken

1. **Token in Reset-/Verifizierungslinks:** üblich und bewusst beibehalten;
   einmalig, 60 Minuten gültig, `no-referrer` gesetzt, nicht in
   Anwendungslogs. Webserver-Zugriffslogs können die URL enthalten.
2. **`/api/auth/session` nach Session-Widerruf:** Das JWT kann dort noch die
   letzte Identität anzeigen. Alle geschützten Seiten und APIs validieren die
   DB-Session und weisen die Anfrage ab; es besteht kein Datenzugriff. Die
   Anzeige kann bis zum nächsten Server-Render veraltet wirken.
3. **Admin-Seiten als `USER`:** Die Zugriffsverweigerung wird als Seite mit
   HTTP 200 und „Keine Berechtigung“ ausgeliefert; es werden keine Admin-Daten
   oder Navigationspunkte gerendert. Die APIs antworten korrekt mit 401/403.
   Für Monitoring sollte der API-Status oder der Seiteninhalt ausgewertet
   werden, nicht nur der HTTP-Status der Seite.
4. **bcrypt-Grenze:** Die Policy begrenzt auf 72 Zeichen; bcrypt zählt Bytes.
   Bei sehr langen Mehrbyte-Passwörtern (>72 UTF-8-Bytes) würde der Hash nur
   den Präfix abdecken. Für normale Passwörter und Passphrasen ohne
   übermäßige Sonderzeichen/Emojis ist das ohne praktische Auswirkung; eine
   Byte-Prüfung wäre eine mögliche spätere Härtung.
5. **Registrierung und Enumeration:** Eine bereits verwendete Adresse liefert
   `409 EMAIL_EXISTS`. Das ist für Registrierungsformulare üblich, erlaubt aber
   die Prüfung, ob eine Adresse ein Konto hat. Der Passwort-Reset ist bewusst
   nicht enumerierbar.

---

## 7. Freigabe

Es wurde **keine** Schemaänderung und **keine** Migration am Projekt oder an
produktiven Daten vorgenommen. Die Migrationen liefen ausschließlich gegen die
wegwerfbaren Datenbanken `webradio_dev` und `webradio_test`. Es wurde nichts
committet, gepusht oder deployt. Dev-Server, Container und Test-Mails wurden
nach der Prüfung entfernt.

**Warte auf ausdrückliche Freigabe für Commit, Push oder Deployment.**
