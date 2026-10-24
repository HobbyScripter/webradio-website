/**
 * German messages for the account API error codes.
 *
 * The account endpoints answer with a machine-readable `error` code and an
 * English `message`. Rendering the code itself ("INVALID_PASSWORD") is not a
 * user-facing sentence and the English text does not match the rest of the
 * interface, so the account forms translate the known codes here and fall back
 * to a generic German sentence.
 */
const MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  NOT_FOUND: 'Das Konto wurde nicht gefunden.',
  VALIDATION_ERROR: 'Bitte prüfe deine Eingaben.',
  INVALID_JSON: 'Die Anfrage konnte nicht gelesen werden.',
  INVALID_PASSWORD: 'Das aktuelle Passwort ist nicht korrekt.',
  SAME_PASSWORD: 'Das neue Passwort muss sich vom aktuellen unterscheiden.',
  EMAIL_EXISTS: 'Diese E-Mail-Adresse wird bereits verwendet.',
  RATE_LIMITED: 'Zu viele Versuche. Bitte warte einen Moment.',
  INTERNAL_ERROR: 'Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es erneut.',
};

export function accountErrorMessage(code: unknown, fallback: string): string {
  if (typeof code === 'string' && MESSAGES[code]) {
    return MESSAGES[code];
  }
  return fallback;
}
