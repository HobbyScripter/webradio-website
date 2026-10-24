#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/0f6d67ee73da300acd0eb2eb15486b8e493bf050af24e687027a74c0ed9a2b82/contract';
import startContract from '../../snapshots/0f6d67ee73da300acd0eb2eb15486b8e493bf050af24e687027a74c0ed9a2b82/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/4f1f3b35ecebf6085467867e10775c4f42dd696568daa675b041276d619eed90/contract';
import endContract from '../../snapshots/4f1f3b35ecebf6085467867e10775c4f42dd696568daa675b041276d619eed90/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Plugin',
        column: col('product', 'text', {
          notNull: true,
          default: lit('WEBRADIO'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Release',
        column: col('product', 'text', {
          notNull: true,
          default: lit('WEBRADIO'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Theme',
        column: col('product', 'text', {
          notNull: true,
          default: lit('WEBRADIO'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Plugin',
        constraint: 'Plugin_product_check_04056a18',
        expression: sql`"product" IN ('WEBRADIO')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Release',
        constraint: 'Release_product_check_04056a18',
        expression: sql`"product" IN ('WEBRADIO')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Theme',
        constraint: 'Theme_product_check_04056a18',
        expression: sql`"product" IN ('WEBRADIO')`,
      }),
      this.createIndex({
        schema: 'public',
        table: 'Plugin',
        index: 'Plugin_product_idx_934f369b',
        columns: ['product'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Release',
        index: 'Release_product_idx_934f369b',
        columns: ['product'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Theme',
        index: 'Theme_product_idx_934f369b',
        columns: ['product'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
