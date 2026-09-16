import { parseRepositoryError } from "./utils"

import { InactivityFeeRun } from "./schema"

export const InactivityFeeRunsRepository = (): IInactivityFeeRunsRepository => {
  const persistRun = async (
    run: InactivityFeeRun,
  ): Promise<InactivityFeeRun | RepositoryError> => {
    try {
      const result = await InactivityFeeRun.create({
        runId: run.runId,
        kind: run.kind,
        asOf: run.asOf,
        mode: run.mode,
        forcedDry: run.forcedDry,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        configVersion: run.configVersion,
        skipListHash: run.skipListHash,
        scanned: run.counts.scanned,
        accountsWithoutClock: run.counts.accountsWithoutClock,
        countsByOutcome: run.counts.byOutcome,
        countsBySkipReason: run.counts.bySkipReason,
        ...(run.error !== undefined ? { error: run.error } : {}),
      })
      return runFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  return { persistRun }
}

const runFromRaw = (result: InactivityFeeRunRecord): InactivityFeeRun => ({
  runId: result.runId,
  kind: result.kind as InactivityFeeRunKind,
  asOf: new Date(result.asOf),
  mode: result.mode as InactivityFeeRunMode,
  forcedDry: result.forcedDry,
  startedAt: new Date(result.startedAt),
  finishedAt: new Date(result.finishedAt),
  configVersion: result.configVersion,
  skipListHash: result.skipListHash,
  counts: {
    scanned: result.scanned,
    accountsWithoutClock: result.accountsWithoutClock,
    byOutcome: { ...result.countsByOutcome },
    bySkipReason: { ...result.countsBySkipReason },
  },
  error: result.error || undefined,
})
