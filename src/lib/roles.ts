/**
 * Central role hierarchy and account navigation.
 *
 * This module is deliberately free of database imports so client components can
 * use the exact same hierarchy as the server-side authorization helpers. The
 * server still re-reads the role from PostgreSQL on every check; the values
 * here describe ordering and labels only.
 */
import type { Role } from './validations';

export const ROLE_RANK: Record<Role, number> = {
  USER: 0,
  DEVELOPER: 1,
  ADMIN: 2,
  SYSTEM_ADMIN: 3,
};

export const ROLE_LABELS: Record<Role, string> = {
  USER: 'Benutzer',
  DEVELOPER: 'Entwickler',
  ADMIN: 'Administrator',
  SYSTEM_ADMIN: 'Systemadministrator',
};

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
  label: string;
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
  { key: 'account', label: 'Mein Konto', href: '/account', icon: 'user', requiredRole: 'USER' },
  {
    key: 'profile',
    label: 'Profil',
    href: '/account/profile',
    icon: 'settings',
    requiredRole: 'USER',
  },
  {
    key: 'security',
    label: 'Sicherheit',
    href: '/account/security',
    icon: 'shield',
    requiredRole: 'USER',
  },
  {
    key: 'developer-access',
    label: 'Entwicklerzugang',
    href: '/account/developer',
    icon: 'code',
    requiredRole: 'USER',
  },
  {
    key: 'developer',
    label: 'Developer-Dashboard',
    href: '/developer',
    icon: 'code',
    requiredRole: 'DEVELOPER',
  },
  {
    key: 'admin',
    label: 'Admin-Dashboard',
    href: '/admin',
    icon: 'shield',
    requiredRole: 'ADMIN',
  },
  {
    key: 'system-admin',
    label: 'Systemverwaltung',
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
