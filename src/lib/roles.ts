/**
 * Central role hierarchy and account navigation.
 *
 * This module is deliberately free of database imports so client components can
 * use the exact same hierarchy as the server-side authorization helpers. The
 * server still re-reads the role from PostgreSQL on every check; the values
 * here describe ordering and labels only.
 *
 * Labels are translation keys, not text: the signed-in chrome is rendered in
 * the visitor's language through `<I18nProvider>`.
 */
import type { Role } from './validations';
import type { TranslationKey } from '@/i18n/messages';

export const ROLE_RANK: Record<Role, number> = {
  USER: 0,
  DEVELOPER: 1,
  ADMIN: 2,
  SYSTEM_ADMIN: 3,
};

/** Translation key per role; resolve with `t(ROLE_LABEL_KEYS[role])`. */
export const ROLE_LABEL_KEYS = {
  USER: 'roles.USER',
  DEVELOPER: 'roles.DEVELOPER',
  ADMIN: 'roles.ADMIN',
  SYSTEM_ADMIN: 'roles.SYSTEM_ADMIN',
} as const satisfies Record<Role, TranslationKey>;

/** Resolve a role's label in the active language. */
export function roleLabel(t: (key: string) => string, role: Role): string {
  return t(ROLE_LABEL_KEYS[role]);
}

/** True when `userRole` satisfies `requiredRole` in the fixed hierarchy. */
export function hasRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[requiredRole];
}

/** The role hierarchy as an ordered list, highest privilege last. */
export const ROLE_ORDER: readonly Role[] = ['USER', 'DEVELOPER', 'ADMIN', 'SYSTEM_ADMIN'];

/** Persisted account state (see the `UserStatus` enum in the contract). */
export type AccountStatus = 'ACTIVE' | 'SUSPENDED';

/**
 * A suspension is in force when the account is `SUSPENDED` and either has no
 * end (`suspendedUntil === null` ⇒ permanent) or an end in the future.
 *
 * Expiry is deliberately *derived*, never written back: no request, cron job or
 * race can turn a permanent suspension into an active account, and concurrent
 * requests at the expiry instant all reach the same answer without a write.
 *
 * Pure and database-free so `resolveSession()`, the login path and the admin UI
 * all apply exactly the same rule.
 */
export function isSuspensionActive(
  status: AccountStatus | null | undefined,
  suspendedUntil: Temporal.Instant | null | undefined,
  now: Temporal.Instant = Temporal.Now.instant(),
): boolean {
  if (status !== 'SUSPENDED') {
    return false;
  }
  if (suspendedUntil === null || suspendedUntil === undefined) {
    return true;
  }
  return Temporal.Instant.compare(suspendedUntil, now) > 0;
}

/** True when the account may act: not suspended, or the suspension expired. */
export function isAccountAccessible(
  status: AccountStatus | null | undefined,
  suspendedUntil: Temporal.Instant | null | undefined,
  now: Temporal.Instant = Temporal.Now.instant(),
): boolean {
  return !isSuspensionActive(status, suspendedUntil, now);
}

export type AccountNavIcon = 'user' | 'settings' | 'shield' | 'code' | 'server' | 'logout';

export type AccountNavItem = {
  key: string;
  labelKey: TranslationKey;
  href: string;
  icon: AccountNavIcon;
  /** Minimum role that sees this entry. USER entries are visible to everyone. */
  requiredRole: Role;
};

/**
 * Single source of truth for the account menu / mobile account section.
 * Higher roles inherit the entries of lower roles.
 */
export const ACCOUNT_NAV_ITEMS: readonly AccountNavItem[] = [
  {
    key: 'account',
    labelKey: 'account.navOverview',
    href: '/account',
    icon: 'user',
    requiredRole: 'USER',
  },
  {
    key: 'profile',
    labelKey: 'account.navProfile',
    href: '/account/profile',
    icon: 'settings',
    requiredRole: 'USER',
  },
  {
    key: 'security',
    labelKey: 'account.navSecurity',
    href: '/account/security',
    icon: 'shield',
    requiredRole: 'USER',
  },
  {
    key: 'language',
    labelKey: 'account.navLanguage',
    href: '/account/settings',
    icon: 'settings',
    requiredRole: 'USER',
  },
  {
    key: 'developer-access',
    labelKey: 'account.navDeveloperAccess',
    href: '/account/developer',
    icon: 'code',
    requiredRole: 'USER',
  },
  {
    key: 'developer',
    labelKey: 'account.navDeveloperDashboard',
    href: '/developer',
    icon: 'code',
    requiredRole: 'DEVELOPER',
  },
  {
    key: 'admin',
    labelKey: 'account.navAdminDashboard',
    href: '/admin',
    icon: 'shield',
    requiredRole: 'ADMIN',
  },
  {
    key: 'system-admin',
    labelKey: 'account.navSystemAdmin',
    href: '/system-admin',
    icon: 'server',
    requiredRole: 'SYSTEM_ADMIN',
  },
];

/**
 * Account entries for a role. An unknown or missing role is treated as USER so
 * a malformed session can never reveal privileged links.
 */
export function getAccountNavItems(role: Role | null | undefined): AccountNavItem[] {
  const effective: Role = role && role in ROLE_RANK ? role : 'USER';
  return ACCOUNT_NAV_ITEMS.filter((item) => hasRole(effective, item.requiredRole));
}
