/**
 * @jest-environment node
 *
 * Unit tests for the central release-channel classifier.
 * These tests are purely functional – no DB, no network.
 */
import { channelFor, type ReleaseChannel } from '../analytics/channel';

describe('channelFor – stable releases', () => {
  it('classifies a plain version as stable', () => {
    expect(channelFor('1.0.8', false)).toBe<ReleaseChannel>('stable');
  });

  it('classifies a "v"-prefixed version as stable', () => {
    expect(channelFor('v1.0.8', false)).toBe<ReleaseChannel>('stable');
  });

  it('always returns stable when prerelease=false, regardless of tag', () => {
    // Hypothetically malformed tag but GitHub says not a prerelease.
    expect(channelFor('1.0.8-rc.1', false)).toBe<ReleaseChannel>('stable');
  });
});

describe('channelFor – alpha', () => {
  it('classifies an alpha tag', () => {
    expect(channelFor('1.0.8-alpha.1', true)).toBe<ReleaseChannel>('alpha');
  });

  it('classifies an uppercase ALPHA tag', () => {
    expect(channelFor('1.0.8-ALPHA.1', true)).toBe<ReleaseChannel>('alpha');
  });

  it('classifies a mixed-case Alpha tag', () => {
    expect(channelFor('v2.0.0-Alpha.3', true)).toBe<ReleaseChannel>('alpha');
  });
});

describe('channelFor – beta', () => {
  it('classifies a beta tag', () => {
    expect(channelFor('1.0.8-beta.1', true)).toBe<ReleaseChannel>('beta');
  });

  it('classifies an uppercase BETA tag', () => {
    expect(channelFor('1.0.8-BETA.2', true)).toBe<ReleaseChannel>('beta');
  });
});

describe('channelFor – RC (Release Candidate)', () => {
  it('classifies 1.0.8-rc.1', () => {
    expect(channelFor('1.0.8-rc.1', true)).toBe<ReleaseChannel>('rc');
  });

  it('classifies 1.0.8-RC.1 (uppercase)', () => {
    expect(channelFor('1.0.8-RC.1', true)).toBe<ReleaseChannel>('rc');
  });

  it('classifies v1.0.8-rc.2', () => {
    expect(channelFor('v1.0.8-rc.2', true)).toBe<ReleaseChannel>('rc');
  });

  it('classifies a tag with rc followed by a digit boundary', () => {
    expect(channelFor('1.0.8-rc1', true)).toBe<ReleaseChannel>('rc');
  });

  it('does NOT classify "rc" substring inside "discreet" as rc', () => {
    // "discreet" contains "rc" but not at a word boundary
    expect(channelFor('1.0.0-discreet', true)).toBe<ReleaseChannel>('unknown');
  });
});

describe('channelFor – unknown / edge cases', () => {
  it('returns unknown for an unrecognised prerelease tag', () => {
    expect(channelFor('1.0.8-nightly', true)).toBe<ReleaseChannel>('unknown');
  });

  it('returns unknown for an empty prerelease tag', () => {
    expect(channelFor('', true)).toBe<ReleaseChannel>('unknown');
  });

  it('alpha takes priority over rc when both appear in tag', () => {
    expect(channelFor('1.0.0-alpha-rc.1', true)).toBe<ReleaseChannel>('alpha');
  });

  it('beta takes priority over rc when both appear in tag', () => {
    expect(channelFor('1.0.0-beta-rc.1', true)).toBe<ReleaseChannel>('beta');
  });
});
