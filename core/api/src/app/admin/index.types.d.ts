type AdminTriggerMarketingNotificationArgs = {
  userIdsFilter: string[] | undefined
  phoneCountryCodesFilter: string[] | undefined
  openDeepLink:
    | {
        screen: DeepLinkScreen | undefined
        action: DeepLinkAction | undefined
        label: string | undefined
      }
    | undefined
  openExternalUrl:
    | {
        url: string
        label: string | undefined
      }
    | undefined
  shouldSendPush: boolean
  shouldAddToHistory: boolean
  shouldAddToBulletin: boolean
  icon?: Icon
  localizedNotificationContents: {
    title: string
    body: string
    language: string
  }[]
}

type AdminFilteredUserCountArgs = {
  userIdsFilter: string[] | undefined
  phoneCountryCodesFilter: string[] | undefined
}
