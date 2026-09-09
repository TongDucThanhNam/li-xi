#!/usr/bin/env node

import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

const port = Number(process.env.SMOKE_PORT ?? 3100);
const explicitBaseUrl = process.env.SMOKE_BASE_URL;
const baseUrl = explicitBaseUrl ?? `http://127.0.0.1:${port}`;
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 30000);
const smokeConvexUrl = explicitBaseUrl ? (process.env.VITE_CONVEX_URL ?? "https://smoke-test.convex.cloud") : "https://smoke-test.convex.cloud";
const smokeSiteUrl = explicitBaseUrl ? (process.env.VITE_SITE_URL ?? baseUrl) : baseUrl;
const smokeEnv = {
  ...process.env,
  VITE_CONVEX_URL: smokeConvexUrl,
  VITE_SITE_URL: smokeSiteUrl,
};
const isWindows = process.platform === "win32";
const npmCommand = "npm";
const workspacePending = ["Đang mở trang", "Đang chuẩn bị dữ liệu và quyền truy cập"];

const checks = [
  {
    path: "/",
    includes: ["Đang mở không gian làm việc"],
    excludes: ["Lunar Fortune", "Premium Gacha Experience", "Not Found"],
  },
  {
    path: "/auth",
    includes: ["Đăng nhập dành cho host", "Tiếp tục với Google"],
    excludes: ["Tên định danh", "Legacy PIN", "Not Found"],
  },
  {
    path: "/setup",
    includes: ["Đang mở thiết lập phù hợp"],
    excludes: ["Not Found"],
  },
  {
    path: "/draw",
    includes: ["Đang xác định trò chơi mặc định"],
    excludes: ["Not Found"],
  },
  {
    path: "/campaigns",
    includes: workspacePending,
    excludes: ["Not Found"],
  },
  {
    path: "/onboarding",
    includes: workspacePending,
    excludes: ["Not Found"],
  },
  {
    path: "/campaigns/new",
    includes: workspacePending,
    excludes: ["Not Found"],
  },
  {
    path: "/campaigns/abcdefabcdefabcdefabcdef",
    includes: workspacePending,
    excludes: ["Not Found"],
  },
  {
    path: "/campaigns/abcdefabcdefabcdefabcdef/games",
    includes: workspacePending,
    excludes: ["Not Found"],
  },
  {
    path: "/campaigns/abcdefabcdefabcdefabcdef/games/abcdefabcdefabcdefabcdef",
    includes: workspacePending,
    excludes: ["Not Found"],
  },
  {
    path: "/campaigns/abcdefabcdefabcdefabcdef/rewards",
    includes: workspacePending,
    excludes: ["Not Found"],
  },
  {
    path: "/campaigns/abcdefabcdefabcdefabcdef/distribution",
    includes: workspacePending,
    excludes: ["Not Found"],
  },
  {
    path: "/analytics?view=overview",
    includes: workspacePending,
    excludes: ["Not Found"],
  },
  {
    path: "/settings/billing",
    includes: workspacePending,
    excludes: ["Not Found"],
  },
  {
    path: "/settings/integrations",
    includes: workspacePending,
    excludes: ["Not Found"],
  },
  {
    path: "/settings/operations",
    includes: workspacePending,
    excludes: ["Not Found"],
  },
  {
    path: "/operate/abcdefabcdefabcdefabcdef",
    includes: workspacePending,
    excludes: ["Not Found"],
  },
  {
    path: "/station/abcdefabcdefabcdefabcdef",
    includes: ["Đang tải trạm chơi"],
    excludes: ["Not Found"],
  },
  {
    path: "/play/abcdefabcdefabcdefabcdef",
    includes: ["Đang kiểm tra liên kết chơi"],
    excludes: ["Not Found"],
  },
  {
    path: "/play/not-a-code",
    includes: ["Liên kết chơi không hợp lệ", "Liên kết chơi này không đúng định dạng"],
    excludes: ["Đang kiểm tra liên kết chơi", "Not Found"],
  },
  {
    path: "/claim/abcdefabcdefabcdefabcdef",
    includes: ["Đang kiểm tra liên kết chơi"],
    excludes: ["Not Found"],
  },
  {
    path: "/claim/not-a-code",
    includes: ["Liên kết chơi không hợp lệ", "Liên kết chơi này không đúng định dạng"],
    excludes: ["Đang kiểm tra liên kết chơi", "Not Found"],
  },
  {
    path: "/leaderboard",
    includes: workspacePending,
    excludes: ["Not Found"],
  },
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/auth`, {
        headers: { accept: "text/html" },
      });
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }

  throw new Error(
    `Timed out waiting for ${baseUrl}. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function assertRoute({ path, includes, excludes }) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, { headers: { accept: "text/html" } });

  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }

  const html = await response.text();

  for (const expected of includes) {
    if (!html.includes(expected)) {
      throw new Error(`${path} did not include expected text: ${expected}`);
    }
  }

  for (const unexpected of excludes) {
    if (html.includes(unexpected)) {
      throw new Error(`${path} included unexpected text: ${unexpected}`);
    }
  }

  console.log(`ok ${path}`);
}

let child = null;
let builtOutput = false;
let serverDiagnostics = "";

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const useWindowsShell = isWindows && command === npmCommand;
    const childProcess = spawn(useWindowsShell ? [command, ...args].join(" ") : command, useWindowsShell ? [] : args, {
      stdio: "inherit",
      env: process.env,
      shell: useWindowsShell,
      ...options,
    });

    childProcess.on("error", reject);
    childProcess.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} exited with ${
            signal ? `signal ${signal}` : `code ${code}`
          }`
        )
      );
    });
  });
}

try {
  if (!explicitBaseUrl) {
    await runCommand(npmCommand, ["run", "build"], { env: smokeEnv });
    builtOutput = true;

    child = spawn(
      "node",
      [".output/server/index.mjs"],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...smokeEnv,
          HOST: process.env.HOST ?? "127.0.0.1",
          PORT: String(port),
        },
      }
    );

    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => {
      serverDiagnostics += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on("exit", (code, signal) => {
      if (code !== null && code !== 0) {
        console.error(`dev server exited with code ${code}`);
      }
      if (signal) {
        console.error(`dev server exited with signal ${signal}`);
      }
    });
  }

  await waitForServer();

  for (const check of checks) {
    await assertRoute(check);
  }

  if (serverDiagnostics.includes("aria-label or aria-labelledby prop is required for accessibility")) {
    throw new Error("Route smoke emitted an accessibility warning for an unnamed interactive collection");
  }

  console.log("route smoke checks passed");
} finally {
  if (child) {
    child.kill("SIGTERM");
    await delay(250);
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }
  if (builtOutput && process.env.SMOKE_KEEP_OUTPUT !== "true") {
    await rm(".output", { recursive: true, force: true });
  }
}
