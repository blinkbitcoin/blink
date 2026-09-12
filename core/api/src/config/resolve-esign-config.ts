import { createPrivateKey } from "crypto"
import fs from "fs"

import {
  docuSignDemoHostsInUse,
  productionErrors,
  ProductionConfig,
} from "@blinkbitcoin/esign-node"

import { ConfigError } from "./error"

import { checkedToInvestmentAgreementTemplateIds } from "@/domain/investment-agreement"

const requiredValue = ({
  name,
  value,
}: {
  name: string
  value: string | undefined
}): string => {
  if (!value) throw new ConfigError(`Missing ${name} config`)
  return value
}

const readPrivateKeyFile = (file: string): string => {
  try {
    return fs.readFileSync(file, "utf8")
  } catch (err) {
    throw new ConfigError("Unable to read DOCUSIGN_PRIVATE_KEY_FILE", err)
  }
}

const checkedPrivateKey = (privateKey: string): string => {
  try {
    createPrivateKey(privateKey)
    return privateKey
  } catch {
    throw new ConfigError("DocuSign private key is not a valid PEM private key")
  }
}

const docuSignPrivateKey = ({
  DOCUSIGN_PRIVATE_KEY_BASE64: base64,
  DOCUSIGN_PRIVATE_KEY_FILE: file,
}: ESignEnv): string => {
  if (base64 && file) {
    throw new ConfigError(
      "Set only one of DOCUSIGN_PRIVATE_KEY_BASE64 or DOCUSIGN_PRIVATE_KEY_FILE",
    )
  }
  if (base64) return checkedPrivateKey(Buffer.from(base64, "base64").toString())
  if (file) return checkedPrivateKey(readPrivateKeyFile(file))
  throw new ConfigError(
    "Missing DOCUSIGN_PRIVATE_KEY_BASE64 or DOCUSIGN_PRIVATE_KEY_FILE config",
  )
}

const assertNoDemoSettingsInProduction = ({
  esignEnv,
  productionConfig,
}: {
  esignEnv: ESignEnv
  productionConfig: ProductionConfig
}): void => {
  const errors = productionErrors(
    { ESIGN_ENV: esignEnv.ESIGN_ENV, ESIGN_ALLOW_DEMO: esignEnv.ESIGN_ALLOW_DEMO },
    productionConfig,
  )
  if (errors.length > 0) {
    throw new ConfigError("Demo e-signature settings in production", errors)
  }
}

const resolveDocuSignConfig = (esignEnv: ESignEnv): DocuSignESignConfig => {
  const apiBaseUrl = requiredValue({
    name: "DOCUSIGN_BASE_URL",
    value: esignEnv.DOCUSIGN_BASE_URL,
  })
  const oauthBaseUrl = requiredValue({
    name: "DOCUSIGN_OAUTH_URL",
    value: esignEnv.DOCUSIGN_OAUTH_URL,
  })

  const templateIds = checkedToInvestmentAgreementTemplateIds(
    requiredValue({ name: "DOCUSIGN_TEMPLATE_ID", value: esignEnv.DOCUSIGN_TEMPLATE_ID }),
  )
  if (templateIds instanceof Error) throw new ConfigError(templateIds.message)

  assertNoDemoSettingsInProduction({
    esignEnv,
    productionConfig: {
      provider: "docusign",
      demoHosts: docuSignDemoHostsInUse({
        apiBaseUrl,
        oauthBaseUrl,
        webFormsBaseUrl: "",
      }),
    },
  })

  return {
    provider: "docusign",
    returnUrl: requiredValue({
      name: "DOCUSIGN_RETURN_URL",
      value: esignEnv.DOCUSIGN_RETURN_URL,
    }),
    accountId: requiredValue({
      name: "DOCUSIGN_ACCOUNT_ID",
      value: esignEnv.DOCUSIGN_ACCOUNT_ID,
    }),
    integrationKey: requiredValue({
      name: "DOCUSIGN_INTEGRATION_KEY",
      value: esignEnv.DOCUSIGN_INTEGRATION_KEY,
    }),
    userId: requiredValue({ name: "DOCUSIGN_USER_ID", value: esignEnv.DOCUSIGN_USER_ID }),
    privateKey: docuSignPrivateKey(esignEnv),
    apiBaseUrl,
    oauthBaseUrl,
    templateIds,
    signerRole: requiredValue({
      name: "DOCUSIGN_SIGNER_ROLE",
      value: esignEnv.DOCUSIGN_SIGNER_ROLE,
    }),
  }
}

export const resolveESignConfig = (esignEnv: ESignEnv): ESignConfig => {
  switch (esignEnv.ESIGN_PROVIDER) {
    case "docusign":
      return resolveDocuSignConfig(esignEnv)

    case "mock":
      assertNoDemoSettingsInProduction({
        esignEnv,
        productionConfig: { provider: "mock", demo: true },
      })
      return {
        provider: "mock",
        returnUrl: requiredValue({
          name: "DOCUSIGN_RETURN_URL",
          value: esignEnv.DOCUSIGN_RETURN_URL,
        }),
      }

    default:
      throw new ConfigError("Missing ESIGN_PROVIDER config")
  }
}
