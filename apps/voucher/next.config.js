/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: require("path").join(__dirname, "../../"),
  outputFileTracingIncludes: {
    "./": ["./services/db/migrations/**/*"],
  },
  serverExternalPackages: ["knex", "pg"],
  output: "standalone",
}

module.exports = nextConfig
