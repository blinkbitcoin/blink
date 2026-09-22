import { OnChain, Lightning, Wallets, Payments, Merchants, InactivityFee } from "@/app"

import { getCronConfig, getInactivityFeeConfig, TWO_MONTHS_IN_MS } from "@/config"

import { ErrorLevel } from "@/domain/shared"
import { OperationInterruptedError } from "@/domain/errors"
import {
  feeRunId,
  isFifteenthOfMonthUtc,
  isFirstOfMonthUtc,
  noticeRunId,
} from "@/domain/inactivity-fee"

import {
  addAttributesToCurrentSpan,
  recordExceptionInCurrentSpan,
  wrapAsyncToRunInSpan,
} from "@/services/tracing"
import {
  deleteExpiredLightningPaymentFlows,
  deleteFailedPaymentsAttemptAllLnds,
  updateEscrows,
  updateRoutingRevenues,
} from "@/services/lnd/utils"
import { baseLogger } from "@/services/logger"
import { setupMongoConnection } from "@/services/mongodb"
import { activateLndHealthCheck, checkAllLndHealth } from "@/services/lnd/health"

import { elapsedSinceTimestamp, sleep } from "@/utils"
import { rebalancingInternalChannels } from "@/services/lnd/rebalancing"

const logger = baseLogger.child({ module: "cron" })

const rebalance = async () => {
  const result = await OnChain.rebalanceToColdWallet()
  if (result instanceof Error) throw result
}

const updatePendingLightningInvoices = () => Wallets.handleHeldInvoices(logger)

const updatePendingLightningPayments = () => Payments.updatePendingPayments(logger)

const updateLegacyOnChainReceipt = async () => {
  const txNumber = await Wallets.updateLegacyOnChainReceipt({ logger })
  if (txNumber instanceof Error) throw txNumber
}

const deleteExpiredPaymentFlows = async () => {
  await deleteExpiredLightningPaymentFlows()
}

const updateLnPaymentsCollection = async () => {
  const result = await Lightning.updateLnPayments()
  if (result instanceof Error) throw result
}

const deleteLndPaymentsBefore2Months = async () => {
  const timestamp2Months = new Date(Date.now() - TWO_MONTHS_IN_MS)
  const result = await Lightning.deleteLnPaymentsBefore(timestamp2Months)
  if (result instanceof Error) throw result
}

const removeInactiveMerchants = async () => {
  const result = await Merchants.removeInactiveMerchants()
  if (result instanceof Error) throw result
}

// Monthly, from the daily container: the UTC-1st gate lives here so no schedule changes.
// Live whenever the task is registered (cronConfig.inactivityFeeJobsEnabled); dry-run is only
// reachable through the on-demand runner in src/debug.
export const inactivityFeeNoticeJob = async () => {
  const asOf = new Date()
  if (!isFirstOfMonthUtc({ date: asOf })) {
    addAttributesToCurrentSpan({ "inactivityfee.notice.skipped": "not_first_of_month" })
    return
  }
  const result = await InactivityFee.runNoticeJob({
    asOf,
    dryRun: false,
    runId: noticeRunId({ asOf }),
  })
  if (result instanceof Error) throw result
}

// Monthly, from the daily container: the UTC-15th gate lives here. Dry until the CCO switch
// (inactivityFee.liveCharging) is on; a 15th missed or run dry is never charged for later.
export const inactivityFeeFeeJob = async () => {
  const asOf = new Date()
  if (!isFifteenthOfMonthUtc({ date: asOf })) {
    addAttributesToCurrentSpan({ "inactivityfee.fee.skipped": "not_fifteenth_of_month" })
    return
  }
  const result = await InactivityFee.runFeeJob({
    asOf,
    dryRun: !getInactivityFeeConfig().liveCharging,
    runId: feeRunId({ asOf }),
  })
  if (result instanceof Error) throw result
}

const main = async () => {
  console.log("cronjob started")
  const start = new Date()
  await checkAllLndHealth()

  const cronConfig = getCronConfig()
  const results: Array<boolean> = []
  const mongoose = await setupMongoConnection()

  const tasks = [
    // bitcoin related tasks
    rebalancingInternalChannels,
    updateEscrows,
    updatePendingLightningInvoices,
    updatePendingLightningPayments,
    updateLnPaymentsCollection,
    updateRoutingRevenues,
    updateLegacyOnChainReceipt,
    ...(cronConfig.rebalanceEnabled ? [rebalance] : []),
    deleteExpiredPaymentFlows,
    deleteLndPaymentsBefore2Months,
    deleteFailedPaymentsAttemptAllLnds,
    ...(cronConfig.removeInactiveMerchantsEnabled ? [removeInactiveMerchants] : []),
    ...(cronConfig.inactivityFeeJobsEnabled
      ? [inactivityFeeNoticeJob, inactivityFeeFeeJob]
      : []),
  ]

  const PROCESS_KILL_EVENTS = ["SIGTERM", "SIGINT"]
  for (const task of tasks) {
    const taskStart = new Date()

    try {
      logger.info(`starting ${task.name}`)

      const wrappedTask = wrapAsyncToRunInSpan({
        namespace: "cron",
        fnName: task.name,
        fn: async () => {
          const span = addAttributesToCurrentSpan({ jobCompleted: "false" })

          // Same function reference must be passed to process.on & process.removeListener. Listeners
          // aren't removed if an anonymous function or different functions are used
          const signalHandler = async (eventName: string) => {
            const finishDelay = 5_000

            logger.info(`Received ${eventName} signal. Finishing span...`)
            const elapsed = elapsedSinceTimestamp(start)
            recordExceptionInCurrentSpan({
              error: new OperationInterruptedError(
                `Operation was interrupted by '${eventName}' signal after ${elapsed.toLocaleString()}s`,
              ),
              level: ErrorLevel.Critical,
              attributes: { killSignal: eventName, elapsedBeforeKillInSeconds: elapsed },
            })
            span?.end()
            await sleep(finishDelay)
            logger.info(`Finished span with '${finishDelay}'ms delay to flush.`)

            process.exit()
          }

          for (const event of PROCESS_KILL_EVENTS) {
            process.on(event, signalHandler)
          }

          // Always remove listener on loop continue, else signalHandler could target incorrect span
          try {
            const res = await task()

            for (const event of PROCESS_KILL_EVENTS) {
              process.removeListener(event, signalHandler)
            }

            addAttributesToCurrentSpan({ jobCompleted: "true" })

            return res
          } catch (error) {
            for (const event of PROCESS_KILL_EVENTS) {
              process.removeListener(event, signalHandler)
            }
            addAttributesToCurrentSpan({ jobCompleted: "true" })

            throw error
          }
        },
      })

      await wrappedTask()

      logger.info(
        `finished ${task.name} in ${elapsedSinceTimestamp(taskStart)}s (success: true)`,
      )
      results.push(true)
    } catch (error) {
      logger.error({ error }, `issue with task ${task.name}`)

      logger.info(
        `finished ${task.name} in ${elapsedSinceTimestamp(taskStart)}s (success: false)`,
      )
      results.push(false)
    }
  }

  await mongoose.connection.close()

  process.exit(results.every((r) => r) ? 0 : 99)
}

if (require.main === module) {
  try {
    activateLndHealthCheck()
    main()
  } catch (err) {
    logger.warn({ err }, "error in the cron job")
  }
}
