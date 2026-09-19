export const extraGrantScopes = (
  grantScope: string[],
  requestedScope: string[],
): string[] => grantScope.filter((scope) => !requestedScope.includes(scope))
