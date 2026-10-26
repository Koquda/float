const origin = process.env.FLOAT_SITE_URL;
const jobToken = process.env.FLOAT_JOB_TOKEN;
const siteToken = process.env.FLOAT_SITES_ACCESS_TOKEN;
if (!origin || !jobToken || !siteToken) {
  throw new Error('Configure FLOAT_SITE_URL, FLOAT_JOB_TOKEN, and FLOAT_SITES_ACCESS_TOKEN before running scheduled imports.');
}
const url = new URL('/api/jobs', origin);
if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
  throw new Error('The job endpoint must use HTTPS.');
}
const response = await fetch(url, {
  method: 'POST',
  redirect: 'error',
  signal: AbortSignal.timeout(60000),
  headers: {
    Authorization: `Bearer ${jobToken}`,
    'OAI-Sites-Authorization': `Bearer ${siteToken}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});
if (!response.ok) throw new Error(`Float job failed with HTTP ${response.status}. Inspect the app's import history.`);
console.log('Float job endpoint completed. Check the app for import and alert delivery status.');
