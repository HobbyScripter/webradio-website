import {
  isPackageAsset,
  isReleaseMetadataAsset,
  rankReleaseAssets,
  selectPrimaryReleaseAsset,
} from '@/lib/release-asset-selection';

const manifest = { name: 'manifest.json', size: 575 };
const updaterMetadata = { name: 'latest.yml', size: 320 };
const checksums = { name: 'SHA256SUMS.txt', size: 210 };
const blockmap = { name: 'mediahub-1.2.3.zip.blockmap', size: 1_024 };
const archive = { name: 'mediahub-1.2.3.zip', size: 4_194_304 };
const rawScript = { name: 'index.js', size: 12_000 };

describe('release asset classification', () => {
  it('recognises updater metadata and manifests', () => {
    for (const asset of [manifest, updaterMetadata, checksums, blockmap]) {
      expect(isReleaseMetadataAsset(asset.name)).toBe(true);
      expect(isPackageAsset(asset.name)).toBe(false);
    }
  });

  it('recognises archives as packages', () => {
    expect(isPackageAsset(archive.name)).toBe(true);
  });

  it('treats a plain script as deliverable but not as a preferred package', () => {
    expect(isReleaseMetadataAsset(rawScript.name)).toBe(false);
    expect(isPackageAsset(rawScript.name)).toBe(false);
  });
});

describe('selectPrimaryReleaseAsset', () => {
  it('picks the archive even when a 575 B manifest is listed first', () => {
    const selected = selectPrimaryReleaseAsset([manifest, updaterMetadata, archive]);

    expect(selected).toBe(archive);
    expect(selected?.size).toBe(4_194_304);
  });

  it('never falls back to metadata when only metadata exists', () => {
    expect(selectPrimaryReleaseAsset([manifest, updaterMetadata])).toBeNull();
  });

  it('accepts a non-archive file when no archive exists', () => {
    expect(selectPrimaryReleaseAsset([checksums, rawScript])).toBe(rawScript);
  });

  it('returns null for an empty list', () => {
    expect(selectPrimaryReleaseAsset([])).toBeNull();
  });
});

describe('rankReleaseAssets', () => {
  it('orders packages before side files without dropping any', () => {
    const ranked = rankReleaseAssets([manifest, rawScript, archive]);

    expect(ranked.map((asset) => asset.name)).toEqual([
      'mediahub-1.2.3.zip',
      'index.js',
      'manifest.json',
    ]);
  });

  it('does not mutate the input list', () => {
    const input = [manifest, archive];
    rankReleaseAssets(input);

    expect(input.map((asset) => asset.name)).toEqual(['manifest.json', 'mediahub-1.2.3.zip']);
  });
});
