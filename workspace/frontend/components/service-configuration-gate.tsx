'use client';

import type { ReactNode } from 'react';
import { apiBaseFromEnv, authBaseFromEnv, webBaseFromEnv } from '@/lib/service-endpoints';

/** Blocks the app until api, web, and auth origins are configured. */
export function ServiceConfigurationGate({ children }: { children: ReactNode }) {
  const api = apiBaseFromEnv();
  const web = webBaseFromEnv();
  const auth = authBaseFromEnv();
  if (api && web && auth) return children;
  return (
    <main data-configuration="required" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 p-8">
      <h1 className="text-xl font-semibold">configuration_required</h1>
      <p className="text-sm text-muted-foreground">
        Set apiBase, webBase, and authBase for this deployment before it can call a service.
      </p>
    </main>
  );
}
