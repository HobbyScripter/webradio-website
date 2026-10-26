/**
 * /api/reports
 *
 * Any signed-in account may report catalogue content. The reporter is taken
 * from the live session, the target is validated server-side, and the decision
 * is never part of this request: reports do not change any content.
 */
import { errorResponse, isSameOriginRequest, noStoreJson } from '@/lib/api-response';
import { requireUserSession } from '@/lib/server-auth';
import { enforceRateLimits } from '@/lib/rate-limit-http';
import { getClientIp } from '@/lib/rate-limit';
import { reportCreateSchema } from '@/lib/validations';
import { listOwnReports, submitReport } from '@/lib/report-service';

export async function GET() {
  try {
    const user = await requireUserSession();
    const reports = await listOwnReports(user.id);

    return noStoreJson({
      reports: reports.map((report) => ({
        id: report.id,
        targetType: report.targetType,
        targetId: report.targetId,
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt.toString(),
        resolvedAt: report.resolvedAt ? report.resolvedAt.toString() : null,
      })),
    });
  } catch (error) {
    return errorResponse('api:reports:get', error);
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
      { scope: 'reportCreate', identifier: user.id },
    ]);
    if (limited) {
      return limited;
    }

    const json = await request.json().catch(() => null);
    const parsed = reportCreateSchema.safeParse(json);
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

    const report = await submitReport({
      reporterId: user.id,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reason: parsed.data.reason,
      details: parsed.data.details,
      ipAddress: getClientIp(request.headers) ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return noStoreJson(
      {
        message:
          'Meldung eingegangen. Ein Administrator prüft den Inhalt; die Meldung allein ändert nichts.',
        report: { id: report.id },
      },
      201,
    );
  } catch (error) {
    return errorResponse('api:reports:post', error);
  }
}
