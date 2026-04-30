import express from "express"

import { Server, ServerCredentials } from "@grpc/grpc-js"

import healthzHandler from "./middlewares/healthz"

import {
  TRANSACTIONS_GRPC_STREAM_HEALTH_PORT,
  TRANSACTIONS_GRPC_STREAM_PORT,
} from "@/config"

import { baseLogger } from "@/services/logger"
import { setupMongoConnection } from "@/services/mongodb"
import { TransactionsGrpcServer } from "@/services/transactions-stream/grpc-server"
import { TransactionsStreamService } from "@/services/transactions-stream/proto/transactions_grpc_pb"

const logger = baseLogger.child({ module: "transactions-grpc-stream-server" })

const startHealthServer = async () => {
  const app = express()

  app.get(
    "/healthz",
    healthzHandler({
      checkDbConnectionStatus: true,
      checkRedisStatus: false,
      checkLndsStatus: false,
      checkBriaStatus: false,
    }),
  )

  await new Promise<void>((resolve, reject) => {
    const healthServer = app.listen(TRANSACTIONS_GRPC_STREAM_HEALTH_PORT, () => {
      logger.info(
        { port: TRANSACTIONS_GRPC_STREAM_HEALTH_PORT },
        "Transactions gRPC stream health server listening",
      )
      resolve()
    })
    healthServer.once("error", reject)
  })
}

const startGrpcServer = async () => {
  const server = new Server()
  server.addService(TransactionsStreamService, TransactionsGrpcServer())

  const address = `0.0.0.0:${TRANSACTIONS_GRPC_STREAM_PORT}`
  await new Promise<void>((resolve, reject) => {
    server.bindAsync(address, ServerCredentials.createInsecure(), (err) => {
      if (err) return reject(err)
      return resolve()
    })
  })

  server.start()
  logger.info({ address }, "Transactions gRPC stream listening")
}

const main = async () => {
  await setupMongoConnection({ syncIndexes: false })
  await startGrpcServer()
  await startHealthServer()
}

main().catch((err) => {
  logger.error({ err }, "Transactions gRPC stream server failed")
  process.exit(1)
})
