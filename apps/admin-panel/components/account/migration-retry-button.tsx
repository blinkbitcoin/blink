"use client"

import React, { FormEvent } from "react"
import { useFormState, useFormStatus } from "react-dom"

export type RetryGrantState = {
  error: string | null
  granted: boolean
}

export const initialRetryGrantState: RetryGrantState = { error: null, granted: false }

const SubmitButton: React.FC = () => {
  const { pending } = useFormStatus()

  return (
    <button
      disabled={pending}
      className="text-sm bg-green-500 hover:bg-green-700 text-white font-bold p-2 border border-green-700 rounded disabled:opacity-50"
    >
      {pending ? "Granting…" : "Grant retry"}
    </button>
  )
}

type PropType = {
  accountId: string
  action: (previous: RetryGrantState, formData: FormData) => Promise<RetryGrantState>
}

const MigrationRetryButton: React.FC<PropType> = ({ accountId, action }) => {
  const [state, formAction] = useFormState(action, initialRetryGrantState)

  function confirmGrant(e: FormEvent) {
    if (
      !window.confirm(
        "Grant a migration retry for this account? The user must then re-run the migration from their own app.",
      )
    ) {
      e.preventDefault()
    }
  }

  return (
    <div>
      <form action={formAction} onSubmit={confirmGrant}>
        <input type="hidden" name="accountId" value={accountId} />
        <SubmitButton />
      </form>
      {state.error && (
        <p className="mt-2 text-sm text-red-600 break-words">{state.error}</p>
      )}
      {state.granted && (
        <p className="mt-2 text-sm text-green-700">
          {"Retry granted. The user can now re-run the migration."}
        </p>
      )}
    </div>
  )
}

export default MigrationRetryButton
