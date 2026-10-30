#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/096f7da5a64999bac4aa0d0ae2cfd1ce87b0bc6225c7cd0e2617293297a03c09/contract';
import endContract from '../../snapshots/096f7da5a64999bac4aa0d0ae2cfd1ce87b0bc6225c7cd0e2617293297a03c09/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/297315b0b622fec8a6381c97a99fccd0ab1c5a56565211db00cca77c4b284dc4/contract';
import startContract from '../../snapshots/297315b0b622fec8a6381c97a99fccd0ab1c5a56565211db00cca77c4b284dc4/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Plugin',
        column: col('repositoryUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
