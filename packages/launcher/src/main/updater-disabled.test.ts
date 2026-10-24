// @vitest-environment node
import { expect, it, vi } from "vitest"
vi.mock("electron",()=>({app:{getVersion:()=>"1.1.1",isPackaged:true,getPath:()=>"unused",getName:()=>"AgentHub",on:()=>{}},ipcMain:{handle:(name:string,fn:Function)=>effects.handlers.set(name,fn)}}))
const effects=vi.hoisted(()=>({reads:0,handlers:new Map<string,Function>()}))
vi.mock("electron-updater",()=>({default:{autoUpdater:{get app(){effects.reads++;throw new Error("Legacy updater cache must not be touched")}}}}))
it("disabled candidate updates leave all updater caches and configuration untouched",async()=>{
  const prior=process.env.AGHUB_UPDATE_ENABLED;delete process.env.AGHUB_UPDATE_ENABLED
  try{
    const updater=await import("./updater")
    updater.setupAutoUpdater({getWindow:()=>null,log:()=>{},isAutoUpdateEnabled:()=>false,onDownloaded:()=>{},beforeInstall:async()=>{}})
    expect(effects.reads).toBe(0)
    expect(updater.getUpdaterState().supported).toBe(false)
    expect(effects.handlers.get("updater:get-state")?.()).toMatchObject({supported:false})
  }finally{if(prior===undefined)delete process.env.AGHUB_UPDATE_ENABLED;else process.env.AGHUB_UPDATE_ENABLED=prior}
})
