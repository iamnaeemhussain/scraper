import { DatabaseSync } from 'node:sqlite';
import { SqlExecutor } from './router';

export function createNodeSqliteExecutor(dbPath = ':memory:'): {
  executor: SqlExecutor;
  close: () => void;
} {
  const db = new DatabaseSync(dbPath);
  const executor: SqlExecutor = {
    exec: (query: string, ...bindings: any[]) => {
      const trimmed = query.trim();
      if (bindings.length === 0 && !/^(SELECT|PRAGMA|WITH)\b/i.test(trimmed)) {
        db.exec(query);
        return {
          toArray: () => [],
          one: () => null,
        };
      }
      const stmt = db.prepare(query);
      if (/^(SELECT|PRAGMA|WITH)\b/i.test(trimmed) || /\bRETURNING\b/i.test(trimmed)) {
        const rows = stmt.all(...bindings) as Record<string, any>[];
        return {
          toArray: () => rows,
          one: () => (rows.length ? rows[0] : null),
        };
      } else {
        stmt.run(...bindings);
        return {
          toArray: () => [],
          one: () => null,
        };
      }
    },
  };
  return {
    executor,
    close: () => db.close(),
  };
}
