import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DEFAULT_CONFIG, normalizeConfig } from "../shared/config";
import { isRecord } from "../shared/guards";
import type { AppConfig, ProviderKind } from "../shared/types";
import { createAzureProvider } from "./providers/azure";
import { azureSettingsFromEnv } from "./providers/azure/settings";
import { createGitHubProvider } from "./providers/github";
import { githubSettingsFromEnv } from "./providers/github/settings";
import { createMockProvider } from "./providers/mock";
import type { MockProvider, Provider } from "./providers/types";

const DEFAULT_PORT = 8787;

const PROVIDER_KINDS: Record<ProviderKind, true> = {
  mock: true,
  azure: true,
  github: true,
};

export interface ServerProviders {
  mock: MockProvider;
  azure?: Provider;
  github?: Provider;
}

export interface ServerEnvironment {
  port: number;
  initialConfig: AppConfig;
  providers: ServerProviders;
}

export interface EnvironmentLogger {
  warn(message: string): void;
}

export interface LoadEnvironmentOptions {
  env?: Record<string, string | undefined>;
  rootDir?: string;
  configPath?: string;
  logger?: EnvironmentLogger;
}

function portFromEnv(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("PORT must be an integer from 0 through 65535");
  }
  return port;
}

function configPatch(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) throw new Error("isles.config.json must contain a JSON object");
  return {
    watchedRepoIds: raw.watch,
    coverage: raw.coverage,
    thresholds: raw.thresholds,
    rules: raw.rules,
    pollSeconds: raw.pollSeconds,
    maxRepos: raw.maxRepos,
    maxPrsPerRepo: raw.maxPrsPerRepo,
  };
}

function initialConfigFromFile(configPath: string): AppConfig {
  if (!existsSync(configPath)) return normalizeConfig({}, DEFAULT_CONFIG);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Unable to parse isles.config.json: invalid JSON");
    throw new Error("Unable to read isles.config.json");
  }
  return normalizeConfig(configPatch(raw), DEFAULT_CONFIG);
}

function configuredProvider(value: string | undefined): ProviderKind | null {
  const candidate = value?.trim();
  if (candidate === undefined || candidate === "") return "mock";
  if (Object.hasOwn(PROVIDER_KINDS, candidate)) return candidate as ProviderKind;
  return null;
}

function providerIsAvailable(provider: ProviderKind, providers: ServerProviders): boolean {
  switch (provider) {
    case "mock":
      return true;
    case "azure":
      return providers.azure !== undefined;
    case "github":
      return providers.github !== undefined;
  }
}

/** Reads server-only settings, never placing credentials in the returned client configuration. */
export function loadServerEnvironment(options: LoadEnvironmentOptions = {}): ServerEnvironment {
  const env = options.env ?? process.env;
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const configPath = resolve(rootDir, options.configPath ?? "isles.config.json");
  const azureSettings = azureSettingsFromEnv(env);
  const githubSettings = githubSettingsFromEnv(env);
  const providers: ServerProviders = { mock: createMockProvider() };
  if (azureSettings !== null) providers.azure = createAzureProvider(azureSettings);
  if (githubSettings !== null) providers.github = createGitHubProvider(githubSettings);

  const requestedProvider = configuredProvider(env.PROVIDER);
  const provider = requestedProvider !== null && providerIsAvailable(requestedProvider, providers)
    ? requestedProvider
    : "mock";
  if (provider !== requestedProvider) {
    (options.logger ?? console).warn("Configured provider is unavailable; using mock instead.");
  }

  const config = initialConfigFromFile(configPath);
  return {
    port: portFromEnv(env.PORT),
    initialConfig: { ...config, provider },
    providers,
  };
}
