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

const checks = [
  {
    path: "/",
    includes: ["Đang mở trạm"],
    excludes: ["Lunar Fortune", "Premium Gacha Experience", "Not Found"],
  },
  {
    path: "/auth",
    includes: ["Đăng nhập host chiến dịch", "Tiếp tục với Google"],
    excludes: ["Tên định danh", "Legacy PIN", "Not Found"],
  },
  {
    path: "/setup",
    includes: ["Đang tải cấu hình"],
    excludes: ["Not Found"],
  },
  {
    path: "/draw",
    includes: ["ĐANG TẢI TRẠM RÚT"],
    excludes: ["Not Found"],
  },
  {
    path: "/campaigns",
    includes: ["Đang tải Campaign Studio"],
    excludes: ["Not Found"],
  },
  {
    path: "/claim/abcdefabcdefabcdefabcdef",
    includes: ["Đang kiểm tra link rút"],
    excludes: ["Not Found"],
  },
  {
    path: "/claim/not-a-code",
    includes: ["Link không hợp lệ", "Link rút này không đúng định dạng"],
    excludes: ["Đang kiểm tra link rút", "Not Found"],
  },
  {
    path: "/leaderboard",
    includes: ["Đang tải bảng thống kê"],
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

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
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
    await runCommand("npm", ["run", "build"], { env: smokeEnv });
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
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
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
