import { errorResponse } from '@/lib/api-response';
import { listReleases } from '@/lib/catalog';
import { releaseChannel } from '@/lib/format';
import { publicJson } from '@/lib/public-api';
import { safeHttpUrl } from '@/lib/site';

/**
 * GET /api/releases
 *
 * Public, read-only. Download URLs are passed through the HTTP(S) allowlist;
 * a malformed or unsafe URL is returned as null instead of being forwarded.
 */
export async function GET() {
  try {
    const releases = await listReleases(50);

    return publicJson({
      data: releases.map((release) => ({
        id: release.id,
        version: release.version,
        title: release.title,
        description: release.description,
        releaseDate: release.releaseDate,
        channel: releaseChannel(release.version),
        isLatest: release.isLatest,
        downloadUrl: safeHttpUrl(release.downloadUrl),
        fileSize: release.fileSize,
        checksum: release.checksum,
        changelogs: release.changelogs,
      })),
    });
  } catch (error) {
    const response = errorResponse('api.releases', error);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
