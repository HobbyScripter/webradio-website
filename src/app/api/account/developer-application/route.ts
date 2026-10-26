/**
 * /api/account/developer-application
 *
 * The applicant is always the caller of the live database session; no user id
 * is accepted from the request. Rate limiting is per account.
 */
import { errorResponse, isSameOriginRequest, noStoreJson } from '@/lib/api-response';
import { requireUserSession } from '@/lib/server-auth';
import { enforceRateLimits } from '@/lib/rate-limit-http';
import { getClientIp } from '@/lib/rate-limit';
import { developerApplicationSchema } from '@/lib/validations';
import {
  listOwnApplications,
  requestDeveloperAccess,
  withdrawDeveloperApplication,
} from '@/lib/developer-application-service';

export async function GET() {
  try {
    const user = await requireUserSession();
    const applications = await listOwnApplications(user.id);

    return noStoreJson({
      applications: applications.map((application) => ({
        id: application.id,
        status: application.status,
        motivation: application.motivation,
        portfolioUrl: application.portfolioUrl,
        decisionNotes: application.decisionNotes,
        decidedAt: application.decidedAt ? application.decidedAt.toString() : null,
        createdAt: application.createdAt.toString(),
      })),
    });
  } catch (error) {
    return errorResponse('api:account:developer-application:get', error);
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return noStoreJson(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        403,
      );
    }

    const user = await requireUserSession();

    const limited = await enforceRateLimits([
      { scope: 'developerApplication', identifier: user.id },
    ]);
    if (limited) {
      return limited;
    }

    const json = await request.json().catch(() => null);
    const parsed = developerApplicationSchema.safeParse(json);
    if (!parsed.success) {
      return noStoreJson(
        {
          error: 'VALIDATION_ERROR',
          message: 'Bitte prüfe die Eingaben.',
          details: parsed.error.flatten().fieldErrors,
        },
        400,
      );
    }

    const application = await requestDeveloperAccess({
      userId: user.id,
      motivation: parsed.data.motivation,
      portfolioUrl: parsed.data.portfolioUrl || null,
      ipAddress: getClientIp(request.headers) ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return noStoreJson(
      {
        message: 'Antrag eingereicht. Ein Administrator prüft ihn.',
        application: { id: application.id, status: application.status },
      },
      201,
    );
  } catch (error) {
    return errorResponse('api:account:developer-application:post', error);
  }
}

export async function DELETE(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return noStoreJson(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        403,
      );
    }

    const user = await requireUserSession();

    const withdrawn = await withdrawDeveloperApplication({
      userId: user.id,
      ipAddress: getClientIp(request.headers) ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return noStoreJson({ message: 'Antrag zurückgezogen.', id: withdrawn.id });
  } catch (error) {
    return errorResponse('api:account:developer-application:delete', error);
  }
}
