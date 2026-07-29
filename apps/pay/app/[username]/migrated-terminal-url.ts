import { env } from "@/env"

// When a username is deactivated on custodial Blink because it was migrated to
// a non-custodial account, check whether it is registered on the lnurl-server.
// If so, the user now lives on Blink Terminal, so send them there instead of
// showing an error. Returns the redirect target, or null if not migrated.
//
// Tradeoff (accepted): this probe runs on ANY username-lookup error, not just
// deactivation. The lnurl-server answers payRequest for active custodial
// usernames too, so during a transient core outage an active custodial user
// may be redirected to Terminal. That is arguably better than an error page:
// Terminal resolves custodial-first with an LNURL fallback, so the payer still
// lands on a working POS. We deliberately do NOT gate the probe on specific
// error messages — migrated usernames surface as "Account is inactive."
// (InactiveAccountError), not "Account does not exist", so a gate would need
// to match multiple message strings.
//
// `subpath`/`search` let the caller preserve the original route (e.g. /print)
// and query string (amount/memo/display, which Terminal parses) in the
// redirect target.
export const migratedTerminalUrl = async (
  username: string,
  subpath = "",
  search = "",
): Promise<string | null> => {
  try {
    const res = await fetch(
      `${env.WELL_KNOWN_LNURL_URL}/.well-known/lnurlp/${encodeURIComponent(username)}`,
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    )
    if (!res.ok) return null
    const body = await res.json()
    if (body?.tag === "payRequest") {
      return `${env.BLINK_TERMINAL_URL}/${encodeURIComponent(username)}${subpath}${search}`
    }
  } catch (err) {
    // Non-fatal by design: any probe failure falls back to the error page.
    // Warn-level: bot scans of pay.blink.sv/<random> routinely trigger this
    // path and must not spam error logs.
    console.warn("error checking lnurl-server for migrated username", err)
  }
  return null
}
