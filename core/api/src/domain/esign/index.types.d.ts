type ESignError = import("./errors").ESignError
type ESignServiceError = import("./errors").ESignServiceError

type ESignEnvelopeId = string & { readonly brand: unique symbol }
type ESignSigningUrl = string & { readonly brand: unique symbol }
type ESignTemplateId = string & { readonly brand: unique symbol }

type ESignRecipientStatus =
  (typeof import("./primitives").ESignRecipientStatus)[keyof typeof import("./primitives").ESignRecipientStatus]

type ESignTab = {
  value: string
  locked: boolean
}

type ESignTabs = Record<string, ESignTab>

type ESignRecipient = {
  name: string
  email: EmailAddress
}

type ESignEnvelope = {
  envelopeId: ESignEnvelopeId
  signingUrl: ESignSigningUrl
}

type CreateESignEnvelopeArgs = {
  accountId: AccountId
  recipient: ESignRecipient
  tabs: ESignTabs
}

type GetESignSigningUrlArgs = {
  envelopeId: ESignEnvelopeId
  recipient: ESignRecipient
}

type GetESignRecipientStatusArgs = {
  envelopeId: ESignEnvelopeId
}

type ESignReturnPage = {
  html: string
  contentSecurityPolicy: string
}

interface IESignService {
  createEnvelope(
    args: CreateESignEnvelopeArgs,
  ): Promise<ESignEnvelope | ESignServiceError>
  getSigningUrl(
    args: GetESignSigningUrlArgs,
  ): Promise<ESignSigningUrl | ESignServiceError>
  getRecipientStatus(
    args: GetESignRecipientStatusArgs,
  ): Promise<ESignRecipientStatus | ESignServiceError>
}
