const mockProvider = {
  createEnvelope: jest.fn(),
  getEnvelopeStatus: jest.fn(),
  getSigningUrl: jest.fn(),
  verifyWebhook: jest.fn(),
  parseWebhookEvent: jest.fn(),
}
const mockCreateMockProvider = jest.fn()
const mockCreateDocuSignProvider = jest.fn()
let mockESignConfig: ESignConfig | undefined

jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getESignConfig: () => mockESignConfig,
}))

jest.mock("@blinkbitcoin/esign-node", () => ({
  ...jest.requireActual("@blinkbitcoin/esign-node"),
  createMockProvider: (options: unknown) => mockCreateMockProvider(options),
  createDocuSignProvider: (options: unknown) => mockCreateDocuSignProvider(options),
}))

import { createError, ErrorCodes } from "@blinkbitcoin/esign-node"

import {
  ESignEnvelopeCreationError,
  ESignEnvelopeNotFoundError,
  ESignNotConfiguredError,
  ESignProviderUnavailableError,
  ESignRecipientStatusNotSupportedError,
  UnknownESignServiceError,
} from "@/domain/esign"
import { ESignService, signingReturnPage } from "@/services/esign"

const returnUrl = "http://localhost:4455/signing/return"
const accountId = "account-id" as AccountId
const envelopeId = "envelope-id" as ESignEnvelopeId
const signingUrl = "https://demo.docusign.net/signing/envelope-id"
const recipient: ESignRecipient = {
  name: "TEST Investor Name",
  email: "investor@blink.sv" as EmailAddress,
}
const tabs: ESignTabs = { email: { value: "investor@blink.sv", locked: true } }

const docuSignConfig: DocuSignESignConfig = {
  provider: "docusign",
  returnUrl,
  accountId: "docusign-account",
  integrationKey: "integration-key",
  userId: "docusign-user",
  privateKey: "private-key",
  apiBaseUrl: "https://na4.docusign.net/restapi",
  oauthBaseUrl: "https://account.docusign.com",
  templateIds: ["membership", "subscription", "joinder"] as ESignTemplateId[],
  signerRole: "investor",
}

const configuredService = (): IESignService => {
  const service = ESignService()
  if (service instanceof Error) throw service
  return service
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateMockProvider.mockReturnValue(mockProvider)
  mockCreateDocuSignProvider.mockReturnValue(mockProvider)
  mockESignConfig = { provider: "mock", returnUrl }
})

describe("ESignService", () => {
  it("fails when the e-signature provider is not configured", () => {
    mockESignConfig = undefined

    expect(ESignService()).toBeInstanceOf(ESignNotConfiguredError)
    expect(mockCreateMockProvider).not.toHaveBeenCalled()
  })

  it("serves the mock signing pages from the return url origin and refuses webhooks", () => {
    configuredService()

    const [{ baseUrl, webhook }] = mockCreateMockProvider.mock.calls[0]
    expect(baseUrl()).toEqual("http://localhost:4455")
    expect(webhook.verifyWebhook()).toBe(false)
    expect(webhook.parseWebhookEvent("not a connect payload")).toBeNull()
  })

  it("reuses the provider for the same configuration", () => {
    configuredService()
    configuredService()

    expect(mockCreateMockProvider).toHaveBeenCalledTimes(1)
  })

  it("configures docusign with the templates in signing order and the investor role", () => {
    mockESignConfig = docuSignConfig
    configuredService()

    expect(mockCreateDocuSignProvider).toHaveBeenCalledWith({
      config: {
        apiBaseUrl: "https://na4.docusign.net/restapi",
        oauthBaseUrl: "https://account.docusign.com",
        webFormsBaseUrl: "",
        returnUrl,
        accountId: "docusign-account",
        integrationKey: "integration-key",
        privateKey: "private-key",
        userId: "docusign-user",
        templateId: "membership,subscription,joinder",
        signerRoleName: "investor",
      },
      webhook: { hmacKey: expect.any(Function) },
    })
    const [{ webhook }] = mockCreateDocuSignProvider.mock.calls[0]
    expect(webhook.hmacKey()).toBeUndefined()
  })

  describe("createEnvelope", () => {
    it("creates the envelope with the locked tabs for the recipient", async () => {
      mockProvider.createEnvelope.mockResolvedValue({ envelopeId, signingUrl })

      const result = await configuredService().createEnvelope({
        accountId,
        recipient,
        tabs,
      })

      expect(result).toEqual({ envelopeId, signingUrl })
      expect(mockProvider.createEnvelope).toHaveBeenCalledWith(
        accountId,
        "investment_agreement",
        recipient,
        tabs,
      )
    })

    it.each([
      ["an envelope id", { envelopeId: "", signingUrl }],
      ["a signing url", { envelopeId, signingUrl: "" }],
    ])("fails when the provider returns no %s", async (_, envelope) => {
      mockProvider.createEnvelope.mockResolvedValue(envelope)

      expect(
        await configuredService().createEnvelope({ accountId, recipient, tabs }),
      ).toBeInstanceOf(UnknownESignServiceError)
    })

    it.each([
      [ErrorCodes.ENVELOPE_NOT_FOUND, ESignEnvelopeNotFoundError],
      [ErrorCodes.ENVELOPE_CREATION_FAILED, ESignEnvelopeCreationError],
      [ErrorCodes.PROVIDER_UNAVAILABLE, ESignProviderUnavailableError],
      [ErrorCodes.VALIDATION_ERROR, UnknownESignServiceError],
    ])("maps a %s provider error", async (code, expectedError) => {
      mockProvider.createEnvelope.mockRejectedValue(createError(code, "provider error"))

      expect(
        await configuredService().createEnvelope({ accountId, recipient, tabs }),
      ).toBeInstanceOf(expectedError)
    })

    it("maps an uncoded failure to an unknown error", async () => {
      mockProvider.createEnvelope.mockRejectedValue(new Error("socket hang up"))

      const result = await configuredService().createEnvelope({
        accountId,
        recipient,
        tabs,
      })
      expect(result).toBeInstanceOf(UnknownESignServiceError)
      expect(result).toHaveProperty("message", "socket hang up")
    })
  })

  describe("getSigningUrl", () => {
    it("opens a new signing session for the envelope", async () => {
      mockProvider.getSigningUrl.mockResolvedValue({ signingUrl })

      expect(await configuredService().getSigningUrl({ envelopeId, recipient })).toEqual(
        signingUrl,
      )
      expect(mockProvider.getSigningUrl).toHaveBeenCalledWith(envelopeId, recipient)
    })

    it("fails when the provider returns no signing url", async () => {
      mockProvider.getSigningUrl.mockResolvedValue({ signingUrl: "" })

      expect(
        await configuredService().getSigningUrl({ envelopeId, recipient }),
      ).toBeInstanceOf(UnknownESignServiceError)
    })

    it("maps a provider error", async () => {
      mockProvider.getSigningUrl.mockRejectedValue(
        createError(ErrorCodes.ENVELOPE_NOT_FOUND, "Envelope not found"),
      )

      expect(
        await configuredService().getSigningUrl({ envelopeId, recipient }),
      ).toBeInstanceOf(ESignEnvelopeNotFoundError)
    })
  })

  describe("getRecipientStatus", () => {
    it("fails until the provider reports recipient status", async () => {
      expect(await configuredService().getRecipientStatus({ envelopeId })).toBeInstanceOf(
        ESignRecipientStatusNotSupportedError,
      )
    })
  })
})

describe("signingReturnPage", () => {
  const nonceFrom = (contentSecurityPolicy: string): string =>
    (contentSecurityPolicy.match(/script-src 'nonce-([^']+)'/) || [])[1]

  it("posts the signing event with a script allowed by the page nonce", () => {
    const { html, contentSecurityPolicy } = signingReturnPage({
      event: "signing_complete",
    })

    const nonce = nonceFrom(contentSecurityPolicy)
    expect(nonce).toBeTruthy()
    expect(html).toContain(`<script nonce="${nonce}">`)
    expect(html).toContain('"signing_complete"')
  })

  it.each([
    ["an unknown event", "not_a_docusign_event"],
    ["a missing event", undefined],
  ])("reports %s as an exception", (_, event) => {
    const { html } = signingReturnPage({ event })

    expect(html).toContain('"exception"')
    expect(html).not.toContain("not_a_docusign_event")
  })

  it("uses a new nonce for every page", () => {
    expect(signingReturnPage({ event: "cancel" }).contentSecurityPolicy).not.toEqual(
      signingReturnPage({ event: "cancel" }).contentSecurityPolicy,
    )
  })
})
