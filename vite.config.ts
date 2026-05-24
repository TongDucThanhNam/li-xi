import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3000,
  },
  envPrefix: "VITE_",
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: ".",
      router: {
        routesDirectory: "app",
        routeFileIgnorePattern:
          "(^|/)(components|fortune|templates)(/|$)|(^|/)(ConvexClientProvider|CssDebugger|FortuneStage|hostUtils)(\\.|$)",
      },
    }),
    viteReact(),
    nitro(),
  ],
});
