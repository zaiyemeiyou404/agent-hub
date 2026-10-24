import { beforeEach, expect, it, vi } from "vitest"

const write = vi.hoisted(() => vi.fn())
vi.mock("electron", () => ({ app: { getPath: () => "G:/synthetic-profile" } }))
vi.mock("fs", () => ({ default: { existsSync: () => false } }))
vi.mock("./atomic-json", () => ({ writeJsonAtomic: write }))
import { Store } from "./store"

beforeEach(() => { write.mockReset() })
it("keeps the active settings unchanged when the atomic write fails", () => {
  const store = new Store({ workspaceEndpoint: "https://old.example.test" })
  write.mockImplementation(() => { throw new Error("disk full") })
  expect(() => store.setChecked({ workspaceEndpoint: "https://new.example.test" })).toThrow("disk full")
  expect(store.get("workspaceEndpoint")).toBe("https://old.example.test")
})
it("persists all service origins and the Connector endpoint together", () => {
  const store = new Store({ unrelatedPreference: true })
  const values = { serviceOrigins: { apiBase: "https://new.example.test" }, workspaceEndpoint: "https://new.example.test" }
  store.setChecked(values)
  expect(write).toHaveBeenCalledWith(expect.any(String), { unrelatedPreference: true, ...values })
  expect(store.get()).toEqual({ unrelatedPreference: true, ...values })
})
