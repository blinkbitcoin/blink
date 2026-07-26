import React from "react"

import { redirect } from "next/navigation"
import { headers } from "next/headers"

import { ApolloQueryResult } from "@apollo/client"

import { apollo } from "../ssr-client"

import { defaultCurrencyMetadata } from "../currency-metadata"

import { migratedTerminalUrl } from "./migrated-terminal-url"

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
    //
    // App Router layouts receive neither the pathname nor searchParams, so
    // middleware stamps them into the x-pathname/x-search request headers.
    // Of the routes sharing this layout, only /print has a Terminal
    // equivalent (the static paycode poster) and is preserved; /transaction
    // has no public equivalent on Terminal (tx history lives in the
    // authenticated dashboard) and deliberately collapses to the profile
    // root. The query string is forwarded as-is: pay's canonical URL always
    // carries amount/memo/display and Terminal parses them.
    const pathname = headers().get("x-pathname")
    const search = headers().get("x-search") ?? ""
    const subpath = pathname?.endsWith("/print") ? "/print" : ""
    const terminalUrl = await migratedTerminalUrl(params.username, subpath, search)
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
