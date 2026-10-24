// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { createHash } from "node:crypto"
let dir: string
let options: { isPackaged: boolean; appPath: string; resourcesPath: string }
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "aghub-runtime-"))
  options = { isPackaged: true, appPath: path.join(dir, "app"), resourcesPath: path.join(dir, "resources") }
  const core = path.join(options.resourcesPath, "aghub-core")
  fs.mkdirSync(path.join(core, "src"), { recursive: true })
  fs.mkdirSync(path.join(core, "bin"))
  const files: Record<string,string> = {
    "package.json": JSON.stringify({ name:"@zaiyemeiyou/aghub-connector", version:"0.2.196", main:"src/index.js", bin:{agn:"bin/agent-connector.js"} }),
    "src/index.js": "module.exports = { own: true };",
    "bin/agent-connector.js": 'console.log("own");',
  }
  for (const [file, bytes] of Object.entries(files)) fs.writeFileSync(path.join(core, file), bytes)
  const manifest = JSON.stringify({ schemaVersion:1, connectorVersion:"0.2.196", sourceSha:"c".repeat(40), entrypoints:{main:"src/index.js",cli:"bin/agent-connector.js"}, hashes:Object.fromEntries(Object.entries(files).map(([file, bytes])=>[file,createHash("sha256").update(bytes).digest("hex")])) })
  fs.mkdirSync(path.join(options.appPath, ".aghub-core"), { recursive:true })
  fs.writeFileSync(path.join(options.appPath, ".aghub-core/manifest.json"), manifest)
  fs.writeFileSync(path.join(options.resourcesPath, "aghub-core-manifest.json"), manifest)
  const global = path.join(dir, ".openagents/nodejs/node_modules/@openagents-org/agent-launcher")
  fs.mkdirSync(global, { recursive: true })
  fs.writeFileSync(path.join(global, "package.json"), '{"version":"99.0.0"}')
})
afterEach(() => fs.rmSync(dir, { recursive:true, force:true }))
async function resolve() { return (await import("./runtime")).resolveCoreLocation(options) }
describe("fixed packaged core", () => {
  it("loads the verified bundled core regardless of a newer official cache", async () => {
    const core = await resolve()
    expect(core).toMatchObject({ directory:fs.realpathSync(path.join(options.resourcesPath,"aghub-core")), version:"0.2.196", sourceSha:"c".repeat(40) })
    expect(require(core.entrypoints.main)).toEqual({ own:true })
  })
  it("fails on corrupted bundled code without falling back to a newer cache", async () => {
    fs.writeFileSync(path.join(options.resourcesPath,"aghub-core/src/index.js"), 'module.exports = { own:false };')
    await expect(resolve()).rejects.toThrow(/hash/i)
  })
  it("rejects a changed external CLI manifest", async () => {
    fs.writeFileSync(path.join(options.resourcesPath,"aghub-core-manifest.json"), '{}')
    await expect(resolve()).rejects.toThrow(/manifest/i)
  })
  it("does not adopt an arbitrary development path in a packaged app", async () => {
    process.env.AGHUB_DEV_CORE = path.join(dir,".openagents")
    try { expect((await resolve()).directory).toBe(fs.realpathSync(path.join(options.resourcesPath,"aghub-core"))) }
    finally { delete process.env.AGHUB_DEV_CORE }
  })
  it("fails on a missing packaged core even if an upstream cache exists", async () => {
    fs.rmSync(path.join(options.resourcesPath,"aghub-core"), { recursive:true })
    await expect(resolve()).rejects.toThrow(/ENOENT|missing/i)
  })
})
