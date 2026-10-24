import { describe, expect, it } from "vitest"

import {
  ConfigurationRequiredError,
  DEV_API_BASE,
  DEV_WEB_BASE,
  resolveServiceUrl,
  tokenForService,
  updateFeedOrNull,
} from "./service-endpoints"

const https = { apiBase: "https://api.example.com", webBase: "https://web.example.com", authBase: "https://auth.example.com" }

describe("independent service endpoints", () => {
  it("returns configuration_required when a required base is missing", () => {
    expect(() => resolveServiceUrl(undefined, "api", {})).toThrow(ConfigurationRequiredError)
    expect(() => resolveServiceUrl("", "web", {})).toThrow(ConfigurationRequiredError)
    expect(() => resolveServiceUrl("   ", "auth", {})).toThrow(ConfigurationRequiredError)
  })

  it("rejects a non-dev HTTP URL and does not invent an official host", () => {
    expect(() => resolveServiceUrl("http://example.com", "api", {})).toThrow(ConfigurationRequiredError)
    expect(() => resolveServiceUrl("http://127.0.0.1:18000", "api", {})).toThrow(ConfigurationRequiredError)
    expect(() => resolveServiceUrl("not a url", "auth", {})).toThrow(ConfigurationRequiredError)
  })

  it("accepts the explicit dev loopback contract only when development mode is on", () => {
    const env = { AGHUB_DEV_LOOPBACK: "1" }
    expect(resolveServiceUrl(DEV_API_BASE, "api", env)).toBe(DEV_API_BASE)
    expect(resolveServiceUrl(DEV_API_BASE, "auth", env)).toBe(DEV_API_BASE)
    expect(resolveServiceUrl(DEV_WEB_BASE, "web", env)).toBe(DEV_WEB_BASE)
    expect(() => resolveServiceUrl("http://127.0.0.1:3001", "web", env)).toThrow(ConfigurationRequiredError)
    expect(resolveServiceUrl(https.apiBase, "api", {})).toBe(https.apiBase)
  })

  it("does not send a credential minted for one service to another", () => {
    const stored = { apiBase: "https://old.example.com", token: "old-token" }
    expect(tokenForService(stored, "https://new.example.com")).toBeNull()
    expect(tokenForService(stored, "https://old.example.com")).toBe("old-token")
    expect(tokenForService({ apiBase: "", token: "orphan" }, https.apiBase)).toBeNull()
  })

  it("does not produce an official update URL when updates are off or the feed is official", () => {
    expect(updateFeedOrNull("https://dl.openagents.org/launcher/stable", false)).toBeNull()
    expect(updateFeedOrNull("https://dl.openagents.org/launcher/stable", true)).toBeNull()
    expect(updateFeedOrNull(undefined, true)).toBeNull()
    expect(updateFeedOrNull("https://updates.example.com/launcher", true)).toBe("https://updates.example.com/launcher")
  })
})
