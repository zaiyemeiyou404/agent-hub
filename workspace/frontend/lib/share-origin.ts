import { ConfigurationRequired, resolveServiceUrl, webBaseFromEnv } from './service-endpoints';

/**
 * The origin a link has to carry to open anywhere but this page.
 * A real page origin is used as-is. Local and desktop views use the origin
 * handed over by the host, or NEXT_PUBLIC_WEB_BASE. There is no hosted fallback.
 */
export function shareOrigin(): string {
  if (typeof window !== 'undefined') {
    const { protocol, hostname, origin } = window.location;
    const isWeb = protocol === 'https:' || protocol === 'http:';
    if (isWeb && hostname !== 'localhost' && hostname !== '127.0.0.1') return origin;
    const desktop = (window as unknown as { __OA_WEB_URL__?: string }).__OA_WEB_URL__;
    if (desktop) return resolveServiceUrl(desktop, 'web');
  }
  const web = webBaseFromEnv();
  if (!web) throw new ConfigurationRequired('web');
  return web;
}

export { ConfigurationRequired };
