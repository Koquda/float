import type { LedgerState } from './model.ts';
import { demoState } from './demo.ts';
export class ConflictError extends Error {
  status = 409;
  state: LedgerState;
  constructor(state: LedgerState) { super('The ledger changed. Your latest data has been loaded. Please retry the action.'); this.state = state; }
}
export class Repository {
  private db: D1Database;
  private userId: string;
  private asOf: string;
  constructor(db: D1Database, userId: string, asOf: string) { this.db = db; this.userId = userId; this.asOf = asOf; }
  async read(): Promise<LedgerState> {
    const initial = demoState(this.asOf);
    await this.db.prepare('INSERT OR IGNORE INTO float_ledgers (user_id, revision, state_json) VALUES (?, 0, ?)').bind(this.userId, JSON.stringify(initial)).run();
    const row = await this.db.prepare('SELECT revision, state_json FROM float_ledgers WHERE user_id = ?').bind(this.userId).first<{ revision: number; state_json: string }>();
    if (!row) throw new Error('Unable to load the ledger.');
    return { ...JSON.parse(row.state_json), revision: row.revision, asOf: this.asOf };
  }
  async mutate(change: (state: LedgerState) => LedgerState, expectedRevision?: number): Promise<LedgerState> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await this.read();
      if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new ConflictError(current);
      const next = change(structuredClone(current));
      next.revision = current.revision + 1;
      const result = await this.db.prepare('UPDATE float_ledgers SET revision = ?, state_json = ? WHERE user_id = ? AND revision = ?').bind(next.revision, JSON.stringify(next), this.userId, current.revision).run();
      if (result.meta.changes === 1) return next;
    }
    throw new ConflictError(await this.read());
  }
}
