// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { createHash } from "node:crypto"

let root: string
let manifest: Record<string, any>
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
async function resolve() {
  const { resolveVerifiedCore } = await import("./core-manifest")
  return resolveVerifiedCore(manifest, root)
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "aghub 中文 core "))
  fs.mkdirSync(path.join(root, "src"))
  fs.mkdirSync(path.join(root, "bin"))
  const files = {
    "package.json": '{"name":"@zaiyemeiyou/aghub-connector","version":"0.2.196","main":"src/index.js","bin":{"agn":"bin/agent-connector.js"}}',
    "src/index.js": 'module.exports = { owned: true };\n',
    "bin/agent-connector.js": '#!/usr/bin/env node\nconsole.log("owned");\n',
  }
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(root, name), bytes)
  manifest = { schemaVersion: 1, connectorVersion: "0.2.196", sourceSha: "a".repeat(40),
    entrypoints: { main: "src/index.js", cli: "bin/agent-connector.js" },
    hashes: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, hash(v)])) }
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe("verified core release boundary", () => {
  it("resolves an exact release under Chinese and spaced paths", async () => {
    const core = await resolve()
    expect(core).toMatchObject({ directory: fs.realpathSync(root), version: "0.2.196", sourceSha: "a".repeat(40) })
    expect(core.entrypoints.cli).toBe(path.join(fs.realpathSync(root), "bin", "agent-connector.js"))
  })
  it("rejects same-version modified source", async () => {
    fs.writeFileSync(path.join(root, "src/index.js"), "module.exports = { upstream: true };")
    await expect(resolve()).rejects.toThrow(/hash/i)
  })
  it("rejects a missing CLI instead of falling back", async () => {
    fs.unlinkSync(path.join(root, "bin/agent-connector.js"))
    await expect(resolve()).rejects.toThrow(/missing|file|ENOENT/i)
  })
  it("rejects unlisted files which could shadow dependencies", async () => {
    fs.writeFileSync(path.join(root, "src/ws.js"), "module.exports = {}")
    await expect(resolve()).rejects.toThrow(/unexpected|unlisted/i)
  })
  it.each(["../outside.js", "src/../../outside.js", "C:/outside.js", "src\\index.js"])("rejects unsafe path %s", async unsafe => {
    manifest.hashes[unsafe] = hash("")
    await expect(resolve()).rejects.toThrow(/path/i)
  })
  it("rejects symlinked directories instead of trusting their targets", async () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "aghub-target-"))
    try {
      fs.symlinkSync(target, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir")
      await expect(resolve()).rejects.toThrow(/link/i)
    } finally { fs.rmSync(target, { recursive: true, force: true }) }
  })
  it("rejects an unlisted executable entrypoint", async () => {
    manifest.entrypoints.cli = "src/not-approved.js"
    await expect(resolve()).rejects.toThrow(/entry|listed/i)
  })
  it.each([0, 2, "1"])("rejects unknown manifest schema %s", async schema => {
    manifest.schemaVersion = schema
    await expect(resolve()).rejects.toThrow(/schema/i)
  })
  it("rejects a missing source commit", async () => {
    manifest.sourceSha = "unknown"
    await expect(resolve()).rejects.toThrow(/source/i)
  })
  it("rejects package/manifest version disagreement", async () => {
    manifest.connectorVersion = "9.9.9"
    await expect(resolve()).rejects.toThrow(/version/i)
  })
})
