import { InvalidUrlError } from "@/domain/callback/errors"
import { ErrorLevel } from "@/domain/shared"
import { CallbackService } from "@/services/svix"
import { UnknownSvixError } from "@/services/svix/errors"

const mockEndpointCreate = jest.fn()

jest.mock("svix", () => ({
  Svix: jest.fn().mockImplementation(() => ({
    application: { create: jest.fn().mockResolvedValue({}) },
    endpoint: { create: (...args: unknown[]) => mockEndpointCreate(...args) },
  })),
}))

jest.mock("@/services/tracing", () => ({
  wrapAsyncFunctionsToRunInSpan: ({ fns }: { fns: unknown }) => fns,
  addAttributesToCurrentSpan: jest.fn(),
}))

const httpsOnly = new Error(
  'HTTP-Code: 422\nMessage: {"detail":[{"loc":["body","url"],"msg":"Endpoint URL schemes must be https when enforceHttps is set.","type":"value_error"}]}',
)

const addEndpoint = () =>
  CallbackService({ secret: "secret" } as SvixConfig).addEndpoint({
    accountId: "account-id" as AccountId,
    url: "http://example.com/hook",
  })

describe("CallbackService errors", () => {
  beforeEach(() => mockEndpointCreate.mockReset())

  it.each([
    httpsOnly,
    new Error('{"code":"endpoint_https_only","detail":"Endpoint must be https"}'),
  ])("maps the https-only rejection to an info-level InvalidUrlError", async (err) => {
    mockEndpointCreate.mockRejectedValue(err)

    const result = await addEndpoint()

    expect(result).toBeInstanceOf(InvalidUrlError)
    if (!(result instanceof Error)) throw new Error("expected an error")
    expect(result.message).toBe("URL must be https")
    expect(result.level).toBe(ErrorLevel.Info)
  })

  it("keeps unrecognised errors as UnknownSvixError", async () => {
    mockEndpointCreate.mockRejectedValue(new Error("HTTP-Code: 500\nMessage: boom"))

    expect(await addEndpoint()).toBeInstanceOf(UnknownSvixError)
  })
})
