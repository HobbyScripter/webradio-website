import { NextResponse } from 'next/server';
import { requireUserSession } from '@/lib/server-auth';
import { getPublishedLegalDocument, recordLegalConsent } from '@/lib/legal-document-service';
import { AuthError } from '@/lib/auth-service';

export async function POST() {
  try {
    const user = await requireUserSession();
    const published = await getPublishedLegalDocument('NUTZUNGSBEDINGUNGEN');
    if (!published) {
      return NextResponse.json({ error: 'NO_PUBLISHED_VERSION' }, { status: 404 });
    }
    await recordLegalConsent({
      userId: user.id,
      documentType: 'NUTZUNGSBEDINGUNGEN',
      documentVersionId: published.id,
    });
    return NextResponse.json({ ok: true, versionId: published.id, versionNumber: published.versionNumber });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}