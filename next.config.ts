import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
import { version } from "./package.json";
import path from 'node:path';
const cloudflare = process.env.NEKOCIRCLE_CLOUDFLARE_BUILD === '1';

function buildVersion(): string {
  const supplied = process.env.BUILD_VERSION?.trim();
  if (supplied) {
    if (!/^[A-Za-z0-9._+-]{1,80}$/.test(supplied)) {
      throw new Error("BUILD_VERSION must contain 1–80 letters, digits, dots, underscores, pluses or hyphens.");
    }
    return supplied;
  }
  try {
    const repository = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
    }).trim();
    // 解压目录可能位于另一个仓库内部，不能误用父仓库的提交号。
    if (repository.replace(/\\/g, "/").toLowerCase() !== process.cwd().replace(/\\/g, "/").toLowerCase()) {
      throw new Error("Not a repository root");
    }
    const commit = execFileSync("git", ["rev-parse", "--short=8", "HEAD"], {
      cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
    }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], {
      cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
    }).trim();
    return `${version}-${commit}${dirty ? "+dirty" : ""}`;
  } catch {
    return `${version}-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
  }
}

const nextConfig: NextConfig = {
  webpack(config, { isServer, webpack }) {
    if (cloudflare && isServer) {
      config.resolve.alias = { ...config.resolve.alias,
        '@/lib/db$': path.resolve('lib/cloudflare-db.ts'),
        '@/lib/admin-data$': path.resolve('lib/cloudflare-admin-data.ts'),
        '@/lib/node-proxy$': path.resolve('lib/cloudflare-proxy.ts'),
      };
      // Next's tsconfig paths resolver may turn @/ imports into absolute requests
      // before aliases run. Replace both forms at module resolution time.
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(
        /(?:^|[/\\])lib[/\\](db|admin-data|node-proxy)(?:\.ts)?$/,
        (resource: { request: string }) => {
          const name = resource.request.match(/(db|admin-data|node-proxy)(?:\.ts)?$/)?.[1];
          const replacement = name === 'db' ? 'cloudflare-db' : name === 'admin-data' ? 'cloudflare-admin-data' : 'cloudflare-proxy';
          resource.request = path.resolve('lib', `${replacement}.ts`);
        },
      ));
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(
        /(?:^|[/\\])app[/\\]api[/\\]og[/\\]circle[/\\]route(?:\.tsx)?$/,
        path.resolve('lib/cloudflare-og-route.ts'),
      ));
    }
    return config;
  },
  async headers() {
    const headers = [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }, { key: "X-Frame-Options", value: "DENY" }];
    return ["/admin/:path*", "/api/admin/:path*", "/api/auth/:path*"].map(source => ({ source, headers }));
  },
  env: { NEXT_PUBLIC_BUILD_VERSION: buildVersion() },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    unoptimized: cloudflare,
    remotePatterns: [
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "abs.twimg.com" },
    ],
  },
};
export default nextConfig;
