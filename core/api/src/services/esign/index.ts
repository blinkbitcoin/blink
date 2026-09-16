import {
  createDocuSignProvider,
  createMockProvider,
  EnvelopeResult,
  ESignProvider,
  parseDocuSignWebhook,
  renderSigningReturnBridge,
  signingPageCsp,
  signingPageNonce,
} from "@blinkbitcoin/esign-node"

import { handleESignErrors } from "./errors"

import { getESignConfig } from "@/config"
import {
  ESignNotConfiguredError,
  ESignRecipientStatusNotSupportedError,
  UnknownESignServiceError,
} from "@/domain/esign"
import { baseLogger } from "@/services/logger"
import {
  addAttributesToCurrentSpan,
  wrapAsyncFunctionsToRunInSpan,
  wrapAsyncToRunInSpan,
} from "@/services/tracing"

const ENVELOPE_CONTRACT_TYPE = "investment_agreement"

const createProvider = (config: ESignConfig): ESignProvider => {
  if (config.provider === "mock") {
    return createMockProvider({
      baseUrl: () => new URL(config.returnUrl).origin,
      // webhooks are refused until the Connect HMAC key is configured
      webhook: { verifyWebhook: () => false, parseWebhookEvent: parseDocuSignWebhook },
    })
  }

  return createDocuSignProvider({
    config: {
      apiBaseUrl: config.apiBaseUrl,
      oauthBaseUrl: config.oauthBaseUrl,
      webFormsBaseUrl: "",
      returnUrl: config.returnUrl,
      accountId: config.accountId,
      integrationKey: config.integrationKey,
      privateKey: config.privateKey,
      userId: config.userId,
      templateId: config.templateIds.join(","),
      signerRoleName: config.signerRole,
    },
    webhook: { hmacKey: () => undefined },
  })
}

const providers = new WeakMap<ESignConfig, ESignProvider>()

// one provider per configuration keeps the DocuSign token cache and the mock envelopes
const providerFor = (config: ESignConfig): ESignProvider => {
  const cachedProvider = providers.get(config)
  if (cachedProvider) return cachedProvider

  const provider = createProvider(config)
  providers.set(config, provider)
  return provider
}

export const ESignService = (): IESignService | ESignNotConfiguredError => {
  const config = getESignConfig()
  if (!config) {
    baseLogger.warn("ESignService not configured")
    return new ESignNotConfiguredError("ESIGN_PROVIDER is not configured")
  }

  const provider = providerFor(config)

  const createEnvelope = async ({
    accountId,
    recipient,
    tabs,
  }: CreateESignEnvelopeArgs): Promise<ESignEnvelope | ESignServiceError> => {
    try {
      const result = await provider.createEnvelope(
        accountId,
        ENVELOPE_CONTRACT_TYPE,
        recipient,
        tabs,
      )
      addAttributesToCurrentSpan({ "esign.envelopeId": result.envelopeId })
      return envelopeFromRaw(result)
    } catch (err) {
      return handleESignErrors(err)
    }
  }

  const getSigningUrl = async ({
    envelopeId,
    recipient,
  }: GetESignSigningUrlArgs): Promise<ESignSigningUrl | ESignServiceError> => {
    addAttributesToCurrentSpan({ "esign.envelopeId": envelopeId })
    try {
      const { signingUrl } = await provider.getSigningUrl(envelopeId, recipient)
      if (!signingUrl) return new UnknownESignServiceError("empty signing url")
      return signingUrl as ESignSigningUrl
    } catch (err) {
      return handleESignErrors(err)
    }
  }

  const getRecipientStatus = async ({
    envelopeId,
  }: GetESignRecipientStatusArgs): Promise<ESignRecipientStatus | ESignServiceError> => {
    addAttributesToCurrentSpan({ "esign.envelopeId": envelopeId })
    return new ESignRecipientStatusNotSupportedError(
      "the e-signature provider does not report recipient status yet",
    )
  }

  // the recipient name and email must not reach the span attributes
  return {
    ...wrapAsyncFunctionsToRunInSpan({
      namespace: "services.esign",
      fns: { getRecipientStatus },
    }),
    createEnvelope: wrapAsyncToRunInSpan({
      namespace: "services.esign",
      fnName: "createEnvelope",
      fn: createEnvelope,
      ignoreFnArgs: true,
    }),
    getSigningUrl: wrapAsyncToRunInSpan({
      namespace: "services.esign",
      fnName: "getSigningUrl",
      fn: getSigningUrl,
      ignoreFnArgs: true,
    }),
  }
}

export const signingReturnPage = ({
  event,
}: {
  event: string | undefined
}): ESignReturnPage => {
  const nonce = signingPageNonce()
  return {
    html: renderSigningReturnBridge(event, nonce),
    contentSecurityPolicy: signingPageCsp(nonce),
  }
}

const envelopeFromRaw = ({
  envelopeId,
  signingUrl,
}: EnvelopeResult): ESignEnvelope | UnknownESignServiceError => {
  const isCompleteEnvelope = !!envelopeId && !!signingUrl
  if (!isCompleteEnvelope) return new UnknownESignServiceError("incomplete envelope")
  return {
    envelopeId: envelopeId as ESignEnvelopeId,
    signingUrl: signingUrl as ESignSigningUrl,
  }
}
