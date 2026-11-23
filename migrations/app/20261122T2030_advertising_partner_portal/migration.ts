#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/80e32e10d066867f39c44f1dd61537a5d28a2b6e1076b8a375c34cba034c89df/contract';
import startContract from '../../snapshots/80e32e10d066867f39c44f1dd61537a5d28a2b6e1076b8a375c34cba034c89df/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e54862c5d731bb20d89d75e46c4c0d41ab25a388639be96f2f02bcb0785ae1a6/contract';
import endContract from '../../snapshots/e54862c5d731bb20d89d75e46c4c0d41ab25a388639be96f2f02bcb0785ae1a6/contract.json' with { type: 'json' };
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
        table: 'AdCampaign',
        columns: [
          col('advertiserId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('endDate', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('format', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('internalNotes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('partnerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('placement', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('startDate', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('targetUrl', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'AdCampaign_format_check_8fcb7643',
            sql`"format" IN ('BANNER', 'SPONSOR_CARD', 'LOGO_LINK', 'CUSTOM')`,
          ),
          checkExpression(
            'AdCampaign_placement_check_0ea85d86',
            sql`"placement" IN ('HOMEPAGE', 'DOWNLOAD_PAGE', 'PUBLIC_PAGES')`,
          ),
          checkExpression(
            'AdCampaign_status_check_2517fecd',
            sql`"status" IN ('DRAFT', 'PENDING_REVIEW', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'REJECTED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'AdClick',
        columns: [
          col('campaignId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('count', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
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
          col('placement', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'AdClick_placement_check_0ea85d86',
            sql`"placement" IN ('HOMEPAGE', 'DOWNLOAD_PAGE', 'PUBLIC_PAGES')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'AdCreative',
        columns: [
          col('altText', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('campaignId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('contentType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('fileSize', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('height', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('imageUrl', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('width', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'AdImpression',
        columns: [
          col('campaignId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('count', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
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
          col('placement', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'AdImpression_placement_check_0ea85d86',
            sql`"placement" IN ('HOMEPAGE', 'DOWNLOAD_PAGE', 'PUBLIC_PAGES')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Advertiser',
        columns: [
          col('companyName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('contactName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('logoUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('websiteUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Advertiser_status_check_2d304ab8',
            sql`"status" IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'AdvertisingApplication',
        columns: [
          col('adFormat', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('companyName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('contactName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('customMessage', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('description', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('desiredBudget', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('desiredEndDate', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('desiredStartDate', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('internalNotes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('phone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('placement', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('rejectionReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reviewedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('reviewedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('websiteUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'AdvertisingApplication_adFormat_check_04e8acab',
            sql`"adFormat" IN ('BANNER', 'SPONSOR_CARD', 'LOGO_LINK', 'CUSTOM')`,
          ),
          checkExpression(
            'AdvertisingApplication_placement_check_0ea85d86',
            sql`"placement" IN ('HOMEPAGE', 'DOWNLOAD_PAGE', 'PUBLIC_PAGES')`,
          ),
          checkExpression(
            'AdvertisingApplication_status_check_5ccde6d9',
            sql`"status" IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Partner',
        columns: [
          col('companyName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isFeatured', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('logoUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('websiteUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Partner_status_check_6a6f42a1',
            sql`"status" IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'PartnerHistory',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('details', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('partnerId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('performedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('relationshipId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'PartnerRelationship',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('endDate', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isPublic', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('partnerId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('startDate', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'PartnerRelationship_status_check_62955aa4',
            sql`"status" IN ('ACTIVE', 'ENDED', 'PAUSED')`,
          ),
          checkExpression(
            'PartnerRelationship_type_check_c2f24250',
            sql`"type" IN ('OFFICIAL_PARTNER', 'TECHNICAL_PARTNER', 'SPONSOR', 'MEDIA_PARTNER', 'STRATEGIC_PARTNER')`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'AdClick',
        constraint: 'AdClick_campaignId_placement_day_key',
        columns: ['campaignId', 'placement', 'day'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'AdImpression',
        constraint: 'AdImpression_campaignId_placement_day_key',
        columns: ['campaignId', 'placement', 'day'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdCampaign',
        index: 'AdCampaign_advertiserId_idx_d211eb82',
        columns: ['advertiserId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdCampaign',
        index: 'AdCampaign_endDate_idx_4a9a40fb',
        columns: ['endDate'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdCampaign',
        index: 'AdCampaign_partnerId_idx_bf5b312c',
        columns: ['partnerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdCampaign',
        index: 'AdCampaign_placement_idx_29de1d43',
        columns: ['placement'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdCampaign',
        index: 'AdCampaign_startDate_idx_9ce08316',
        columns: ['startDate'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdCampaign',
        index: 'AdCampaign_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdClick',
        index: 'AdClick_campaignId_idx_3aacd648',
        columns: ['campaignId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdClick',
        index: 'AdClick_day_idx_930fcf9b',
        columns: ['day'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdClick',
        index: 'AdClick_placement_idx_29de1d43',
        columns: ['placement'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdCreative',
        index: 'AdCreative_campaignId_idx_3aacd648',
        columns: ['campaignId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdImpression',
        index: 'AdImpression_campaignId_idx_3aacd648',
        columns: ['campaignId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdImpression',
        index: 'AdImpression_day_idx_930fcf9b',
        columns: ['day'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdImpression',
        index: 'AdImpression_placement_idx_29de1d43',
        columns: ['placement'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Advertiser',
        index: 'Advertiser_email_idx_46df9cad',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Advertiser',
        index: 'Advertiser_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdvertisingApplication',
        index: 'AdvertisingApplication_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdvertisingApplication',
        index: 'AdvertisingApplication_email_idx_46df9cad',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdvertisingApplication',
        index: 'AdvertisingApplication_reviewedById_idx_e2835478',
        columns: ['reviewedById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AdvertisingApplication',
        index: 'AdvertisingApplication_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Partner',
        index: 'Partner_isFeatured_idx_4ec5a125',
        columns: ['isFeatured'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Partner',
        index: 'Partner_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PartnerHistory',
        index: 'PartnerHistory_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PartnerHistory',
        index: 'PartnerHistory_partnerId_idx_bf5b312c',
        columns: ['partnerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PartnerHistory',
        index: 'PartnerHistory_relationshipId_idx_51f7e2f7',
        columns: ['relationshipId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PartnerRelationship',
        index: 'PartnerRelationship_endDate_idx_4a9a40fb',
        columns: ['endDate'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PartnerRelationship',
        index: 'PartnerRelationship_isPublic_idx_ceb5dcf6',
        columns: ['isPublic'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PartnerRelationship',
        index: 'PartnerRelationship_partnerId_idx_bf5b312c',
        columns: ['partnerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PartnerRelationship',
        index: 'PartnerRelationship_startDate_idx_9ce08316',
        columns: ['startDate'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PartnerRelationship',
        index: 'PartnerRelationship_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PartnerRelationship',
        index: 'PartnerRelationship_type_idx_b6b604ea',
        columns: ['type'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AdCampaign',
        foreignKey: {
          name: 'AdCampaign_partnerId_fkey',
          columns: ['partnerId'],
          references: { schema: 'public', table: 'Partner', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AdCampaign',
        foreignKey: {
          name: 'AdCampaign_advertiserId_fkey',
          columns: ['advertiserId'],
          references: { schema: 'public', table: 'Advertiser', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AdClick',
        foreignKey: {
          name: 'AdClick_campaignId_fkey',
          columns: ['campaignId'],
          references: { schema: 'public', table: 'AdCampaign', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AdCreative',
        foreignKey: {
          name: 'AdCreative_campaignId_fkey',
          columns: ['campaignId'],
          references: { schema: 'public', table: 'AdCampaign', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AdImpression',
        foreignKey: {
          name: 'AdImpression_campaignId_fkey',
          columns: ['campaignId'],
          references: { schema: 'public', table: 'AdCampaign', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AdvertisingApplication',
        foreignKey: {
          name: 'AdvertisingApplication_reviewedById_fkey',
          columns: ['reviewedById'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PartnerHistory',
        foreignKey: {
          name: 'PartnerHistory_partnerId_fkey',
          columns: ['partnerId'],
          references: { schema: 'public', table: 'Partner', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PartnerHistory',
        foreignKey: {
          name: 'PartnerHistory_relationshipId_fkey',
          columns: ['relationshipId'],
          references: { schema: 'public', table: 'PartnerRelationship', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PartnerRelationship',
        foreignKey: {
          name: 'PartnerRelationship_partnerId_fkey',
          columns: ['partnerId'],
          references: { schema: 'public', table: 'Partner', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
