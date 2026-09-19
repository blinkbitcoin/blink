import { generateKeyPairSync } from "crypto"
import http from "http"

import express from "express"
import jsonwebtoken from "jsonwebtoken"

import { buildJwtMiddleware } from "@/servers/middlewares/jwt"

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString()

const signToken = (payload: Record<string, unknown>) =>
  jsonwebtoken.sign(payload, privateKey, {
    algorithm: "RS256",
    issuer: "galoy.io",
    expiresIn: "1h",
  })

const startApp = async (audience?: string) => {
  const app = express()
  app.use(buildJwtMiddleware({ secret: publicKeyPem, audience }))
  app.get("/probe", (_req, res) => res.json({ ok: true }))
  app.use(
    (
      err: { status?: number; code?: string },
      _req: express.Request,
      res: express.Response,
    ) => res.status(err.status || 500).json({ error: err.code }),
  )
  const server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("no address")
  return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

const probe = async (baseUrl: string, token?: string) => {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${baseUrl}/probe`, { headers })
  return res.status
}

describe("buildJwtMiddleware", () => {
  describe("public api (no audience configured)", () => {
    let server: http.Server
    let baseUrl: string

    beforeAll(async () => {
      ;({ server, baseUrl } = await startApp())
    })

    afterAll(() => server.close())

    it("accepts a user token without an aud claim", async () => {
      const token = signToken({ sub: "user-id" })
      expect(await probe(baseUrl, token)).toBe(200)
    })
  })

  describe("admin api (audience configured)", () => {
    let server: http.Server
    let baseUrl: string

    beforeAll(async () => {
      ;({ server, baseUrl } = await startApp("galoy-admin"))
    })

    afterAll(() => server.close())

    it("rejects a request without a token", async () => {
      expect(await probe(baseUrl)).toBe(401)
    })

    it("rejects a user token without an aud claim", async () => {
      const token = signToken({ sub: "user-id" })
      expect(await probe(baseUrl, token)).toBe(401)
    })

    it("rejects a token with a different audience", async () => {
      const token = signToken({ sub: "user-id", aud: "galoy-public" })
      expect(await probe(baseUrl, token)).toBe(401)
    })

    it("accepts a token with the admin audience", async () => {
      const token = signToken({ sub: "admin@blink.sv", aud: "galoy-admin" })
      expect(await probe(baseUrl, token)).toBe(200)
    })
  })
})
