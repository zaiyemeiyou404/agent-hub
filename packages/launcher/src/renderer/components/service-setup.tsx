import React, { useEffect, useState } from "react"
import { validateServiceConfiguration, type ServiceConfiguration } from "../../shared/service-endpoints"

/** Native entry exposes settings before login or the embedded workspace view. */
export function ServiceSetup({children}:{children:React.ReactNode}):React.JSX.Element {
  const [ready,setReady]=useState(false)
  const [config,setConfig]=useState<ServiceConfiguration|null>(null)
  const [editing,setEditing]=useState(false)
  const [error,setError]=useState("")
  const [saving,setSaving]=useState(false)
  useEffect(()=>{
    let current=true
    window.api.getAllSettings().then(settings=>{
      if(!current)return
      try { setConfig(validateServiceConfiguration(settings.serviceOrigins)) } catch { setConfig(null) }
      setReady(true)
    }).catch(()=>{if(current){setError("无法读取设置，请重试。");setReady(true)}})
    return ()=>{current=false}
  },[])
  if(!ready)return <main className="p-8">正在读取服务设置…</main>
  if(config&&!editing)return <><button className="fixed bottom-3 right-3 z-50 rounded-md border bg-background px-3 py-2 text-sm" onClick={()=>setEditing(true)}>服务设置</button>{children}</>
  async function save(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();setError("");setSaving(true)
    const data=new FormData(event.currentTarget)
    try {
      const next=validateServiceConfiguration({apiBase:data.get("apiBase"),webBase:data.get("webBase"),authBase:data.get("authBase"),devLoopback:data.get("devLoopback")==="on"})
      await window.api.configureServices(next)
      setConfig(next);setEditing(false)
    }catch {setError("设置未保存。请填写三个有效的 HTTPS 地址；本机 HTTP 需勾选开发模式并使用指定端口。")}
    finally {setSaving(false)}
  }
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
    <h1 className="text-2xl font-semibold">连接你的服务</h1>
    <p className="text-sm text-muted-foreground">填写你自己的服务地址。保存会退出旧服务的登录，不会自动连接官方服务。</p>
    <form onSubmit={save} className="space-y-4">
      {([['apiBase','接口地址'],['webBase','网页地址'],['authBase','认证地址']] as const).map(([key,label])=><label key={key} className="block space-y-1 text-sm"><span>{label}</span><input name={key} type="url" required disabled={saving} defaultValue={config?.[key]||''} autoComplete="off" placeholder="https://…" className="w-full rounded-md border bg-background px-3 py-2" /></label>)}
      <label className="flex items-start gap-2 text-sm"><input name="devLoopback" type="checkbox" defaultChecked={config?.devLoopback} disabled={saving}/><span>本机开发模式（接口/认证 127.0.0.1:18000，网页 127.0.0.1:13000）</span></label>
      {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3"><button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-primary-foreground">{saving?'保存中…':'保存设置'}</button>{config&&<button type="button" onClick={()=>setEditing(false)}>取消</button>}</div>
    </form>
  </main>
}
