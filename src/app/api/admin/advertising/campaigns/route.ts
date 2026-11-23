import { NextRequest, NextResponse } from 'next/server';
import { AdvertisingService } from '@/lib/advertising/service';
import {
  adCampaignSchema,
  adCampaignStatusSchema,
  adCampaignUpdateSchema,
} from '@/lib/advertising/validations';
import {
  errorResponse,
  isSameOriginRequest,
  noStoreJson,
  readJsonObject,
} from '@/lib/api-response';
import { db } from '@/lib/db';
import { requireAdminSession } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();

    const statusParam = request.nextUrl.searchParams.get('status');
    const advertiserId = request.nextUrl.searchParams.get('advertiserId') || undefined;
    const status = statusParam ? adCampaignStatusSchema.parse(statusParam) : undefined;

    if (!status && !advertiserId) {
      const campaigns = await AdvertisingService.getCampaigns();
      return noStoreJson({ campaigns });
    }

    const campaigns = await AdvertisingService.getCampaigns({ status, advertiserId });
    return noStoreJson({ campaigns });
  } catch (error) {
    return errorResponse('api:admin:advertising:campaigns:GET', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Cross-origin request rejected.' },
        { status: 403 },
      );
    }

    await requireAdminSession();

    const json = await readJsonObject(request);
    if (!json.ok) {
      return json.response;
    }

    const campaign = await AdvertisingService.createCampaign(adCampaignSchema.parse(json.body));

    return noStoreJson({ success: true, campaign }, 201);
  } catch (error) {
    return errorResponse('api:admin:advertising:campaigns:POST', error);
  }
}

/**
 * Edit a campaign, including its status.
 *
 * A status change is written to the audit log (previous → new), so the
 * transition stays traceable for later reviews.
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

    const input = adCampaignUpdateSchema.parse(json.body);

    const before = input.status
      ? await db.orm.public.AdCampaign.first({ id: input.id })
      : null;

    const campaign = await AdvertisingService.updateCampaign(input);

    if (before && campaign && before.status !== campaign.status) {
      try {
        await db.orm.public.AuditLog.create({
          userId: admin.id,
          action: 'AD_CAMPAIGN_STATUS_CHANGED',
          details: JSON.stringify({
            campaignId: campaign.id,
            from: before.status,
            to: campaign.status,
          }),
          ipAddress: null,
          userAgent: 'admin-portal',
        });
      } catch {
        // The status change itself succeeded; a missing audit row must not fail it.
      }
    }

    return noStoreJson({ success: true, campaign });
  } catch (error) {
    return errorResponse('api:admin:advertising:campaigns:PATCH', error);
  }
}
