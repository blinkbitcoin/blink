import { Quiz } from "@/app"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import { GT } from "@/graphql/index"

import QuizClaim from "@/graphql/public/types/payload/quiz-claim"

const QuizClaimInput = GT.Input({
  name: "QuizClaimInput",
  fields: () => ({
    id: { type: GT.NonNull(GT.ID) },
    skipRewards: { type: GT.Boolean, defaultValue: false },
  }),
})

const QuizClaimMutation = GT.Field<
  null,
  GraphQLPublicContextAuth,
  { input: { id: string; skipRewards: boolean } }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(QuizClaim),
  args: {
    input: { type: GT.NonNull(QuizClaimInput) },
  },
  resolve: async (_, args, { domainAccount, ip }) => {
    const { id, skipRewards } = args.input

    const quizzes = await Quiz.claimQuiz({
      quizQuestionId: id,
      accountId: domainAccount.id,
      skipRewards,
      ip,
    })
    if (quizzes instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(quizzes)], quizzes: [] }
    }

    return {
      errors: [],
      quizzes,
    }
  },
})

export default QuizClaimMutation
