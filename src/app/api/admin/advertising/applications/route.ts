import { NextRequest, NextResponse } from 'next/server';
import { AdvertisingService } from '@/lib/advertising/service';
import {
  applicationNotesSchema,
  applicationReviewSchema,
  applicationStatusSchema,
} from '@/lib/advertising/validations';
import {
  errorResponse,
  isSameOriginRequest,
  noStoreJson,
  readJsonObject,
} from '@/lib/api-response';
import { requireAdminSession } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();

    const statusParam = request.nextUrl.searchParams.get('status');
    const status = statusParam ? applicationStatusSchema.parse(statusParam) : undefined;

    const applications = await AdvertisingService.getApplications(
      status ? { status } : undefined,
    );

    return noStoreJson({ applications });
  } catch (error) {
    return errorResponse('api:admin:advertising:applications:GET', error);
  }
}

/**
 * PATCH either reviews an application (`status` present) or only stores the
 * internal notes (`internalNotes` without `status`). Keeping the two apart means
 * saving a note never moves an application through its review workflow.
 */
export async function PATCH(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        { status: 403 },
      );
    }

    const admin = await requireAdminSession();

    const json = await readJsonObject(request);
    if (!json.ok) {
      return json.response;
    }

    if (json.body['status'] === undefined) {
      const notes = applicationNotesSchema.parse(json.body);
      const updated = await AdvertisingService.updateApplicationNotes(
        notes.id,
        notes.internalNotes,
      );

      return noStoreJson({ success: true, application: updated });
    }

    const input = applicationReviewSchema.parse(json.body);
    const updated = await AdvertisingService.updateApplicationStatus(
      input.id,
      input.status,
      input.rejectionReason,
      input.internalNotes,
      admin.id,
    );

    return noStoreJson({ success: true, application: updated });
  } catch (error) {
    return errorResponse('api:admin:advertising:applications:PATCH', error);
  }
}
