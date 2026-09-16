import {
  ESignEnvelopeCreationError,
  ESignEnvelopeNotFoundError,
  ESignError,
  ESignNotConfiguredError,
  ESignProviderUnavailableError,
  ESignRecipientStatusNotSupportedError,
  ESignServiceError,
  UnknownESignServiceError,
} from "@/domain/esign"
import { ErrorLevel } from "@/domain/shared"

describe("esign service errors", () => {
  it.each([
    ["a provider that is not configured", new ESignNotConfiguredError(), ErrorLevel.Info],
    [
      "an envelope that cannot be found",
      new ESignEnvelopeNotFoundError(),
      ErrorLevel.Info,
    ],
    [
      "a recipient status query the provider does not support yet",
      new ESignRecipientStatusNotSupportedError(),
      ErrorLevel.Info,
    ],
    ["an unavailable provider", new ESignProviderUnavailableError(), ErrorLevel.Warn],
    [
      "an envelope the provider rejected",
      new ESignEnvelopeCreationError(),
      ErrorLevel.Critical,
    ],
    ["an unknown provider failure", new UnknownESignServiceError(), ErrorLevel.Critical],
  ])("reports %s as an esign service error with level %s", (_, error, level) => {
    expect(error).toBeInstanceOf(ESignServiceError)
    expect(error).toBeInstanceOf(ESignError)
    expect(error).toHaveProperty("level", level)
  })
})
