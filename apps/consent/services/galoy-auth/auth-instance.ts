import { create as createAxiosInstance, AxiosInstance } from "axios"

import { env } from "../../env"

const axiosInstance: AxiosInstance = createAxiosInstance({
  baseURL: env.CORE_AUTH_URL,
  headers: { "Content-Type": "application/json" },
})

export default axiosInstance
