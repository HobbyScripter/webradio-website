#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/d027b4ae96704bf55a1842f645c0c9b84dd93ea181c7097e8b48acf4125e62e2/contract';
import endContract from '../../snapshots/d027b4ae96704bf55a1842f645c0c9b84dd93ea181c7097e8b48acf4125e62e2/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e92699fa49946fb069739ec2d72e7b4c38c68c204707a8fb1b556adfc92e17ef/contract';
import startContract from '../../snapshots/e92699fa49946fb069739ec2d72e7b4c38c68c204707a8fb1b556adfc92e17ef/contract.json' with { type: 'json' };
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
        table: 'DownloadSyncLog',
        columns: [
          col('completedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('errorMessage', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('startedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('syncedAssetsCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('totalGitHubDownloads', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'DownloadSyncLog_status_check_5c3c95c5',
            sql`"status" IN ('RUNNING', 'SUCCESS', 'FAILED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'GitHubAppInstallation',
        columns: [
          col('accountLogin', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('appId', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('appName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('installationId', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('lastApiCallAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('lastWebhookAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('permissions', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('repositoryName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('CONNECTED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'GitHubAppInstallation_status_check_e440b423',
            sql`"status" IN ('CONNECTED', 'SUSPENDED', 'DELETED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'GitHubDownloadSnapshot',
        columns: [
          col('assetId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('downloadCount', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('snapshotDate', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'GitHubReleaseAsset',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('currentDownloadCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('downloadUrl', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('fileName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('format', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('githubAssetId', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('lastSyncedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('platform', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('releaseChannel', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('releaseId', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('releaseTag', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('size', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'GitHubWebhookDelivery',
        columns: [
          col('action', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('deliveryId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('event', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('processedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('repository', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'WebsiteDownloadStat',
        columns: [
          col('assetId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('count', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('countryCode', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('date', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GitHubAppInstallation',
        constraint: 'GitHubAppInstallation_installationId_key',
        columns: ['installationId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GitHubDownloadSnapshot',
        constraint: 'GitHubDownloadSnapshot_assetId_snapshotDate_key',
        columns: ['assetId', 'snapshotDate'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GitHubReleaseAsset',
        constraint: 'GitHubReleaseAsset_githubAssetId_key',
        columns: ['githubAssetId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GitHubWebhookDelivery',
        constraint: 'GitHubWebhookDelivery_deliveryId_key',
        columns: ['deliveryId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'WebsiteDownloadStat',
        constraint: 'WebsiteDownloadStat_assetId_countryCode_date_key',
        columns: ['assetId', 'countryCode', 'date'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DownloadSyncLog',
        index: 'DownloadSyncLog_startedAt_idx_cac56236',
        columns: ['startedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'DownloadSyncLog',
        index: 'DownloadSyncLog_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GitHubAppInstallation',
        index: 'GitHubAppInstallation_repositoryName_idx_254e3e4d',
        columns: ['repositoryName'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GitHubDownloadSnapshot',
        index: 'GitHubDownloadSnapshot_assetId_idx_4ebe630a',
        columns: ['assetId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GitHubDownloadSnapshot',
        index: 'GitHubDownloadSnapshot_snapshotDate_idx_073d86f4',
        columns: ['snapshotDate'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GitHubReleaseAsset',
        index: 'GitHubReleaseAsset_releaseChannel_idx_baa3058e',
        columns: ['releaseChannel'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GitHubReleaseAsset',
        index: 'GitHubReleaseAsset_releaseTag_idx_eb9e1f83',
        columns: ['releaseTag'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GitHubWebhookDelivery',
        index: 'GitHubWebhookDelivery_event_idx_0e2c7e2f',
        columns: ['event'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'WebsiteDownloadStat',
        index: 'WebsiteDownloadStat_assetId_idx_4ebe630a',
        columns: ['assetId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'WebsiteDownloadStat',
        index: 'WebsiteDownloadStat_countryCode_idx_479cc5a2',
        columns: ['countryCode'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'WebsiteDownloadStat',
        index: 'WebsiteDownloadStat_date_idx_b4ca319c',
        columns: ['date'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'GitHubDownloadSnapshot',
        foreignKey: {
          name: 'GitHubDownloadSnapshot_assetId_fkey',
          columns: ['assetId'],
          references: { schema: 'public', table: 'GitHubReleaseAsset', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'WebsiteDownloadStat',
        foreignKey: {
          name: 'WebsiteDownloadStat_assetId_fkey',
          columns: ['assetId'],
          references: { schema: 'public', table: 'GitHubReleaseAsset', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
