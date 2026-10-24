# WebRadio Website - Security Concept

## Security Principles

This document outlines the security measures implemented in the WebRadio Website to protect users, data, and the application from common threats.

## 1. Authentication & Authorization

### Password Security
- **Hashing**: bcryptjs with cost factor 12 (configurable)
- **Storage**: Only password hashes stored, never plaintext
- **Requirements**: Minimum 8 characters, recommended complexity
- **Reset**: Token-based reset (`/auth/forgot-password`); 32 random bytes,
  only a SHA-256 hash is stored, 60-minute lifetime, single use, rate-limited.
  A successful reset revokes every database session for the account.
- **Verification**: One-time e-mail verification tokens (24 hours, hashed,
  single use). Assigning DEVELOPER or ADMIN requires a verified address.

### Session Management
- **Authority**: Server-side session row in PostgreSQL (`Session` model). The
  NextAuth JWT is transport only and carries the session id.
- **Transport**: HttpOnly cookie, SameSite=Lax, `Secure` + `__Secure-` prefix when
  `NEXTAUTH_URL` is HTTPS
- **Expiration**: 30 days for JWT and database session; expired rows are deleted on
  validation
- **Token**: 32 bytes from the CSPRNG, stored as SHA-256 hash only
- **Invalidation**: Logout and password reset delete the database session(s)
  immediately; roles are re-read from the database on every protected access
- **Route Protection**: `src/proxy.ts` (Next.js 16) only redirects requests without a
  session cookie. Authorization always happens server-side in `src/lib/server-auth.ts`.

### Multi-Factor Authentication (Future)
- Support for TOTP-based 2FA
- Backup codes for recovery
- Optional enforcement for admin accounts

### Role-Based Access Control (RBAC)
- **Roles**: Guest, User, Developer, Admin, System Admin (`SYSTEM_ADMIN`)
- **Enforcement**: Server-side checks on all protected routes. The role is
  re-read from PostgreSQL for every protected access, never taken from the JWT
  claim or a client-supplied value.
- **Hierarchy**: `USER < DEVELOPER < ADMIN < SYSTEM_ADMIN`, defined once in
  `src/lib/auth-service.ts` (`ROLE_RANK`). `SYSTEM_ADMIN` satisfies every
  ADMIN check without changing the existing admin routes.
- **Principle of Least Privilege**: Users only get necessary permissions
- **Elevation**: Admin actions require explicit confirmation
- **No HTTP path to SYSTEM_ADMIN**: Registration strips any supplied role, and
  the role endpoint only accepts `USER`, `DEVELOPER` and `ADMIN`. The highest
  level is created by the operator-only CLI with an explicit confirmation
  phrase and database credentials.
- **Protection of the highest level**: A normal Admin cannot change, demote or
  remove a System Admin account. Role changes lock all privileged rows in a
  transaction and the last remaining System Admin cannot be demoted.
- **Verification gate**: A privileged role can only be assigned to an account
  whose e-mail address has been verified; the bootstrap CLIs mark their
  operator-controlled accounts verified
- **Audit**: `SYSTEM_ADMIN_BOOTSTRAPPED`, `SYSTEM_ADMIN_RECOVERED` and
  `ADMIN_ROLE_CHANGED` entries contain no password, hash or token

## 2. Data Protection

### Encryption at Rest
- Database encryption via PostgreSQL (configured at infrastructure level)
- Encrypted storage of sensitive tokens (GitHub tokens, API keys)
- Environment variables for secrets (never in code)

### Encryption in Transit
- TLS 1.2+ for all connections
- HTTPS enforced in production
- Secure database connections with SSL mode

### Data Minimization
- Only collect necessary user data
- Minimal data retention policies
- Right to deletion (GDPR compliance)

### Input Validation
- **Validation Layer**: Zod schemas for all inputs
- **Type Safety**: TypeScript prevents many type-related vulnerabilities
- **Length Limits**: Maximum lengths on all text fields
- **Sanitization**: HTML sanitization for user-generated content

## 3. Protection Against Common Attacks

### SQL Injection
- **Prevention**: Prisma 8 ORM and parameterized query plans; values are never
  concatenated into SQL
- **Validation**: Zod schemas before database operations
- **Raw SQL exception**: The atomic rate-limit increment uses
  `db.raw.sql` with bound template parameters (the ORM has no atomic
  increment). Identifiers are SHA-256 digests, never user input interpolated
  into the statement

### Cross-Site Scripting (XSS)
- **Prevention**: React automatic escaping
- **CSP Headers**: Content Security Policy configured
- **Sanitization**: HTML sanitization for markdown/user content
- **HttpOnly Cookies**: Prevents cookie theft via XSS

### Cross-Site Request Forgery (CSRF)
- **Prevention**: NextAuth.js built-in CSRF protection for its own endpoints
- **SameSite Cookies**: `Lax`
- **Custom Mutating Routes**: same-origin check against `Origin`/`Host` (or
  `NEXTAUTH_URL`) in addition to the session check
- **State-Changing Methods**: POST/PUT/DELETE require a valid, non-revoked session

### Rate Limiting
- **Status**: implemented in the application, backed by PostgreSQL
  (`RateLimitBucket`), so limits are shared across serverless instances.
- **Login**: 20 attempts / 15 min per trusted IP and 8 / 15 min per normalized
  e-mail address. The credentials callback returns a real HTTP 429.
- **Registration**: 5 / hour per trusted IP and 3 / hour per e-mail address.
- **Password reset / verification**: 10 requests / 15 min per IP, 3 / 15 min
  per account; token attempts 20 / 15 min per IP.
- **Privacy**: keys are SHA-256 digests; no plaintext e-mail or IP is stored in
  the bucket row.
- **Trusted IP**: `x-forwarded-for` is used only with `VERCEL=1` or
  `TRUST_PROXY=1`; otherwise IP limits are skipped rather than keyed on a
  spoofable header.
- **Failure mode**: a limiter/database failure fails open and is logged without
  identifiers; authentication still requires a working database.
- **Cleanup**: `cleanupExpiredRateLimits()` exists, but no scheduled job is
  configured yet.
- **DDoS Mitigation**: Vercel's built-in protection (not a substitute for the
  application limits above).

### File Upload Security
- **Validation**: File type, size, and content validation
- **Storage**: External object storage (not on app server)
- **Sandboxing**: Files stored with random names
- **Malware Scanning**: (Future integration with virus scanning service)

## 4. Secure Headers

### HTTP Security Headers
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

### Cookie Security
- HttpOnly flag to prevent JavaScript access
- Secure flag in production (HTTPS only)
- SameSite=Strict or Lax
- Proper domain and path configuration

## 5. Audit & Logging

### Audit Logs
- **Recorded Actions**: All administrative and sensitive user actions
- **Information**: User ID, action, timestamp, IP address, user agent
- **Storage**: Secure database table (`AuditLog`)
- **Retention**: Configurable retention period (default: 90 days)

### Security Event Logging
- Failed login attempts
- Password reset requests
- Unauthorized access attempts
- Suspicious activity patterns

### Log Protection
- Logs not exposed to public
- Sensitive data redacted from logs
- Log integrity protection (future: WORM storage)

## 6. Dependency Security

### Supply Chain Security
- **npm audit**: Regular security audits
- **Dependabot**: Automated dependency updates (GitHub)
- **Lockfile**: Commit package-lock.json for reproducibility
- **Peer Dependencies**: Validate compatibility

### Vulnerability Management
- Regular dependency updates
- Security patches prioritized
- Vulnerability scanning in CI/CD pipeline
- Response plan for zero-day vulnerabilities

### Version Policy
- Prefer stable releases over betas/RCs
- Wait 7 days after release before adopting (as per general policy)
- Only use actively maintained packages

### Stand der Prüfung (Phase 4.6)

`npm audit` vom 2026-10-24 meldet **15 Findings: 0 critical, 10 high,
5 moderate**. Auf Produktionsabhängigkeiten begrenzt (`npm audit --omit=dev`)
sind es **2 high**; beide hängen an `nodemailer@7.0.13`.

| Paket | Version | Art | Hinweis / offered fix |
|---|---|---|---|
| `nodemailer` | 7.0.13 | direkt, Production | Fix wäre 10.2.1 (Major). `next-auth@4.24.15` deklariert Peer `nodemailer ^7.0.7`; Upgrade nicht kompatibel |
| `next-auth` | 4.24.15 | direkt, Production | wird nur wegen der `nodemailer`-Abhängigkeit gemeldet; angebotener „Fix“ (1.12.1) ist ein unsinniger Downgrade |
| `@hono/node-server` | 1.19.9 | transitiv, nur Dev | über `prisma` → `@prisma/composer-cli` → `@prisma/dev` |
| `hono` | 4.11.4 | transitiv, nur Dev | dito |
| `lodash` | 4.17.21 | transitiv, nur Dev | über `@mrleebo/prisma-ast`/`chevrotain` |
| `@prisma/composer`, `@prisma/composer-cli`, `@prisma/dev`, `alchemy` | 0.34.0 / 0.34.0 / 0.20.0 / 2.0.0-beta.83 | transitiv, nur Dev | Prisma-8-RC-Werkzeugkette |
| `@mrleebo/prisma-ast`, `chevrotain`, `@chevrotain/*` | 0.13.1 / 10.5.0 | transitiv, nur Dev | Parser-Werkzeuge der Prisma-CLI |
| `valibot` | 1.2.0 | transitiv, nur Dev | Prisma-CLI |

Für die Dev-Findings bietet `npm audit` ausschließlich `prisma@7.10.1` an. Das
wäre ein Major-Wechsel **weg vom Contract-basierten Prisma-8-Workflow** und
wurde deshalb nicht ausgeführt. Die Pakete sind nicht Teil des
Next.js-Runtime-Bundles; `npm audit --omit=dev` bestätigt, dass nur der
E-Mail-Pfad betroffen ist.

#### Nodemailer-Mitigation im aktuellen Code

`src/lib/email.ts` verwendet ausschließlich:

- `createTransport({ host, port, secure, requireTLS, auth? })`,
- `sendMail({ from, to, subject, text })` mit festen, serverseitig erzeugten
  Texten,
- Empfängeradressen aus der Datenbank (bei Registrierung per Zod validiert).

Nicht verwendet werden `envelope.size`, `raw`, benutzerdefinierte Header,
`List-*`-Kommentare, OAuth2-Tokenabruf, DKIM-Signierung, `jsonTransport`,
`disableFileAccess`/`disableUrlAccess`, `resolveContent()` oder ein
benutzerdefinierter `name` der Transportverbindung. Damit sind mehrere der
gemeldeten Vektoren im aktuellen Pfad nicht erreichbar. Das beseitigt die
Advisories **nicht**: Adressparser-DoS und ein kompromittierter SMTP-Server
bleiben möglich.

**Empfehlung:** Vor einem Produktivstart entweder auf eine Nodemailer-Version
mit Fixes wechseln, sobald `next-auth` sie als Peer akzeptiert, oder den
E-Mail-Versand über einen gepflegten Anbieter-SDK/HTTP-API ersetzen. Kein
`npm audit fix --force`, kein unkontrolliertes Major-Upgrade.

## 7. API Security

### API Authentication
- Session-based authentication for the protected web app
- The read-only endpoints `/api/plugins`, `/api/themes`, `/api/releases` and
  `/api/news` are intentionally public; they expose only published data
- Every protected route validates the database session and re-reads the role
  (see `src/lib/server-auth.ts`)
- Future: API keys for third-party integrations

### API Rate Limiting
Authentication and token endpoints are limited as described in §3. Public
read-only catalogue endpoints are not rate-limited yet; they are cache-disabled
(`no-store`) for correctness, so an edge/WAF limit is still advisable for a
public launch. Per-user API keys do not exist yet.

### Public Catalogue and API (Phase 4)
- Every public query filters on `isPublished = true` **and**
  `status = APPROVED`; the condition lives in `src/lib/catalog.ts`, not in the
  client
- Responses are whitelisted DTOs. They never contain e-mail addresses, session
  tokens, audit logs, review notes or private drafts
- `q`, `sort` and `page` are validated with Zod; invalid values return `400`
- Download and preview URLs must be absolute HTTP(S) URLs without embedded
  credentials. Unsafe values are returned as `null` or not rendered
- Public API responses use `Cache-Control: no-store`. A withdrawn entry is
  therefore not served from a shared cache after the next request
- Successful detail pages and catalogue pages are also non-cacheable
  (`private, no-cache, no-store`), because every request reads PostgreSQL
- With Cache Components, the Next.js proxy checks plugin/theme/news detail
  slugs before rendering and rewrites unknown or unpublished entries to
  `/404` with status `404`. A database outage is not turned into a 404
- Known framework limitation: Next.js 16.4 attaches its pre-rendered
  `s-maxage=31536000` header to the rendered `404` answer even though the proxy
  sets `no-store`. Withdrawn *content* is never cached (the 200 page and the
  API are `no-store`), but a negative 404 can outlive a later publication. This
  must be handled at the CDN or re-checked after a Next.js update; see
  `docs/PHASE4_5_REPORT.md` §6 and §13
- The proxy check adds one indexed slug lookup per detail request. It is not an
  authorization boundary and does not replace the page-level filter

### API Input Validation
- Zod schemas for all API inputs
- Strict type checking
- No implicit type coercion
- Error messages don't leak sensitive info
- Public read-only endpoints reject invalid query parameters instead of
  silently coercing them

## 8. GitHub Integration Security

### Token Storage
- Encrypted storage in database
- Scoped tokens with minimal permissions
- Token rotation capability
- Revocation on user request

### Webhook Security
- Signature verification for all webhooks
- Replay attack prevention
- IP allowlisting (optional)
- Rate limiting for webhook endpoints

### API Limits
- Respect GitHub API rate limits
- Implement exponential backoff
- Cache responses where appropriate
- Monitor usage and alert on anomalies

## 9. Privacy & Compliance

### GDPR Compliance
- Explicit consent for data collection
- Right to access user data
- Right to deletion
- Data portability
- Clear privacy policy

### Data Retention
- Clear retention policies
- Automatic deletion of expired data
- User-controlled data deletion
- Backup retention policies

### Email Privacy
- Email addresses only for authentication
- No third-party marketing without consent
- Unsubscribe mechanism for newsletters
- BCC for mass emails

## 10. Development Security

### Development Practices
- Never commit secrets or credentials
- Use environment variables for configuration
- Code review for security issues
- Security testing in CI/CD

### Secrets Management
- No secrets in code
- Environment variables for all secrets
- Separate secrets per environment
- Secret rotation strategy

### Access Control
- Minimal production access
- Temporary access for maintenance
- Audit log of all production access
- Separate admin accounts

## 11. Incident Response

### Incident Types
- Data breach
- Unauthorized access
- DDoS attack
- Vulnerability disclosure
- Service outage

### Response Plan
1. **Detection**: Monitoring and alerting
2. **Containment**: Isolate affected systems
3. **Investigation**: Determine scope and impact
4. **Remediation**: Fix the issue
5. **Recovery**: Restore normal operations
6. **Post-Mortem**: Document and learn

### Communication
- Timely notification to affected users
- Transparent communication about incidents
- Coordination with security team
- Regulatory reporting if required

## 12. Security Testing

### Automated Testing
- Static analysis (ESLint, TypeScript)
- Dependency scanning (npm audit)
- Secret scanning (GitGuardian or similar)
- SAST in CI/CD pipeline

### Manual Testing
- Regular penetration testing
- Code review for security issues
- Threat modeling
- Security architecture review

### Third-Party Assessments
- Annual security audit (optional)
- Penetration testing by external firm
- Compliance certifications (if needed)

## 13. Configuration Security

### Environment Variables
- All secrets in environment variables
- Different values per environment
- Never hardcoded in code
- Validation at startup

### Database Security
- Strong passwords for database users
- Principle of least privilege for DB users
- Network-level access controls
- Regular backups

### Server Security
- Regular OS updates
- Firewall configuration
- Minimal exposed services
- Intrusion detection (optional)

## 14. Future Security Enhancements

### Planned Enhancements
- Multi-factor authentication (2FA)
- Security question challenges (fallback)
- Biometric authentication (WebAuthn)
- Advanced threat detection
- Automated security testing
- Bug bounty program

### Monitoring & Alerting
- Real-time security monitoring
- Anomaly detection
- Automated alerting
- Dashboard for security metrics

## 15. Security Checklist

### Before Production Deployment
- [ ] All secrets in environment variables
- [ ] HTTPS enforced
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] Audit logging active
- [ ] Database backups configured
- [ ] Error pages don't leak info
- [ ] Dependencies audited
- [ ] Password policies enforced
- [ ] Session expiration configured
- [ ] CORS properly configured
- [ ] CSP headers set
- [ ] No debug info in production

### Regular Security Tasks
- [ ] Monthly dependency updates
- [ ] Quarterly security audit
- [ ] Annual penetration test
- [ ] Regular backup testing
- [ ] Review audit logs
- [ ] Update security documentation
- [ ] Train team on security best practices
