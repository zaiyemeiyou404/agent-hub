const SECRET_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "session_token",
  "custom_token",
  "ct",
  "password",
  "workspace_token",
])

function stripPairs(query: string): string {
  const params = new URLSearchParams(query)
  for (const key of [...params.keys()]) {
    if (SECRET_KEYS.has(key.toLowerCase())) params.delete(key)
  }
  return params.toString()
}

/** Drop credential query keys. Does not read or modify the fragment. */
export function redactQuery(url: string): string {
  const parts = new URL(url)
  parts.search = stripPairs(parts.search.replace(/^\?/, ""))
  return parts.toString()
}

/** Drop credential keys in the fragment. Does not modify the query. */
export function redactFragment(url: string): string {
  const hashAt = url.indexOf("#")
  if (hashAt < 0) return url
  const before = url.slice(0, hashAt)
  const fragment = url.slice(hashAt + 1)
  let next = fragment
  const q = fragment.indexOf("?")
  if (q >= 0) {
    const stripped = stripPairs(fragment.slice(q + 1))
    next = fragment.slice(0, q) + (stripped ? `?${stripped}` : "")
  } else if (fragment.includes("=")) {
    next = stripPairs(fragment)
  }
  return `${before}#${next}`
}

/** Free-form diagnostic text. Not parsed as a URL. */
export function redactDiagnostic(text: string): string {
  return text
    .replace(/("(?:refresh_token|access_token|token|custom_token|identity_token|session_token|password|api_key|apiKey|authorization|workspace_token|secret|stream_ticket|ticket)"\s*:\s*")([^"]*)(")/gi, "$1[redacted]$3")
    .replace(/(bearer\s+)\S+/gi, "$1[redacted]")
    .replace(/\boa_(?:at|rt|st)_[A-Za-z0-9_\-]+/g, "[redacted]")
    .replace(/([?#&](?:token|access_token|refresh_token|session_token|custom_token|ct|password|workspace_token)=)[^&#\s]+/gi, "$1[redacted]")
}

export function diagnosticLine(kind: "query" | "fragment" | "diagnostic", value: string): string {
  if (kind === "query") return redactQuery(value)
  if (kind === "fragment") return redactFragment(value)
  return redactDiagnostic(value)
}
