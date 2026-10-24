# WebRadio Website - Security Concept

## Security Principles

This document outlines the security measures implemented in the WebRadio Website to protect users, data, and the application from common threats.

## 1. Authentication & Authorization

### Password Security
- **Hashing**: bcryptjs with cost factor 12 (configurable)
- **Storage**: Only password hashes stored, never plaintext
- **Requirements**: Minimum 8 characters, recommended complexity
- **Reset**: Secure token-based password reset with expiration

### Session Management
- **Authority**: Server-side session row in PostgreSQL (`Session` model). The
  NextAuth JWT is transport only and carries the session id.
- **Transport**: HttpOnly cookie, SameSite=Lax, `Secure` + `__Secure-` prefix when
  `NEXTAUTH_URL` is HTTPS
- **Expiration**: 30 days for JWT and database session; expired rows are deleted on
  validation
- **Token**: 32 bytes from the CSPRNG, stored as SHA-256 hash only
- **Invalidation**: Logout deletes the database session immediately; roles are
  re-read from the database on every protected access
- **Route Protection**: `src/proxy.ts` (Next.js 16) only redirects requests without a
  session cookie. Authorization always happens server-side in `src/lib/server-auth.ts`.

### Multi-Factor Authentication (Future)
- Support for TOTP-based 2FA
- Backup codes for recovery
- Optional enforcement for admin accounts

### Role-Based Access Control (RBAC)
- **Roles**: Guest, User, Developer, Admin
- **Enforcement**: Server-side checks on all protected routes
- **Principle of Least Privilege**: Users only get necessary permissions
- **Elevation**: Admin actions require explicit confirmation

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
- **Prevention**: Prisma ORM with parameterized queries
- **Validation**: Zod schemas before database operations
- **No Raw SQL**: Avoid raw SQL queries unless absolutely necessary

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
- **Status**: not implemented in the application yet (see `docs/PHASE3_5_REPORT.md`,
  open risks). Must be added at the reverse proxy/WAF or with a persistent store
  before public production use.
- **API Endpoints**: Rate limit per user/IP (planned)
- **Authentication Attempts**: Limit failed login attempts (planned)
- **Brute Force Protection**: Exponential backoff (planned)
- **DDoS Mitigation**: Vercel's built-in protection

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

## 7. API Security

### API Authentication
- Session-based authentication for web app
- Future: API keys for third-party integrations
- Token validation on every request

### API Rate Limiting
- Per-user rate limits
- Per-IP rate limits for anonymous users
- Burst protection
- Configurable limits per endpoint

### API Input Validation
- Zod schemas for all API inputs
- Strict type checking
- No implicit type coercion
- Error messages don't leak sensitive info

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
