import { checkTotpRemovalBalance } from "@/domain/authentication"
import { TotpRemovalBalanceTooHighError } from "@/domain/authentication/errors"
import { WalletCurrency } from "@/domain/shared"

const blockedBalance = {
  btc: { amount: 5_000_000n, currency: WalletCurrency.Btc },
  usd: { amount: 500_000n, currency: WalletCurrency.Usd },
}

const balances = (btc: bigint, usd: bigint) => [
  { amount: btc, currency: WalletCurrency.Btc },
  { amount: usd, currency: WalletCurrency.Usd },
]

describe("checkTotpRemovalBalance", () => {
  it("passes when both balances are below their thresholds", () => {
    expect(
      checkTotpRemovalBalance({
        balances: balances(4_999_999n, 499_999n),
        blockedBalance,
      }),
    ).toBe(true)
  })

  it("passes with no wallets", () => {
    expect(checkTotpRemovalBalance({ balances: [], blockedBalance })).toBe(true)
  })

  it.each([
    ["BTC at the threshold", 5_000_000n, 0n],
    ["BTC above the threshold", 5_000_001n, 0n],
    ["USD at the threshold", 0n, 500_000n],
    ["USD above the threshold", 0n, 500_001n],
  ])("refuses with %s", (_, btc, usd) => {
    expect(
      checkTotpRemovalBalance({ balances: balances(btc, usd), blockedBalance }),
    ).toBeInstanceOf(TotpRemovalBalanceTooHighError)
  })

  it("sums same-currency wallets before comparing", () => {
    const twoBtcWallets = [
      { amount: 3_000_000n, currency: WalletCurrency.Btc },
      { amount: 2_000_000n, currency: WalletCurrency.Btc },
      { amount: 0n, currency: WalletCurrency.Usd },
    ]
    expect(
      checkTotpRemovalBalance({ balances: twoBtcWallets, blockedBalance }),
    ).toBeInstanceOf(TotpRemovalBalanceTooHighError)
  })

  it("compares each balance against its own currency's threshold", () => {
    expect(
      checkTotpRemovalBalance({ balances: balances(500_000n, 0n), blockedBalance }),
    ).toBe(true)
    expect(
      checkTotpRemovalBalance({ balances: balances(0n, 4_999_999n), blockedBalance }),
    ).toBeInstanceOf(TotpRemovalBalanceTooHighError)
  })
})
