# WebRadio Website - Architecture Documentation

## Overview
The WebRadio Website is a greenfield Next.js application for managing plugins, themes, releases, and community resources for the WebRadio project.

## Technology Stack

### Core Framework
- **Next.js 16.4.3** with App Router
- **React 19.3.0**
- **TypeScript 5**
- **Tailwind CSS 4**

### Database & ORM
- **PostgreSQL** - Primary database
- **Prisma ORM 8.0.0-rc.27** - Database toolkit with new contract-based schema
- **@prisma/orm-postgres 8.0.0-rc.20** - PostgreSQL-specific library
- **temporal-polyfill** - Required by Prisma ORM 8

### Authentication & Validation
- **NextAuth.js 4.24.15** - Server-side authentication with secure sessions
- **bcryptjs 3.0.3** - Password hashing
- **Zod 4.6.7** - Runtime validation and TypeScript schema inference

### Deployment & CI/CD
- **Vercel** - Preview and production deployments
- **GitHub Actions** - Automated testing and validation

### External Services
- **Object Storage** (TBD: AWS S3, Cloudflare R2, or similar) - File uploads and plugin/theme packages
- **GitHub REST API** - Read-only source for the official project metadata, README and public releases. No webhook, no write access and no release synchronization job.

## Project Structure

```
webradio-website/
├── prisma/
│   ├── contract.prisma          # Database schema (Prisma ORM 8 format)
│   └── migrations/              # Version-controlled database migrations
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (public)/            # Public website pages
│   │   ├── (auth)/              # Authentication pages
│   │   ├── (developer)/         # Developer portal
│   │   ├── (admin)/             # Administration panel
│   │   └── api/                 # API routes (Next.js Route Handlers)
│   ├── components/             # React components
│   │   ├── ui/                  # Design system components
│   │   ├── public/              # Public website components
│   │   ├── auth/                # Authentication components
│   │   ├── developer/           # Developer portal components
│   │   └── admin/               # Admin panel components
│   ├── lib/                     # Utility libraries
│   │   ├── db.ts                # Prisma client singleton
│   │   ├── auth.ts              # NextAuth options (JWT + DB session link)
│   │   ├── auth-service.ts      # Hashing, sessions, RBAC, audit log
│   │   ├── server-auth.ts       # Server-side session/role enforcement
│   │   ├── validations.ts       # Zod schemas
│   │   └── storage.ts           # Object storage abstraction
│   └── proxy.ts                 # Next.js 16 proxy (optimistic cookie check only)
├── docs/                        # Documentation
├── .github/workflows/           # GitHub Actions
└── prisma.config.ts             # Prisma CLI configuration
```

## Key Architectural Decisions

### 1. Prisma ORM 8 Contract-Based Schema
**Decision**: Use Prisma ORM 8 with the new `contract.prisma` format instead of the traditional `schema.prisma`.

**Rationale**:
- Latest version with active development
- Improved type safety and TypeScript integration
- Better separation of concerns (contract vs. datasource config)
- Forward-looking architecture

**Impact**:
- Schema defined in `prisma/contract.prisma` without datasource/generator blocks
- Connection string configured in `prisma.config.ts`
- Migration workflow uses new Prisma 8 commands

### 2. Server-Side Authentication with NextAuth.js
**Decision**: Use NextAuth.js with a database-backed session authority instead of
client-side tokens. The JWT cookie only transports the opaque database session id;
every protected server access validates that row and reads the current role from
PostgreSQL.

**Rationale**:
- Secure session management on the server
- Built-in support for email/password and OAuth providers
- Easy integration with Next.js App Router
- Protection against token theft and XSS

**Implementation**:
- Session tokens stored in database via `Session` model
- HTTP-only cookies for session transport
- Middleware for route protection
- Server-side session validation in API routes

### 3. Object Storage for File Uploads
**Decision**: Use external object storage instead of local file storage.

**Rationale**:
- Scalability for large plugin/theme packages
- CDN integration for faster downloads
- Separation of storage from application server
- Easier backup and disaster recovery

**Options to Evaluate**:
- AWS S3 (industry standard, mature)
- Cloudflare R2 (no egress fees, good for CDN)
- Backblaze B2 (cost-effective)
- DigitalOcean Spaces (simple pricing)

### 4. Role-Based Access Control
**Decision**: Implement RBAC with server-side permission checks.

**Roles** (hierarchical, enforced by `ROLE_RANK` in `src/lib/auth-service.ts`):
- **Guest**: Public access only
- **User**: Registered user with profile
- **Developer**: Can submit plugins/themes
- **Admin**: Administrative access; may assign USER/DEVELOPER/ADMIN
- **System Admin** (`SYSTEM_ADMIN`): Highest regular level; includes every
  Admin permission

**Implementation**:
- Role stored in the `User` model and constrained by a database check
  constraint; PostgreSQL is the authority
- `src/proxy.ts` only performs an optimistic cookie check; every protected
  page, route handler and data access re-validates the database session and
  reads the current role
- Server-side validation in API routes; `POST /api/admin/users/role` accepts
  only the assignable roles (`USER`, `DEVELOPER`, `ADMIN`)
- `SYSTEM_ADMIN` is never assignable over HTTP or in registration. It is
  created exclusively by the operator-run CLI (`src/lib/system-admin.ts`),
  which requires shell plus database access, an explicit confirmation phrase
  and, for promotion, a verified e-mail address
- Role changes and their audit entry are written in one transaction that locks
  every privileged account first, so concurrent changes cannot remove the last
  system administrator. Normal admins cannot modify a `SYSTEM_ADMIN` account
- Audit logging for sensitive actions (`ADMIN_ROLE_CHANGED`,
  `SYSTEM_ADMIN_BOOTSTRAPPED`, `SYSTEM_ADMIN_RECOVERED`)

### 5. Database Schema Design
**Key Models**:
- `User`: User accounts with email verification
- `Session`: Server-side session management
- `DeveloperProfile`: Extended profile for plugin/theme authors
- `Plugin`/`Theme`: Content with versioning
- `PluginVersion`/`ThemeVersion`: Version history with compatibility info
- `Release`: Historical release table retained for compatibility; official releases are read from GitHub and are not served from this table
- `News`: Articles and announcements
- `RoadmapItem`: Project roadmap tracking
- `AuditLog`: Security and compliance logging
- `GitHubToken`: Encrypted GitHub integration tokens

**Indexes**:
- Indexed on frequently queried fields (email, slug, status, dates)
- Unique constraints on critical fields (email, slug, token)
- Composite indexes for common query patterns

## Security Considerations

### Authentication & Sessions
- Secure HTTP-only cookies for sessions
- bcryptjs for password hashing (cost factor: 12)
- Session expiration with refresh capability
- CSRF protection via NextAuth.js

### Data Protection
- Encrypted storage of sensitive tokens (GitHub tokens)
- Input validation via Zod on all endpoints
- Parameterized Prisma queries (SQL injection protection); the one raw
  statement (atomic rate-limit increment) uses bound parameters
- Durable rate limiting in PostgreSQL for login, registration, password reset
  and e-mail verification

### Content Security
- XSS protection via React and Next.js defaults
- CSP is **not** configured yet; it needs a nonce-aware policy for Next.js
  before it can be enabled safely
- File upload validation (type, size, content)
- Malware scanning for uploaded packages (TBD)

### Audit & Monitoring
- Audit log for all administrative actions
- IP address and user agent tracking
- Failed login attempt monitoring
- Suspicious activity alerts (TBD)

## Public Website (Phase 4)

- Public pages are Server Components by default. Client Components are limited
  to interactive pieces: the mobile navigation, the login and registration
  forms, and the error boundary.
- `src/lib/catalog.ts` is the public data access layer. It applies the
  publication filter (`isPublished` + `APPROVED` + product `WEBRADIO`), returns
  whitelisted DTOs and implements search, sorting and pagination.
- Catalogue pages stream their results behind `<Suspense>` with skeletons, so
  the header, page heading and footer are part of the static shell. Database
  failures render an error panel; empty results render an explicit empty state.
- Detail pages are blocking routes (`instant = false`) and use the proxy's
  pre-render existence check so an unknown slug returns a real `404`.
- Public API routes (`/api/plugins`, `/api/themes`, `/api/releases`,
  `/api/news`) are read-only and return `Cache-Control: no-store` (withdrawn
  content must disappear immediately). Catalogue routes validate query
  parameters with Zod and return generic `500` errors without driver details.
- `/api/releases` reads GitHub through `src/lib/github.ts`; the website database
  is not involved. A GitHub outage returns `503` rather than guessed releases.
  The legacy `Release`/`Changelog` tables remain in the contract but are not a
  public release source.
- GitHub releases are validated into a narrow DTO: draft releases are dropped,
  `prerelease` determines the channel, and only `.exe`, `.AppImage`,
  `.pkg.tar.zst`, `.deb` and `.dmg` assets from this repository's download path
  are exposed. Update metadata (`*.yml`, `*.blockmap`, checksum text files) is
  not presented as an installable artifact.
- GitHub requests are server-only, time out after six seconds, validate the
  repository identity and are capped at five minutes of per-instance caching.
  A public-data snapshot up to 24 hours old can be shown as an explicitly
  marked stale fallback. `GITHUB_TOKEN` is optional; no token is ever sent to
  the browser.
- SEO: metadata is defined per public page. Canonical URLs, Open Graph URLs and
  the sitemap are only emitted when `NEXT_PUBLIC_SITE_URL` is configured.
  `/admin`, `/developer` and `/auth` are marked `noindex` and disallowed in
  `robots.txt`.

## Security & Recovery (Phase 4.5)

- **Rate limiting:** `RateLimitBucket` stores per-scope SHA-256 keys and a
  fixed-window counter. The increment is one atomic PostgreSQL statement, so
  concurrent instances cannot exceed the limit. Limits fail open only when the
  database itself is unavailable.
- **Password reset:** `AuthToken` stores only a SHA-256 digest; 60-minute
  lifetime, single use, transactional consumption, bcrypt re-hash and deletion
  of all existing sessions.
- **E-mail verification:** 24-hour hashed token, single use. Privileged role
  assignment refuses unverified addresses. The bootstrap CLI verifies its own
  operator-controlled account.
- **E-mail delivery:** SMTP via Nodemailer when configured; development/test
  writes to `.local-db/outbox/` and never logs a token.
- **Product boundary:** `Product` enum (`WEBRADIO` only) on `Plugin`, `Theme`
  and `Release`, plus a Zod literal in submission schemas and a `WEBRADIO`
  filter in every public query.
- **Cache:** public APIs and successful catalogue/detail responses are
  `no-store`; dynamic catalogue holes are request-rendered, so revoking an
  entry changes the next HTML/API response. Unknown or withdrawn detail slugs
  are answered by `src/proxy.ts` with a direct `404` and `no-store` on browser,
  CDN and Vercel levels, so a negative hit cannot hide a later publication.
- **GitHub cache:** successful GitHub responses are cached per server instance
  for five minutes and may be reused for at most 24 hours as a clearly marked
  stale fallback. This is not a shared CDN cache, and public API responses stay
  `no-store`; `source.fetchedAt` and `source.stale` make the data age explicit.

## Performance Optimizations

### Database
- Query optimization with proper indexes
- Connection pooling via Prisma
- Read replicas for scaling (TBD)
- Caching for frequently accessed data (TBD)

### Frontend
- Partial Prerendering via Cache Components: static shell plus streamed
  catalogue regions
- No ISR is configured for catalogue pages; publication state is read at
  request time so a newly published entry appears immediately
- External screenshot previews are rendered as lazy, non-proxied `<img>`
  elements with `referrerPolicy="no-referrer"`. They are not passed through
  the Next.js image optimizer because remote host configuration is data-driven
- Code splitting and lazy loading via the App Router

### CDN & Caching
- Static assets served via CDN
- Cache headers for public content
- Private content never cached
- API response caching where appropriate

## Scalability Considerations

### Horizontal Scaling
- Stateless application servers
- Session storage in database
- External object storage
- Load balancer ready (Vercel handles this)

### Database Scaling
- Connection pooling
- Read replicas for heavy read workloads
- Database sharding if needed (future)

### Background Jobs
- No GitHub synchronization job: public metadata and releases are read on demand and cached briefly
- Email sending via queue system (TBD)
- Package processing in background (TBD)

## Deployment Strategy

### Development
- Local development with `npm run dev`
- Local PostgreSQL instance or Docker
- Hot reloading enabled
- Debug mode enabled

### Preview Deployments
- Automatic preview on each PR
- Separate database instance
- Feature branch testing
- URL sharing for stakeholders

### Production
- Manual deployment via git tag
- Production database with backups
- CDN enabled
- Monitoring and alerting (TBD)

## Migration Strategy

### Database Migrations
- Version-controlled via Prisma migrations
- Applied during deployment
- Rollback capability
- Zero-downtime schema changes (where possible)

### Data Migration
- N/A (greenfield project, no legacy data)
- Future: migration tools if needed

## Monitoring & Observability

### Logging
- Structured logging for application events
- Error tracking (TBD: Sentry, LogRocket)
- Audit logging for compliance

### Metrics
- Request/response times
- Error rates
- Database query performance
- User engagement metrics (TBD)

### Health Checks
- Database connectivity
- External service availability
- Critical path monitoring

## Known Limitations & Future Enhancements

### Current Limitations
- No real-time features (WebSockets not implemented)
- No search engine (basic filtering only)
- No advanced analytics
- No multi-language support

### Future Enhancements
- Full-text search (PostgreSQL FTS or dedicated search service)
- Real-time notifications
- Multi-language i18n
- Advanced analytics dashboard
- Plugin/theme marketplace with ratings
- Community features (comments, discussions)
