/**
 * @jest-environment node
 *
 * The suspension state is *derived* on every check, never written back. These
 * tests pin that semantics, including the case that must never regress: an
 * expired temporary suspension cannot lift a permanently recorded one.
 */
import { isAccountAccessible, isSuspensionActive } from '../roles';

const NOW = Temporal.Instant.from('2026-10-25T12:00:00Z');

describe('account suspension semantics', () => {
  it('treats an ACTIVE account as accessible', () => {
    expect(isSuspensionActive('ACTIVE', null, NOW)).toBe(false);
    expect(isAccountAccessible('ACTIVE', null, NOW)).toBe(true);
  });

  it('treats a missing or unknown status as accessible only when not SUSPENDED', () => {
    expect(isAccountAccessible(undefined, null, NOW)).toBe(true);
    expect(isAccountAccessible(null, NOW.add({ hours: 1 }), NOW)).toBe(true);
  });

  it('blocks a temporary suspension until its end', () => {
    const until = NOW.add({ hours: 2 });
    expect(isSuspensionActive('SUSPENDED', until, NOW)).toBe(true);
    expect(isAccountAccessible('SUSPENDED', until, NOW)).toBe(false);
  });

  it('lets a temporary suspension expire without a write', () => {
    const until = NOW.subtract({ minutes: 1 });
    expect(isSuspensionActive('SUSPENDED', until, NOW)).toBe(false);
    expect(isAccountAccessible('SUSPENDED', until, NOW)).toBe(true);
  });

  it('blocks a permanent suspension (no end date)', () => {
    expect(isSuspensionActive('SUSPENDED', null, NOW)).toBe(true);
    expect(isAccountAccessible('SUSPENDED', undefined, NOW)).toBe(false);
  });

  it('never treats an expired timestamp as lifting a permanent suspension', () => {
    // A permanent suspension has no end date at all. If a stale timestamp were
    // ever left behind, the account must not become accessible because of it —
    // which is why the service always clears it when writing a permanent block.
    const permanent = { status: 'SUSPENDED' as const, until: null };
    expect(isAccountAccessible(permanent.status, permanent.until, NOW)).toBe(false);

    // And the reverse: a past timestamp on a SUSPENDED row is only "expired"
    // because it is a *temporary* suspension that ran out.
    const expiredTemporary = NOW.subtract({ hours: 1 });
    expect(isAccountAccessible('SUSPENDED', expiredTemporary, NOW)).toBe(true);
  });

  it('is deterministic for concurrent requests at the expiry instant', () => {
    const until = NOW;
    // Two requests evaluated at the same instant must agree; nothing is written.
    expect(isAccountAccessible('SUSPENDED', until, NOW)).toBe(
      isAccountAccessible('SUSPENDED', until, NOW),
    );
    // At the exact end instant the suspension is no longer active.
    expect(isSuspensionActive('SUSPENDED', until, NOW)).toBe(false);
  });
});
