import { checkedToUsername } from "@/domain/accounts"
import { AccountsRepository, UsernameRepository } from "@/services/mongoose"
import { createRandomUserAndBtcWallet } from "test/helpers"

const randomUsername = () => {
  const num = Math.floor(Math.random() * 10 ** 4)
  const username = checkedToUsername(`alice${num}`)
  if (username instanceof Error) throw username
  return username
}

const accounts = AccountsRepository()
const usernames = UsernameRepository()

describe("AccountsRepository", () => {
  it("returns valid account for username", async () => {
    const username = randomUsername()

    // Create user
    const newWalletDescriptor = await createRandomUserAndBtcWallet()

    // Set username
    const res = await usernames.update({
      accountId: newWalletDescriptor.accountId,
      handle: username,
      isDefault: true,
    })
    expect(res).not.toBeInstanceOf(Error)

    // Find username record
    const usernameRecord = await usernames.findByHandle(username)
    if (usernameRecord instanceof Error) throw usernameRecord

    // Find account using accountId from username
    const account = await accounts.findById(usernameRecord.accountId)
    if (account instanceof Error) throw account
    expect(account.id).toStrictEqual(newWalletDescriptor.accountId)
  })

  it("returns valid account for other capitalization", async () => {
    const username = randomUsername()

    // Create user
    const newWalletDescriptor = await createRandomUserAndBtcWallet()

    // Set username
    const res = await usernames.update({
      accountId: newWalletDescriptor.accountId,
      handle: username,
      isDefault: true,
    })
    expect(res).not.toBeInstanceOf(Error)

    // Find username using uppercase
    const usernameRecord = await usernames.findByHandle(
      username.toLocaleUpperCase() as Username,
    )
    if (usernameRecord instanceof Error) throw usernameRecord

    // Find account
    const account = await accounts.findById(usernameRecord.accountId)
    if (account instanceof Error) throw account
    expect(account.id).toStrictEqual(newWalletDescriptor.accountId)
  })

  it("errors if username does not exist", async () => {
    const username = checkedToUsername("non_user")
    if (username instanceof Error) throw username

    const result = await usernames.findByHandle(username)
    expect(result).toBeInstanceOf(Error)
  })
})
