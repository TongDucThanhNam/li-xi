import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const fixtureRoot = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = fileURLToPath(new URL("../../..", import.meta.url));

// Test-only Vite server for the UI fixtures: mount the ACTUAL workspace
// features in the real HeroUI Pro chrome with real Tailwind app sources and
// a synthetic convex/react replacement. Never part of the production
// route/build graph.
export default defineConfig({
	root: fixtureRoot,
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": projectRoot,
			"convex/react": fileURLToPath(new URL("./convex-mock.ts", import.meta.url)),
			"@convex-dev/auth/react": fileURLToPath(new URL("./convex-auth-mock.ts", import.meta.url)),
		},
	},
	server: { host: "127.0.0.1", port: 3210, strictPort: true, fs: { allow: [projectRoot] } },
});
