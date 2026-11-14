import { NextRequest, NextResponse } from 'next/server';
import type * as DbModule from '@/lib/db';
import { enforceIpRateLimit } from '@/lib/rate-limit-http';
import { trackWebsiteDownload } from '@/lib/download-analytics-service';

async function getDb(): Promise<typeof DbModule.db> {
  const mod = await import('@/lib/db');
  return mod.db;
}

/**
 * Extracts privacy-preserving country information from trusted hosting provider headers.
 * Never performs external GeoIP network calls.
 * Never stores or logs client IP addresses.
 */
function extractCountryCode(request: NextRequest): string {
  const country =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    request.headers.get('x-country-code') ||
    null;

  if (country && /^[A-Za-z]{2}$/.test(country.trim())) {
    return country.trim().toUpperCase();
  }
  return 'XX'; // Unknown
}

/**
 * Validates that the target URL is strictly pointing to the official WebRadio release downloads.
 * Prevents Open Redirect vulnerabilities.
 */
export function isValidGitHubReleaseDownloadUrl(url: string, releaseTag: string, fileName: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
      return false;
    }

    const expectedPrefix = `/YourEliteSystems/WebRadio/releases/download/${encodeURIComponent(releaseTag)}/`;
    if (!decodeURIComponent(parsed.pathname).startsWith(decodeURIComponent(expectedPrefix))) {
      return false;
    }

    const pathSegments = parsed.pathname.split('/');
    const lastSegment = decodeURIComponent(pathSegments[pathSegments.length - 1] || '');
    return lastSegment === fileName;
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> },
): Promise<NextResponse> {
  // 1. Rate limiting
  const rateLimitResponse = await enforceIpRateLimit(request, 'downloadRequestIp');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { assetId } = await context.params;
  if (!assetId || typeof assetId !== 'string') {
    return NextResponse.json(
      { error: 'INVALID_ASSET_ID', message: 'Ungültige Asset-ID.' },
      { status: 400 },
    );
  }

  const db = await getDb();

  // 2. Lookup Asset by internal UUID or GitHub Asset ID
  let asset = null;
  try {
    asset = await db.orm.public.GitHubReleaseAsset.first({ id: assetId });
    if (!asset && /^\d+$/.test(assetId)) {
      asset = await db.orm.public.GitHubReleaseAsset.first({ githubAssetId: BigInt(assetId) });
    }
  } catch {
    return NextResponse.json(
      { error: 'DATABASE_ERROR', message: 'Download-Dienst vorübergehend nicht erreichbar.' },
      { status: 503 },
    );
  }

  if (!asset) {
    return NextResponse.json(
      { error: 'ASSET_NOT_FOUND', message: 'Die angeforderte Datei existiert nicht oder wurde entfernt.' },
      { status: 404 },
    );
  }

  // 3. Security Check: Assert destination URL is an official WebRadio release asset
  if (!isValidGitHubReleaseDownloadUrl(asset.downloadUrl, asset.releaseTag, asset.fileName)) {
    return NextResponse.json(
      { error: 'INVALID_DOWNLOAD_TARGET', message: 'Download-Ziel ungültig.' },
      { status: 403 },
    );
  }

  // 4. Extract approximate country code without logging or storing client IP
  const countryCode = extractCountryCode(request);

  // 5. Track download invocation (asynchronous / non-blocking)
  trackWebsiteDownload(asset.id, countryCode).catch(() => {});

  // 6. Secure redirect (HTTP 307 Temporary Redirect) to GitHub
  return NextResponse.redirect(asset.downloadUrl, {
    status: 307,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

