import React, { useState } from "react"
import {
  Button,
  Modal,
  ModalDialog,
  Typography,
  Input,
  FormControl,
  FormLabel,
  Stack,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Box,
} from "@mui/joy"
import {
  setDailyLimit,
  setWeeklyLimit,
  setMonthlyLimit,
  setAnnualLimit,
  removeLimit,
  removeWeeklyLimit,
  removeMonthlyLimit,
  removeAnnualLimit,
} from "@/app/api-keys/server-actions"

type LimitPeriod = "daily" | "weekly" | "monthly" | "annual"

interface LimitProps {
  id: string
  limits: {
    daily: number | null
    weekly: number | null
    monthly: number | null
    annual: number | null
  }
  spent: {
    last24h: number
    last7d: number
    last30d: number
    last365d: number
  }
}

const Limit: React.FC<LimitProps> = ({ id, limits, spent }) => {
  const [open, setOpen] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<LimitPeriod>("daily")
  const [limitValues, setLimitValues] = useState({
    daily: limits.daily?.toString() || "",
    weekly: limits.weekly?.toString() || "",
    monthly: limits.monthly?.toString() || "",
    annual: limits.annual?.toString() || "",
  })
  const [loading, setLoading] = useState(false)

  const periodConfig = {
    daily: {
      label: "Daily (24h)",
      description: "Set a rolling 24-hour spending limit",
      currentLimit: limits.daily,
      spent: spent.last24h,
      setValue: (val: string) => setLimitValues({ ...limitValues, daily: val }),
      getValue: () => limitValues.daily,
    },
    weekly: {
      label: "Weekly (7 days)",
      description: "Set a rolling 7-day spending limit",
      currentLimit: limits.weekly,
      spent: spent.last7d,
      setValue: (val: string) => setLimitValues({ ...limitValues, weekly: val }),
      getValue: () => limitValues.weekly,
    },
    monthly: {
      label: "Monthly (30 days)",
      description: "Set a rolling 30-day spending limit",
      currentLimit: limits.monthly,
      spent: spent.last30d,
      setValue: (val: string) => setLimitValues({ ...limitValues, monthly: val }),
      getValue: () => limitValues.monthly,
    },
    annual: {
      label: "Annual (365 days)",
      description: "Set a rolling 365-day spending limit",
      currentLimit: limits.annual,
      spent: spent.last365d,
      setValue: (val: string) => setLimitValues({ ...limitValues, annual: val }),
      getValue: () => limitValues.annual,
    },
  }

  const handleSetLimit = async (period: LimitPeriod) => {
    const config = periodConfig[period]
    const limitValue = config.getValue()

    if (!limitValue || parseInt(limitValue) <= 0) {
      alert("Please enter a valid limit in satoshis")
      return
    }

    setLoading(true)
    try {
      const satsValue = parseInt(limitValue)
      switch (period) {
        case "daily":
          await setDailyLimit({ id, dailyLimitSats: satsValue })
          break
        case "weekly":
          await setWeeklyLimit({ id, weeklyLimitSats: satsValue })
          break
        case "monthly":
          await setMonthlyLimit({ id, monthlyLimitSats: satsValue })
          break
        case "annual":
          await setAnnualLimit({ id, annualLimitSats: satsValue })
          break
      }
      setOpen(false)
      window.location.reload() // Refresh to show updated data
    } catch (error) {
      console.error("Error setting limit:", error)
      alert("Failed to set limit. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveLimit = async (period: LimitPeriod) => {
    const periodLabels = {
      daily: "daily",
      weekly: "weekly",
      monthly: "monthly",
      annual: "annual",
    }

    if (
      !confirm(
        `Are you sure you want to remove the ${periodLabels[period]} spending limit?`,
      )
    ) {
      return
    }

    setLoading(true)
    try {
      switch (period) {
        case "daily":
          await removeLimit({ id })
          break
        case "weekly":
          await removeWeeklyLimit({ id })
          break
        case "monthly":
          await removeMonthlyLimit({ id })
          break
        case "annual":
          await removeAnnualLimit({ id })
          break
      }
      setOpen(false)
      window.location.reload() // Refresh to show updated data
    } catch (error) {
      console.error("Error removing limit:", error)
      alert("Failed to remove limit. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const formatSats = (sats: number | null) => {
    if (sats === null) return "Unlimited"
    return `${sats.toLocaleString()} sats`
  }

  const hasAnyLimit = limits.daily || limits.weekly || limits.monthly || limits.annual

  return (
    <>
      <Button size="sm" variant="outlined" color="neutral" onClick={() => setOpen(true)}>
        {hasAnyLimit ? "Edit Limits" : "Set Limits"}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog sx={{ maxWidth: 600, width: "100%" }}>
          <Typography level="h4">Budget Limits</Typography>
          <Typography level="body-sm" sx={{ mt: 1, mb: 2 }}>
            Configure rolling budget limits for different time periods
          </Typography>

          <Tabs
            value={selectedPeriod}
            onChange={(_, value) => setSelectedPeriod(value as LimitPeriod)}
          >
            <TabList>
              <Tab value="daily">Daily</Tab>
              <Tab value="weekly">Weekly</Tab>
              <Tab value="monthly">Monthly</Tab>
              <Tab value="annual">Annual</Tab>
            </TabList>

            {(Object.keys(periodConfig) as LimitPeriod[]).map((period) => {
              const config = periodConfig[period]
              const remaining = config.currentLimit
                ? config.currentLimit - config.spent
                : null

              return (
                <TabPanel key={period} value={period}>
                  <Stack spacing={2}>
                    <Typography level="body-sm">{config.description}</Typography>

                    {config.currentLimit && (
                      <Box
                        sx={{
                          p: 2,
                          bgcolor: "background.level1",
                          borderRadius: "sm",
                        }}
                      >
                        <Stack spacing={1}>
                          <Typography level="body-sm">
                            <strong>Current Limit:</strong>{" "}
                            {formatSats(config.currentLimit)}
                          </Typography>
                          <Typography level="body-sm">
                            <strong>Spent:</strong> {formatSats(config.spent)}
                          </Typography>
                          <Typography level="body-sm">
                            <strong>Remaining:</strong> {formatSats(remaining)}
                          </Typography>
                        </Stack>
                      </Box>
                    )}

                    <FormControl>
                      <FormLabel>{config.label} Limit (satoshis)</FormLabel>
                      <Input
                        type="number"
                        value={config.getValue()}
                        onChange={(e) => config.setValue(e.target.value)}
                        placeholder="Enter limit in sats (e.g., 100000)"
                        disabled={loading}
                      />
                    </FormControl>

                    <Stack direction="row" spacing={1}>
                      <Button
                        onClick={() => handleSetLimit(period)}
                        loading={loading}
                        disabled={!config.getValue() || parseInt(config.getValue()) <= 0}
                      >
                        Set Limit
                      </Button>
                      {config.currentLimit && (
                        <Button
                          variant="outlined"
                          color="danger"
                          onClick={() => handleRemoveLimit(period)}
                          loading={loading}
                        >
                          Remove Limit
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                </TabPanel>
              )
            })}
          </Tabs>

          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button
              variant="outlined"
              color="neutral"
              onClick={() => setOpen(false)}
              disabled={loading}
              fullWidth
            >
              Close
            </Button>
          </Stack>
        </ModalDialog>
      </Modal>
    </>
  )
}

export default Limit
