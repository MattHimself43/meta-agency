import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // @react-pdf/renderer is loaded from node_modules at runtime (not bundled) and is imported lazily,
  // only inside the PDF render functions, so the dashboard and routines never load pdfkit.
  serverExternalPackages: ["postgres", "@react-pdf/renderer"],
  // pdfkit loads its standard fonts from data files that Next's tracer misses; ship them with the functions.
  outputFileTracingIncludes: {
    "/**": [
      "../../node_modules/pdfkit/js/standard-fonts/**",
      "./node_modules/pdfkit/js/standard-fonts/**",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
};

export default nextConfig;
