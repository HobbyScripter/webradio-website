/**
 * Health Check API Endpoint
 *
 * GET /api/health
 *
 * Returns the application health status. Used by:
 *   - Vercel deployment checks
 *   - Monitoring services
 *   - CI/CD pipeline readiness checks
 *
 * Does NOT expose sensitive information.
 * Does NOT require authentication.
 */
import { NextResponse } from 'next/server';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] ?? '0.1.0',
    },
    { status: 200 },
  );
}
