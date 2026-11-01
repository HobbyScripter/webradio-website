import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  isCommonPassword,
  isPasswordAcceptable,
  normalizeForBlocklist,
  validatePassword,
} from '../password-policy';
import { passwordSchema, registerSchema } from '../validations';

describe('password policy', () => {
  it('requires at least twelve characters', () => {
    expect(validatePassword('nebelkerze1')).toContain(
      `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`,
    );
    expect(validatePassword('nebelkerze12')).toEqual([]);
  });

  it('rejects values bcrypt would silently truncate', () => {
    const tooLong = 'a'.repeat(PASSWORD_MAX_LENGTH + 1);
    expect(validatePassword(tooLong)).toContain(
      `Das Passwort darf höchstens ${PASSWORD_MAX_LENGTH} Zeichen lang sein.`,
    );
    expect(validatePassword('a'.repeat(PASSWORD_MAX_LENGTH))).toEqual([]);
  });

  it('rejects common passwords and simple variants of them', () => {
    expect(isCommonPassword('passwort123456')).toBe(true);
    expect(isCommonPassword('Sommer2026')).toBe(true);
    expect(isCommonPassword('WebRadio2026')).toBe(true);
    expect(validatePassword('passwort123456')[0]).toMatch(/zu verbreitet/);
  });

  it('does not flag a long, unique passphrase', () => {
    expect(isCommonPassword('gruener-sessel-tanzt-leise')).toBe(false);
    expect(isPasswordAcceptable('gruener-sessel-tanzt-leise')).toBe(true);
  });

  it('normalises case, punctuation and umlauts for the blocklist', () => {
    expect(normalizeForBlocklist('Grüße, Welt!')).toBe('grussewelt');
  });

  it('applies the same rules through the zod schema', () => {
    expect(passwordSchema.safeParse('kurz').success).toBe(false);
    expect(passwordSchema.safeParse('passwort123456').success).toBe(false);
    expect(passwordSchema.safeParse('gruener-sessel-tanzt-leise').success).toBe(true);
  });
});

describe('registration consent', () => {
  const base = {
    email: 'user@example.com',
    password: 'gruener-sessel-tanzt-leise',
    confirmPassword: 'gruener-sessel-tanzt-leise',
    acceptedTerms: true,
    acceptedPrivacy: true,
  };

  it('accepts a registration with both unchecked checkboxes ticked', () => {
    expect(registerSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a missing or false consent on the server', () => {
    expect(registerSchema.safeParse({ ...base, acceptedTerms: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, acceptedPrivacy: false }).success).toBe(false);

    const withoutConsent: Record<string, unknown> = { ...base };
    delete withoutConsent.acceptedTerms;
    delete withoutConsent.acceptedPrivacy;
    expect(registerSchema.safeParse(withoutConsent).success).toBe(false);
  });

  it('reports which consent is missing', () => {
    const result = registerSchema.safeParse({ ...base, acceptedPrivacy: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.acceptedPrivacy?.[0]).toMatch(
        /Datenschutz/,
      );
    }
  });
});
