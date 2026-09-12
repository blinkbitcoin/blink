import { generateKeyPairSync } from "crypto"
import fs from "fs"
import os from "os"
import path from "path"

import { ConfigError } from "@/config/error"
import { resolveESignConfig } from "@/config/resolve-esign-config"

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
})

const returnUrl = "https://api.blink.sv/signing/return"

const mockEnv: ESignEnv = {
  ESIGN_PROVIDER: "mock",
  DOCUSIGN_RETURN_URL: returnUrl,
}

const docuSignEnv: ESignEnv = {
  ESIGN_PROVIDER: "docusign",
  DOCUSIGN_ACCOUNT_ID: "account-id",
  DOCUSIGN_INTEGRATION_KEY: "integration-key",
  DOCUSIGN_USER_ID: "user-id",
  DOCUSIGN_PRIVATE_KEY_BASE64: Buffer.from(privateKey).toString("base64"),
  DOCUSIGN_BASE_URL: "https://na4.docusign.net/restapi",
  DOCUSIGN_OAUTH_URL: "https://account.docusign.com",
  DOCUSIGN_TEMPLATE_ID: "membership-template,subscription-template,joinder-template",
  DOCUSIGN_SIGNER_ROLE: "investor",
  DOCUSIGN_RETURN_URL: returnUrl,
}

const demoHosts = {
  DOCUSIGN_BASE_URL: "https://demo.docusign.net/restapi",
  DOCUSIGN_OAUTH_URL: "https://account-d.docusign.com",
}

const errorThrownBy = (resolve: () => unknown): unknown => {
  try {
    resolve()
  } catch (err) {
    return err
  }
  return undefined
}

describe("resolveESignConfig", () => {
  it("fails without a provider", () => {
    const error = errorThrownBy(() => resolveESignConfig({}))
    expect(error).toBeInstanceOf(ConfigError)
    expect(error).toHaveProperty("message", "Missing ESIGN_PROVIDER config")
  })

  describe("mock provider", () => {
    it("resolves the return url", () => {
      expect(resolveESignConfig(mockEnv)).toEqual({ provider: "mock", returnUrl })
    })

    it("fails without a return url", () => {
      const error = errorThrownBy(() =>
        resolveESignConfig({ ...mockEnv, DOCUSIGN_RETURN_URL: undefined }),
      )
      expect(error).toBeInstanceOf(ConfigError)
      expect(error).toHaveProperty("message", "Missing DOCUSIGN_RETURN_URL config")
    })

    it("fails in production", () => {
      const error = errorThrownBy(() =>
        resolveESignConfig({ ...mockEnv, ESIGN_ENV: "production" }),
      )
      expect(error).toBeInstanceOf(ConfigError)
      expect(error).toHaveProperty("message", "Demo e-signature settings in production")
    })

    it("is allowed in production when demo settings are allowed", () => {
      expect(
        resolveESignConfig({
          ...mockEnv,
          ESIGN_ENV: "production",
          ESIGN_ALLOW_DEMO: "true",
        }),
      ).toEqual({ provider: "mock", returnUrl })
    })
  })

  describe("docusign provider", () => {
    it("resolves the credentials, hosts and template ids in signing order", () => {
      expect(resolveESignConfig(docuSignEnv)).toEqual({
        provider: "docusign",
        returnUrl,
        accountId: "account-id",
        integrationKey: "integration-key",
        userId: "user-id",
        privateKey,
        apiBaseUrl: "https://na4.docusign.net/restapi",
        oauthBaseUrl: "https://account.docusign.com",
        templateIds: ["membership-template", "subscription-template", "joinder-template"],
        signerRole: "investor",
      })
    })

    it("reads the private key from a file", () => {
      const keyFile = path.join(os.tmpdir(), `docusign-key-${process.pid}.pem`)
      fs.writeFileSync(keyFile, privateKey)
      try {
        expect(
          resolveESignConfig({
            ...docuSignEnv,
            DOCUSIGN_PRIVATE_KEY_BASE64: undefined,
            DOCUSIGN_PRIVATE_KEY_FILE: keyFile,
          }),
        ).toHaveProperty("privateKey", privateKey)
      } finally {
        fs.unlinkSync(keyFile)
      }
    })

    it.each([
      [
        "both private key sources are set",
        { DOCUSIGN_PRIVATE_KEY_FILE: "/tmp/docusign.pem" },
        "Set only one of DOCUSIGN_PRIVATE_KEY_BASE64 or DOCUSIGN_PRIVATE_KEY_FILE",
      ],
      [
        "no private key source is set",
        { DOCUSIGN_PRIVATE_KEY_BASE64: undefined },
        "Missing DOCUSIGN_PRIVATE_KEY_BASE64 or DOCUSIGN_PRIVATE_KEY_FILE config",
      ],
      [
        "the private key file cannot be read",
        {
          DOCUSIGN_PRIVATE_KEY_BASE64: undefined,
          DOCUSIGN_PRIVATE_KEY_FILE: "/nonexistent/docusign.pem",
        },
        "Unable to read DOCUSIGN_PRIVATE_KEY_FILE",
      ],
      [
        "the private key is not a pem private key",
        { DOCUSIGN_PRIVATE_KEY_BASE64: Buffer.from("not a key").toString("base64") },
        "DocuSign private key is not a valid PEM private key",
      ],
      [
        "the template ids do not match the documents",
        { DOCUSIGN_TEMPLATE_ID: "membership-template,subscription-template" },
        "expected 3 comma separated template ids: membership-template,subscription-template",
      ],
      [
        "demo hosts are used in production",
        { ...demoHosts, ESIGN_ENV: "production" },
        "Demo e-signature settings in production",
      ],
    ])("fails when %s", (_, overrides, message) => {
      const error = errorThrownBy(() =>
        resolveESignConfig({ ...docuSignEnv, ...overrides }),
      )
      expect(error).toBeInstanceOf(ConfigError)
      expect(error).toHaveProperty("message", message)
    })

    it.each([
      "DOCUSIGN_ACCOUNT_ID",
      "DOCUSIGN_INTEGRATION_KEY",
      "DOCUSIGN_USER_ID",
      "DOCUSIGN_BASE_URL",
      "DOCUSIGN_OAUTH_URL",
      "DOCUSIGN_TEMPLATE_ID",
      "DOCUSIGN_SIGNER_ROLE",
      "DOCUSIGN_RETURN_URL",
    ])("fails without %s", (name) => {
      const error = errorThrownBy(() =>
        resolveESignConfig({ ...docuSignEnv, [name]: undefined }),
      )
      expect(error).toBeInstanceOf(ConfigError)
      expect(error).toHaveProperty("message", `Missing ${name} config`)
    })

    it("allows demo hosts in production when demo settings are allowed", () => {
      expect(
        resolveESignConfig({
          ...docuSignEnv,
          ...demoHosts,
          ESIGN_ENV: "production",
          ESIGN_ALLOW_DEMO: "true",
        }),
      ).toHaveProperty("apiBaseUrl", demoHosts.DOCUSIGN_BASE_URL)
    })

    it("allows production hosts in production", () => {
      expect(
        resolveESignConfig({ ...docuSignEnv, ESIGN_ENV: "production" }),
      ).toHaveProperty("provider", "docusign")
    })
  })
})
