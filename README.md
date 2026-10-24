# WebRadio Website

A modern web platform for the WebRadio project, providing plugin and theme management, release distribution, documentation, and community resources.

## Overview

This is a greenfield Next.js application built from scratch with modern technologies. It provides:

- **Public Website**: Project information, downloads, plugin/theme catalogs, documentation, news, and roadmap
- **User Accounts**: Registration, authentication, profile management
- **Developer Portal**: Plugin and theme submission, version management
- **Administration**: Content moderation, user management, audit logging
- **GitHub Integration**: Release synchronization and webhook handling

## Technology Stack

- **Framework**: Next.js 16.4.3 with App Router
- **Language**: TypeScript 5
- **Database**: PostgreSQL with Prisma ORM 8
- **Authentication**: NextAuth.js with server-side sessions
- **Styling**: Tailwind CSS 4
- **Validation**: Zod
- **Testing**: Jest, React Testing Library, Playwright
- **Deployment**: Vercel

## Project Structure

```
webradio-website/
├── prisma/
│   └── contract.prisma          # Database schema
├── src/
│   ├── app/                     # Next.js App Router
│   ├── components/             # React components
│   ├── lib/                    # Utility libraries
│   └── middleware/             # Middleware
├── docs/                        # Documentation
└── prisma.config.ts             # Prisma CLI configuration
```

## Getting Started

### Prerequisites

- Node.js 22.18+ or 24.11+ or 26+
- PostgreSQL database
- npm, yarn, pnpm, or bun

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd webradio-website
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp docs/env.example .env
```

Edit `.env` and fill in the required values:
- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
- `NEXTAUTH_URL`: Application URL (http://localhost:3000 for development)
- Other variables as needed

4. Set up the database:
```bash
npm run prisma:migrate
```

5. Generate Prisma client:
```bash
npm run prisma:generate
```

6. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run type-check` - Run TypeScript type checking
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System architecture and design decisions
- [Security](docs/SECURITY.md) - Security concept and best practices
- [Testing](docs/TESTING.md) - Testing strategy and procedures
- [Requirements](docs/REQUIREMENTS.md) - Functional and non-functional requirements
- [Phase 1 Report](docs/PHASE1_REPORT.md) - Project preparation report

## Development

### Code Style

- Use TypeScript for type safety
- Follow ESLint rules
- Write tests for new features
- Document complex logic

### Database Changes

1. Edit `prisma/contract.prisma`
2. Run `npm run prisma:migrate` to create a migration
3. Run `npm run prisma:generate` to update the client

### Adding New Features

1. Create feature branch
2. Implement feature with tests
3. Run linting and type checking
4. Submit pull request

## Deployment

### Vercel

The project is configured for Vercel deployment:

1. Connect repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Environment Variables

Production requires the following environment variables:
- `DATABASE_URL` - Production PostgreSQL connection string
- `NEXTAUTH_SECRET` - Secret for NextAuth.js
- `NEXTAUTH_URL` - Production URL
- `STORAGE_*` - Object storage credentials
- `GITHUB_*` - GitHub integration credentials (optional)

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting pull requests.

## License

[Specify your license here]

## Support

For support, please open an issue in the repository or contact the development team.
