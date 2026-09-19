import fs from "fs"
import path from "path"

import * as yaml from "js-yaml"

import { JWT_ISSUER } from "@/servers/middlewares/jwt"

// Must match the default of ADMIN_API_JWT_AUDIENCE in src/config/env.ts.
// The admin API verifies `aud` against that value, so every oathkeeper config
// that mints admin tokens has to emit the same claim or all admin calls 401.
const EXPECTED_ADMIN_AUDIENCE = "galoy-admin"

const REPO_ROOT = path.resolve(__dirname, "../../../../..")

// Both configs boot a working stack; CI only exercises `dev/`, so a stale
// `quickstart/` mutator would otherwise ship silently.
const OATHKEEPER_RULE_FILES = [
  "dev/config/ory/oathkeeper_rules.yaml",
  "quickstart/dev/config/ory/oathkeeper_rules.yaml",
]

type OathkeeperRule = {
  id: string
  mutators?: { handler: string; config?: { claims?: string } }[]
}

const loadRules = (relPath: string): OathkeeperRule[] => {
  const raw = fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8")
  return yaml.load(raw) as OathkeeperRule[]
}

const adminIdTokenClaims = (rules: OathkeeperRule[]): Record<string, unknown> => {
  const admin = rules.find((rule) => rule.id === "admin-backend")
  if (!admin) throw new Error("no admin-backend rule")

  const idToken = (admin.mutators || []).find((m) => m.handler === "id_token")
  if (!idToken?.config?.claims) throw new Error("admin-backend has no id_token claims")

  // Go template placeholders live inside JSON string values, so the claims
  // template is itself valid JSON.
  return JSON.parse(idToken.config.claims)
}

describe("admin API JWT audience: issuer/verifier consistency", () => {
  it("middleware issuer is the oathkeeper issuer", () => {
    expect(JWT_ISSUER).toBe("galoy.io")
  })

  describe.each(OATHKEEPER_RULE_FILES)("%s", (relPath) => {
    const claims = adminIdTokenClaims(loadRules(relPath))

    it("admin-backend id_token mints the audience the admin API requires", () => {
      expect(claims.aud).toBe(EXPECTED_ADMIN_AUDIENCE)
    })

    it("admin-backend id_token still carries sub and scope", () => {
      expect(claims.sub).toBe("{{ print .Subject }}")
      expect(claims.scope).toBe("{{ print .Extra.scope }}")
    })
  })
})
