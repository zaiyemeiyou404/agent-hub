'use strict';

const DEV_API_BASE = 'http://127.0.0.1:18000';
const DEV_WEB_BASE = 'http://127.0.0.1:13000';

class ConfigurationRequired extends Error {
  constructor(field) {
    super('configuration_required');
    this.name = 'ConfigurationRequired';
    this.code = 'configuration_required';
    this.field = field;
  }
}

function resolveServiceUrl(raw, role, env = process.env) {
  const value = String(raw || '').trim().replace(/\/$/, '');
  if (!value) throw new ConfigurationRequired(role);
  let url;
  try { url = new URL(value); } catch { throw new ConfigurationRequired(role); }
  if (url.username || url.password || url.search || url.hash) throw new ConfigurationRequired(role);
  if (url.pathname !== '/' && url.pathname !== '') throw new ConfigurationRequired(role);
  const origin = `${url.protocol}//${url.host}`;
  if (url.protocol === 'https:') return origin;
  const allowed = role === 'web' ? DEV_WEB_BASE : DEV_API_BASE;
  if (env.AGHUB_DEV_LOOPBACK === '1' && origin === allowed) return origin;
  throw new ConfigurationRequired(role);
}

function acceptExplicitServiceUrl(raw, role = 'api') {
  const value = String(raw || '').trim().replace(/\/$/, '');
  if (!value) throw new ConfigurationRequired(role);
  let url;
  try { url = new URL(value); } catch { throw new ConfigurationRequired(role); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ConfigurationRequired(role);
  return `${url.protocol}//${url.host}`;
}

function workspaceLabelFromEndpoint(endpoint, slug) {
  const value = String(endpoint || '').trim().replace(/\/$/, '');
  if (!value) return 'configuration_required';
  let url;
  try { url = new URL(value); } catch { return 'configuration_required'; }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  return local ? `${value}/${slug}` : `${url.host}/${slug}`;
}

function configuredWebPath(slug) {
  try {
    return `${resolveServiceUrl(process.env.OPENAGENTS_WORKSPACE_WEB_BASE, 'web')}/${slug}`;
  } catch {
    return 'configuration_required';
  }
}

function tokenForService(stored, apiBase) {
  if (!stored || !stored.token || !stored.apiBase) return null;
  if (String(stored.apiBase).replace(/\/$/, '') !== String(apiBase).replace(/\/$/, '')) return null;
  return stored.token;
}

module.exports = {
  ConfigurationRequired,
  DEV_API_BASE,
  DEV_WEB_BASE,
  resolveServiceUrl,
  acceptExplicitServiceUrl,
  workspaceLabelFromEndpoint,
  configuredWebPath,
  tokenForService,
};
