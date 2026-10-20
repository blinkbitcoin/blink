jest.mock("@/app", () => ({
  Accounts: {
    getAccountFromUserId: jest.fn(),
    updateAccountIPsInfo: jest.fn(),
  },
  InactivityFee: { recordActivity: jest.fn() },
  Transactions: { getTransactionsMetadataByIds: jest.fn() },
}))

jest.mock("@/app/authentication", () => ({
  maybeExtendSession: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: { findUserById: jest.fn() },
  UsersRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findUserById,
  }),
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
}))

import { Accounts, InactivityFee } from "@/app"
import { CouldNotFindAccountFromKratosIdError } from "@/domain/errors"
import { sessionPublicContext } from "@/servers/middlewares/session"
import {
  addAttributesToCurrentSpan,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

const { __mocks: mongooseMocks } = jest.requireMock("@/services/mongoose")

const USER_ID = "0d8c2a4e-5b1f-4c3a-9e7d-2f6b8a1c3d5e"
const OTHER_ID = "7f3e9b2a-1c4d-4e8f-a6b5-9d0c2e4f6a8b"
const APP_ID = "dashboard-client"

const account = {
  id: "account-id",
  kratosUserId: USER_ID,
  lastActivityAt: new Date(),
  username: "alice",
} as unknown as Account
const user = { id: USER_ID } as unknown as User

const run = (tokenPayload: Record<string, unknown>) =>
  sessionPublicContext({
    tokenPayload,
    ip: undefined,
    userAgent: undefined,
  })

beforeEach(() => {
  jest.clearAllMocks()
  ;(Accounts.getAccountFromUserId as jest.Mock).mockImplementation(async (id) =>
    id === USER_ID ? account : new CouldNotFindAccountFromKratosIdError(id),
  )
  ;(InactivityFee.recordActivity as jest.Mock).mockResolvedValue(true)
  mongooseMocks.findUserById.mockResolvedValue(user)
})

const expectAnonymous = (ctx: GraphQLPublicContext | GraphQLPublicContextAuth) => {
  expect(ctx).not.toHaveProperty("domainAccount")
  expect(ctx).not.toHaveProperty("user")
  expect(ctx.sessionId).toBeUndefined()
}

describe("sessionPublicContext", () => {
  it("treats a client_credentials token matching a user as anonymous", async () => {
    const ctx = await run({ sub: USER_ID, client_id: USER_ID, scope: "read write" })

    expectAnonymous(ctx)
    expect(Accounts.getAccountFromUserId).not.toHaveBeenCalled()
    expect(InactivityFee.recordActivity).not.toHaveBeenCalled()
    expect(Accounts.updateAccountIPsInfo).not.toHaveBeenCalled()
    expect(mongooseMocks.findUserById).not.toHaveBeenCalled()
    expect(addAttributesToCurrentSpan).toHaveBeenCalledWith({
      "token.clientCredentialsSubject": "true",
    })
  })

  it("treats a client_credentials token not matching a user as anonymous without a critical error", async () => {
    const ctx = await run({ sub: OTHER_ID, client_id: OTHER_ID, scope: "read write" })

    expectAnonymous(ctx)
    expect(Accounts.getAccountFromUserId).not.toHaveBeenCalled()
    expect(recordExceptionInCurrentSpan).not.toHaveBeenCalled()
    expect(addAttributesToCurrentSpan).toHaveBeenCalledWith({
      "token.clientCredentialsSubject": "true",
    })
  })

  it("authenticates an authorization_code token as its user", async () => {
    const ctx = (await run({
      sub: USER_ID,
      client_id: APP_ID,
      scope: "read write",
    })) as GraphQLPublicContextAuth

    expect(ctx.domainAccount).toBe(account)
    expect(ctx.user).toBe(user)
    expect(ctx.appId).toBe(APP_ID)
    expect(Accounts.getAccountFromUserId).toHaveBeenCalledWith(USER_ID)
    expect(addAttributesToCurrentSpan).not.toHaveBeenCalled()
  })

  it.each([
    ["kratos session", { sub: USER_ID, session_id: "session-id", expires_at: "x" }],
    ["kratos session, empty client_id", { sub: USER_ID, session_id: "s", client_id: "" }],
    ["api key", { sub: USER_ID, scope: "read", api_key_id: "key-id" }],
    ["placeholder client_id", { sub: USER_ID, client_id: "<no value>" }],
  ])("authenticates a %s unchanged", async (_name, tokenPayload) => {
    const ctx = (await run(tokenPayload)) as GraphQLPublicContextAuth

    expect(ctx.domainAccount).toBe(account)
    expect(ctx.user).toBe(user)
    expect(Accounts.getAccountFromUserId).toHaveBeenCalledWith(USER_ID)
    expect(addAttributesToCurrentSpan).not.toHaveBeenCalled()
  })

  it("keeps anonymous requests anonymous", async () => {
    const ctx = await run({ sub: "anon", client_id: "" })

    expect("domainAccount" in ctx && ctx.domainAccount).toBeFalsy()
    expect("user" in ctx && ctx.user).toBeFalsy()
    expect(Accounts.getAccountFromUserId).not.toHaveBeenCalled()
    expect(addAttributesToCurrentSpan).not.toHaveBeenCalled()
  })
})
