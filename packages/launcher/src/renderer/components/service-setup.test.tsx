import React from "react"
import { beforeEach, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
const fakes=vi.hoisted(()=>({save:vi.fn(),settings:vi.fn()}))
import { ServiceSetup } from "./service-setup"
beforeEach(()=>{fakes.save.mockReset().mockResolvedValue(undefined);fakes.settings.mockReset().mockResolvedValue({});window.api={getAllSettings:fakes.settings,configureServices:fakes.save} as any})
it("first install collects all three origins before mounting account or local tools",async()=>{
  render(<ServiceSetup><div>READY APP</div></ServiceSetup>)
  await screen.findByRole("heading",{name:"连接你的服务"})
  expect(screen.queryByText("READY APP")).toBeNull()
  for(const [name,value] of [["接口地址","http://127.0.0.1:18000"],["网页地址","http://127.0.0.1:13000"],["认证地址","http://127.0.0.1:18000"]])fireEvent.change(screen.getByLabelText(name),{target:{value}})
  fireEvent.click(screen.getByLabelText(/本机开发模式/))
  fireEvent.click(screen.getByRole("button",{name:"保存设置"}))
  await waitFor(()=>expect(fakes.save).toHaveBeenCalledWith({apiBase:"http://127.0.0.1:18000",webBase:"http://127.0.0.1:13000",authBase:"http://127.0.0.1:18000",devLoopback:true}))
  expect(await screen.findByText("READY APP")).toBeVisible()
})
it("restores persisted settings and keeps the service switcher reachable",async()=>{
  fakes.settings.mockResolvedValue({serviceOrigins:{apiBase:"https://api.example.test",webBase:"https://web.example.test",authBase:"https://auth.example.test",devLoopback:false}})
  render(<ServiceSetup><div>READY APP</div></ServiceSetup>)
  await screen.findByText("READY APP")
  fireEvent.click(screen.getByRole("button",{name:"服务设置"}))
  expect(screen.getByLabelText("接口地址")).toHaveValue("https://api.example.test")
})
it("failed persistence leaves the form editable and does not enter the app",async()=>{
  fakes.save.mockRejectedValue(new Error("disk full"))
  render(<ServiceSetup><div>READY APP</div></ServiceSetup>)
  await screen.findByRole("heading",{name:"连接你的服务"})
  for(const name of ["接口地址","网页地址","认证地址"])fireEvent.change(screen.getByLabelText(name),{target:{value:"https://service.example.test"}})
  fireEvent.click(screen.getByRole("button",{name:"保存设置"}))
  expect(await screen.findByRole("alert")).toHaveTextContent("设置未保存")
  expect(screen.getByRole("button",{name:"保存设置"})).toBeEnabled()
  expect(screen.queryByText("READY APP")).toBeNull()
})
