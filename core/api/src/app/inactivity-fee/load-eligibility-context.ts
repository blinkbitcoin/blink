import { gatherCohortSignals } from "@/app/wind-down/gather-cohort-signals"
import { getAccountWindDown } from "@/app/wind-down/get-account-wind-down"

import { CouldNotListWalletsFromAccountIdError } from "@/domain/errors"
import { assessCohortResidency } from "@/domain/wind-down"

import { LedgerService } from "@/services/ledger"
import { WalletsRepository } from "@/services/mongoose"

// Everything the context-dependent eligibility checks need for one account; the caller has
// already passed the static checks and looked up the notice row. Expensive signals are loaded
// only when they can change the verdict: wind-down status only once a region is armed
// (PreCutoff never skips), jurisdiction only when notPermittedCountries is set.
export const loadEligibilityContext = async ({
  account,
  activeNotice,
  config,
  windDownConfig,
}: {
  account: Account
  activeNotice: InactivityFeeNotice | undefined
  config: InactivityFeeConfig
  windDownConfig: WindDownConfig
}): Promise<InactivityFeeLoadedContext | ApplicationError> => {
  const wallets = await loadWalletBalances({ account })
  if (wallets instanceof Error) return wallets

  const windDownStatus = await loadWindDownStatus({ account, windDownConfig })
  if (windDownStatus instanceof Error) return windDownStatus

  const assignedCountry = await loadAssignedCountry({ account, config, windDownConfig })
  if (assignedCountry instanceof Error) return assignedCountry

  return {
    activeNotice,
    balances: wallets.map(({ balance }) => balance),
    wallets,
    windDownStatus,
    assignedCountry,
  }
}

// MainBook.balance is the snapshot plus every entry after it: exact at read time
const loadWalletBalances = async ({
  account,
}: {
  account: Account
}): Promise<InactivityFeeWalletBalance[] | ApplicationError> => {
  const wallets = await WalletsRepository().listByAccountId(account.id)
  // an account without wallets holds nothing
  if (wallets instanceof CouldNotListWalletsFromAccountIdError) return []
  if (wallets instanceof Error) return wallets

  const loaded: InactivityFeeWalletBalance[] = []
  for (const wallet of wallets) {
    const balance = await LedgerService().getWalletBalanceAmount(wallet)
    if (balance instanceof Error) return balance
    loaded.push({ wallet, balance })
  }
  return loaded
}

const loadWindDownStatus = async ({
  account,
  windDownConfig,
}: {
  account: Account
  windDownConfig: WindDownConfig
}): Promise<WindDownStatus | undefined | ApplicationError> => {
  const armed =
    windDownConfig.enabled &&
    windDownConfig.regions.some((region) => region.receiveDisabled || region.gateClosed)
  if (!armed) return undefined

  const state = await getAccountWindDown({ account })
  if (state instanceof Error) return state
  return state?.status
}

// same evidence and hierarchy as the wind-down cohort assessment, against the fee's own list;
// no evidence means no attributed jurisdiction
const loadAssignedCountry = async ({
  account,
  config,
  windDownConfig,
}: {
  account: Account
  config: InactivityFeeConfig
  windDownConfig: WindDownConfig
}): Promise<string | undefined | ApplicationError> => {
  if (config.notPermittedCountries.length === 0) return undefined

  const signals = await gatherCohortSignals({
    accountId: account.id,
    kratosUserId: account.kratosUserId,
    ipEvidenceCutoff: windDownConfig.ipEvidenceCutoff,
  })
  if (signals instanceof Error) return signals

  const verdict = assessCohortResidency({
    phoneCountry: signals.phoneCountry,
    newestDeletedPhoneCountry: signals.deletedPhoneCountries[0],
    creationIpCountry: signals.creationIpCountry,
    latestIpCountry: signals.latestIpCountry,
    affectedCountries: config.notPermittedCountries,
    strictCountries: [],
  })
  return verdict.assignedCountry
}
