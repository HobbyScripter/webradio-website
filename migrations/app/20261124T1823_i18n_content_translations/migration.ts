#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/43914ff3b0f229942a1e9484855706c76da643f0de44923bafec42d192efb27c/contract';
import endContract from '../../snapshots/43914ff3b0f229942a1e9484855706c76da643f0de44923bafec42d192efb27c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e54862c5d731bb20d89d75e46c4c0d41ab25a388639be96f2f02bcb0785ae1a6/contract';
import startContract from '../../snapshots/e54862c5d731bb20d89d75e46c4c0d41ab25a388639be96f2f02bcb0785ae1a6/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'ContentTranslation',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('entityId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('entityType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('field', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('locale', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reviewedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('translatedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('value', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('locale', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'ContentTranslation',
        constraint: 'ContentTranslation_entityType_entityId_locale_field_key',
        columns: ['entityType', 'entityId', 'locale', 'field'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentTranslation',
        index: 'ContentTranslation_entityType_entityId_idx_ea0fa809',
        columns: ['entityType', 'entityId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentTranslation',
        index: 'ContentTranslation_locale_idx_ca6adb0a',
        columns: ['locale'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentTranslation',
        index: 'ContentTranslation_status_idx_e98638ab',
        columns: ['status'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
