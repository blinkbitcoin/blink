type AppCheckServiceError = import("./errors").AppCheckServiceError

interface IAppCheckService {
  verifyToken(args: {
    token: string
    checkAlreadyConsumed?: boolean
  }): Promise<true | AppCheckServiceError>
}
