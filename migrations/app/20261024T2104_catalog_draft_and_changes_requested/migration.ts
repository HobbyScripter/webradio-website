#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/2eaf80b7361587d3661b4d4e4f329dc8ce6242623010563378fe4871023dacab/contract';
import startContract from '../../snapshots/2eaf80b7361587d3661b4d4e4f329dc8ce6242623010563378fe4871023dacab/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/8116d0696aa09b6976cfc453f7c9db1cf55107d54bc492483cc3146e9673671c/contract';
import endContract from '../../snapshots/8116d0696aa09b6976cfc453f7c9db1cf55107d54bc492483cc3146e9673671c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'Plugin',
        constraint: 'Plugin_status_check_ee930c87',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'Theme',
        constraint: 'Theme_status_check_ee930c87',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Plugin',
        constraint: 'Plugin_status_check_d5a30912',
        expression: sql`"status" IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'ARCHIVED')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Theme',
        constraint: 'Theme_status_check_d5a30912',
        expression: sql`"status" IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'ARCHIVED')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
