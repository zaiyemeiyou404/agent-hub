import { contextBridge, ipcRenderer } from "electron"
import { DEFAULT_THEME_MODE, WORKSPACE_THEME_KEY } from "../shared/appearance-bridge"

/**
 * Preload for the workspace the launcher hosts — the only thing that crosses
 * from the launcher into that app.
 *
 * It does three things, all of them before the page's first script runs:
 *
 *  - plants the signed-in session where the workspace already looks for it
 *    (`localStorage.oa_workspace_session`), so the app comes up signed in with
 *    no web code aware it is inside a desktop app
 *  - hands over the API base, so a self-hosted endpoint is a setting rather
 *    than a rebuild, and the web origin, so links shared from inside the app
 *    open outside it
 *  - hands over the look and feel — dark or light, and which language — so the
 *    two halves of one window cannot disagree about either
 *
 * All of it synchronously. Each has to be in place before the page reads it:
 * an async round-trip lands a frame late, which is a signed-out gate that
 * flashes, or a flash of the wrong theme.
 *
 * The session flows one way. Main owns the account; the page is told when it
 * changes and never reports its own storage back, so nothing the page does to
 * that storage — expiring a copy, clearing it on a failed callback — can sign
 * the whole app out. Signing in and out are explicit requests to main.
 */

/**
 * Declared rather than pulled in from the DOM lib: this project's main/preload
 * tsconfig deliberately excludes DOM types (main must not reach for browser
 * globals), and this file needs a few members of two of them.
 */
declare const window: {
  localStorage: {
    getItem: (key: string) => string | null
    setItem: (key: string, value: string) => void
    removeItem: (key: string) => void
  }
}

const SESSION_KEY = "oa_workspace_session"

interface EmbeddedSession {
  apiBase: string
  token: string
  email: string
  displayName: string | null
  expiresAt: number
}

interface HostConfig {
  session: EmbeddedSession | null
  apiUrl?: string
  webUrl?: string
  authUrl?: string
  devLoopback?: boolean
  theme: "light" | "dark" | "system"
  locale: string
}

let config: HostConfig | null = null

try {
  config = ipcRenderer.sendSync("workspace-view:config") as HostConfig

  // Expose only explicit service configuration; the page has no Node process
  // or official defaults to fall back to.
  contextBridge.exposeInMainWorld("__OA_API_URL__", config?.apiUrl || "")
  contextBridge.exposeInMainWorld("__OA_AUTH_URL__", config?.authUrl || "")
  contextBridge.exposeInMainWorld("__OA_DEV_LOOPBACK__", config?.devLoopback ? "1" : "")

  // The bundle's own origin is `openagents://workspace`, which nothing outside
  // this app can open. Links the page hands out — the QR code a phone scans, a
  // copied share link — carry this one instead (see lib/share-origin.ts).
  contextBridge.exposeInMainWorld("__OA_WEB_URL__", config?.webUrl || "")

  // Main destroys this view and wipes its storage whenever the account ends,
  // so a view that exists always belongs to a signed-in account.
  const initialSession = config?.session
  if (isCurrentSession(initialSession)) storeSession(initialSession)
  else window.localStorage.removeItem(SESSION_KEY)

  // next-themes reads this key as it initialises. Writing it here rather than
  // letting the page settle into its own choice is what keeps the window from
  // being dark on one side of the strip and light on the other.
  if (config?.theme) window.localStorage.setItem(WORKSPACE_THEME_KEY, config.theme)
} catch (err) {
  // None of this is fatal: the app falls back to its own sign-in gate and its
  // own stored preferences, which is exactly what a browser visitor gets.
  console.error("workspace host handoff failed:", err)
}

/**
 * A renewed session, stored before anyone hears of it so a later load of the
 * app — the router's route restore, a reload — reads the current token.
 */
ipcRenderer.on("workspace-view:session", (_e, session: EmbeddedSession) => {
  if (!isCurrentSession(session)) return
  storeSession(session)
})

function isCurrentSession(session: EmbeddedSession | null | undefined): session is EmbeddedSession {
  return Boolean(config?.apiUrl && session?.apiBase === config.apiUrl && session?.token)
}

function storeSession(session: EmbeddedSession): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    /* The page's own copy is still updated through onSession. */
  }
}

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const handler = (_e: unknown, value: T): void => callback(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

/**
 * What the hosted app can ask of the launcher.
 *
 * A narrow bridge for account actions, local device setup, and appearance.
 * Shared components use it only when present; the web app keeps its own behavior.
 */
contextBridge.exposeInMainWorld("__oaHost__", {
  openComputer: () => ipcRenderer.send("workspace-view:open-computer"),
  signIn: () => ipcRenderer.send("workspace-view:sign-in"),
  signOut: () => ipcRenderer.send("workspace-view:sign-out"),
  connectComputer: (workspaceId: string) => ipcRenderer.invoke("workspace-view:connect-computer", workspaceId),
  getComputerStatus: (workspaceId: string) => ipcRenderer.invoke("workspace-view:computer-status", workspaceId),
  notifyAgentReply: (input: { workspaceId: string; sessionId: string; eventId: string; sender: string; content: string }) =>
    ipcRenderer.send("workspace-view:agent-reply", input),
  /** The account's session changed in main (a renewal). Returns an unsubscribe function. */
  onSession: (callback: (session: EmbeddedSession) => void) =>
    subscribe("workspace-view:session", (session: EmbeddedSession) => {
      if (isCurrentSession(session)) callback(session)
    }),
  /** A launcher notice to show here, where the launcher's own toasts cannot be seen. */
  onNotice: (callback: (notice: { message: string; type: string }) => void) =>
    subscribe("workspace-view:notice", callback),
  appearance: {
    theme: config?.theme ?? DEFAULT_THEME_MODE,
    locale: config?.locale ?? "en-US",
  },
  /** The app changed its own theme; tell the launcher so the strip follows. */
  setTheme: (theme: string) =>
    ipcRenderer.send("workspace-view:theme-changed", theme),
  /** Likewise for language. */
  setLocale: (locale: string) =>
    ipcRenderer.send("workspace-view:locale-changed", locale),
  /** The launcher changed one of them. Returns an unsubscribe function. */
  onAppearance: (callback: (next: { theme: string; locale: string }) => void) =>
    subscribe("workspace-view:appearance", callback),
})
