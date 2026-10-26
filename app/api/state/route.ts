import { authenticatedRepository, failure, json } from '@/lib/float/http';
export async function GET() {
  try {
    const repo = await authenticatedRepository();
    if (!repo) return json({ error: 'Sign in to access your ledger.' }, 401);
    return json(await repo.read());
  } catch (error) { return failure(error); }
}
