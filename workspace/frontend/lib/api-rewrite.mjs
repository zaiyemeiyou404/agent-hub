/** Origin allowed to proxy /wsapi. Same contract as the service URL resolver. */
export function apiRewriteOrigin(raw, env) {
  if (!env) env = process.env;
  const value = String(raw || '').trim().replace(/\/$/, '');
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    return '';
  }
  if (url.username || url.password || url.search || url.hash) return '';
  if (url.pathname !== '/' && url.pathname !== '') return '';
  const origin = `${url.protocol}//${url.host}`;
  if (url.protocol === 'https:') return origin;
  const dev = env.AGHUB_DEV_LOOPBACK === '1' || env.NEXT_PUBLIC_AGHUB_DEV_LOOPBACK === '1';
  if (dev && origin === 'http://127.0.0.1:18000') return origin;
  return '';
}
