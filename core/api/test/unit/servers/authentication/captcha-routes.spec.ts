// Route-level coverage for the captcha-gated phone flow: mounts the real
// authRouter on an ephemeral listener and drives it over HTTP (supertest is not
// a dependency here). jest.mock is hoisted above const declarations, so mock
// handles are defined inside the factories and re-exported via jest.requireMock.
jest.mock("@/config", () => ({
  UNSECURE_IP_FROM_REQUEST_OBJECT: false,
}))

jest.mock("@/app", () => ({
  Authentication: {
    requestPhoneCodeWithCaptcha: jest.fn(),
  },
}))

jest.mock("@/app/captcha", () => ({
  registerCaptchaGeetest: jest.fn(),
}))

jest.mock("@/services/kratos", () => ({
  checkedToAuthToken: jest.fn(),
  checkedToEmailLoginId: jest.fn(),
  checkedToTotpCode: jest.fn(),
}))

jest.mock("@/services/tracing", () => ({
  tracer: { startSpan: jest.fn(() => ({ end: jest.fn() })) },
  recordExceptionInCurrentSpan: jest.fn(),
  addAttributesToCurrentSpan: jest.fn(),
}))

jest.mock("@/services/logger", () => ({
  baseLogger: { child: () => ({ error: jest.fn(), warn: jest.fn() }), warn: jest.fn() },
}))

jest.mock("@/graphql/error-map", () => ({
  mapError: (e: Error) => ({ message: e.message }),
}))

// The real telegram-passport router pulls in bot config at import time; the
// captcha routes under test never dispatch to it, so mount an inert handler.
jest.mock("@/servers/authentication/telegram-passport", () => ({
  telegramPassportRouter: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import { Server } from "http"

import express from "express"

import { Authentication } from "@/app"
import { registerCaptchaGeetest } from "@/app/captcha"
import { CaptchaServiceUnavailableError } from "@/domain/captcha/errors"
import { DevicePlatform } from "@/domain/phone-provider"
import { ErrorLevel } from "@/domain/shared"
import { recordExceptionInCurrentSpan } from "@/services/tracing"
import authRouter from "@/servers/authentication"

const mockRegisterCaptcha = registerCaptchaGeetest as jest.Mock

let server: Server
let baseUrl: string

beforeAll(
  () =>
    new Promise<void>((resolve, reject) => {
      const app = express()
      app.use(authRouter)
      server = app.listen(0, () => {
        const address = server.address()
        if (!address || typeof address === "string") {
          reject(new Error("could not bind ephemeral port"))
          return
        }
        baseUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    }),
)

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve())
    }),
)

beforeEach(() => {
  jest.clearAllMocks()
})

const post = (path: string, { body }: { body?: Record<string, unknown> } = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": "1.2.3.4",
      "user-agent": "captcha-routes-spec",
    },
    body: JSON.stringify(body ?? {}),
  })

describe("POST /phone/captcha", () => {
  it("returns a successful online challenge without advertising failback mode", async () => {
    mockRegisterCaptcha.mockResolvedValue({
      success: 1,
      gt: "gt-id",
      challenge: "online-challenge",
      newCaptcha: true,
    })

    const res = await post("/phone/captcha")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      result: {
        id: "gt-id",
        challengeCode: "online-challenge",
        newCaptcha: true,
        failbackMode: false,
      },
    })
    expect(mockRegisterCaptcha).toHaveBeenCalledTimes(1)
  })

  it("returns a retryable 503 on provider outage without double-reporting it", async () => {
    mockRegisterCaptcha.mockResolvedValue(new CaptchaServiceUnavailableError())

    const res = await post("/phone/captcha")

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({
      error: "captcha provider unavailable, retry later",
    })
    expect(recordExceptionInCurrentSpan).not.toHaveBeenCalled()
  })

  it("records unexpected challenge failures and answers 500", async () => {
    const error = new Error("unexpected failure")
    mockRegisterCaptcha.mockResolvedValue(error)

    const res = await post("/phone/captcha")

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "error creating challenge" })
    expect(recordExceptionInCurrentSpan).toHaveBeenCalledWith({
      error,
      level: ErrorLevel.Critical,
    })
  })
})

describe("POST /phone/code - captcha validation", () => {
  const body = {
    phone: "+12025550123",
    challengeCode: "challenge",
    validationCode: "validation",
    secCode: "security-code",
    channel: "SMS",
  }
  const requestPhoneCode = Authentication.requestPhoneCodeWithCaptcha as jest.Mock

  it("returns a retryable 503 when the captcha provider is unavailable", async () => {
    requestPhoneCode.mockResolvedValue(new CaptchaServiceUnavailableError())

    const res = await post("/phone/code", { body })

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({
      error: "captcha provider unavailable, retry later",
    })
    expect(requestPhoneCode).toHaveBeenCalledWith({
      phone: body.phone,
      geetestChallenge: body.challengeCode,
      geetestValidate: body.validationCode,
      geetestSeccode: body.secCode,
      ip: "1.2.3.4",
      channel: body.channel,
      userAgent: "captcha-routes-spec",
      devicePlatform: DevicePlatform.Web,
    })
    expect(recordExceptionInCurrentSpan).not.toHaveBeenCalled()
  })

  it("preserves 400 for rejected user captcha input", async () => {
    const error = Object.assign(new Error("invalid captcha"), {
      name: "InvalidCaptchaError",
    })
    requestPhoneCode.mockResolvedValue(error)

    const res = await post("/phone/code", { body })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: { name: "InvalidCaptchaError" } })
  })

  it("preserves the successful phone-code response", async () => {
    requestPhoneCode.mockResolvedValue(true)

    const res = await post("/phone/code", { body })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })
})
