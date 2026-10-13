/** @type {import('next').NextConfig} */

module.exports = {
  experimental: {
    outputFileTracingRoot: require("path").join(__dirname, "../../"),
    instrumentationHook: true,
  },
  transpilePackages: ["@galoy/galoy-components"],
  output: "standalone",
  // Disable the /_next/image optimizer: all images are static repo assets
  images: { unoptimized: true },
}
