import { Payments } from "@/app"

import { toSats } from "@/domain/bitcoin"
import {
  PaymentSendStatus,
  decodeInvoice,
  InsufficientBalanceForRoutingError,
  LnAlreadyPaidError,
} from "@/domain/bitcoin/lightning"
import { WalletCurrency } from "@/domain/shared"

import { LnPayment } from "@/services/lnd/schema"
import { AccountsRepository } from "@/services/mongoose"
import * as LndImpl from "@/services/lnd"

import {
  createMandatoryUsers,
  createRandomUserAndBtcWallet,
  recordReceiveLnPayment,
} from "test/helpers"

import * as ConfigImpl from "@/config"

let lnInvoice: LnInvoice

const DEFAULT_PUBKEY =
  "03ca1907342d5d37744cb7038375e1867c24a87564c293157c95b2a9d38dcfb4c2" as Pubkey

beforeAll(async () => {
  await createMandatoryUsers()

  const randomRequest =
    "lnbcrt10n1p39jatkpp5djwv295kunhe5e0e4whj3dcjzwy7cmcxk8cl2a4dquyrp3dqydesdqqcqzpuxqr23ssp56u5m680x7resnvcelmsngc64ljm7g5q9r26zw0qyq5fenuqlcfzq9qyyssqxv4kvltas2qshhmqnjctnqkjpdfzu89e428ga6yk9jsp8rf382f3t03ex4e6x3a4sxkl7ruj6lsfpkuu9u9ee5kgr5zdyj7x2nwdljgq74025p"
  const invoice = decodeInvoice(randomRequest)
  if (invoice instanceof Error) throw invoice
  lnInvoice = invoice
})

beforeEach(async () => {
  await LnPayment.deleteMany({})
})

afterEach(async () => {
  await LnPayment.deleteMany({})
  jest.restoreAllMocks()
})

const amount = toSats(1000)
const btcPaymentAmount: BtcPaymentAmount = {
  amount: BigInt(amount),
  currency: WalletCurrency.Btc,
}

const receiveAmounts = {
  btc: btcPaymentAmount,
  usd: {
    amount: 100n,
    currency: WalletCurrency.Usd,
  },
}

const receiveBankFee = {
  btc: { amount: 0n, currency: WalletCurrency.Btc },
  usd: { amount: 0n, currency: WalletCurrency.Usd },
}

const receiveDisplayAmounts = {
  amountDisplayCurrency: 100 as DisplayCurrencyBaseAmount,
  feeDisplayCurrency: 0 as DisplayCurrencyBaseAmount,
  displayCurrency: "USD" as DisplayCurrency,
}

describe("Lightning payment with first hop preference", () => {
  describe("fallback logic", () => {
    it("retries without first hop when preferred channel has insufficient balance", async () => {
      // Mock configuration to enable first hop preference
      const getPreferredFirstHopConfigSpy = jest
        .spyOn(ConfigImpl, "getPreferredFirstHopConfig")
        .mockReturnValue({
          enabled: true,
          outgoingChannels: ["123456789012345678" as ChanId],
          fallbackOnError: true,
        })

      // Setup LND service mock
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      let attemptCount = 0
      const lndServiceSpy = jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        defaultPubkey: (): Pubkey => DEFAULT_PUBKEY,
        listAllPubkeys: () => [],
        payInvoiceViaPaymentDetails: async ({ outgoingChannel }) => {
          attemptCount++
          // First attempt with outgoing channel fails
          if (attemptCount === 1 && outgoingChannel) {
            return new InsufficientBalanceForRoutingError()
          }
          // Second attempt without outgoing channel succeeds
          return {
            roundedUpFee: toSats(1),
            revealedPreImage: "preimage" as RevealedPreImage,
            sentFromPubkey: DEFAULT_PUBKEY,
          }
        },
      })

      // Create user and fund wallet
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(newWalletDescriptor.accountId)
      if (newAccount instanceof Error) throw newAccount

      const receive = await recordReceiveLnPayment({
        walletDescriptor: newWalletDescriptor,
        paymentAmount: receiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: receiveDisplayAmounts,
        memo: "funding",
      })
      if (receive instanceof Error) throw receive

      // Execute payment
      const paymentResult = await Payments.payInvoiceByWalletId({
        uncheckedPaymentRequest: lnInvoice.paymentRequest,
        memo: "test payment with first hop fallback",
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
      })

      // Verify payment succeeded after fallback
      expect(paymentResult).not.toBeInstanceOf(Error)
      if (paymentResult instanceof Error) throw paymentResult
      expect(paymentResult.status).toBe(PaymentSendStatus.Success)

      // Verify both attempts were made
      expect(attemptCount).toBe(2)

      // Cleanup
      getPreferredFirstHopConfigSpy.mockRestore()
      lndServiceSpy.mockRestore()
    })

    it("does not retry when error is non-retry-able", async () => {
      // Mock configuration to enable first hop preference
      const getPreferredFirstHopConfigSpy = jest
        .spyOn(ConfigImpl, "getPreferredFirstHopConfig")
        .mockReturnValue({
          enabled: true,
          outgoingChannels: ["123456789012345678" as ChanId],
          fallbackOnError: true,
        })

      // Setup LND service mock
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      let attemptCount = 0
      const lndServiceSpy = jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        defaultPubkey: (): Pubkey => DEFAULT_PUBKEY,
        listAllPubkeys: () => [],
        payInvoiceViaPaymentDetails: async ({ outgoingChannel }) => {
          attemptCount++
          // First attempt with outgoing channel fails with non-retry-able error
          if (attemptCount === 1 && outgoingChannel) {
            return new LnAlreadyPaidError()
          }
          // Should not reach here
          throw new Error("Should not retry for non-retry-able error")
        },
      })

      // Create user and fund wallet
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(newWalletDescriptor.accountId)
      if (newAccount instanceof Error) throw newAccount

      const receive = await recordReceiveLnPayment({
        walletDescriptor: newWalletDescriptor,
        paymentAmount: receiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: receiveDisplayAmounts,
        memo: "funding",
      })
      if (receive instanceof Error) throw receive

      // Execute payment
      const paymentResult = await Payments.payInvoiceByWalletId({
        uncheckedPaymentRequest: lnInvoice.paymentRequest,
        memo: "test payment with non-retry-able error",
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
      })

      // Verify payment failed with the original error
      expect(paymentResult).toBeInstanceOf(Error)

      // Verify only one attempt was made
      expect(attemptCount).toBe(1)

      // Cleanup
      getPreferredFirstHopConfigSpy.mockRestore()
      lndServiceSpy.mockRestore()
    })

    it("works normally when first hop preference is disabled", async () => {
      // Mock configuration to disable first hop preference
      const getPreferredFirstHopConfigSpy = jest
        .spyOn(ConfigImpl, "getPreferredFirstHopConfig")
        .mockReturnValue({
          enabled: false,
          outgoingChannels: [],
          fallbackOnError: true,
        })

      // Setup LND service mock
      const { LndService: LnServiceOrig } = jest.requireActual("@/services/lnd")
      let attemptCount = 0
      const lndServiceSpy = jest.spyOn(LndImpl, "LndService").mockReturnValue({
        ...LnServiceOrig(),
        defaultPubkey: (): Pubkey => DEFAULT_PUBKEY,
        listAllPubkeys: () => [],
        payInvoiceViaPaymentDetails: async ({ outgoingChannel }) => {
          attemptCount++
          // Should not receive outgoing channel when disabled
          expect(outgoingChannel).toBeUndefined()
          return {
            roundedUpFee: toSats(1),
            revealedPreImage: "preimage" as RevealedPreImage,
            sentFromPubkey: DEFAULT_PUBKEY,
          }
        },
      })

      // Create user and fund wallet
      const newWalletDescriptor = await createRandomUserAndBtcWallet()
      const newAccount = await AccountsRepository().findById(newWalletDescriptor.accountId)
      if (newAccount instanceof Error) throw newAccount

      const receive = await recordReceiveLnPayment({
        walletDescriptor: newWalletDescriptor,
        paymentAmount: receiveAmounts,
        bankFee: receiveBankFee,
        displayAmounts: receiveDisplayAmounts,
        memo: "funding",
      })
      if (receive instanceof Error) throw receive

      // Execute payment
      const paymentResult = await Payments.payInvoiceByWalletId({
        uncheckedPaymentRequest: lnInvoice.paymentRequest,
        memo: "test payment without first hop preference",
        senderWalletId: newWalletDescriptor.id,
        senderAccount: newAccount,
      })

      // Verify payment succeeded
      expect(paymentResult).not.toBeInstanceOf(Error)
      if (paymentResult instanceof Error) throw paymentResult
      expect(paymentResult.status).toBe(PaymentSendStatus.Success)

      // Verify only one attempt was made
      expect(attemptCount).toBe(1)

      // Cleanup
      getPreferredFirstHopConfigSpy.mockRestore()
      lndServiceSpy.mockRestore()
    })
  })
})
