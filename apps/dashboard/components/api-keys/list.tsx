"use client"

import React from "react"
import Table from "@mui/joy/Table"
import Typography from "@mui/joy/Typography"
import Divider from "@mui/joy/Divider"
import { Stack } from "@mui/joy"

import RevokeKey from "./revoke"
import Limit from "./limit"
import { formatDate, getScopeText } from "./utils"

import { ApiKey } from "@/services/graphql/generated"

interface ApiKeysListProps {
  activeKeys: ApiKey[]
  expiredKeys: ApiKey[]
  revokedKeys: ApiKey[]
}

const ApiKeysList: React.FC<ApiKeysListProps> = ({
  activeKeys,
  expiredKeys,
  revokedKeys,
}) => {
  return (
    <>
      <Typography fontSize={22}>Active Keys</Typography>
      <Table aria-label="active keys table">
        <thead>
          <tr>
            <th style={{ width: "12%" }}>Name</th>
            <th style={{ width: "18%" }}>API Key ID</th>
            <th style={{ width: "8%" }}>Scope</th>
            <th style={{ width: "25%" }}>Budget Limits</th>
            <th style={{ width: "10%" }}>Expires At</th>
            <th style={{ width: "10%" }}>Last Used</th>
            <th style={{ width: "10%", textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {activeKeys.map(
            ({
              id,
              name,
              expiresAt,
              lastUsedAt,
              scopes,
              dailyLimitSats,
              weeklyLimitSats,
              monthlyLimitSats,
              annualLimitSats,
              spentLast24HSats,
              spentLast7DSats,
              spentLast30DSats,
              spentLast365DSats,
            }) => {
              const remainingDailyLimitSats =
                dailyLimitSats !== null && dailyLimitSats !== undefined
                  ? dailyLimitSats - (spentLast24HSats || 0)
                  : null

              const hasAnyLimit =
                dailyLimitSats || weeklyLimitSats || monthlyLimitSats || annualLimitSats

              return (
                <tr key={id}>
                  <td>{name}</td>
                  <td>{id}</td>
                  <td>{getScopeText(scopes)}</td>
                  <td>
                    {hasAnyLimit ? (
                      <Stack spacing={0.5}>
                        {dailyLimitSats && (
                          <div>
                            <Typography level="body-sm">
                              <strong>Daily:</strong> {dailyLimitSats.toLocaleString()}{" "}
                              sats
                            </Typography>
                            <Typography level="body-xs" color="neutral">
                              Spent: {spentLast24HSats?.toLocaleString() || 0} /
                              Remaining: {remainingDailyLimitSats?.toLocaleString() || 0}
                            </Typography>
                          </div>
                        )}
                        {weeklyLimitSats && (
                          <div>
                            <Typography level="body-sm">
                              <strong>Weekly:</strong> {weeklyLimitSats.toLocaleString()}{" "}
                              sats
                            </Typography>
                            <Typography level="body-xs" color="neutral">
                              Spent: {spentLast7DSats?.toLocaleString() || 0} / Remaining:{" "}
                              {(
                                weeklyLimitSats - (spentLast7DSats || 0)
                              ).toLocaleString()}
                            </Typography>
                          </div>
                        )}
                        {monthlyLimitSats && (
                          <div>
                            <Typography level="body-sm">
                              <strong>Monthly:</strong>{" "}
                              {monthlyLimitSats.toLocaleString()} sats
                            </Typography>
                            <Typography level="body-xs" color="neutral">
                              Spent: {spentLast30DSats?.toLocaleString() || 0} /
                              Remaining:{" "}
                              {(
                                monthlyLimitSats - (spentLast30DSats || 0)
                              ).toLocaleString()}
                            </Typography>
                          </div>
                        )}
                        {annualLimitSats && (
                          <div>
                            <Typography level="body-sm">
                              <strong>Annual:</strong> {annualLimitSats.toLocaleString()}{" "}
                              sats
                            </Typography>
                            <Typography level="body-xs" color="neutral">
                              Spent: {spentLast365DSats?.toLocaleString() || 0} /
                              Remaining:{" "}
                              {(
                                annualLimitSats - (spentLast365DSats || 0)
                              ).toLocaleString()}
                            </Typography>
                          </div>
                        )}
                      </Stack>
                    ) : (
                      <Typography level="body-sm" color="neutral">
                        Unlimited
                      </Typography>
                    )}
                  </td>
                  <td>{expiresAt ? formatDate(expiresAt) : "Never"}</td>
                  <td>{lastUsedAt ? formatDate(lastUsedAt) : "Never"}</td>
                  <td style={{ textAlign: "right" }}>
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Limit
                        id={id}
                        limits={{
                          daily: dailyLimitSats ?? null,
                          weekly: weeklyLimitSats ?? null,
                          monthly: monthlyLimitSats ?? null,
                          annual: annualLimitSats ?? null,
                        }}
                        spent={{
                          last24h: spentLast24HSats ?? 0,
                          last7d: spentLast7DSats ?? 0,
                          last30d: spentLast30DSats ?? 0,
                          last365d: spentLast365DSats ?? 0,
                        }}
                      />
                      <RevokeKey id={id} />
                    </Stack>
                  </td>
                </tr>
              )
            },
          )}
        </tbody>
      </Table>
      {activeKeys.length === 0 && <Typography>No active keys to display.</Typography>}

      <Divider />

      <Typography fontSize={22}>Revoked Keys</Typography>
      <Table aria-label="revoked keys table">
        <thead>
          <tr>
            <th style={{ width: "20%" }}>Name</th>
            <th style={{ width: "25%" }}>API Key ID</th>
            <th style={{ width: "15%" }}>Scope</th>
            <th style={{ width: "20%" }}>Created At</th>
            <th style={{ textAlign: "right", width: "15%" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {revokedKeys.map(({ id, name, createdAt, scopes }) => (
            <tr key={id}>
              <td>{name}</td>
              <td>{id}</td>
              <td>{getScopeText(scopes)}</td>
              <td>{formatDate(createdAt)}</td>
              <td style={{ textAlign: "right" }}>Revoked</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {revokedKeys.length === 0 && <Typography>No revoked keys to display.</Typography>}

      <Divider />

      {/* Expired Keys Section */}
      <Typography fontSize={22}>Expired Keys</Typography>
      <Table aria-label="expired keys table">
        <thead>
          <tr>
            <th style={{ width: "20%" }}>Name</th>
            <th style={{ width: "25%" }}>API Key ID</th>
            <th style={{ width: "15%" }}>Scope</th>
            <th style={{ width: "20%" }}>Created At</th>
            <th style={{ textAlign: "right", width: "15%" }}>Expires At</th>
          </tr>
        </thead>
        <tbody>
          {expiredKeys.map(({ id, name, createdAt, expiresAt, scopes }) => (
            <tr key={id}>
              <td>{name}</td>
              <td>{id}</td>
              <td>{getScopeText(scopes)}</td>
              <td>{formatDate(createdAt)}</td>
              <td style={{ textAlign: "right" }}>
                {expiresAt ? formatDate(expiresAt) : "Never"}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {expiredKeys.length === 0 && <Typography>No expired keys to display.</Typography>}
    </>
  )
}

export default ApiKeysList
