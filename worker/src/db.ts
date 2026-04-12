// D1 query helpers — thin wrappers to reduce boilerplate in route handlers

export async function dbFirst(db: D1Database, sql: string, ...params: unknown[]) {
  return db.prepare(sql).bind(...params).first<Record<string, unknown>>()
}

export async function dbAll(db: D1Database, sql: string, ...params: unknown[]) {
  const { results } = await db.prepare(sql).bind(...params).all<Record<string, unknown>>()
  return results
}

export async function dbRun(db: D1Database, sql: string, ...params: unknown[]) {
  return db.prepare(sql).bind(...params).run()
}

// Build an IN clause for array params: inClause([1,2,3]) → "?,?,?"
export function inClause(arr: unknown[]): string {
  return arr.map(() => '?').join(',')
}
