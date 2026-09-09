#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

declare const Bun: {
  argv: string[];
  file(path: string): { text(): Promise<string> };
  Glob: new (pattern: string) => {
    scan(options: { cwd: string; absolute: boolean }): AsyncIterable<string>;
  };
};

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    focus: { type: "string" },
    scope: { type: "string", default: "down" },
    layoutOnly: { type: "boolean", default: false },
    output: { type: "string" },
    src: { type: "string", default: "app" },
  },
  strict: true,
});

if (!values.focus) throw new Error("--focus <ComponentName> is required");
const root = process.cwd();
const sourceRoot = path.resolve(root, values.src ?? "app");
const component = values.focus;
const glob = new Bun.Glob("**/*.{tsx,jsx}");
let match: { file: string; source: string } | undefined;

for await (const file of glob.scan({ cwd: sourceRoot, absolute: true })) {
  const source = await Bun.file(file).text();
  const escaped = component.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(?:function|const)\\s+${escaped}\\b`).test(source)) {
    match = { file, source };
    break;
  }
}

if (!match) throw new Error(`Component ${component} was not found below ${sourceRoot}`);

const relative = path.relative(root, match.file).replaceAll("\\", "/");
const lines = match.source.split(/\r?\n/);
const interesting = lines
  .map((line, index) => ({ line: line.trim(), number: index + 1 }))
  .filter(({ line }) =>
    /<(?:[A-Z][\w.]*|main|nav|aside|header|section|form|button|a|h[1-6]|p)\b|\b(?:return|if)\s*[({]/.test(line),
  )
  .map(({ line, number }) => `  [line ${number}] ${line.slice(0, 240)}`);

const map = [`[${component}] ${relative}`, ...interesting].join("\n");
if (values.output) {
  const output = path.resolve(root, values.output);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, map, "utf8");
} else {
  console.log(map);
}
