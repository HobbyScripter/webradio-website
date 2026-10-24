#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0f6d67ee73da300acd0eb2eb15486b8e493bf050af24e687027a74c0ed9a2b82/contract';
import endContract from '../../snapshots/0f6d67ee73da300acd0eb2eb15486b8e493bf050af24e687027a74c0ed9a2b82/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/b0d9463c5ca3151b86d063e4791193bef2a6dfc12294b1b6735f16b6b06adc94/contract';
import startContract from '../../snapshots/b0d9463c5ca3151b86d063e4791193bef2a6dfc12294b1b6735f16b6b06adc94/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'AuthToken',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('usedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'AuthToken_type_check_5a4470d6',
            sql`"type" IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'RateLimitBucket',
        columns: [
          col('count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('windowStart', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['key'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'AuthToken',
        constraint: 'AuthToken_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AuthToken',
        index: 'AuthToken_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AuthToken',
        index: 'AuthToken_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AuthToken',
        index: 'AuthToken_userId_type_idx_59b0b5ce',
        columns: ['userId', 'type'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'RateLimitBucket',
        index: 'RateLimitBucket_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AuthToken',
        foreignKey: {
          name: 'AuthToken_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
