module.exports = {
  rewrites() {
    return [{ source: "/.well-known/lnurlp/:username", destination: "/lnurlp/:username" }]
  },
  experimental: {
    outputFileTracingRoot: require("path").join(__dirname, "../../"),
    instrumentationHook: true,
  },
  output: "standalone",
  // Disable the /_next/image optimizer: all images are static repo assets
  images: { unoptimized: true },
}
