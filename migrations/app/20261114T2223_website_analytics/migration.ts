#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/05013c21e484e53976d1e87bab62e7714d631e06d5048d7ac4d4d97117d070c2/contract';
import startContract from '../../snapshots/05013c21e484e53976d1e87bab62e7714d631e06d5048d7ac4d4d97117d070c2/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5360db9638eb2aa305bf2b8c833d17b60cce13e5f750ad138d1f63847ac266bb/contract';
import endContract from '../../snapshots/5360db9638eb2aa305bf2b8c833d17b60cce13e5f750ad138d1f63847ac266bb/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'WebsiteDownloadRequestDaily',
        columns: [
          col('arch', 'text', {
            notNull: true,
            default: lit(''),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('assetId', 'text', {
            notNull: true,
            default: lit(''),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('channel', 'text', {
            notNull: true,
            default: lit(''),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('count', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('countryCode', 'text', {
            notNull: true,
            default: lit('XX'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('day', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('platform', 'text', {
            notNull: true,
            default: lit(''),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('referrerHost', 'text', {
            notNull: true,
            default: lit(''),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('releaseTag', 'text', {
            notNull: true,
            default: lit(''),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'WebsitePageViewDaily',
        columns: [
          col('count', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('countryCode', 'text', {
            notNull: true,
            default: lit('XX'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('day', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deviceType', 'text', {
            notNull: true,
            default: lit('unknown'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('os', 'text', {
            notNull: true,
            default: lit('unknown'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('path', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('referrerHost', 'text', {
            notNull: true,
            default: lit(''),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'WebsiteDownloadRequestDaily',
        constraint: 'WebsiteDownloadRequestDaily_day_assetId_releaseTag_channel_plat',
        columns: [
          'day',
          'assetId',
          'releaseTag',
          'channel',
          'platform',
          'arch',
          'countryCode',
          'referrerHost',
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'WebsitePageViewDaily',
        constraint: 'WebsitePageViewDaily_day_path_referrerHost_countryCode_deviceTy',
        columns: ['day', 'path', 'referrerHost', 'countryCode', 'deviceType', 'os'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'WebsiteDownloadRequestDaily',
        index: 'WebsiteDownloadRequestDaily_day_idx_930fcf9b',
        columns: ['day'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'WebsiteDownloadRequestDaily',
        index: 'WebsiteDownloadRequestDaily_releaseTag_idx_eb9e1f83',
        columns: ['releaseTag'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'WebsitePageViewDaily',
        index: 'WebsitePageViewDaily_day_idx_930fcf9b',
        columns: ['day'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'WebsitePageViewDaily',
        index: 'WebsitePageViewDaily_path_idx_a72f861c',
        columns: ['path'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
