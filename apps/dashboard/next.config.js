/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: require("path").join(__dirname, "../../"),
  output: "standalone",
  // Security: keep the Next.js image optimizer (/_next/image) disabled.
  // Every next/image source in this app is a static repo asset, so optimization
  // buys nothing, while the optimizer is a public endpoint that decodes images
  // server-side and has had critical advisories (e.g. GHSA-2xp9-vwfh-vxw4, RCE
  // via AVIF decoding). Do not re-enable without a security review; see
  // blinkbitcoin/blink-wip#1262.
  images: { unoptimized: true },
}

module.exports = nextConfig
