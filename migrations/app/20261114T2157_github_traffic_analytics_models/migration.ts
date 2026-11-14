#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/45a62aa2acbe712123ce618d3fe0dfa56200e0167fc566854b84f3c3e88efc65/contract';
import endContract from '../../snapshots/45a62aa2acbe712123ce618d3fe0dfa56200e0167fc566854b84f3c3e88efc65/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d027b4ae96704bf55a1842f645c0c9b84dd93ea181c7097e8b48acf4125e62e2/contract';
import startContract from '../../snapshots/d027b4ae96704bf55a1842f645c0c9b84dd93ea181c7097e8b48acf4125e62e2/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'GitHubTrafficDaily',
        columns: [
          col('capturedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('clones', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('day', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('uniqueClones', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('uniqueVisitors', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('views', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'GitHubTrafficPathSnapshot',
        columns: [
          col('capturedFor', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('path', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('uniques', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'GitHubTrafficReferrerSnapshot',
        columns: [
          col('capturedFor', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('referrer', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('uniques', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GitHubTrafficDaily',
        constraint: 'GitHubTrafficDaily_day_key',
        columns: ['day'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GitHubTrafficPathSnapshot',
        constraint: 'GitHubTrafficPathSnapshot_capturedFor_path_key',
        columns: ['capturedFor', 'path'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GitHubTrafficReferrerSnapshot',
        constraint: 'GitHubTrafficReferrerSnapshot_capturedFor_referrer_key',
        columns: ['capturedFor', 'referrer'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
