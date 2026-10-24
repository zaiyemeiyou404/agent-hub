import React from "react"

import { useThemeStore } from "@renderer/store/theme"
import { cn } from "@renderer/lib/utils"

/**
 * The OpenAgents mark. One component so the rail, the About card and anything
 * added later cannot drift onto different artwork.
 *
 * The mark ships as a black and a white cut-out (`src/renderer/public/`),
 * referenced RELATIVELY: production loads index.html over file://, where a
 * leading slash resolves to the filesystem root.
 */
export function BrandMark({
  className,
  variant = "auto",
}: {
  /** Size it with `size-*`; the logo is transparent and needs no backdrop. */
  className?: string
  /**
   * Which cut-out to paint. `auto` follows the theme and is right on any
   * surface built from the theme tokens. Pin it to `white` on the surfaces
   * that stay dark in both themes — the rail and the onboarding sidebar — and
   * to `black` on ones that stay light.
   */
  variant?: "auto" | "black" | "white"
}): React.JSX.Element {
  const resolved = useThemeStore((s) => s.resolved)
  const dark = variant === "auto" ? resolved === "dark" : variant === "white"

  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="AgentHub"
      className={cn("shrink-0 select-none", dark ? "text-white" : "text-black", className)}>
      <path d="M16 16 6 6m10 10L26 6M16 16 6 26m10-10 10 10" stroke="currentColor" strokeWidth="3" />
      <circle cx="16" cy="16" r="6" fill="currentColor" />
      <circle cx="6" cy="6" r="4" fill="currentColor" />
      <circle cx="26" cy="6" r="4" fill="currentColor" />
      <circle cx="6" cy="26" r="4" fill="currentColor" />
      <circle cx="26" cy="26" r="4" fill="currentColor" />
    </svg>
  )
}
