import { getAccountNavItems, hasRole, ROLE_LABELS, ROLE_ORDER } from '../roles';

describe('role hierarchy', () => {
  it('orders USER < DEVELOPER < ADMIN < SYSTEM_ADMIN', () => {
    expect(hasRole('USER', 'USER')).toBe(true);
    expect(hasRole('USER', 'DEVELOPER')).toBe(false);
    expect(hasRole('DEVELOPER', 'DEVELOPER')).toBe(true);
    expect(hasRole('DEVELOPER', 'ADMIN')).toBe(false);
    expect(hasRole('ADMIN', 'ADMIN')).toBe(true);
    expect(hasRole('ADMIN', 'SYSTEM_ADMIN')).toBe(false);
    expect(hasRole('SYSTEM_ADMIN', 'SYSTEM_ADMIN')).toBe(true);
    expect(hasRole('SYSTEM_ADMIN', 'ADMIN')).toBe(true);
    expect(hasRole('SYSTEM_ADMIN', 'DEVELOPER')).toBe(true);
  });

  it('ranks every role exactly once', () => {
    expect(new Set(ROLE_ORDER).size).toBe(4);
    for (const role of ROLE_ORDER) {
      expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
    }
  });
});

describe('account navigation', () => {
  it('shows account pages and the developer-access entry to USER', () => {
    const keys = getAccountNavItems('USER').map((item) => item.key);
    // `developer-access` is the application page, not the developer dashboard:
    // it is open to every account and grants nothing by itself.
    expect(keys).toEqual(['account', 'profile', 'security', 'developer-access']);
    expect(keys).not.toContain('developer');
    expect(keys).not.toContain('admin');
    expect(keys).not.toContain('system-admin');
  });

  it('adds the developer dashboard for DEVELOPER but no admin links', () => {
    const keys = getAccountNavItems('DEVELOPER').map((item) => item.key);
    expect(keys).toContain('developer');
    expect(keys).not.toContain('admin');
    expect(keys).not.toContain('system-admin');
  });

  it('adds the admin dashboard for ADMIN but not system administration', () => {
    const keys = getAccountNavItems('ADMIN').map((item) => item.key);
    expect(keys).toContain('developer');
    expect(keys).toContain('admin');
    expect(keys).not.toContain('system-admin');
  });

  it('gives SYSTEM_ADMIN every section', () => {
    const keys = getAccountNavItems('SYSTEM_ADMIN').map((item) => item.key);
    expect(keys).toEqual([
      'account',
      'profile',
      'security',
      'developer-access',
      'developer',
      'admin',
      'system-admin',
    ]);
  });

  it('treats a missing or unknown role as USER', () => {
    expect(getAccountNavItems(null).map((item) => item.key)).toEqual([
      'account',
      'profile',
      'security',
      'developer-access',
    ]);
    expect(getAccountNavItems(undefined).map((item) => item.key)).toEqual([
      'account',
      'profile',
      'security',
      'developer-access',
    ]);
  });
});
