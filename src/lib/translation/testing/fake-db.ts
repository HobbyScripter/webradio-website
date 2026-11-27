/**
 * Minimal in-memory stand-in for the Prisma 8 client.
 *
 * Supports exactly the query surface the translation engine uses:
 * `where(...).select(...).all()`, `.first()`, `.forUpdate()`, `.update(payload)`,
 * `.create(row)` and the transaction raw-query escape hatch (`tx.raw.sql` /
 * `tx.execute`) used by the atomic job claim.
 * It exists so the engine's rules — never overwrite an approval, never pay twice,
 * legal content needs review, blocked text is not sent — are tested against
 * behaviour rather than against mocked return values.
 *
 * Not a general-purpose fake: no joins, no operators, no ordering guarantees, and
 * `tx.raw.sql` only understands the single conditional claim statement.
 */

type Row = Record<string, unknown>;

type RawPlan = { sql: string; params: unknown[] };

let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `fake-${idCounter.toString(36).padStart(6, '0')}`;
}

function matches(row: Row, condition: Row): boolean {
  return Object.entries(condition).every(([key, value]) => {
    if (value === undefined) return true;
    return row[key] === value;
  });
}

function project(row: Row, fields: string[] | null): Row {
  if (fields === null) return { ...row };
  const result: Row = {};
  for (const field of fields) result[field] = row[field];
  return result;
}

class FakeTable {
  rows: Row[] = [];

  where(condition: Row = {}) {
    const rows = this.rows;
    let fields: string[] | null = null;

    const query = {
      select(...selected: string[]) {
        fields = selected;
        return query;
      },
      all() {
        return rows.filter((row) => matches(row, condition)).map((row) => project(row, fields));
      },
      first() {
        const row = rows.find((candidate) => matches(candidate, condition));
        return row ? project(row, fields) : null;
      },
      count() {
        return rows.filter((row) => matches(row, condition)).length;
      },
      forUpdate() {
        // Row locks do not exist in memory; callers only need the chain to survive.
        return query;
      },
      async update(patch: Row) {
        for (const row of rows) {
          if (!matches(row, condition)) continue;
          for (const [key, value] of Object.entries(patch)) {
            if (value !== undefined) row[key] = value;
          }
        }
      },
      async delete() {
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          if (matches(rows[index], condition)) rows.splice(index, 1);
        }
      },
    };

    return query;
  }

  async create(row: Row) {
    const created: Row = {
      id: nextId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...row,
    };
    this.rows.push(created);
    return { ...created };
  }

  async count() {
    return this.rows.length;
  }
}

type FakeOrm = { public: Record<string, FakeTable> };

class FakeDb {
  private readonly tables = new Map<string, FakeTable>();

  table(name: string): FakeTable {
    const existing = this.tables.get(name);
    if (existing) return existing;
    const created = new FakeTable();
    this.tables.set(name, created);
    return created;
  }

  get orm(): FakeOrm {
    return {
      public: new Proxy(
        {},
        {
          get: (_target, property) => this.table(String(property)),
        },
      ),
    };
  }

  /**
   * Raw-statement builder, mirroring the subset the engine uses:
   * `tx.raw.sql`UPDATE ...`.affectedCount().build()` produces `{ sql, params }`.
   */
  private readonly raw = {
    sql: (strings: TemplateStringsArray, ...values: unknown[]): { affectedCount: () => { build: () => RawPlan } } => {
      let sql = strings[0];
      for (let index = 0; index < values.length; index += 1) {
        sql += `$${index + 1}${strings[index + 1]}`;
      }
      return {
        affectedCount: () => ({ build: (): RawPlan => ({ sql, params: values }) }),
      };
    },
  };

  /** Apply the one raw statement the engine issues: the conditional job claim. */
  private executePlan(plan: RawPlan): { affectedRows: number } {
    const normalized = plan.sql.replace(/\s+/g, ' ').trim();
    const isClaim =
      /^UPDATE "TranslationJob"/i.test(normalized) && /SET "status" = 'RUNNING'/i.test(normalized);
    if (!isClaim) return { affectedRows: 0 };

    const jobId = plan.params[0];
    const row = this.table('TranslationJob').rows.find((candidate) => candidate.id === jobId);
    if (!row || row.status === 'RUNNING') return { affectedRows: 0 };

    row.status = 'RUNNING';
    row.attempts = (typeof row.attempts === 'number' ? row.attempts : 0) + 1;
    row.startedAt = new Date().toISOString();
    row.finishedAt = null;
    row.errorCode = null;
    row.updatedAt = new Date().toISOString();
    return { affectedRows: 1 };
  }

  async transaction<T>(
    fn: (tx: { orm: FakeOrm; raw: FakeDb['raw']; execute: (plan: RawPlan) => Promise<{ affectedRows: number }> }) => Promise<T>,
  ): Promise<T> {
    return fn({
      orm: this.orm,
      raw: this.raw,
      execute: async (plan: RawPlan) => this.executePlan(plan),
    });
  }

  /** Test helper: seed rows into a table. */
  seed(table: string, rows: Row[]): void {
    for (const row of rows) {
      this.table(table).rows.push({
        id: nextId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...row,
      });
    }
  }

  /** Test helper: every row of a table (copies). */
  rows(table: string): Row[] {
    return this.table(table).rows.map((row) => ({ ...row }));
  }

  reset(): void {
    this.tables.clear();
    idCounter = 0;
  }
}

export const fakeDb = new FakeDb();

/** Keep TypeScript from narrowing the Proxy any further in tests. */
export type FakeDbHandle = {
  seed(table: string, rows: Row[]): void;
  rows(table: string): Row[];
  reset(): void;
};
