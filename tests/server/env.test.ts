import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadServerEnvironment } from "../../server/env";
import { createGameState } from "../../server/state";

describe("server environment", () => {
  it("loads every supported config-file key into the initial normalized configuration", () => {
    const root = mkdtempSync(join(tmpdir(), "repo-isles-config-"));
    const configPath = join(root, "isles.config.json");
    writeFileSync(configPath, JSON.stringify({
      watch: ["mock:payments"],
      coverage: { "Platform Integration": ["Catalog"] },
      thresholds: { staleDays: 10, crowdSize: 7 },
      rules: { meltdown: false },
      pollSeconds: 45,
      maxRepos: 9,
      maxPrsPerRepo: 17,
    }), "utf8");

    try {
      const environment = loadServerEnvironment({
        configPath,
        env: { PORT: "9124", PROVIDER: "mock" },
      });
      expect(environment.port).toBe(9124);
      expect(environment.initialConfig).toMatchObject({
        provider: "mock",
        watchedRepoIds: ["mock:payments"],
        coverage: { "Platform Integration": ["Catalog"] },
        pollSeconds: 45,
        maxRepos: 9,
        maxPrsPerRepo: 17,
      });
      expect(environment.initialConfig.thresholds.staleDays).toBe(10);
      expect(environment.initialConfig.thresholds.crowdSize).toBe(7);
      expect(environment.initialConfig.rules.meltdown).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses defaults when the optional file is missing and falls back from an unavailable provider", () => {
    const warnings: string[] = [];
    const environment = loadServerEnvironment({
      configPath: join(tmpdir(), "repo-isles-missing-config.json"),
      env: { PROVIDER: "azure" },
      logger: { warn(message: string): void { warnings.push(message); } },
    });

    expect(environment.port).toBe(8787);
    expect(environment.initialConfig.provider).toBe("mock");
    expect(warnings).toEqual(["Configured provider is unavailable; using mock instead."]);
  });

  it("fails clearly when the optional config file is not JSON", () => {
    const root = mkdtempSync(join(tmpdir(), "repo-isles-bad-config-"));
    const configPath = join(root, "isles.config.json");
    writeFileSync(configPath, "{ broken", "utf8");
    try {
      expect(() => loadServerEnvironment({ configPath, env: {} })).toThrow("Unable to parse isles.config.json: invalid JSON");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("never exposes configured provider tokens through client state", () => {
    const fakeToken = "fake-token-that-must-never-reach-the-browser";
    const environment = loadServerEnvironment({
      configPath: join(tmpdir(), "repo-isles-missing-config.json"),
      env: { GITHUB_TOKEN: fakeToken, GITHUB_OWNER: "octo-lab" },
    });
    const state = createGameState({ config: environment.initialConfig, providers: environment.providers });

    expect(JSON.stringify(state.getClientState())).not.toContain(fakeToken);
  });
});
