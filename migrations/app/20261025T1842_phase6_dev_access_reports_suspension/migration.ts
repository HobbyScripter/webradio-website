#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/297315b0b622fec8a6381c97a99fccd0ab1c5a56565211db00cca77c4b284dc4/contract';
import endContract from '../../snapshots/297315b0b622fec8a6381c97a99fccd0ab1c5a56565211db00cca77c4b284dc4/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/8116d0696aa09b6976cfc453f7c9db1cf55107d54bc492483cc3146e9673671c/contract';
import startContract from '../../snapshots/8116d0696aa09b6976cfc453f7c9db1cf55107d54bc492483cc3146e9673671c/contract.json' with { type: 'json' };
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
      this.dropCheckConstraint({
        schema: 'public',
        table: 'Plugin',
        constraint: 'Plugin_status_check_d5a30912',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'PublicationReview',
        constraint: 'PublicationReview_status_check_13038551',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'Theme',
        constraint: 'Theme_status_check_d5a30912',
      }),
      this.createTable({
        schema: 'public',
        table: 'ContentReport',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('details', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reporterId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('resolutionNotes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('resolvedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('resolvedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('OPEN'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('targetId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('targetType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'ContentReport_reason_check_57e704e3',
            sql`"reason" IN ('ILLEGAL', 'MALWARE', 'COPYRIGHT', 'SPAM', 'MISLEADING', 'OTHER')`,
          ),
          checkExpression(
            'ContentReport_status_check_8a170c60',
            sql`"status" IN ('OPEN', 'DISMISSED', 'CONTENT_REMOVED', 'WARNING_ISSUED', 'ACCOUNT_SUSPENDED')`,
          ),
          checkExpression(
            'ContentReport_targetType_check_e746220a',
            sql`"targetType" IN ('PLUGIN', 'THEME', 'PLUGIN_VERSION', 'THEME_VERSION')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'DeveloperApplication',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('decidedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('decidedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('decisionNotes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('motivation', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('portfolioUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'DeveloperApplication_status_check_9a526491',
            sql`"status" IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')`,
          ),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('status', 'text', {
          notNull: true,
          default: lit('ACTIVE'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('suspendedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('suspendedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('suspendedReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('suspendedUntil', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'ContentReport',
        constraint: 'ContentReport_reporterId_targetType_targetId_key',
        columns: ['reporterId', 'targetType', 'targetId'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Plugin',
        constraint: 'Plugin_status_check_9768c138',
        expression: sql`"status" IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'ARCHIVED', 'REMOVED')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'PublicationReview',
        constraint: 'PublicationReview_status_check_457e60ba',
        expression: sql`"status" IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'REMOVED')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Theme',
        constraint: 'Theme_status_check_9768c138',
        expression: sql`"status" IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'ARCHIVED', 'REMOVED')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'User',
        constraint: 'User_status_check_1527ac15',
        expression: sql`"status" IN ('ACTIVE', 'SUSPENDED')`,
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_reporterId_idx_aa245831',
        columns: ['reporterId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_resolvedById_idx_fc75edc7',
        columns: ['resolvedById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ContentReport',
        index: 'ContentReport_targetType_targetId_idx_7a5ee9cb',
        columns: ['targetType', 'targetId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DeveloperApplication',
        index: 'DeveloperApplication_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DeveloperApplication',
        index: 'DeveloperApplication_decidedById_idx_8194d55f',
        columns: ['decidedById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DeveloperApplication',
        index: 'DeveloperApplication_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DeveloperApplication',
        index: 'DeveloperApplication_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DeveloperApplication',
        index: 'DeveloperApplication_userId_status_idx_e4a128ba',
        columns: ['userId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'User',
        index: 'User_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'User',
        index: 'User_suspendedById_idx_441458ac',
        columns: ['suspendedById'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ContentReport',
        foreignKey: {
          name: 'ContentReport_reporterId_fkey',
          columns: ['reporterId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ContentReport',
        foreignKey: {
          name: 'ContentReport_resolvedById_fkey',
          columns: ['resolvedById'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'DeveloperApplication',
        foreignKey: {
          name: 'DeveloperApplication_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'DeveloperApplication',
        foreignKey: {
          name: 'DeveloperApplication_decidedById_fkey',
          columns: ['decidedById'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'User',
        foreignKey: {
          name: 'User_suspendedById_fkey',
          columns: ['suspendedById'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
