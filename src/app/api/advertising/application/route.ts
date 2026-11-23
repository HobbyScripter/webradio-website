import { NextRequest, NextResponse } from 'next/server';
import { AdvertisingService } from '@/lib/advertising/service';
import { advertisingApplicationSchema } from '@/lib/advertising/validations';
import {
  errorResponse,
  isSameOriginRequest,
  noStoreJson,
  readJsonObject,
} from '@/lib/api-response';
import { enforceIpRateLimit } from '@/lib/rate-limit-http';

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        { status: 403 },
      );
    }

    // Durable, database-backed limit; skipped only when no trusted proxy is
    // configured (then no client IP can be trusted for a key).
    const limited = await enforceIpRateLimit(request, 'advertisingApplicationIp');
    if (limited) {
      return limited;
    }

    const json = await readJsonObject(request);
    if (!json.ok) {
      return json.response;
    }

    const parsed = advertisingApplicationSchema.safeParse(json.body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Bitte prüfe die Angaben in den markierten Feldern.',
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            message: issue.message,
          })),
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const application = await AdvertisingService.createApplication(parsed.data);

    return noStoreJson(
      {
        success: true,
        message: 'Bewerbung erfolgreich eingereicht',
        applicationId: application.id,
      },
      201,
    );
  } catch (error) {
    return errorResponse('api:advertising:application', error);
  }
}
