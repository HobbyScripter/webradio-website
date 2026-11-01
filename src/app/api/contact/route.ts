import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, isSameOriginRequest } from '@/lib/api-response';
import {
  CONTACT_EMAIL_MAX,
  CONTACT_MESSAGE_MAX,
  CONTACT_MESSAGE_MIN,
  CONTACT_NAME_MAX,
  buildContactEmail,
  isContactFormEnabled,
} from '@/lib/contact';
import { sendTransactionalEmail } from '@/lib/email';
import { getLegalDetails } from '@/lib/legal';
import { enforceIpRateLimit, enforceRateLimits } from '@/lib/rate-limit-http';

const NO_STORE = 'no-store';

/**
 * POST /api/contact
 *
 * Prepared contact form. It answers 404 while the operator has not enabled it
 * (`CONTACT_FORM_ENABLED`) or while no transactional e-mail path is configured,
 * so a visitor can never send a message into a void.
 *
 * Protection: same-origin check, IP and address rate limits, a hidden honeypot
 * field and strict length limits. The response never reveals whether the
 * delivery itself succeeded on the provider side.
 */
const contactSchema = z.object({
  name: z.string().trim().max(CONTACT_NAME_MAX).optional(),
  email: z.string().trim().email('Bitte gib eine gültige E-Mail-Adresse an.').max(CONTACT_EMAIL_MAX),
  message: z
    .string()
    .trim()
    .min(CONTACT_MESSAGE_MIN, `Die Nachricht muss mindestens ${CONTACT_MESSAGE_MIN} Zeichen lang sein.`)
    .max(CONTACT_MESSAGE_MAX, `Die Nachricht darf höchstens ${CONTACT_MESSAGE_MAX} Zeichen lang sein.`),
  // Honeypot. A real form submits an empty string.
  website: z.string().max(0).optional().default(''),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': NO_STORE, 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return json({ error: 'FORBIDDEN', message: 'Cross-origin request rejected.' }, 403);
    }

    if (!isContactFormEnabled()) {
      // Same answer as an unknown route: the feature does not exist yet.
      return json({ error: 'NOT_FOUND', message: 'Nicht gefunden.' }, 404);
    }

    const ipLimited = await enforceIpRateLimit(request, 'contactIp');
    if (ipLimited) {
      return ipLimited;
    }

    const parsed = contactSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Bitte prüfe die Angaben in den markierten Feldern.',
        },
        400,
      );
    }

    if ((parsed.data.website ?? '') !== '') {
      // Honeypot triggered. Answer like a normal success so a bot learns
      // nothing, but send no message.
      return json({ message: 'Danke, die Nachricht ist eingegangen.' });
    }

    const addressLimited = await enforceRateLimits([
      { scope: 'contactAccount', identifier: parsed.data.email },
    ]);
    if (addressLimited) {
      return addressLimited;
    }

    const { operator } = getLegalDetails();
    if (!operator.email) {
      console.error('[api.contact] operator address is not configured');
      return json(
        { error: 'CONTACT_UNAVAILABLE', message: 'Die Nachricht konnte nicht gesendet werden.' },
        503,
      );
    }

    const email = buildContactEmail({
      name: parsed.data.name && parsed.data.name.length > 0 ? parsed.data.name : null,
      email: parsed.data.email,
      message: parsed.data.message,
      receivedAt: new Date().toISOString(),
    });

    const result = await sendTransactionalEmail({
      to: operator.email,
      subject: email.subject,
      text: email.text,
    });

    if (!result.delivered) {
      console.error('[api.contact] delivery failed', {
        mode: result.mode,
        failure: result.failure ?? 'unknown',
      });
      return json(
        {
          error: 'CONTACT_DELIVERY_FAILED',
          message: 'Die Nachricht konnte nicht gesendet werden. Bitte nutze die E-Mail-Adresse im Impressum.',
        },
        502,
      );
    }

    return json({ message: 'Danke, die Nachricht ist eingegangen.' });
  } catch (error) {
    return errorResponse('api:contact', error);
  }
}
