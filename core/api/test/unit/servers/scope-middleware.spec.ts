/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectAccess"] }] */
jest.mock("@/graphql/public", () => ({
  queryFields: { authed: { atAccountLevel: { me: {} }, atWalletLevel: {} } },
  mutationFields: {
    authed: {
      atAccountLevel: {},
      atWalletLevel: {
        send: { lnInvoicePaymentSend: {} },
        receive: { lnInvoiceCreate: {} },
      },
    },
  },
}))

import { GraphQLResolveInfo } from "graphql"

import { scopeMiddleware } from "@/servers/middlewares/scope"

const readField = "me"
const sendField = "lnInvoicePaymentSend"
const receiveField = "lnInvoiceCreate"

const RESOLVED = { resolved: true }
const resolve = jest.fn(async () => RESOLVED)

const run = async (
  kind: "read" | "send" | "receive",
  context: { scope?: string[]; sessionId?: string; appId?: string },
) => {
  const authorize =
    kind === "read"
      ? scopeMiddleware.Query[readField]
      : scopeMiddleware.Mutation[kind === "send" ? sendField : receiveField]
  const result = await authorize(
    resolve,
    undefined,
    {},
    context as unknown as GraphQLPublicContextAuth,
    {} as GraphQLResolveInfo,
  )
  return result === RESOLVED
}

const expectAccess = async (
  context: { scope?: string[]; sessionId?: string; appId?: string },
  expected: { read: boolean; send: boolean; receive: boolean },
) => {
  expect(await run("read", context)).toBe(expected.read)
  expect(await run("send", context)).toBe(expected.send)
  expect(await run("receive", context)).toBe(expected.receive)
}

describe("scopeMiddleware", () => {
  beforeEach(() => resolve.mockClear())

  it("trusts empty scope for a kratos session", async () => {
    await expectAccess(
      { scope: [], sessionId: "session-id" },
      { read: true, send: true, receive: true },
    )
  })

  it("allows read and write for dashboard oauth", async () => {
    await expectAccess(
      { scope: ["read", "write"], appId: "dashboard" },
      { read: true, send: true, receive: true },
    )
  })

  it("allows only read for a read-only oauth token", async () => {
    await expectAccess(
      { scope: ["read"], appId: "client" },
      { read: true, send: false, receive: false },
    )
  })

  it("rejects an oauth token with an empty scope", async () => {
    await expectAccess(
      { scope: [], appId: "client" },
      { read: false, send: false, receive: false },
    )
    await expectAccess(
      { scope: undefined, appId: "client" },
      { read: false, send: false, receive: false },
    )
  })

  it("allows payments for a write api key", async () => {
    await expectAccess(
      { scope: ["read", "write"] },
      { read: true, send: true, receive: true },
    )
  })

  it("keeps read and receive api keys restricted", async () => {
    await expectAccess({ scope: ["read"] }, { read: true, send: false, receive: false })
    await expectAccess(
      { scope: ["receive"] },
      { read: false, send: false, receive: true },
    )
  })

  it("rejects an empty scope without a session", async () => {
    await expectAccess({ scope: [] }, { read: false, send: false, receive: false })
  })
})
