import Ajv from "ajv"

import { configSchema, yamlConfig } from "@/config"

const ajv = new Ajv({ useDefaults: true, discriminator: true, $data: true })
const validate = ajv.compile(configSchema)

const cloneConfig = () => JSON.parse(JSON.stringify(yamlConfig))

describe("custodialMigrationFlow fee-retention invariant", () => {
  it("accepts the shipped-dark default config", () => {
    expect(validate(cloneConfig())).toBe(true)
  })

  it("accepts the flow enabled with fee-reserve retention on", () => {
    const config = cloneConfig()
    config.custodialMigrationFlow.enabled = true
    config.paymentNetworks.lightning.send.skipFeeReimbursement = true
    expect(validate(config)).toBe(true)
  })

  it("rejects the flow enabled while fees are reimbursed", () => {
    const config = cloneConfig()
    config.custodialMigrationFlow.enabled = true
    config.paymentNetworks.lightning.send.skipFeeReimbursement = false
    expect(validate(config)).toBe(false)
  })

  it("rejects the flow enabled with skipFeeReimbursement unset", () => {
    const config = cloneConfig()
    config.custodialMigrationFlow.enabled = true
    delete config.paymentNetworks.lightning.send.skipFeeReimbursement
    expect(validate(config)).toBe(false)
  })
})

describe("deMinimisThresholdSats floor", () => {
  it("rejects a threshold below the 10-sat drain floor", () => {
    const config = cloneConfig()
    config.custodialMigrationFlow.deMinimisThresholdSats = 9
    expect(validate(config)).toBe(false)
  })

  it("accepts a threshold of exactly 10", () => {
    const config = cloneConfig()
    config.custodialMigrationFlow.deMinimisThresholdSats = 10
    expect(validate(config)).toBe(true)
  })
})
