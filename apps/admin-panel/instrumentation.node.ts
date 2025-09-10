import { NodeSDK } from "@opentelemetry/sdk-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { Resource } from "@opentelemetry/resources"
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions/incubating"
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node"
import { NetInstrumentation } from "@opentelemetry/instrumentation-net"
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http"
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql"
import { W3CTraceContextPropagator } from "@opentelemetry/core"

import { env } from "./app/env"

// Simply accessing the env object triggers validation of all variables
try {
  JSON.stringify(env)
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  throw new Error(
    `Failed to validate environment variables: ${errorMessage}. ` +
      `Please check your environment configuration.`
  )
}

const sdk = new NodeSDK({
  textMapPropagator: new W3CTraceContextPropagator(),
  resource: new Resource({
    [ATTR_SERVICE_NAME]: process.env.TRACING_SERVICE_NAME || "admin-panel",
  }),
  spanProcessor: new SimpleSpanProcessor(new OTLPTraceExporter()),
  instrumentations: [
    new NetInstrumentation(),
    new HttpInstrumentation(),
    new GraphQLInstrumentation({
      mergeItems: true,
      allowValues: true,
    }),
  ],
})
sdk.start()

process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => console.log("Tracing terminated"))
    .catch((error) => console.log("Error terminating tracing", error))
    .finally(() => process.exit(0))
})
