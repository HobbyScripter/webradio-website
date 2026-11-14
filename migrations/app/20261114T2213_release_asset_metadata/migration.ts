#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/45a62aa2acbe712123ce618d3fe0dfa56200e0167fc566854b84f3c3e88efc65/contract';
import startContract from '../../snapshots/45a62aa2acbe712123ce618d3fe0dfa56200e0167fc566854b84f3c3e88efc65/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/a61918f0b1c8b54dbf33affc080620281580b3acf90ea9097df5e2db7a28c21a/contract';
import endContract from '../../snapshots/a61918f0b1c8b54dbf33affc080620281580b3acf90ea9097df5e2db7a28c21a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'GitHubReleaseAsset',
        column: col('contentType', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'GitHubReleaseAsset',
        column: col('digest', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'GitHubReleaseAsset',
        column: col('isPrerelease', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'GitHubReleaseAsset',
        column: col('releaseName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'GitHubReleaseAsset',
        column: col('releasePublishedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'GitHubReleaseAsset',
        column: col('state', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
