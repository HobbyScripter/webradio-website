#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/43914ff3b0f229942a1e9484855706c76da643f0de44923bafec42d192efb27c/contract';
import startContract from '../../snapshots/43914ff3b0f229942a1e9484855706c76da643f0de44923bafec42d192efb27c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e8dc07735da9f571e94ee9b1a8321f53913db3a2f1a8b8b18da97882efda7245/contract';
import endContract from '../../snapshots/e8dc07735da9f571e94ee9b1a8321f53913db3a2f1a8b8b18da97882efda7245/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'TranslationEvent',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actorId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('entityId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('entityType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('field', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('fromStatus', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('locale', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('provider', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('toStatus', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('translationId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'TranslationJob',
        columns: [
          col('attempts', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('characters', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('entityId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('entityType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('errorCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('field', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('finishedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('jobKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('locale', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('requestedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('sourceHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('startedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
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
        table: 'TranslationUsage',
        columns: [
          col('characters', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('costMicros', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('locale', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('quotaLimit', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('quotaUsed', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('requests', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'ContentTranslation',
        column: col('outdated', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ContentTranslation',
        column: col('provider', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ContentTranslation',
        column: col('sourceHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.setDefault({
        schema: 'public',
        table: 'ContentTranslation',
        column: col('status', 'text', {
          default: lit('MISSING'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.setDefault({
        schema: 'public',
        table: 'ContentTranslation',
        column: col('value', 'text', { default: lit(''), codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'TranslationJob',
        constraint: 'TranslationJob_jobKey_key',
        columns: ['jobKey'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentTranslation',
        index: 'ContentTranslation_outdated_idx_7ff64e50',
        columns: ['outdated'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TranslationEvent',
        index: 'TranslationEvent_action_idx_cd0d2116',
        columns: ['action'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TranslationEvent',
        index: 'TranslationEvent_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TranslationEvent',
        index: 'TranslationEvent_entityType_entityId_locale_field_idx_b7f094a4',
        columns: ['entityType', 'entityId', 'locale', 'field'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TranslationJob',
        index: 'TranslationJob_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TranslationJob',
        index: 'TranslationJob_entityType_entityId_idx_ea0fa809',
        columns: ['entityType', 'entityId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TranslationJob',
        index: 'TranslationJob_locale_idx_ca6adb0a',
        columns: ['locale'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TranslationJob',
        index: 'TranslationJob_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TranslationUsage',
        index: 'TranslationUsage_locale_idx_ca6adb0a',
        columns: ['locale'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TranslationUsage',
        index: 'TranslationUsage_provider_createdAt_idx_fd3b9fd1',
        columns: ['provider', 'createdAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
