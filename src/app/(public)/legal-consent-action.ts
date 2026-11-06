'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUserSession } from '@/lib/server-auth';
import {
  getPublishedLegalDocument,
  recordLegalConsent,
  type LegalDocumentType,
} from '@/lib/legal-document-service';

const CONSENT_TYPES: LegalDocumentType[] = ['NUTZUNGSBEDINGUNGEN', 'DATENSCHUTZ'];

/**
 * Record the acceptance of the currently published versions listed in the
 * notice. Only documents that still require consent are considered, so a
 * manipulated form cannot mark an outdated version as accepted.
 */
export async function acceptLegalVersionAction(formData: FormData): Promise<void> {
  const user = await requireUserSession();
  const ids = formData
    .getAll('documentId')
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  const rawNext = formData.get('next');
  const next =
    typeof rawNext === 'string' && rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : '/';

  try {
    for (const type of CONSENT_TYPES) {
      const published = await getPublishedLegalDocument(type);
      if (!published || !published.requiresConsent || !ids.includes(published.id)) continue;
      await recordLegalConsent({
        userId: user.id,
        documentType: type,
        documentVersionId: published.id,
      });
    }
  } catch {
    redirect(`${next}?consentError=1`);
  }

  revalidatePath('/', 'layout');
  redirect(next);
}
