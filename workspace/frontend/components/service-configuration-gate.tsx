'use client';

import React, { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { apiBaseFromEnv, authBaseFromEnv, webBaseFromEnv, validateServiceConfiguration } from '@/lib/service-endpoints';
import { saveServiceConfiguration } from '@/lib/service-configuration';
import { desktopHost } from '@/lib/desktop-host';
import { useI18n } from '@/lib/i18n';

/** A first-install form and a reachable service switcher on both clients. */
export function ServiceConfigurationGate({ children, onConfigured }: { children?: ReactNode; onConfigured?: () => void }) {
  const { locale } = useI18n();
  const zh = locale === 'zh-CN';
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <main aria-busy="true" className="p-8">{zh ? '正在读取服务设置…' : 'Loading service settings…'}</main>;
  const configured = Boolean(apiBaseFromEnv() && webBaseFromEnv() && authBaseFromEnv());
  if (configured && !editing) return <>
    <button type="button" onClick={() => setEditing(true)} className="fixed bottom-3 right-3 z-50 rounded-md border bg-background px-3 py-1.5 text-xs shadow-sm">
      {zh ? '服务设置' : 'Service settings'}
    </button>
    {children}
  </>;
  return <ServiceConfigurationForm zh={zh} onCancel={configured ? () => setEditing(false) : undefined} onConfigured={onConfigured} />;
}

function ServiceConfigurationForm({ zh, onCancel, onConfigured }: { zh: boolean; onCancel?: () => void; onConfigured?: () => void }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(''); setSaving(true);
    try {
      const config = validateServiceConfiguration({
        apiBase: data.get('apiBase'), webBase: data.get('webBase'), authBase: data.get('authBase'),
        devLoopback: data.get('devLoopback') === 'on',
      });
      const host = desktopHost();
      if (host) {
        if (!host.configureServices) throw new Error('host_upgrade_required');
        await host.configureServices(config);
      } else {
        await saveServiceConfiguration(config);
        if (onConfigured) onConfigured();
        else window.location.reload();
      }
    } catch (err) {
      setError((err as Error).message === 'configuration_required'
        ? (zh ? '请填写三个有效的 HTTPS 地址，不要包含密码、路径或查询参数。本机 HTTP 需勾选开发模式并使用指定端口。' : 'Enter three HTTPS origins without credentials, paths or queries. Local HTTP requires development mode and the specified ports.')
        : (zh ? '设置未保存。请检查本地存储权限，或升级桌面客户端后重试。' : 'Settings were not saved. Check local storage permissions or update the desktop client and retry.'));
      setSaving(false);
    }
  }
  return <main data-configuration="required" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
    <h1 className="text-2xl font-semibold">{zh ? '连接你的服务' : 'Connect to your service'}</h1>
    <p className="text-sm text-muted-foreground">{zh ? '填写你自己的服务地址。保存后重新加载并退出旧服务的登录，不会自动连接官方服务。' : 'Enter your own service origins. Saving reloads the app and ends the old login; it never connects to an official default.'}</p>
    <form onSubmit={save} className="space-y-4">
      {([
        ['apiBase', zh ? '接口地址' : 'API origin', apiBaseFromEnv()],
        ['webBase', zh ? '网页地址' : 'Web origin', webBaseFromEnv()],
        ['authBase', zh ? '认证地址' : 'Authentication origin', authBaseFromEnv()],
      ] as const).map(([name, label, value]) => <label key={name} className="block space-y-1 text-sm">
        <span>{label}</span>
        <input name={name} type="url" required defaultValue={value} disabled={saving} autoComplete="off" placeholder="https://…" className="w-full rounded-md border bg-background px-3 py-2" />
      </label>)}
      <label className="flex items-start gap-2 text-sm">
        <input name="devLoopback" type="checkbox" disabled={saving} defaultChecked={apiBaseFromEnv() === 'http://127.0.0.1:18000'} />
        <span>{zh ? '本机开发模式（接口/认证 127.0.0.1:18000，网页 127.0.0.1:13000）' : 'Local development (API/auth 127.0.0.1:18000, web 127.0.0.1:13000)'}</span>
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{saving ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存并重新加载' : 'Save and reload')}</button>
        {onCancel && <button type="button" disabled={saving} onClick={onCancel} className="rounded-md border px-4 py-2 text-sm">{zh ? '取消' : 'Cancel'}</button>}
      </div>
    </form>
  </main>;
}
