/**
 * Contact form availability.
 *
 * The form is prepared but deliberately inert: it only appears when the
 * operator both enables it explicitly (`CONTACT_FORM_ENABLED=true`) and a
 * working transactional e-mail path is configured. Without a delivery path a
 * contact form would silently discard messages, so it stays hidden.
 *
 * The API route checks the same function, so hiding the form is a convenience,
 * not the access control.
 */

function read(env: Record<string, string | undefined>, name: string): string {
  return (env[name] ?? '').trim();
}

/** Mirrors the delivery gate in `src/lib/email.ts`. */
export function isContactFormEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (read(env, 'CONTACT_FORM_ENABLED').toLowerCase() !== 'true') {
    return false;
  }

  const deliveryEnabled = read(env, 'EMAIL_DELIVERY_ENABLED').toLowerCase() === 'true';
  if (!deliveryEnabled) {
    return false;
  }

  const from = read(env, 'EMAIL_FROM');
  const configured = read(env, 'RESEND_API_KEY') !== '' || read(env, 'EMAIL_SERVER_HOST') !== '';
  return from !== '' && configured;
}

export const CONTACT_NAME_MAX = 100;
export const CONTACT_EMAIL_MAX = 200;
export const CONTACT_MESSAGE_MIN = 20;
export const CONTACT_MESSAGE_MAX = 2000;

/** Plain-text body of the operator notification. Never includes secrets. */
export function buildContactEmail(input: {
  name: string | null;
  email: string;
  message: string;
  receivedAt: string;
}): { subject: string; text: string } {
  return {
    subject: 'Nachricht über das Kontaktformular der Website',
    text: [
      `Eingang: ${input.receivedAt}`,
      `Name: ${input.name ?? 'nicht angegeben'}`,
      `Antwortadresse: ${input.email}`,
      '',
      input.message,
    ].join('\n'),
  };
}
