import { useState } from "react"
import {
  Box,
  FormControl,
  FormHelperText,
  Input,
  Typography,
  Select,
  Option,
  Checkbox,
} from "@mui/joy"
import InfoOutlined from "@mui/icons-material/InfoOutlined"

import FormSubmitButton from "../form-submit-button"

import { ApiKeyResponse } from "@/app/api-keys/api-key.types"

type ApiKeyFormProps = {
  state: ApiKeyResponse
  formAction: (formData: FormData) => Promise<void>
}

const ApiKeyForm = ({ state, formAction }: ApiKeyFormProps) => {
  const [enableCustomExpiresInDays, setEnableCustomExpiresInDays] = useState(false)
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null)
  const [showSpendingLimits, setShowSpendingLimits] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    await formAction(formData)
  }

  return (
    <FormControl sx={{ width: "100%" }} error={state.error}>
      <form
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1em",
        }}
        onSubmit={handleSubmit}
      >
        <NameInput />
        <ExpiresInSelect
          setEnableCustomExpiresInDays={setEnableCustomExpiresInDays}
          setExpiresInDays={setExpiresInDays}
        />
        {enableCustomExpiresInDays && (
          <CustomExpiresInDays
            expiresInDays={expiresInDays}
            setExpiresInDays={setExpiresInDays}
          />
        )}
        {state.error && <ErrorMessage message={state.message} />}
        <ScopeCheckboxes />
        <SpendingLimitsToggle
          showSpendingLimits={showSpendingLimits}
          setShowSpendingLimits={setShowSpendingLimits}
        />
        {showSpendingLimits && <SpendingLimitsInputs />}
        <SubmitButton />
      </form>
    </FormControl>
  )
}

const NameInput = () => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: "0.2em" }}>
    <Typography>Name</Typography>
    <Input
      data-testid="create-api-name-input"
      name="apiKeyName"
      id="apiKeyName"
      sx={{ padding: "0.6em", width: "100%" }}
      placeholder="API Key Name *"
    />
  </Box>
)

const ExpiresInSelect = ({
  setEnableCustomExpiresInDays,
  setExpiresInDays,
}: {
  setEnableCustomExpiresInDays: (value: boolean) => void
  setExpiresInDays: (value: number | null) => void
}) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: "0.2em" }}>
    <Typography>Expires In</Typography>
    <Select
      data-testid="create-api-expire-select"
      name="apiKeyExpiresInDaysSelect"
      id="apiKeyExpiresInDaysSelect"
      sx={{ padding: "0.6em" }}
      placeholder="Never"
      onChange={(_, v) => {
        if (v === "custom") {
          setEnableCustomExpiresInDays(true)
          setExpiresInDays(30)
        }
        if (v && v !== "custom") setExpiresInDays(parseInt(String(v)))
      }}
    >
      <Option data-testid="create-api-expire-30-days-select" value="30">
        30 days
      </Option>
      <Option value="90">90 days</Option>
      <Option value="custom">Custom</Option>
    </Select>
  </Box>
)

const CustomExpiresInDays = ({
  expiresInDays,
  setExpiresInDays,
}: {
  expiresInDays: number | null
  setExpiresInDays: (value: number) => void
}) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "row",
      columnGap: 2,
      alignItems: "center",
    }}
  >
    <Input
      name="apiKeyExpiresInDaysCustom"
      id="apiKeyExpiresInDaysCustom"
      sx={{ width: "100%", padding: "0.6em" }}
      onChange={(e) => {
        if (e.target.value && parseInt(e.target.value) > 0)
          setExpiresInDays(parseInt(e.target.value))
        else setExpiresInDays(0)
      }}
      type="number"
      value={String(expiresInDays)}
    />
    <Typography>days</Typography>
  </Box>
)

const ErrorMessage = ({ message }: { message: string | null }) => (
  <FormHelperText>
    <InfoOutlined />
    {message}
  </FormHelperText>
)

const ScopeCheckboxes = () => (
  <Box>
    <Typography>Scopes</Typography>
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "0.8em",
        marginTop: "1em",
      }}
    >
      <Checkbox
        name="readScope"
        id="readScope"
        label="Read"
        value="READ"
        defaultChecked
      />
      <Checkbox
        name="receiveScope"
        id="receiveScope"
        label="Receive"
        value="RECEIVE"
        defaultChecked
      />
      <Checkbox
        data-testid="write-scope-checkbox"
        name="writeScope"
        id="writeScope"
        label="Write"
        value="WRITE"
        defaultChecked
      />
    </Box>
  </Box>
)

const SpendingLimitsToggle = ({
  showSpendingLimits,
  setShowSpendingLimits,
}: {
  showSpendingLimits: boolean
  setShowSpendingLimits: (value: boolean) => void
}) => (
  <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "0.5em" }}>
    <Checkbox
      checked={showSpendingLimits}
      onChange={(e) => setShowSpendingLimits(e.target.checked)}
      label="Set budget limits"
    />
  </Box>
)

const SpendingLimitsInputs = () => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      gap: "1em",
      padding: "1em",
      border: "1px solid",
      borderColor: "divider",
      borderRadius: "8px",
    }}
  >
    <Typography level="body-sm" sx={{ fontWeight: "bold" }}>
      Limits (in satoshis)
    </Typography>
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.2em" }}>
      <Typography level="body-sm">Daily Limit</Typography>
      <Input
        name="dailyLimitSats"
        id="dailyLimitSats"
        type="number"
        placeholder="e.g., 100000"
        sx={{ padding: "0.6em", width: "100%" }}
      />
      <FormHelperText>Rolling 24-hour window</FormHelperText>
    </Box>
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.2em" }}>
      <Typography level="body-sm">Weekly Limit</Typography>
      <Input
        name="weeklyLimitSats"
        id="weeklyLimitSats"
        type="number"
        placeholder="e.g., 500000"
        sx={{ padding: "0.6em", width: "100%" }}
      />
      <FormHelperText>Rolling 7-day window</FormHelperText>
    </Box>
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.2em" }}>
      <Typography level="body-sm">Monthly Limit</Typography>
      <Input
        name="monthlyLimitSats"
        id="monthlyLimitSats"
        type="number"
        placeholder="e.g., 2000000"
        sx={{ padding: "0.6em", width: "100%" }}
      />
      <FormHelperText>Rolling 30-day window</FormHelperText>
    </Box>
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.2em" }}>
      <Typography level="body-sm">Annual Limit</Typography>
      <Input
        name="annualLimitSats"
        id="annualLimitSats"
        type="number"
        placeholder="e.g., 20000000"
        sx={{ padding: "0.6em", width: "100%" }}
      />
      <FormHelperText>Rolling 365-day window</FormHelperText>
    </Box>
  </Box>
)

const SubmitButton = () => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      width: "100%",
      alignItems: "center",
    }}
  >
    <FormSubmitButton
      data-testid="create-api-create-btn"
      variant="outlined"
      color="primary"
      type="submit"
      sx={{ width: "100%" }}
    >
      Create
    </FormSubmitButton>
  </Box>
)

export default ApiKeyForm
