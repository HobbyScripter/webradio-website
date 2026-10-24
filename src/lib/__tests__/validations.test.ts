/**
 * Validation Schema Tests
 *
 * Unit tests for the Zod validation schemas defined in src/lib/validations.ts.
 * These tests verify that the schemas accept valid input and reject invalid input.
 */
import {
  emailSchema,
  loginSchema,
  registerSchema,
  slugSchema,
  pluginCreateSchema,
  roleSchema,
  assignableRoleSchema,
} from '../validations';

describe('emailSchema', () => {
  it('accepts a valid email', () => {
    const result = emailSchema.safeParse('user@example.com');
    expect(result.success).toBe(true);
  });

  it('lowercases the email', () => {
    const result = emailSchema.safeParse('User@Example.COM');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('user@example.com');
    }
  });

  it('rejects an invalid email', () => {
    const result = emailSchema.safeParse('not-an-email');
    expect(result.success).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = emailSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'invalid',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });
});

describe('registerSchema', () => {
  const validInput = {
    email: 'user@example.com',
    password: 'securepassword123',
    confirmPassword: 'securepassword123',
    name: 'Test User',
  };

  it('accepts valid registration data', () => {
    const result = registerSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects mismatched passwords', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      confirmPassword: 'differentpassword',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const passwordError = result.error.issues.find(
        (i) => i.path[0] === 'confirmPassword',
      );
      expect(passwordError).toBeDefined();
    }
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: 'short',
      confirmPassword: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('strips a client-supplied role so registration cannot self-assign privileges', () => {
    for (const role of ['ADMIN', 'SYSTEM_ADMIN']) {
      const result = registerSchema.safeParse({ ...validInput, role });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('role');
      }
    }
  });
});

describe('role schemas', () => {
  it('reads SYSTEM_ADMIN from the database', () => {
    expect(roleSchema.safeParse('SYSTEM_ADMIN').success).toBe(true);
  });

  it('never exposes SYSTEM_ADMIN as an assignable role', () => {
    expect(assignableRoleSchema.safeParse('SYSTEM_ADMIN').success).toBe(false);
    expect(assignableRoleSchema.safeParse('ADMIN').success).toBe(true);
  });
});

describe('slugSchema', () => {
  it('accepts a valid slug', () => {
    expect(slugSchema.safeParse('my-plugin-123').success).toBe(true);
  });

  it('rejects uppercase letters', () => {
    expect(slugSchema.safeParse('My-Plugin').success).toBe(false);
  });

  it('rejects spaces', () => {
    expect(slugSchema.safeParse('my plugin').success).toBe(false);
  });

  it('rejects underscores', () => {
    expect(slugSchema.safeParse('my_plugin').success).toBe(false);
  });
});

describe('pluginCreateSchema', () => {
  it('accepts valid plugin data and defaults the product to WEBRADIO', () => {
    const result = pluginCreateSchema.safeParse({
      slug: 'my-plugin',
      name: 'My Plugin',
      description: 'A plugin that does something useful and interesting.',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.product).toBe('WEBRADIO');
    }
  });

  it('rejects a product other than WebRadio', () => {
    const result = pluginCreateSchema.safeParse({
      slug: 'my-plugin',
      name: 'My Plugin',
      description: 'A plugin that does something useful and interesting.',
      product: 'SOME_OTHER_APP',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a description shorter than 10 characters', () => {
    const result = pluginCreateSchema.safeParse({
      slug: 'my-plugin',
      name: 'My Plugin',
      description: 'Short',
    });
    expect(result.success).toBe(false);
  });
});
