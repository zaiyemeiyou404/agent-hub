import { ConfigurationRequired, SERVICE_CONFIGURATION_KEY, validateServiceConfiguration, type ServiceConfiguration } from './service-endpoints';

/** Saves non-secret connection settings only; callers reload before using them. */
export async function saveServiceConfiguration(value: ServiceConfiguration): Promise<void> {
  const config = validateServiceConfiguration(value);
  // A configured browser identity must not be restored against a different API.
  // Missing optional Firebase configuration is the ordinary independent mode.
  const { signOutUser } = await import('./firebase');
  try { await signOutUser(); } catch (err) {
    if (!(err instanceof ConfigurationRequired)) throw err;
  }
  localStorage.removeItem('oa_workspace_session');
  localStorage.setItem(SERVICE_CONFIGURATION_KEY, JSON.stringify(config));
}
