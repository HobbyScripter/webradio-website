#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5360db9638eb2aa305bf2b8c833d17b60cce13e5f750ad138d1f63847ac266bb/contract';
import startContract from '../../snapshots/5360db9638eb2aa305bf2b8c833d17b60cce13e5f750ad138d1f63847ac266bb/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/80e32e10d066867f39c44f1dd61537a5d28a2b6e1076b8a375c34cba034c89df/contract';
import endContract from '../../snapshots/80e32e10d066867f39c44f1dd61537a5d28a2b6e1076b8a375c34cba034c89df/contract.json' with { type: 'json' };
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
        table: 'AnalyticsSourceStatus',
        columns: [
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('lastErrorCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('lastErrorMessage', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('lastFailureAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('lastHttpStatus', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('lastSuccessAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('source', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'AnalyticsSourceStatus_source_check_de1cf053',
            sql`"source" IN ('TRAFFIC_VIEWS', 'TRAFFIC_CLONES', 'TRAFFIC_REFERRERS', 'TRAFFIC_PATHS', 'RELEASES', 'REPO_METADATA', 'COMMIT_ACTIVITY', 'CONTRIBUTORS', 'CODE_FREQUENCY', 'PARTICIPATION', 'PUNCH_CARD')`,
          ),
          checkExpression(
            'AnalyticsSourceStatus_status_check_e440e353',
            sql`"status" IN ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'PENDING', 'EMPTY', 'UNSUPPORTED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'AnalyticsSyncRun',
        columns: [
          col('completedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('errorCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('errorMessage', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('httpStatus', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('itemCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('source', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('startedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'AnalyticsSyncRun_source_check_de1cf053',
            sql`"source" IN ('TRAFFIC_VIEWS', 'TRAFFIC_CLONES', 'TRAFFIC_REFERRERS', 'TRAFFIC_PATHS', 'RELEASES', 'REPO_METADATA', 'COMMIT_ACTIVITY', 'CONTRIBUTORS', 'CODE_FREQUENCY', 'PARTICIPATION', 'PUNCH_CARD')`,
          ),
          checkExpression(
            'AnalyticsSyncRun_status_check_e440e353',
            sql`"status" IN ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'PENDING', 'EMPTY', 'UNSUPPORTED')`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'AnalyticsSourceStatus',
        constraint: 'AnalyticsSourceStatus_source_key',
        columns: ['source'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AnalyticsSyncRun',
        index: 'AnalyticsSyncRun_source_startedAt_idx_9afd1603',
        columns: ['source', 'startedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AnalyticsSyncRun',
        index: 'AnalyticsSyncRun_status_idx_e98638ab',
        columns: ['status'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
