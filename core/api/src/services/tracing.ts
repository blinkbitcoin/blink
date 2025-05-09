import { W3CTraceContextPropagator } from "@opentelemetry/core"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { registerInstrumentations } from "@opentelemetry/instrumentation"
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql"
import { GrpcInstrumentation } from "@opentelemetry/instrumentation-grpc"
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http"
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis"
import { MongoDBInstrumentation } from "@opentelemetry/instrumentation-mongodb"
import { Span as SdkSpan, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import {
  ATTR_CODE_FUNCTION,
  ATTR_CODE_NAMESPACE,
  ATTR_USER_ID,
  ATTR_SERVICE_NAME,
} from "@opentelemetry/semantic-conventions/incubating"

// these have been deprecated but we must keep them to avoid issues with alert system
const ATTR_ENDUSER_ID = "enduser.id"
const ATTR_HTTP_USER_AGENT = "http.user_agent"
const ATTR_HTTP_CLIENT_IP = "http.client_ip"

import {
  trace,
  context,
  propagation,
  Span as OriginalSpan,
  Attributes,
  SpanStatusCode,
  SpanOptions,
  TimeInput,
  Exception,
  Context,
  AttributeValue,
} from "@opentelemetry/api"

import { NetInstrumentation } from "@opentelemetry/instrumentation-net"

import type * as graphqlTypes from "graphql"
import { Resource } from "@opentelemetry/resources"

import { baseLogger } from "./logger"

import { ErrorLevel, RankedErrorLevel, parseErrorFromUnknown } from "@/domain/shared"
type ExtendedException = Exclude<Exception, string> & {
  level?: ErrorLevel
}

propagation.setGlobalPropagator(new W3CTraceContextPropagator())

// FYI this hook is executed BEFORE the `formatError` hook from apollo
// The data.errors field here may still change before being returned to the client
const gqlResponseHook = (span: ExtendedSpan, data: graphqlTypes.ExecutionResult) => {
  const baggage = propagation.getBaggage(context.active())
  if (baggage) {
    const ip = baggage.getEntry(ATTR_HTTP_CLIENT_IP)
    if (ip) {
      span.setAttribute(ATTR_HTTP_CLIENT_IP, ip.value)
    }
    const userAgent = baggage.getEntry(ATTR_HTTP_USER_AGENT)
    if (userAgent) {
      span.setAttribute(ATTR_HTTP_USER_AGENT, userAgent.value)
    }
  }

  if (data.errors && data.errors.length > 0) {
    recordGqlErrors({ errors: data.errors, span, subPathName: "" })
  }

  let gqlNestedKeys: string[] = []
  if (data.data) {
    gqlNestedKeys = Object.keys(data.data)
  }
  for (const nestedObj of gqlNestedKeys) {
    const nestedObjData = data.data?.[nestedObj] as Required<{
      errors: IError[]
    }>
    if (!nestedObjData) continue
    if (nestedObjData.errors && nestedObjData.errors.length > 0) {
      recordGqlErrors({ errors: nestedObjData.errors, span, subPathName: nestedObj })
    }
  }
}

const recordGqlErrors = ({
  errors,
  span,
  subPathName,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: any
  span: ExtendedSpan
  subPathName: string
}) => {
  const subPath = subPathName ? `${subPathName}.` : ""

  recordException(
    span,
    {
      name: `graphql.${subPath}execution.error`,
      message: JSON.stringify(errors),
    },
    ErrorLevel.Warn,
  )

  const setErrorAttribute = ({
    attribute,
    value,
  }: {
    attribute: string
    value: AttributeValue
  }) =>
    span.setAttribute(`graphql.${subPath ? "data." : subPath}error.${attribute}`, value)

  const firstErr = errors[0]
  if (subPath) {
    setErrorAttribute({
      attribute: `operation.name`,
      value: subPath.split(".").join(""), // remove trailing '.'
    })
  }

  setErrorAttribute({
    attribute: "message",
    value: firstErr.message,
  })

  setErrorAttribute({
    attribute: "type",
    value: firstErr.constructor?.name,
  })

  setErrorAttribute({
    attribute: "path",
    value: firstErr.path,
  })

  setErrorAttribute({
    attribute: "code",
    value: firstErr.extensions?.code || firstErr.code,
  })

  if (firstErr.originalError) {
    setErrorAttribute({
      attribute: "original.type",
      value: firstErr.originalError.constructor?.name,
    })

    setErrorAttribute({
      attribute: "original.message",
      value: firstErr.originalError.message,
    })
  }

  /* eslint @typescript-eslint/ban-ts-comment: "off" */
  // @ts-ignore-next-line no-implicit-any error
  errors.forEach((err, idx) => {
    setErrorAttribute({
      attribute: `${idx}.message`,
      value: err.message,
    })

    setErrorAttribute({
      attribute: `${idx}.type`,
      value: err.constructor?.name,
    })

    setErrorAttribute({
      attribute: `${idx}.path`,
      value: err.path,
    })

    setErrorAttribute({
      attribute: `${idx}.code`,
      value: err.extensions?.code || err.code,
    })

    if (err.originalError) {
      setErrorAttribute({
        attribute: `${idx}.original.type`,
        value: err.originalError.constructor?.name,
      })

      setErrorAttribute({
        attribute: `${idx}.original.message`,
        value: err.originalError.message,
      })
    }
  })
}

registerInstrumentations({
  instrumentations: [
    new NetInstrumentation(),
    new HttpInstrumentation({
      ignoreIncomingPaths: ["/healthz"],
      headersToSpanAttributes: {
        server: {
          requestHeaders: [
            "apollographql-client-name",
            "apollographql-client-version",
            "x-real-ip",
            "x-forwarded-for",
            "x-appcheck-jti",
            "user-agent",
          ],
        },
      },
    }),
    new GraphQLInstrumentation({
      mergeItems: true,
      allowValues: true,
      responseHook: gqlResponseHook,
    }),
    new MongoDBInstrumentation(),
    new GrpcInstrumentation({
      ignoreGrpcMethods: [/GetPrice/],
    }),
    new IORedisInstrumentation(),
  ],
})

// FIXME we should be using OTEL_SERVICE_NAME and not have to set it manually
// but it doesn't seem to work
const provider = new NodeTracerProvider({
  resource: Resource.default().merge(
    new Resource({
      [ATTR_SERVICE_NAME]: process.env.TRACING_SERVICE_NAME || "galoy-dev",
    }),
  ),
})
class SpanProcessorWrapper extends SimpleSpanProcessor {
  onStart(span: SdkSpan, parentContext: Context) {
    const ctx = context.active()
    if (ctx) {
      const baggage = propagation.getBaggage(ctx)
      if (baggage) {
        baggage.getAllEntries().forEach(([key, entry]) => {
          span.setAttribute(key, entry.value)
        })
      }
    }
    super.onStart(span, parentContext)
  }
}

provider.addSpanProcessor(new SpanProcessorWrapper(new OTLPTraceExporter()))

provider.register()

// the reason we have to use process.env.COMMITHASH instead of env.COMMITHASH
// is because tracing is been initialized before any other code is imported,
// including the env variables
export const tracer = trace.getTracer(process.env.COMMITHASH || "dev")

export const addAttributesToCurrentSpan = (attributes: Attributes) => {
  const span = trace.getSpan(context.active())
  if (span) {
    for (const [key, value] of Object.entries(attributes)) {
      if (value) {
        span.setAttribute(key, value)
      }
    }
  }
  return span
}

export const addEventToCurrentSpan = (
  name: string,
  attributesOrStartTime?: Attributes | TimeInput | undefined,
  startTime?: TimeInput | undefined,
) => {
  const span = trace.getSpan(context.active())
  if (span) {
    span.addEvent(name, attributesOrStartTime, startTime)
  }
}

export const recordExceptionInCurrentSpan = ({
  error,
  level,
  attributes,
  fallbackMsg,
}: {
  error: ExtendedException | unknown
  level?: ErrorLevel
  attributes?: Attributes
  fallbackMsg?: string
}) => {
  const span = trace.getSpan(context.active())
  if (!span || !error) return

  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      if (value) span.setAttribute(key, value)
    }
  }

  if (error instanceof Error) {
    recordException(span, error, level)
  } else if (fallbackMsg) {
    recordException(span, { message: fallbackMsg }, level)
  } else {
    recordException(
      span,
      { message: typeof error === "object" ? JSON.stringify(error) : "Unknown error" },
      level,
    )
  }
}

const updateErrorForSpan = ({
  span,
  errorLevel,
}: {
  span: ExtendedSpan
  errorLevel: ErrorLevel
}): boolean => {
  const spanErrorLevel =
    (span && span.attributes && (span.attributes["error.level"] as ErrorLevel)) ||
    ErrorLevel.Info
  const spanErrorRank = RankedErrorLevel.indexOf(spanErrorLevel)
  const errorRank = RankedErrorLevel.indexOf(errorLevel)

  return errorRank >= spanErrorRank
}

const recordException = (
  span: ExtendedSpan,
  exception: ExtendedException,
  level?: ErrorLevel,
) => {
  const errorLevel = level || exception["level"] || ErrorLevel.Warn

  // Write error attributes if update checks pass
  if (updateErrorForSpan({ span, errorLevel })) {
    span.setAttribute("error.level", errorLevel)
    span.setAttribute("error.name", exception["name"] || "undefined")
    span.setAttribute("error.message", exception["message"] || "undefined")
  }

  // Append error with next index
  let nextIdx = 0
  while (span.attributes && span.attributes[`error.${nextIdx}.level`] !== undefined) {
    nextIdx++
  }
  span.setAttribute(`error.${nextIdx}.level`, errorLevel)
  span.setAttribute(`error.${nextIdx}.name`, exception["name"] || "undefined")
  span.setAttribute(`error.${nextIdx}.message`, exception["message"] || "undefined")

  span.recordException(exception)
  span.setStatus({ code: SpanStatusCode.ERROR })
}

export const asyncRunInSpan = <F extends () => ReturnType<F>>(
  spanName: string,
  options: SpanOptions,
  fn: F,
) => {
  const ret = tracer.startActiveSpan(spanName, options, async (span) => {
    try {
      const ret = await Promise.resolve(fn())
      if ((ret as unknown) instanceof Error) {
        recordException(span, ret as Error)
      }
      span.end()
      return ret
    } catch (error) {
      const err = parseErrorFromUnknown(error)
      recordException(span, err, ErrorLevel.Critical)
      span.end()
      throw error
    }
  })
  return ret
}

const resolveFunctionSpanOptions = ({
  namespace,
  functionName,
  functionArgs,
  spanAttributes,
  root,
  ignoreFnArgs,
}: {
  namespace: string
  functionName: string
  functionArgs: Array<unknown>
  spanAttributes?: Attributes
  root?: boolean
  ignoreFnArgs?: boolean
}): SpanOptions => {
  const attributes: Attributes = {
    [ATTR_CODE_FUNCTION]: functionName,
    [ATTR_CODE_NAMESPACE]: namespace,
    ...spanAttributes,
  }
  if (!ignoreFnArgs && functionArgs && functionArgs.length > 0) {
    const params =
      typeof functionArgs[0] === "object" ? functionArgs[0] : { "0": functionArgs[0] }
    for (const key in params) {
      // @ts-ignore-next-line no-implicit-any error
      const value = params[key]
      attributes[`${ATTR_CODE_FUNCTION}.params.${key}`] = value
      attributes[`${ATTR_CODE_FUNCTION}.params.${key}.null`] = value === null
      attributes[`${ATTR_CODE_FUNCTION}.params.${key}.undefined`] = value === undefined
    }
  }
  return { attributes, root }
}

export const wrapToRunInSpan = <
  A extends Array<unknown>,
  R extends PartialResult<unknown> | unknown,
>({
  fn,
  fnName,
  namespace,
  spanAttributes,
  root,
  ignoreFnArgs,
}: {
  fn: (...args: A) => PromiseReturnType<R>
  fnName?: string
  namespace: string
  spanAttributes?: Attributes
  root?: boolean
  ignoreFnArgs?: boolean
}) => {
  const functionName = fnName || fn.name || "unknown"

  const wrappedFn = (...args: A): PromiseReturnType<R> => {
    const spanName = `${namespace}.${functionName}`
    const spanOptions = resolveFunctionSpanOptions({
      namespace,
      functionName,
      functionArgs: args,
      spanAttributes,
      root,
      ignoreFnArgs,
    })
    const ret = tracer.startActiveSpan(spanName, spanOptions, (span) => {
      try {
        const ret = fn(...args)
        if (ret instanceof Error) recordException(span, ret)
        const partialRet = ret as PartialResult<unknown>
        if (partialRet?.partialResult && partialRet?.error)
          recordException(span, partialRet.error)
        span.end()
        return ret
      } catch (error) {
        const err = parseErrorFromUnknown(error)
        recordException(span, err, ErrorLevel.Critical)
        span.end()
        throw error
      }
    })
    return ret
  }

  // Re-add the original name to the wrapped function
  Object.defineProperty(wrappedFn, "name", {
    value: functionName,
    configurable: true,
  })

  return wrappedFn
}

type PromiseReturnType<T> = T extends Promise<infer Return> ? Return : T

export const wrapAsyncToRunInSpan = <
  A extends Array<unknown>,
  R extends PartialResult<unknown> | unknown,
>({
  fn,
  fnName,
  namespace,
  spanAttributes,
  root,
  ignoreFnArgs,
}: {
  fn: (...args: A) => Promise<PromiseReturnType<R>>
  fnName?: string
  namespace: string
  spanAttributes?: Attributes
  root?: boolean
  ignoreFnArgs?: boolean
}) => {
  const functionName = fnName || fn.name || "unknown"

  const wrappedFn = (...args: A): Promise<PromiseReturnType<R>> => {
    // Determine if there's an active span that's recording
    const currentContext = context.active()
    const activeSpan = trace.getSpan(currentContext)
    const parentSpanIsRecording = activeSpan?.isRecording()
    const parentSpanName = (activeSpan as unknown as { name?: string })?.name

    const spanName = `${namespace}.${functionName}`
    const spanOptions = resolveFunctionSpanOptions({
      namespace,
      functionName,
      functionArgs: args,
      spanAttributes,
      root,
      ignoreFnArgs,
    })
    const ret = tracer.startActiveSpan(spanName, spanOptions, async (span) => {
      baseLogger.info(
        {
          function: spanOptions.attributes?.["code.function"],
          isRecording: span.isRecording(),
          spanId: span.spanContext().spanId,
          parentSpanIsRecording,
          parentSpanId: activeSpan?.spanContext().spanId,
          parentSpanName,
        },
        `spanName: ${spanName}`,
      )
      try {
        const ret = await fn(...args)
        if (ret instanceof Error) recordException(span, ret)
        const partialRet = ret as PartialResult<unknown>
        if (partialRet?.partialResult && partialRet?.error)
          recordException(span, partialRet.error)
        span.end()
        return ret
      } catch (error) {
        const err = parseErrorFromUnknown(error)
        recordException(span, err, ErrorLevel.Critical)
        span.end()
        throw error
      }
    })
    return ret
  }

  // Re-add the original name to the wrapped function
  Object.defineProperty(wrappedFn, "name", {
    value: functionName,
    configurable: true,
  })

  return wrappedFn
}

type FunctionReturn = PartialResult<unknown> | unknown
type FunctionType = (...args: unknown[]) => PromiseReturnType<FunctionReturn>
type AsyncFunctionType = (
  ...args: unknown[]
) => Promise<PromiseReturnType<FunctionReturn>>

export const wrapAsyncFunctionsToRunInSpan = <F extends object>({
  namespace,
  fns,
  root,
  spanAttributes,
}: {
  namespace: string
  fns: F
  root?: boolean
  spanAttributes?: Attributes
}): F => {
  const functions: Record<string, FunctionType | AsyncFunctionType> = {}
  for (const fnKey of Object.keys(fns)) {
    const fn = fnKey as keyof typeof fns
    const func = fns[fn] as FunctionType
    const fnType = func.constructor.name
    if (fnType === "Function") {
      functions[fnKey] = wrapToRunInSpan({
        namespace,
        fn: func,
        fnName: fnKey,
        root,
        spanAttributes,
      })
      continue
    }

    if (fnType === "AsyncFunction") {
      functions[fnKey] = wrapAsyncToRunInSpan({
        namespace,
        fn: fns[fn] as AsyncFunctionType,
        fnName: fnKey,
        root,
        spanAttributes,
      })
      continue
    }
  }
  return {
    ...fns,
    ...functions,
  }
}

export const addAttributesToCurrentSpanAndPropagate = <F extends () => ReturnType<F>>(
  attributes: { [key: string]: string | undefined },
  fn: F,
) => {
  const ctx = context.active()
  let baggage = propagation.getBaggage(ctx) || propagation.createBaggage()
  const currentSpan = trace.getSpan(ctx)
  Object.entries(attributes).forEach(([key, value]) => {
    if (value) {
      baggage = baggage.setEntry(key, { value })
      if (currentSpan) {
        currentSpan.setAttribute(key, value)
      }
    }
  })
  return context.with(propagation.setBaggage(ctx, baggage), fn)
}

export const shutdownTracing = async () => {
  await provider.forceFlush()
  await provider.shutdown()
}

export const SemanticResourceAttributes = {
  SERVICE_NAME: ATTR_SERVICE_NAME,
}

export const SemanticAttributes = {
  CODE_FUNCTION: ATTR_CODE_FUNCTION,
  CODE_NAMESPACE: ATTR_CODE_NAMESPACE,
  HTTP_CLIENT_IP: ATTR_HTTP_CLIENT_IP,
  HTTP_USER_AGENT: ATTR_HTTP_USER_AGENT,
  ENDUSER_ID: ATTR_ENDUSER_ID,
  USER_ID: ATTR_USER_ID,
}

export const ACCOUNT_USERNAME = "account.username"

export interface ExtendedSpan extends OriginalSpan {
  attributes?: Attributes
}
