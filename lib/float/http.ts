import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ConflictError, Repository } from './repository';
import { InputError, object } from './validation';
export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export function failure(error: unknown): Response {
  if (error instanceof ConflictError) return json({ error: error.message, state: error.state }, 409);
  if (error instanceof InputError) return json({ error: error.message }, 400);
  console.error('Float request failed', error instanceof Error ? error.message : 'unknown');
  return json({ error: 'Float could not save or load your ledger. Please retry.' }, 503);
}
export function sameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new InputError('This request must come from Float.');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new InputError('Cross-site requests are not allowed.');
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get('content-type') || '').includes('application/json')) throw new InputError('Send application/json.');
  if (!request.body) throw new InputError('Request body is required.');
  const reader = request.body.getReader(); let size = 0; const decoder = new TextDecoder(); let raw = '';
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 1_100_000) throw new InputError('Request is too large.'); raw += decoder.decode(chunk.value, { stream: true }); }
    raw += decoder.decode();
  } finally { await reader.cancel(); }
  try { return object(JSON.parse(raw)); } catch (error) { if (error instanceof InputError) throw error; throw new InputError('Request body must be valid JSON.'); }
}
export async function authenticatedRepository(): Promise<Repository | null> {
  const user = await getChatGPTUser();
  if (!user) return null;
  if (!env.DB) throw new Error('D1 DB binding is not configured.');
  return new Repository(env.DB, user.userId, new Date().toISOString().slice(0, 10));
}
