import type { Action } from '@/lib/float/model';
import { authenticatedRepository, body, failure, json, sameOrigin } from '@/lib/float/http';
import { reduceAction } from '@/lib/float/ledger';
import { checkBreach, deliverAlerts, importSource } from '@/lib/float/service';
import { integer, InputError } from '@/lib/float/validation';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const repo = await authenticatedRepository();
    if (!repo) return json({ error: 'Sign in to update your ledger.' }, 401);
    const input = await body(request);
    if (typeof input.type !== 'string') throw new InputError('Action type is required.');
    const expectedRevision = input.expectedRevision === undefined ? undefined : integer(input.expectedRevision, 'Revision', 0, Number.MAX_SAFE_INTEGER);
    const now = new Date().toISOString();
    if (input.type === 'import.run') {
      await importSource(repo, now, expectedRevision);
      return json(await deliverAlerts(repo, now));
    }
    const id = crypto.randomUUID();
    await repo.mutate(state => checkBreach(reduceAction(state, input as Action, id, now), now), expectedRevision);
    return json(await deliverAlerts(repo, now));
  } catch (error) { return failure(error); }
}
