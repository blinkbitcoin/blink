import MockAdapter from "axios-mock-adapter"

let lnurlServerInternalUrl = "http://localhost:4455/lnurl-internal"

jest.mock("@/config", () => ({
  get LNURL_SERVER_INTERNAL_URL() {
    return lnurlServerInternalUrl
  },
}))

import { LnurlServerService, lnurlServerClient } from "@/services/lnurl-server"
import {
  LnurlServerBadRequestError,
  LnurlServerMissingInternalUrlError,
  LnurlServerNotFoundError,
  LnurlServerUnavailableError,
  UnknownLnurlServerServiceError,
} from "@/domain/lnurl-server"

/* eslint @typescript-eslint/ban-ts-comment: "off" */
let mock: MockAdapter

beforeAll(() => {
  mock = new MockAdapter(lnurlServerClient)
})

afterEach(() => {
  // @ts-ignore-next-line no-implicit-any error
  mock.reset()
  lnurlServerInternalUrl = "http://localhost:4455/lnurl-internal"
})

const lnurlServerService = (): ILnurlServerService => {
  const service = LnurlServerService()

  if (service instanceof LnurlServerMissingInternalUrlError) {
    throw service
  }

  return service
}

describe("LnurlServerService", () => {
  it("returns typed error when LNURL_SERVER_INTERNAL_URL is empty", () => {
    lnurlServerInternalUrl = ""

    const result = LnurlServerService()

    expect(result).toBeInstanceOf(LnurlServerMissingInternalUrlError)
    expect((result as LnurlServerMissingInternalUrlError).message).toBe(
      "LNURL_SERVER_INTERNAL_URL is empty",
    )
  })

  it("creates a Blink account and maps snake_case fields", async () => {
    const response = {
      account_id: "acct_blink_123",
      provider: "blink",
      blink_account_id: "blink_account_123" as AccountId,
      btc_wallet_id: "btc_wallet_123" as WalletId,
      usd_wallet_id: "usd_wallet_123" as WalletId,
      default_wallet: "usd",
      domain: "example.com",
      identifiers: [{ identifier: "alice", kind: "username", description: "Alice" }],
    }

    mock.onPost("/internal/blink/accounts").reply((config: { data?: string }) => {
      expect(JSON.parse(config.data ?? "{}")).toEqual({
        domain: "example.com",
        blink_account_id: "blink_account_123",
        btc_wallet_id: "btc_wallet_123",
        usd_wallet_id: "usd_wallet_123",
        default_wallet: "usd",
        description: "Alice",
        identifiers: ["alice"],
      })

      return [200, response]
    })

    const result = await lnurlServerService().createBlinkAccount({
      domain: "example.com",
      blinkAccountId: "blink_account_123" as AccountId,
      btcWalletId: "btc_wallet_123" as WalletId,
      usdWalletId: "usd_wallet_123" as WalletId,
      defaultWallet: "usd",
      description: "Alice",
      identifiers: ["alice"],
    })

    expect(result).toEqual({
      accountId: "acct_blink_123",
      provider: "blink",
      blinkAccountId: "blink_account_123",
      btcWalletId: "btc_wallet_123",
      usdWalletId: "usd_wallet_123",
      defaultWallet: "usd",
      domain: "example.com",
      identifiers: [{ identifier: "alice", kind: "username", description: "Alice" }],
    })
  })

  it("updates a Blink account default wallet and URL-encodes the account id", async () => {
    const encodedPath = "/internal/blink/accounts/blink_account_123%2Fusd"

    mock.onPatch(encodedPath).reply((config: { data?: string }) => {
      expect(JSON.parse(config.data ?? "{}")).toEqual({
        default_wallet: "btc",
      })

      return [
        200,
        {
          account_id: "acct_blink_123",
          provider: "blink",
          blink_account_id: "blink_account_123/usd" as AccountId,
          default_wallet: "btc",
        },
      ]
    })

    const result = await lnurlServerService().updateDefaultWallet({
      accountId: "blink_account_123/usd" as AccountId,
      defaultWallet: "btc",
    })

    expect(result).toEqual({
      accountId: "acct_blink_123",
      provider: "blink",
      blinkAccountId: "blink_account_123/usd",
      defaultWallet: "btc",
    })
  })

  it("gets an identifier and URL-encodes domain and identifier", async () => {
    const encodedPath = "/internal/domains/example.com%3A4088/identifiers/alice%2Busd"
    mock.onGet(encodedPath).reply(200, {
      provider: "blink",
      account_id: "acct_blink_123",
      domain: "example.com:4088",
      identifier: "alice",
      identifier_kind: "username",
      description: "Alice",
      requested_wallet: "usd",
      provider_details: {
        blink_account_id: "blink_account_123" as AccountId,
        btc_wallet_id: "btc_wallet_123" as WalletId,
        usd_wallet_id: "usd_wallet_123" as WalletId,
        default_wallet: "usd",
      },
    })

    const result = await lnurlServerService().getIdentifier({
      domain: "example.com:4088",
      identifier: "alice+usd",
    })

    expect(result).toEqual({
      provider: "blink",
      accountId: "acct_blink_123",
      domain: "example.com:4088",
      identifier: "alice",
      identifierKind: "username",
      description: "Alice",
      requestedWallet: "usd",
      providerDetails: {
        blinkAccountId: "blink_account_123",
        btcWalletId: "btc_wallet_123",
        usdWalletId: "usd_wallet_123",
        defaultWallet: "usd",
      },
    })
  })

  it("transfers an identifier to Spark and maps request/response fields", async () => {
    mock
      .onPost("/internal/identifiers/transfer-to-spark")
      .reply((config: { data?: string }) => {
        expect(JSON.parse(config.data ?? "{}")).toEqual({
          domain: "example.com",
          identifier: "alice",
          destination_spark_pubkey:
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
          description: "Moved to Spark",
        })

        return [
          200,
          {
            domain: "example.com",
            identifier: "alice",
            provider: "spark",
            spark_pubkey:
              "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            lightning_address: "alice@example.com",
            lnurl: "lnurlp://example.com/lnurlp/alice",
          },
        ]
      })

    const result = await lnurlServerService().transferIdentifierToSpark({
      domain: "example.com",
      identifier: "alice",
      destinationSparkPubkey:
        "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      description: "Moved to Spark",
    })

    expect(result).toEqual({
      domain: "example.com",
      identifier: "alice",
      provider: "spark",
      sparkPubkey: "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      lightningAddress: "alice@example.com",
      lnurl: "lnurlp://example.com/lnurlp/alice",
    })
  })

  it("maps a 400 response to LnurlServerBadRequestError", async () => {
    mock.onPost("/internal/blink/accounts").reply(400, { error: "invalid_request" })

    const result = await lnurlServerService().createBlinkAccount({
      domain: "example.com",
      blinkAccountId: "blink_account_123" as AccountId,
      btcWalletId: "btc_wallet_123" as WalletId,
      usdWalletId: "usd_wallet_123" as WalletId,
      defaultWallet: "usd",
      description: "Alice",
      identifiers: ["alice"],
    })

    expect(result).toBeInstanceOf(LnurlServerBadRequestError)
    expect((result as LnurlServerBadRequestError).message).toBe("invalid_request")
  })

  it("maps patch 404 responses to LnurlServerNotFoundError", async () => {
    mock.onPatch("/internal/blink/accounts/blink_account_123").reply(404, {
      error: "not_found",
    })

    const result = await lnurlServerService().updateDefaultWallet({
      accountId: "blink_account_123" as AccountId,
      defaultWallet: "usd",
    })

    expect(result).toBeInstanceOf(LnurlServerNotFoundError)
    expect((result as LnurlServerNotFoundError).message).toBe("not_found")
  })

  it("maps a 503 response to LnurlServerUnavailableError", async () => {
    mock.onGet("/internal/domains/example.com/identifiers/alice").reply(503, {
      error: "provider_disabled",
    })

    const result = await lnurlServerService().getIdentifier({
      domain: "example.com",
      identifier: "alice",
    })

    expect(result).toBeInstanceOf(LnurlServerUnavailableError)
    expect((result as LnurlServerUnavailableError).message).toBe("provider_disabled")
  })

  it("maps network failures to UnknownLnurlServerServiceError", async () => {
    mock.onGet("/internal/domains/example.com/identifiers/alice").networkError()

    const result = await lnurlServerService().getIdentifier({
      domain: "example.com",
      identifier: "alice",
    })

    expect(result).toBeInstanceOf(UnknownLnurlServerServiceError)
  })
})
