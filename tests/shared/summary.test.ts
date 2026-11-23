import { describe, expect, it } from "vitest";
import { summarizeEstate, summarizeIslands } from "../../shared/summary";
import { sampleCity } from "../fixtures/sampleCity";

describe("island summaries", () => {
  const islands = summarizeIslands(sampleCity);

  it("counts each repository's pipelines by status and lists the most urgent first", () => {
    const billing = islands.get("mock:billing")!;
    expect(billing.statuses.failure).toBe(1);
    expect(billing.towers.map((tower) => tower.name)).toEqual(["Billing Release"]);
    // The pipeline whose repository is not shown is counted on the outskirts, not lost.
    expect(islands.get("outskirts")?.towers.map((tower) => tower.name)).toEqual(["Partner Sync"]);
    expect([...islands.values()].reduce((total, island) => total + island.towers.length, 0)).toBe(sampleCity.towers.length);
  });

  it("separates open pull requests from drafts and counts the ones waiting on someone", () => {
    expect(islands.get("mock:atlas")).toMatchObject({ openPrs: 1, draftPrs: 1, attentionPrs: 0 });
    // Docs: four waiting on review and one with changes requested.
    expect(islands.get("mock:docs")).toMatchObject({ openPrs: 5, draftPrs: 0, attentionPrs: 5 });
    // A merge conflict waits on its author.
    expect(islands.get("mock:edge")).toMatchObject({ openPrs: 1, attentionPrs: 1 });
  });

  it("charges a problem to every island it involves, through its districts, towers or pull requests", () => {
    // The shared outage starts at Billing's release and reaches Checkout through coverage.
    expect(islands.get("mock:checkout")?.worst).toBe("critical");
    expect(islands.get("mock:billing")?.incidents).toBeGreaterThanOrEqual(3);
    // A warning that names only a tower still counts for the island the tower stands on.
    expect(islands.get("mock:edge")).toMatchObject({ worst: "warning" });
    expect(islands.get("mock:infra")).toMatchObject({ incidents: 0, worst: null });
  });
});

describe("estate summary", () => {
  it("adds up to what the islands show", () => {
    const estate = summarizeEstate(sampleCity);
    const islands = [...summarizeIslands(sampleCity).values()];
    expect(estate.repoTotal).toBe(7);
    expect(estate.repos.good + estate.repos.warn + estate.repos.bad).toBe(7);
    expect(estate.pipelineTotal).toBe(8);
    expect(estate.statuses).toMatchObject({ failure: 2, partial: 1, running: 1, queued: 1, success: 3 });
    expect(estate.openPrs).toBe(islands.reduce((total, island) => total + island.openPrs, 0));
    expect(estate.draftPrs).toBe(1);
    expect(estate.attentionPrs).toBe(islands.reduce((total, island) => total + island.attentionPrs, 0));
    expect(estate.incidents.critical + estate.incidents.error + estate.incidents.warning).toBe(sampleCity.incidents.length);
  });
});
