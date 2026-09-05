export type SyntheticQueryOperation = Readonly<{
  name: string;
  args: readonly unknown[];
}>;

export type SyntheticQueryCall = Readonly<{
  table: string;
  operations: readonly SyntheticQueryOperation[];
}>;

export type SyntheticQueryResult = Readonly<{
  data: unknown;
  error: unknown | null;
  count?: number | null;
}>;

type QueryHandler = (call: SyntheticQueryCall) => Promise<SyntheticQueryResult>;

let queryHandler: QueryHandler = async (call) => {
  throw new Error(`unconfigured synthetic Supabase query: ${call.table}`);
};

export function setSyntheticQueryHandler(handler: QueryHandler): undefined {
  queryHandler = handler;
  return undefined;
}

class SyntheticQuery implements PromiseLike<SyntheticQueryResult> {
  private readonly operations: SyntheticQueryOperation[] = [];
  private readonly table: string;

  constructor(table: string) {
    this.table = table;
  }

  private record(name: string, args: readonly unknown[]): this {
    this.operations.push(Object.freeze({ name, args: Object.freeze([...args]) }));
    return this;
  }

  select(...args: readonly unknown[]): this { return this.record('select', args); }
  eq(...args: readonly unknown[]): this { return this.record('eq', args); }
  in(...args: readonly unknown[]): this { return this.record('in', args); }
  order(...args: readonly unknown[]): this { return this.record('order', args); }
  single(...args: readonly unknown[]): this { return this.record('single', args); }
  insert(...args: readonly unknown[]): this { return this.record('insert', args); }
  upsert(...args: readonly unknown[]): this { return this.record('upsert', args); }
  update(...args: readonly unknown[]): this { return this.record('update', args); }

  then<TResult1 = SyntheticQueryResult, TResult2 = never>(
    onfulfilled?: ((value: SyntheticQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const call = Object.freeze({
      table: this.table,
      operations: Object.freeze([...this.operations]),
    });
    return queryHandler(call).then(onfulfilled, onrejected);
  }
}

export const supabase = Object.freeze({
  from(table: string): SyntheticQuery {
    return new SyntheticQuery(table);
  },
});
