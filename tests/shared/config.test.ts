import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, normalizeConfig } from "../../shared/config";

describe("normalizeConfig", () => {
  it("clamps numbers into their allowed ranges", () => {
    const config = normalizeConfig({ pollSeconds: 1, maxRepos: 10_000, thresholds: { crowdSize: 0 } });
    expect(config.pollSeconds).toBe(10);
    expect(config.maxRepos).toBe(64);
    expect(config.thresholds.crowdSize).toBe(2);
  });

  it("keeps the base value for malformed fields", () => {
    const base = normalizeConfig({ scenario: "calm", provider: "github" });
    const next = normalizeConfig({ scenario: "../../etc", provider: "gitlab", pollSeconds: "fast" }, base);
    expect(next.scenario).toBe("calm");
    expect(next.provider).toBe("github");
    expect(next.pollSeconds).toBe(DEFAULT_CONFIG.pollSeconds);
  });

  it("drops unknown keys so secrets cannot ride along in a patch", () => {
    const config = normalizeConfig({ token: "ghp_secret", rules: { meltdown: false, bogus: true } });
    expect(JSON.stringify(config)).not.toContain("ghp_secret");
    expect(config.rules.meltdown).toBe(false);
    expect(Object.keys(config.rules)).not.toContain("bogus");
  });

  it("distinguishes 'watch everything' from an explicit empty list", () => {
    const some = normalizeConfig({ watchedRepoIds: ["gh:a/b", "gh:a/b", 3] });
    expect(some.watchedRepoIds).toEqual(["gh:a/b"]);
    expect(normalizeConfig({ watchedRepoIds: null }, some).watchedRepoIds).toBeNull();
    expect(normalizeConfig({ watchedRepoIds: [] }, some).watchedRepoIds).toEqual([]);
  });
});
