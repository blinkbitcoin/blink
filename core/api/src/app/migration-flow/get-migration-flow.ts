import { MigrationFlowStateRepository } from "@/services/mongoose"

export const getMigrationFlow = async ({
  accountId,
}: {
  accountId: AccountId
}): Promise<MigrationFlow | ApplicationError> =>
  MigrationFlowStateRepository().findByAccountId(accountId)
