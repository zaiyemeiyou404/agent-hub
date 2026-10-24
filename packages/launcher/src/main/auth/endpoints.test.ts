import { describe, expect, it } from "vitest"

import { ConfigurationRequiredError } from "./service-endpoints"
import { accountApiBase, apiBase, webBase } from "./endpoints"

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
