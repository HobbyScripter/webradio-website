#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/763e3b57bc99fa207bbd840d3b44199daed778109dc6e7ae6ee2f2c103ff70d6/contract';
import endContract from '../../snapshots/763e3b57bc99fa207bbd840d3b44199daed778109dc6e7ae6ee2f2c103ff70d6/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e8dc07735da9f571e94ee9b1a8321f53913db3a2f1a8b8b18da97882efda7245/contract';
import startContract from '../../snapshots/e8dc07735da9f571e94ee9b1a8321f53913db3a2f1a8b8b18da97882efda7245/contract.json' with { type: 'json' };
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
        table: 'CustomLink',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('createdBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('iconName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('openInNewTab', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('position', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sortOrder', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('updatedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'CustomLink_position_check_d2c40e4f',
            sql`"position" IN ('MAIN_NAVIGATION', 'FOOTER')`,
          ),
          checkExpression(
            'CustomLink_type_check_14338608',
            sql`"type" IN ('INTERNAL', 'EXTERNAL')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'CustomLinkLabel',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('label', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('linkId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('locale', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'CustomLinkLabel',
        constraint: 'CustomLinkLabel_linkId_locale_key',
        columns: ['linkId', 'locale'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CustomLink',
        index: 'CustomLink_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CustomLink',
        index: 'CustomLink_isActive_idx_77fe3ba1',
        columns: ['isActive'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CustomLink',
        index: 'CustomLink_position_idx_82a01784',
        columns: ['position'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CustomLink',
        index: 'CustomLink_sortOrder_idx_ebf2eac2',
        columns: ['sortOrder'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CustomLinkLabel',
        index: 'CustomLinkLabel_linkId_idx_09c902f6',
        columns: ['linkId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CustomLinkLabel',
        index: 'CustomLinkLabel_locale_idx_ca6adb0a',
        columns: ['locale'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'CustomLinkLabel',
        foreignKey: {
          name: 'CustomLinkLabel_linkId_fkey',
          columns: ['linkId'],
          references: { schema: 'public', table: 'CustomLink', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
