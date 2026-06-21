import { setUsername } from "@/app/accounts"

import { LnurlServerMissingInternalUrlError } from "@/domain/lnurl-server"
import { InvalidUsername } from "@/domain/errors"
import { UsernameIsImmutableError, UsernameNotAvailableError } from "@/domain/accounts"

import * as MongooseImpl from "@/services/mongoose"
import * as LnurlServerImpl from "@/services/lnurl-server"

afterEach(() => {
  jest.restoreAllMocks()
})

describe("Set username", () => {
  it("fails to set the same name on a different user", async () => {
    const { AccountsRepository: AccountsRepositoryOrig } =
      jest.requireActual("@/services/mongoose")
    jest.spyOn(MongooseImpl, "AccountsRepository").mockReturnValue({
      ...AccountsRepositoryOrig(),
      findById: () => true,
      findByUsername: () => true,
    })
    jest
      .spyOn(LnurlServerImpl, "LnurlServerService")
      .mockReturnValue(new LnurlServerMissingInternalUrlError("missing"))

    const res = await setUsername({ accountId: crypto.randomUUID(), username: "alice" })
    expect(res).toBeInstanceOf(UsernameNotAvailableError)
  })

  it("fails to change username", async () => {
    const { AccountsRepository: AccountsRepositoryOrig } =
      jest.requireActual("@/services/mongoose")
    jest.spyOn(MongooseImpl, "AccountsRepository").mockReturnValue({
      ...AccountsRepositoryOrig(),
      findById: () => ({ username: "alice" }),
    })
    jest
      .spyOn(LnurlServerImpl, "LnurlServerService")
      .mockReturnValue(new LnurlServerMissingInternalUrlError("missing"))

    const res = await setUsername({ accountId: crypto.randomUUID(), username: "alice" })
    expect(res).toBeInstanceOf(UsernameIsImmutableError)
  })

  it("fails to set username with a valid phone number", async () => {
    let result = await setUsername({
      accountId: crypto.randomUUID(),
      username: "573001234567",
    })
    expect(result).toBeInstanceOf(InvalidUsername)

    result = await setUsername({
      accountId: crypto.randomUUID(),
      username: "+573001234567",
    })
    expect(result).toBeInstanceOf(InvalidUsername)
  })
})
