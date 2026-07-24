import React from "react"

import { redirect } from "next/navigation"

import { ApolloQueryResult } from "@apollo/client"

import { apollo } from "../ssr-client"

import { defaultCurrencyMetadata } from "../currency-metadata"

import { env } from "@/env"
import UsernameLayoutContainer from "@/components/layouts/username-layout"
import { InvoiceProvider } from "@/context/invoice-context"
import {
  AccountDefaultWalletsDocument,
  AccountDefaultWalletsQuery,
} from "@/lib/graphql/generated"
import ErrorMessage from "@/components/error"

type Props = {
  children: React.ReactNode
  params: {
    username: string
  }
}

// When a username is deactivated on custodial Blink because it was migrated to a
// non-custodial account, check whether it is registered on the lnurl-server. If
// so, the user now lives on Blink Terminal, so send them there instead of
// showing an error. Returns the redirect target, or null if not migrated.
const migratedTerminalUrl = async (username: string): Promise<string | null> => {
  try {
    const res = await fetch(
      `${env.WELL_KNOWN_LNURL_URL}/.well-known/lnurlp/${encodeURIComponent(username)}`,
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    )
    if (!res.ok) return null
    const body = await res.json()
    if (body?.tag === "payRequest") {
      return `${env.BLINK_TERMINAL_URL}/${encodeURIComponent(username)}`
    }
  } catch (err) {
    console.error("error checking lnurl-server for migrated username", err)
  }
  return null
}

export default async function UsernameLayout({ children, params }: Props) {
  let response: ApolloQueryResult<AccountDefaultWalletsQuery> | { errorMessage: string }
  try {
    response = await apollo
      .unauthenticated()
      .getClient()
      .query<AccountDefaultWalletsQuery>({
        query: AccountDefaultWalletsDocument,
        variables: { username: params.username },
      })
  } catch (err) {
    console.error("error in username-layout.tsx", err)
    if (err instanceof Error) {
      response = { errorMessage: err.message }
    } else {
      console.error("Unknown error")
      response = { errorMessage: "An unknown error occurred" }
    }
  }

  if ("errorMessage" in response) {
    // Called outside the try/catch above because next/navigation redirect()
    // signals via a thrown error that must not be swallowed.
    const terminalUrl = await migratedTerminalUrl(params.username)
    if (terminalUrl) {
      redirect(terminalUrl)
    }
    return <ErrorMessage errorMessage={response.errorMessage}></ErrorMessage>
  }

  const initialState = {
    currentAmount: "0",
    createdInvoice: false,
    walletCurrency: response?.data?.accountDefaultWallet.walletCurrency,
    walletId: response?.data?.accountDefaultWallet.id,
    username: params.username,
    pinnedToHomeScreenModalVisible: false,
    memo: "",
    displayCurrencyMetaData: defaultCurrencyMetadata,
  }

  return (
    <InvoiceProvider initialState={initialState}>
      <UsernameLayoutContainer username={params.username}>
        {children}
      </UsernameLayoutContainer>
    </InvoiceProvider>
  )
}
