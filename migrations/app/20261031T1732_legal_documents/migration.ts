#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1a8b3a12d16234cd88fbdfbb01b9d148deba2638af9d61edb46a58bda0b4699a/contract';
import endContract from '../../snapshots/1a8b3a12d16234cd88fbdfbb01b9d148deba2638af9d61edb46a58bda0b4699a/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/297315b0b622fec8a6381c97a99fccd0ab1c5a56565211db00cca77c4b284dc4/contract';
import startContract from '../../snapshots/297315b0b622fec8a6381c97a99fccd0ab1c5a56565211db00cca77c4b284dc4/contract.json' with { type: 'json' };
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
        table: 'LegalConsent',
        columns: [
          col('acceptedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('documentType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('documentVersionId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ipAddress', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('userAgent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'LegalConsent_documentType_check_217db1df',
            sql`"documentType" IN ('IMPRESSUM', 'DATENSCHUTZ', 'NUTZUNGSBEDINGUNGEN')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'LegalDocument',
        columns: [
          col('changeDescription', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('createdBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('publishedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('publishedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('requiresConsent', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('title', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('versionNumber', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'LegalDocument_status_check_bc64f66b',
            sql`"status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')`,
          ),
          checkExpression(
            'LegalDocument_type_check_f1bcc268',
            sql`"type" IN ('IMPRESSUM', 'DATENSCHUTZ', 'NUTZUNGSBEDINGUNGEN')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'PrivacyImpactNote',
        columns: [
          col('area', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('description', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('markedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('resolvedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('resolvedById', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'LegalDocument',
        constraint: 'LegalDocument_type_versionNumber_key',
        columns: ['type', 'versionNumber'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'LegalConsent',
        index: 'LegalConsent_acceptedAt_idx_99f41866',
        columns: ['acceptedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'LegalConsent',
        index: 'LegalConsent_documentVersionId_idx_efaa8db2',
        columns: ['documentVersionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'LegalConsent',
        index: 'LegalConsent_userId_documentType_idx_3eab46cd',
        columns: ['userId', 'documentType'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'LegalDocument',
        index: 'LegalDocument_type_createdAt_idx_00d94001',
        columns: ['type', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'LegalDocument',
        index: 'LegalDocument_type_publishedAt_idx_a49ab371',
        columns: ['type', 'publishedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'LegalDocument',
        index: 'LegalDocument_type_status_idx_f045f361',
        columns: ['type', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PrivacyImpactNote',
        index: 'PrivacyImpactNote_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PrivacyImpactNote',
        index: 'PrivacyImpactNote_resolvedAt_idx_a13a9d8d',
        columns: ['resolvedAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
