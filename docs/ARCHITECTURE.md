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
- **GitHub API** - Release synchronization and webhook handling

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

**Roles**:
- **Guest**: Public access only
- **User**: Registered user with profile
- **Developer**: Can submit plugins/themes
- **Admin**: Full administrative access

**Implementation**:
- Role stored in `User` model (or separate role model for flexibility)
- Middleware checks before protected routes
- Server-side validation in API routes
- Audit logging for sensitive actions

### 5. Database Schema Design
**Key Models**:
- `User`: User accounts with email verification
- `Session`: Server-side session management
- `DeveloperProfile`: Extended profile for plugin/theme authors
- `Plugin`/`Theme`: Content with versioning
- `PluginVersion`/`ThemeVersion`: Version history with compatibility info
- `Release`: Official WebRadio releases
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
- Prepared statements via Prisma (SQL injection protection)
- Rate limiting on API endpoints

### Content Security
- XSS protection via React and Next.js defaults
- CSP headers configured
- File upload validation (type, size, content)
- Malware scanning for uploaded packages (TBD)

### Audit & Monitoring
- Audit log for all administrative actions
- IP address and user agent tracking
- Failed login attempt monitoring
- Suspicious activity alerts (TBD)

## Performance Optimizations

### Database
- Query optimization with proper indexes
- Connection pooling via Prisma
- Read replicas for scaling (TBD)
- Caching for frequently accessed data (TBD)

### Frontend
- Static generation for public pages where possible
- ISR (Incremental Static Regeneration) for dynamic content
- Image optimization via Next.js Image component
- Code splitting and lazy loading

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
- GitHub synchronization via scheduled jobs
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
