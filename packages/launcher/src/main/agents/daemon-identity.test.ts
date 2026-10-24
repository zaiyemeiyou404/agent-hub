// @vitest-environment node
import { describe, expect, it } from "vitest"
describe("existing daemon ownership", () => {
  const expected = {directory:"G:/候选 core", version:"0.2.196", sourceSha:"a".repeat(40)}
  it("accepts only matching directory, source commit and version", async () => {
    const { assertDaemonCoreIdentity } = await import("./daemon-identity")
    expect(() => assertDaemonCoreIdentity({core:expected}, expected)).not.toThrow()
    for (const core of [undefined, {...expected,version:"9.9.9"}, {...expected,sourceSha:"b".repeat(40)}, {...expected,directory:"G:/official"}]) {
      expect(() => assertDaemonCoreIdentity({core}, expected)).toThrow(/incompatible|identity/i)
    }
  })
})
