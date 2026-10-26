import { authenticatedRepository, body, failure, json, sameOrigin } from '@/lib/float/http';
import { forecast } from '@/lib/float/forecast';
import type { ForecastOptions } from '@/lib/float/model';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const repo = await authenticatedRepository();
    if (!repo) return json({ error: 'Sign in to forecast your cash.' }, 401);
    const options = await body(request);
    return json(forecast(await repo.read(), options as ForecastOptions));
  } catch (error) { return failure(error); }
}
