#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

const steps = [
  {
    label: "Convex codegen",
    command: "npx",
    args: ["convex", "codegen"],
  },
  {
    label: "TypeScript typecheck",
    command: "npm",
    args: ["run", "typecheck"],
  },
  {
    label: "SaaS contract tests",
    command: "npm",
    args: ["run", "test:contracts"],
  },
  {
    label: "ESLint",
    command: "npm",
    args: ["run", "lint"],
  },
  {
    label: "Production dependency audit",
    command: "npm",
    args: ["audit", "--omit=dev"],
  },
  {
    label: "TanStack route smoke test",
    command: "npm",
    args: ["run", "test:smoke"],
  },
];

function runStep({ label, command, args }) {
  return new Promise((resolve, reject) => {
    console.log(`\n==> ${label}`);
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
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
