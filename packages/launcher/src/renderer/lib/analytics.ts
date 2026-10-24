import posthog from "posthog-js"

export function initAnalytics(): void {
  const key = process.env.AGHUB_POSTHOG_KEY
  const host = process.env.AGHUB_POSTHOG_HOST
  if (process.env.AGHUB_ANALYTICS !== "1" || !key || !host || host.includes("openagents.org")) {
    return
  }
  posthog.init(key, {
    api_host: host,
    person_profiles: "identified_only",
    capture_pageview: false,
    autocapture: true,
    persistence: "localStorage",
  })
  posthog.capture("app_opened")
}

export function capture(event: string, properties?: Record<string, unknown>): void {
  posthog.capture(event, properties)
}

// Tie subsequent events to a workspace. The workspace slug is the join key that connects
// this install's onboarding to the website + workspace funnel stages for the same workspace.
export function group(groupType: string, groupKey: string, properties?: Record<string, unknown>): void {
  posthog.group(groupType, groupKey, properties)
}
