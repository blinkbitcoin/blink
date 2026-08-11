import { revalidatePath } from "next/cache"

import { AdminAccessRight } from "../../app/access-rights"
import { hasAccess } from "../../app/scope-access"
import { getClient } from "../../app/graphql-rsc"
import {
  MigrationFlowDocument,
  MigrationFlowQuery,
  MigrationFlowQueryVariables,
  MigrationRetryGrantDocument,
  MigrationRetryGrantMutation,
  MigrationRetryGrantMutationVariables,
  MigrationStatus,
} from "../../generated"

import MigrationRetryButton, { RetryGrantState } from "./migration-retry-button"

type PropType = {
  accountId: string
  scope: string
}

const grantRetry = async (
  _previous: RetryGrantState,
  formData: FormData,
): Promise<RetryGrantState> => {
  "use server"

  const accountId = formData.get("accountId") as string

  const { data } = await getClient().mutate<
    MigrationRetryGrantMutation,
    MigrationRetryGrantMutationVariables
  >({
    mutation: MigrationRetryGrantDocument,
    variables: { input: { accountId } },
  })

  const payload = data?.migrationRetryGrant
  const errors = payload?.errors ?? []
  if (errors.length > 0) {
    return { error: errors.map((e) => e.message).join("; "), granted: false }
  }
  if (!payload?.success) {
    return { error: "The retry was not granted.", granted: false }
  }

  revalidatePath("/account")
  return { error: null, granted: true }
}

const formatTime = (timestamp: number) => new Date(timestamp * 1000).toISOString()

const Migration = async ({ accountId, scope }: PropType) => {
  if (!hasAccess(scope, AdminAccessRight.MIGRATION_RETRY_GRANT)) return null

  const { data } = await getClient().query<
    MigrationFlowQuery,
    MigrationFlowQueryVariables
  >({
    query: MigrationFlowDocument,
    variables: { accountId },
  })

  const flow = data?.migrationFlow
  if (!flow) return null

  const isFailed = flow.status === MigrationStatus.Failed

  return (
    <div className="shadow p-6 min-w-0 rounded-lg shadow-xs overflow-hidden bg-white">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-gray-600">{"Migration"}</p>
        <span className="text-sm text-gray-600">{flow.status}</span>
      </div>

      <dl className="mt-4 text-sm text-gray-600 grid grid-cols-1 gap-1">
        <div className="flex justify-between gap-4">
          <dt>{"Payment hash"}</dt>
          <dd className="truncate">{flow.lnPaymentHash ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{"Destination pubkey"}</dt>
          <dd className="truncate">{flow.destinationSparkPubkey ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{"Proof verified"}</dt>
          <dd>{flow.destinationProofVerified ? "yes" : "no"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{"Last update"}</dt>
          <dd>{formatTime(flow.updatedAt)}</dd>
        </div>
      </dl>

      <ol className="mt-4 text-sm text-gray-600 border-t pt-3 space-y-1">
        {flow.steps.map((step, index) => (
          <li key={`${step.step}-${index}`} className="flex gap-3">
            <span className="text-gray-400 whitespace-nowrap">
              {formatTime(step.recordedAt)}
            </span>
            <span className="font-medium">{step.step}</span>
            {step.detail && <span className="truncate">{step.detail}</span>}
          </li>
        ))}
      </ol>

      <div className="mt-4">
        <MigrationRetryButton
          accountId={accountId}
          action={grantRetry}
          disabled={!isFailed}
          disabledReason={
            isFailed
              ? undefined
              : `Only a FAILED migration can be retried (${flow.status})`
          }
        />
      </div>
    </div>
  )
}

export default Migration
