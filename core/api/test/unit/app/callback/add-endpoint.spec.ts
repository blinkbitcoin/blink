import { addEndpoint } from "@/app/callback"
import { InvalidUrlError } from "@/domain/callback/errors"
import { CallbackService } from "@/services/svix"

const mockFlag = { value: false }

jest.mock("@/config", () => ({
  getCallbackServiceConfig: jest.fn(() => ({ secret: "secret" })),
  get UNSECURE_CALLBACK_ENDPOINT_URLS() {
    return mockFlag.value
  },
}))

jest.mock("@/services/svix", () => ({
  CallbackService: jest.fn(),
}))

const accountId = "4b5a4bb8-3a17-4b2a-a9a5-7e5a3a1e8c5f"
const svixAddEndpoint = jest.fn()

beforeEach(() => {
  jest.resetAllMocks()
  mockFlag.value = false
  ;(CallbackService as jest.Mock).mockReturnValue({ addEndpoint: svixAddEndpoint })
  svixAddEndpoint.mockResolvedValue("ep_123")
})

describe("addEndpoint", () => {
  it("registers a public https url", async () => {
    const url = "https://example.com/hook"

    const result = await addEndpoint({ accountId, url })

    expect(result).toEqual({ id: "ep_123" })
    expect(svixAddEndpoint).toHaveBeenCalledWith({ accountId, url })
  })

  it.each([
    "http://example.com/hook",
    "https://127.0.0.1/",
    "https://kubernetes.default.svc/",
  ])("rejects %s before calling svix", async (url) => {
    const result = await addEndpoint({ accountId, url })

    expect(result).toBeInstanceOf(InvalidUrlError)
    expect(svixAddEndpoint).not.toHaveBeenCalled()
  })

  it("skips the destination check when the dev flag is on", async () => {
    mockFlag.value = true
    const url = "http://bats-tests:8080/webhook/"

    const result = await addEndpoint({ accountId, url })

    expect(result).toEqual({ id: "ep_123" })
    expect(svixAddEndpoint).toHaveBeenCalledWith({ accountId, url })
  })
})
