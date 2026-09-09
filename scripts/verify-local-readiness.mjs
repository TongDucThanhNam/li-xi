#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

const isWindows = process.platform === "win32";
const npmCommand = "npm";
const npxCommand = "npx";

const steps = [
  {
    label: "Convex codegen",
    command: npxCommand,
    args: ["convex", "codegen"],
  },
  {
    label: "TypeScript typecheck",
    command: npmCommand,
    args: ["run", "typecheck"],
  },
  {
    label: "Platform contract tests",
    command: npmCommand,
    args: ["run", "test:contracts"],
  },
  {
    label: "ESLint",
    command: npmCommand,
    args: ["run", "lint"],
  },
  {
    label: "Production dependency audit",
    command: npmCommand,
    args: ["audit", "--omit=dev"],
  },
  {
    label: "TanStack route smoke test",
    command: npmCommand,
    args: ["run", "test:smoke"],
  },
];

function runStep({ label, command, args }) {
  return new Promise((resolve, reject) => {
    console.log(`\n==> ${label}`);
    const useWindowsShell =
      isWindows && (command === npmCommand || command === npxCommand);
    const child = spawn(useWindowsShell ? [command, ...args].join(" ") : command, useWindowsShell ? [] : args, {
      stdio: "inherit",
      env: process.env,
      shell: useWindowsShell,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${label} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`
        )
      );
    });
  });
}

for (const step of steps) {
  await runStep(step);
}

await rm(".output", { recursive: true, force: true });

if (existsSync(".output")) {
  throw new Error("Expected .output to be absent after local readiness verification");
}

console.log("\nlocal readiness verification passed");
