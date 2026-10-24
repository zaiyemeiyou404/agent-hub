import { afterEach, describe, expect, it, vi } from "vitest"

import { ConfigurationRequiredError } from "./service-endpoints"
import { accountApiBase, apiBase, webBase, loginBase, setServiceConfiguration } from "./endpoints"

afterEach(() => { setServiceConfiguration(undefined); vi.unstubAllEnvs() })

it("restores all saved origins and prefers the saved auth service to old environment values", () => {
  vi.stubEnv("OPENAGENTS_ACCOUNT_API_BASE", "https://old.example.test")
  setServiceConfiguration({ apiBase: "https://api.example.test", webBase: "https://web.example.test", authBase: "https://auth.example.test", devLoopback: false })
  expect(apiBase()).toBe("https://api.example.test")
  expect(webBase()).toBe("https://web.example.test")
  expect(accountApiBase()).toBe("https://auth.example.test")
  expect(loginBase()).toBe("https://auth.example.test")
})

describe("endpoints", () => {
  it("does not invent an API host when nothing is configured", () => {
    expect(() => apiBase(undefined)).toThrow(ConfigurationRequiredError)
  })

  it("keeps an explicitly configured HTTPS origin", () => {
    expect(apiBase("https://oa.internal/")).toBe("https://oa.internal")
    expect(webBase("https://oa.internal")).toBe("https://oa.internal")
  })

  it("does not rewrite one host into an official web host", () => {
    expect(webBase("https://workspace-endpoint.example.com")).toBe(
      "https://workspace-endpoint.example.com",
    )
  })
})

describe("webBase override", () => {
  it("keeps the web origin when the API origin is a different host", () => {
    process.env.OPENAGENTS_WORKSPACE_WEB_BASE = "https://web.example.com"
    try {
      expect(apiBase("https://api.example.com")).toBe("https://api.example.com")
      expect(webBase()).toBe("https://web.example.com")
    } finally {
      delete process.env.OPENAGENTS_WORKSPACE_WEB_BASE
    }
  })

  it("uses the explicit web origin rather than deriving one", () => {
    process.env.OPENAGENTS_WORKSPACE_WEB_BASE = "https://preview.example.com/"
    try {
      expect(webBase(undefined)).toBe("https://preview.example.com")
    } finally {
      delete process.env.OPENAGENTS_WORKSPACE_WEB_BASE
    }
  })
})

describe("accountApiBase", () => {
  it("is configuration_required until an auth origin is set", () => {
    expect(() => accountApiBase()).toThrow(ConfigurationRequiredError)
  })

  it("follows its override to a staging deployment", () => {
    process.env.OPENAGENTS_ACCOUNT_API_BASE = "https://staging.example.com/"
    try {
      expect(accountApiBase()).toBe("https://staging.example.com")
    } finally {
      delete process.env.OPENAGENTS_ACCOUNT_API_BASE
    }
  })
})
