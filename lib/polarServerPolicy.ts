export type PolarServer = "sandbox" | "production";

export function normalizeConfiguredPolarServer(value: string | null | undefined) {
  const configuredServer = value?.trim();
  return configuredServer ? configuredServer : null;
}

export function resolvePolarServer(value: string | null | undefined): PolarServer {
  const configuredServer = normalizeConfiguredPolarServer(value);
  if (!configuredServer) {
    return "sandbox";
  }

  if (configuredServer === "sandbox" || configuredServer === "production") {
    return configuredServer;
  }

  throw new Error("POLAR_SERVER phải là sandbox hoặc production");
}
