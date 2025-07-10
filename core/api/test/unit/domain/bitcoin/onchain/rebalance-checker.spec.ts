import { toSats } from "@/domain/bitcoin"
import { RebalanceChecker } from "@/domain/bitcoin/onchain"

describe("RebalanceChecker", () => {
  const minBalance = toSats(10000)
  const minRebalanceSize = toSats(10000)
  const threshold = toSats(30000)
  const checker = RebalanceChecker({
    minBalance,
    minRebalanceSize,
    threshold,
  })
  it("returns the amount that should be rebalanced", () => {
    const totalBalance = toSats(60000)
    const availableBalance = toSats(50000)
    expect(
      checker.getWithdrawAmount({
        totalBalance,
        availableBalance,
      }),
    ).toEqual(toSats(40000))
  })
  it("returns 0 if the total balance is below the threshold", () => {
    const totalBalance = toSats(20000)
    const availableBalance = toSats(20000)
    expect(
      checker.getWithdrawAmount({
        totalBalance,
        availableBalance,
      }),
    ).toEqual(toSats(0))
  })
  it("returns 0 if the rebalance amount is below the min rebalance size", () => {
    const totalBalance = toSats(35000)
    const availableBalance = toSats(15000)
    expect(
      checker.getWithdrawAmount({
        totalBalance,
        availableBalance,
      }),
    ).toEqual(toSats(0))
  })
  it("returns the amount that should be rebalanced if no available balance is provided", () => {
    const totalBalance = toSats(60000)
    expect(
      checker.getWithdrawAmount({
        totalBalance,
      }),
    ).toEqual(toSats(50000))
  })
})
