# Production image for the WebRadio Website (Next.js standalone output).
#
# Two targets:
#   runner (default) – minimal runtime image, non-root, no build tooling
#   builder          – full source + dev dependencies, used as a one-shot
#                      "tools" container for db:migrate / db:verify / db:status
#
# Validated with Docker Engine 29.9.3 / Compose v5.7.0 on linux/amd64
# (docs/PHASE_INFRA1.1_DOCKER_LINUX_VALIDATION_REPORT.md,
#  docs/PHASE_INFRA1.4_PRODUCTION_READINESS_REPORT.md).
#
# Build-time secrets: `next build` refuses to run with NODE_ENV=production
# unless NEXTAUTH_SECRET and NEXTAUTH_URL are present. They are declared as ARG
# in the builder stage only, so placeholders never reach the runtime image; the
# real values are supplied when the container starts.

# Stage 1: Builder (also the "tools" target for database commands)
FROM node:24-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package*.json ./
RUN npm ci
# Build-time only placeholders; the runtime stage does not inherit them.
ARG NEXTAUTH_SECRET=build-time-placeholder-not-a-secret
ARG NEXTAUTH_URL=http://localhost:3000
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN npm run build

# Stage 2: Production runtime
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

LABEL org.opencontainers.image.title="webradio-website" \
      org.opencontainers.image.description="WebRadio Website (Next.js standalone)" \
      org.opencontainers.image.source="https://github.com/CHANGE_ME/webradio-website" \
      org.opencontainers.image.licenses="UNLICENSED"

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --chown=nextjs:nodejs --from=builder /app/public ./public
COPY --chown=nextjs:nodejs --from=builder /app/.next/standalone ./
COPY --chown=nextjs:nodejs --from=builder /app/.next/static ./.next/static
# Only the small, secret-free contract artefacts; the full node_modules tree is
# not needed because the standalone output already bundles its dependencies.
# This keeps the image in the low hundreds of MB instead of several GB.
COPY --chown=nextjs:nodejs --from=builder /app/prisma/contract.json ./prisma/contract.json
COPY --chown=nextjs:nodejs --from=builder /app/prisma/contract.d.ts ./prisma/contract.d.ts
COPY --chown=nextjs:nodejs --from=builder /app/package.json ./package.json

# The server writes prerender/ISR cache entries at runtime; the runtime user
# must own that directory or the first write fails with EACCES.
RUN mkdir -p /app/.next/cache && chown nextjs:nodejs /app/.next/cache

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
