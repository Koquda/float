import { env } from 'cloudflare:workers';
import { failure, json } from '@/lib/float/http';
import { Repository } from '@/lib/float/repository';
import { runDailyJob } from '@/lib/float/service';
async function equalSecrets(left: string, right: string): Promise<boolean> {
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', encode.encode(left)), crypto.subtle.digest('SHA-256', encode.encode(right))]);
  const one = new Uint8Array(a), two = new Uint8Array(b); let diff = 0;
  for (let i = 0; i < one.length; i++) diff |= one[i] ^ two[i];
  return diff === 0;
}
export async function POST(request: Request) {
  try {
    const configuration = env as typeof env & { FLOAT_JOB_TOKEN?: string; FLOAT_OWNER_ID?: string };
    if (!configuration.FLOAT_JOB_TOKEN || !configuration.FLOAT_OWNER_ID) return json({ error: 'Scheduled jobs are not configured.' }, 503);
    const provided = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
    if (!await equalSecrets(provided, configuration.FLOAT_JOB_TOKEN)) return json({ error: 'Unauthorized.' }, 401);
    if (!env.DB) return json({ error: 'Ledger storage is not configured.' }, 503);
    const now = new Date().toISOString();
    const repo = new Repository(env.DB, configuration.FLOAT_OWNER_ID, now.slice(0, 10));
    return json(await runDailyJob(repo, now));
  } catch (error) { return failure(error); }
}
