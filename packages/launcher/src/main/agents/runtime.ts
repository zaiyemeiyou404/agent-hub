/**
 * Finding the pieces the launcher runs agents with: the agent-launcher core,
 * a node binary that actually launches, and a way to invoke npm.
 */
import path from "path"
import fs from "fs"
import { execFile, spawnSync } from "child_process"
import { readPathEnv, withPathEnv } from "../env"
import { resolveVerifiedCore, type VerifiedCore } from "./core-manifest"
import { CONFIG_DIR, PORTABLE_NODE_DIR } from "./paths"

/** The install-command key for this OS, as the shared registry spells it. */
export function platformKey(): "macos" | "linux" | "windows" {
  if (process.platform === "darwin") return "macos"
  if (process.platform === "win32") return "windows"
  return "linux"
}

/** Legacy asar path utility; executable core now lives in a fixed resource. */
export function unpackedPath(p: string): string {
  return p.includes("app.asar") && !p.includes("app.asar.unpacked") ? p.replace("app.asar", "app.asar.unpacked") : p
}

export interface CoreLocation {
  isPackaged: boolean
  appPath: string
  resourcesPath: string
}

/** Packaged paths are fixed by electron-builder, never by environment/cache. */
export function resolveCoreLocation(location: CoreLocation): VerifiedCore {
  const staging = path.join(location.appPath, ".aghub-core")
  const trusted = fs.readFileSync(path.join(staging, "manifest.json"))
  const directory = location.isPackaged ? path.join(location.resourcesPath, "aghub-core") : path.join(staging, "core")
  if (location.isPackaged) {
    const external = fs.readFileSync(path.join(location.resourcesPath, "aghub-core-manifest.json"))
    if (!trusted.equals(external)) throw new Error("External CLI manifest does not match the trusted application manifest")
  }
  return resolveVerifiedCore(JSON.parse(trusted.toString("utf8")), directory)
}

let verified: VerifiedCore | null = null
export function getVerifiedCore(revalidate = false): VerifiedCore {
  if (verified && !revalidate) return verified
  const { app } = require("electron")
  const isPackaged = app?.isPackaged === true
  verified = resolveCoreLocation({ isPackaged,
    appPath: isPackaged ? app.getAppPath() : path.resolve(__dirname, "../.."),
    resourcesPath: process.resourcesPath,
  })
  return verified
}

export function bundledCoreDir(): string | null {
  try { return getVerifiedCore().directory } catch { return null }
}

export function loadCore(): Record<string, unknown> | null {
  try { return require(getVerifiedCore().entrypoints.main) }
  catch (error) { console.error("AgentHub core verification/load failed; no fallback:", error); return null }
}

export function readCoreVersion(): string | null {
  try { return getVerifiedCore().version } catch { return null }
}

/**
 * Smoke-test a node binary by running `--version`. Returns false if the
 * binary is missing, blocked by Defender/SmartScreen, has an arch mismatch,
 * or any other CreateProcess failure. Used to avoid spawning the daemon with
 * a bundled node.exe that Windows refuses to load — which would otherwise
 * leave the daemon perpetually offline.
 */
export function canExecuteNode(binaryPath: string): boolean {
  try {
    const r = spawnSync(binaryPath, ["--version"], {
      timeout: 5000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    return r.status === 0 && !r.error
  } catch {
    return false
  }
}

/**
 * Resolve a working node binary, preferring the bundled portable runtime
 * when it actually launches, otherwise falling back to a system `node` on
 * PATH. Returns null if nothing works.
 */
export function resolveWorkingNode(
  portableNodeDir: string,
  enhancedPath: string,
): string | null {
  const candidates = [
    path.join(
      portableNodeDir,
      "node" + (process.platform === "win32" ? ".exe" : ""),
    ),
    path.join(portableNodeDir, "bin", "node"),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c) && canExecuteNode(c)) return c
  }
  // Bundled node missing or won't run — try the system one. PATH is walked
  // here rather than asking `where`, which prints in the OEM codepage and so
  // mangled a non-ASCII profile path (C:\Users\王…) past recognition.
  const exe = process.platform === "win32" ? "node.exe" : "node"
  for (const dir of enhancedPath.split(path.delimiter).filter(Boolean)) {
    const c = path.join(dir.replace(/^"(.*)"$/, "$1"), exe)
    if (fs.existsSync(c) && canExecuteNode(c)) return c
  }
  return null
}

/**
 * Resolve how to invoke npm for an install. Prefers running the bundled
 * `node` binary directly against `npm-cli.js` (argv passed array-style, no
 * shell) — on Windows that goes through CreateProcessW as UTF-16, so a home
 * dir with non-ASCII characters (e.g. `C:\Users\用户名\...`) is preserved
 * exactly. The legacy path (spawning `npm.cmd` via `shell:true`) instead
 * relied on a hand-written .cmd batch shim whose UTF-8 bytes cmd.exe decodes
 * with the OEM code page (936/GBK on zh-CN), corrupting the embedded node
 * path and silently breaking every install. We only fall back to that legacy
 * shell path when the bundled node / npm-cli layout is missing, so the common
 * (ASCII) case still works identically.
 */
export function resolveNpmInvocation(): {
  cmd: string
  preArgs: string[]
  useShell: boolean
} {
  const portableNodeDir = path.join(CONFIG_DIR, "nodejs")
  const exists = (p: string): boolean => {
    try {
      return fs.existsSync(p)
    } catch {
      return false
    }
  }
  const nodeBin = [
    path.join(
      portableNodeDir,
      process.platform === "win32" ? "node.exe" : "node",
    ),
    path.join(portableNodeDir, "bin", "node"),
  ].find(exists)
  if (nodeBin) {
    const npmCli = [
      path.join(portableNodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
      path.join(
        portableNodeDir,
        "lib",
        "node_modules",
        "npm",
        "bin",
        "npm-cli.js",
      ),
    ].find(exists)
    if (npmCli) return { cmd: nodeBin, preArgs: [npmCli], useShell: false }
  }
  // Bundled node/npm-cli not found — preserve legacy behaviour exactly.
  return {
    cmd: process.platform === "win32" ? "npm.cmd" : "npm",
    preArgs: [],
    useShell: true,
  }
}

/**
 * The Node that npm agents are installed and run on, as `22.22.3`: the
 * portable runtime when there is one (the binary resolveNpmInvocation hands
 * npm), otherwise the `node` an install's PATH finds. Null when neither
 * answers. Asynchronous because the detail page asks every time it opens.
 */
export function agentNodeVersion(): Promise<string | null> {
  const inv = resolveNpmInvocation()
  const bin = inv.useShell ? "node" : inv.cmd
  return new Promise((resolve) => {
    try {
      execFile(
        bin,
        ["--version"],
        {
          encoding: "utf-8",
          timeout: 5000,
          windowsHide: true,
          env: withPathEnv(PORTABLE_NODE_DIR + path.delimiter + readPathEnv()),
        },
        (err, stdout) => {
          const m = err ? null : /^v?(\d+\.\d+\.\d+)/.exec(stdout.trim())
          resolve(m ? m[1] : null)
        },
      )
    } catch {
      resolve(null)
    }
  })
}
