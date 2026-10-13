/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingRoot: require("path").join(__dirname, "../../"),
    instrumentationHook: true,
    serverComponentsExternalPackages: ["knex", "pg"],
    outputFileTracingIncludes: {
      "./": ["./services/db/migrations/**/*"],
    },
  },
  output: "standalone",
  // Disable the /_next/image optimizer: all images are static repo assets
  images: { unoptimized: true },
}

module.exports = nextConfig
