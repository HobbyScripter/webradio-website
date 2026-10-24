#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/2eaf80b7361587d3661b4d4e4f329dc8ce6242623010563378fe4871023dacab/contract';
import endContract from '../../snapshots/2eaf80b7361587d3661b4d4e4f329dc8ce6242623010563378fe4871023dacab/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/4f1f3b35ecebf6085467867e10775c4f42dd696568daa675b041276d619eed90/contract';
import startContract from '../../snapshots/4f1f3b35ecebf6085467867e10775c4f42dd696568daa675b041276d619eed90/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'User',
        constraint: 'User_role_check_251e1149',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'User',
        constraint: 'User_role_check_c07371c4',
        expression: sql`"role" IN ('USER', 'DEVELOPER', 'ADMIN', 'SYSTEM_ADMIN')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
