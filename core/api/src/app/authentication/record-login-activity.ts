import { recordActivity } from "@/app/inactivity-fee"
import { ActivityKind } from "@/domain/inactivity-fee"
import { ErrorLevel } from "@/domain/shared"
import { AccountsRepository } from "@/services/mongoose"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

export const recordLoginActivity = async (
  args: { userId: UserId } | { accountId: AccountId },
): Promise<void> => {
  const accountId =
    "accountId" in args
      ? args.accountId
      : await AccountsRepository()
          .findByUserId(args.userId)
          .then((account) => (account instanceof Error ? account : account.id))

  const result =
    accountId instanceof Error
      ? accountId
      : await recordActivity({ accountId, kind: ActivityKind.Login })
  if (result instanceof Error) {
    recordExceptionInCurrentSpan({
      error: result,
      level: ErrorLevel.Warn,
      fallbackMsg: "error recording login activity",
    })
  }
}
