/**
 * Environment Variable Validation
 *
 * Validates required environment variables at application startup.
 * Import this module early in your application (e.g., in layout.tsx or middleware).
 *
 * This module throws at startup (not lazily) when required variables are missing,
 * giving clear error messages rather than cryptic runtime failures.
 */

/** Variables required in all environments */
const REQUIRED_ALWAYS = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL'] as const;

/** Variables required only in production */
const REQUIRED_IN_PRODUCTION = ['NEXTAUTH_URL'] as const;

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
        `Please set ${name} in your .env file.\n` +
        `See .env.example for all required variables.`,
    );
  }
  return value;
}

function validateEnv(): void {
  const missing: string[] = [];

  for (const name of REQUIRED_ALWAYS) {
    if (!process.env[name]) {
      missing.push(name);
    }
  }

  if (process.env['NODE_ENV'] === 'production') {
    for (const name of REQUIRED_IN_PRODUCTION) {
      if (!process.env[name] && !missing.includes(name)) {
        missing.push(name);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n` +
        missing.map((n) => `  - ${n}`).join('\n') +
        `\n\nSee .env.example for all required variables.`,
    );
  }
}

/**
 * Validated environment variables with correct TypeScript types.
 * Access environment variables through this object instead of process.env
 * to get type safety and early validation.
 */
export const env = {
  // Database
  get DATABASE_URL() {
    return getEnvVar('DATABASE_URL');
  },

  // NextAuth
  get NEXTAUTH_SECRET() {
    return getEnvVar('NEXTAUTH_SECRET');
  },
  get NEXTAUTH_URL() {
    return getEnvVar('NEXTAUTH_URL');
  },

  // Optional: Object Storage
  STORAGE_ENDPOINT: process.env['STORAGE_ENDPOINT'],
  STORAGE_ACCESS_KEY: process.env['STORAGE_ACCESS_KEY'],
  STORAGE_SECRET_KEY: process.env['STORAGE_SECRET_KEY'],
  STORAGE_BUCKET: process.env['STORAGE_BUCKET'],
  STORAGE_REGION: process.env['STORAGE_REGION'],

  // Optional: Email
  EMAIL_FROM: process.env['EMAIL_FROM'],
  EMAIL_SERVER_HOST: process.env['EMAIL_SERVER_HOST'],
  EMAIL_SERVER_PORT: process.env['EMAIL_SERVER_PORT'] ?? '587',
  EMAIL_SERVER_USER: process.env['EMAIL_SERVER_USER'],
  EMAIL_SERVER_PASSWORD: process.env['EMAIL_SERVER_PASSWORD'],

  // Optional: GitHub OAuth
  GITHUB_CLIENT_ID: process.env['GITHUB_CLIENT_ID'],
  GITHUB_CLIENT_SECRET: process.env['GITHUB_CLIENT_SECRET'],
  GITHUB_WEBHOOK_SECRET: process.env['GITHUB_WEBHOOK_SECRET'],

  // Application
  NODE_ENV: process.env['NODE_ENV'] ?? 'development',
  isDevelopment: process.env['NODE_ENV'] !== 'production',
  isProduction: process.env['NODE_ENV'] === 'production',
} as const;

/**
 * Call this at application startup to validate all required environment variables.
 * Throws with a descriptive error if any required variable is missing.
 *
 * This is NOT called automatically — import and call it in your startup code.
 */
export { validateEnv };
