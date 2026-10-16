import { describe, expect, it } from "vitest";
import { createAzureProvider } from "../../../server/providers/azure";
import type { FetchFn } from "../../../server/providers/types";
import type { AzureSettings } from "../../../server/providers/azure/settings";

const settings: AzureSettings = {
  org: "isles",
  projects: ["Harbor"],
  pat: "top-secret-pat",
  baseUrl: "https://dev.azure.example",
};

const repositories = {
  value: [
    { id: "repo-web", name: "Web", webUrl: "https://ado.example/Harbor/_git/Web", defaultBranch: "refs/heads/main" },
    { id: "repo-api", name: "API", webUrl: "https://ado.example/Harbor/_git/API", defaultBranch: "refs/heads/trunk" },
    { id: "repo-disabled", name: "Old", isDisabled: true },
  ],
};

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function snapshotFetch(calls: string[]): FetchFn {
  return async (input, init) => {
    calls.push(input);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    if (input.includes("/_apis/git/repositories")) return json(repositories);
    if (input.includes("/_apis/git/pullrequests")) {
      return json({
        value: [
          {
            pullRequestId: 201,
            title: "Draft Web work",
            creationDate: "2026-01-01T00:00:00Z",
            createdBy: { displayName: "Ada" },
            repository: { id: "repo-web", name: "Web" },
            reviewers: [{ vote: -5 }],
            isDraft: true,
            mergeStatus: "conflicts",
          },
          {
            pullRequestId: 202,
            title: "API hardening",
            creationDate: "2026-01-02T00:00:00Z",
            createdBy: { displayName: "Bea" },
            repository: { id: "repo-api", name: "API" },
            reviewers: [{ vote: 10 }, { vote: -10 }],
            isDraft: false,
            mergeStatus: "succeeded",
          },
          {
            pullRequestId: 204,
            title: "API approval",
            creationDate: "2026-01-04T00:00:00Z",
            createdBy: { displayName: "Dee" },
            repository: { id: "repo-api", name: "API" },
            reviewers: [{ vote: 5 }],
            isDraft: false,
            mergeStatus: "succeeded",
          },

          {
            pullRequestId: 203,
            title: "Unwatched",
            creationDate: "2026-01-03T00:00:00Z",
            createdBy: { displayName: "Cy" },
            repository: { id: "other", name: "Other" },
            reviewers: [],
          },
        ],
      });
    }
    if (input.includes("/_apis/build/definitions")) {
      return json({
        value: [
          { id: 7, name: "Deploy Web", path: "\\Release", repository: { id: "repo-web" } },
          { id: 8, name: "API CI", path: "\\CI", repository: { id: "repo-api" } },
          { id: 9, name: "Other CI", path: "\\CI", repository: { id: "other" } },
        ],
      });
    }
    if (input.includes("/_apis/build/builds")) {
      return json({
        value: [
          { id: 70, definition: { id: 7 }, status: "completed", result: "succeeded", queueTime: "2026-01-09T00:00:00Z" },
          { id: 71, definition: { id: 7 }, status: "completed", result: "failed", queueTime: "2026-01-10T00:00:00Z" },
          { id: 81, definition: { id: 8 }, status: "inProgress", queueTime: "2026-01-08T00:00:00Z" },
          { id: 82, definition: { id: 8 }, status: "notStarted", queueTime: "2026-01-07T00:00:00Z" },
          { id: 83, definition: { id: 8 }, status: "postponed", queueTime: "2026-01-06T00:00:00Z" },
          { id: 84, definition: { id: 8 }, status: "completed", result: "partiallySucceeded", queueTime: "2026-01-05T00:00:00Z" },
          { id: 85, definition: { id: 8 }, status: "completed", result: "canceled", queueTime: "2026-01-04T00:00:00Z" },
        ],
      });
    }
    throw new Error(`unexpected URL: ${input}`);
  };
}

describe("createAzureProvider", () => {
  it("normalizes repositories and sends Basic PAT authentication", async () => {
    const calls: Array<{ input: string; init: RequestInit | undefined }> = [];
    const provider = createAzureProvider(settings, async (input, init) => {
      calls.push({ input, init });
      return json(repositories);
    });

    await expect(provider.listRepos()).resolves.toEqual([
      { id: "az:repo-web", name: "Web", project: "Harbor", url: "https://ado.example/Harbor/_git/Web", defaultBranch: "main" },
      { id: "az:repo-api", name: "API", project: "Harbor", url: "https://ado.example/Harbor/_git/API", defaultBranch: "trunk" },
    ]);
    expect(calls[0]?.input).toContain("/isles/Harbor/_apis/git/repositories?api-version=7.1");
    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe(`Basic ${Buffer.from(":top-secret-pat").toString("base64")}`);
  });

  it("maps requested repositories, PR votes, and pipeline history", async () => {
    const calls: string[] = [];
    const provider = createAzureProvider(settings, snapshotFetch(calls));

    const snapshot = await provider.fetchSnapshot({
      repoIds: ["az:repo-web", "az:repo-api"],
      maxPrsPerRepo: 2,
      coverage: { "Deploy Web": ["api", "Missing"] },
    });

    expect(snapshot.repos.map((repo) => repo.id)).toEqual(["az:repo-web", "az:repo-api"]);
    expect(snapshot.pullRequests.map((pullRequest) => pullRequest.number)).toEqual([201, 202, 204]);
    expect(snapshot.pullRequests[0]).toMatchObject({ draft: true, hasConflicts: true, verdict: "waitingOnAuthor", checks: "none" });
    expect(snapshot.pullRequests[1]).toMatchObject({ draft: false, hasConflicts: false, verdict: "rejected" });
    expect(snapshot.pullRequests[2]).toMatchObject({ verdict: "approved" });

    const release = snapshot.pipelines.find((pipeline) => pipeline.name === "Deploy Web");
    const ci = snapshot.pipelines.find((pipeline) => pipeline.name === "API CI");
    expect(release).toMatchObject({ kind: "release", coversRepoIds: ["az:repo-web", "az:repo-api"] });
    expect(release?.runs.map((run) => run.result)).toEqual(["failure", "success"]);
    expect(ci?.runs.map((run) => run.result)).toEqual(["running", "queued", "queued", "partial", "cancelled"]);
    expect(calls.find((call) => call.includes("/_apis/git/pullrequests"))).toContain("$top=4");
    expect(calls.find((call) => call.includes("/_apis/build/builds"))).toContain("definitions=7,8");
  });

  it("keeps newest build first even when the REST response is unordered", async () => {
    const calls: string[] = [];
    const provider = createAzureProvider(settings, snapshotFetch(calls));
    const snapshot = await provider.fetchSnapshot({ repoIds: ["az:repo-web"], maxPrsPerRepo: 2, coverage: {} });
    expect(snapshot.pipelines[0]?.runs.map((run) => run.id)).toEqual(["az:build-run:71", "az:build-run:70"]);
  });

  it.each([
    [401, "auth", undefined],
    [403, "auth", undefined],
    [404, "notFound", undefined],
    [429, "throttled", 11],
    [503, "throttled", 3],
    [203, "auth", undefined],
  ] as const)("maps HTTP %s to ProviderError %s", async (status, code, retryAfterSeconds) => {
    const provider = createAzureProvider(settings, async () => {
      const headers = retryAfterSeconds === undefined ? undefined : { "Retry-After": String(retryAfterSeconds) };
      return new Response(status === 203 ? "<html>sign in</html>" : "{}", { status, headers });
    });

    try {
      await provider.listRepos();
      throw new Error("expected provider request to fail");
    } catch (error) {
      expect(error).toMatchObject({ code, retryAfterSeconds });
      expect(error instanceof Error && error.message).not.toContain(settings.pat);
      if (status === 404) expect(error instanceof Error && error.message).toContain("Harbor");
    }
  });

  it("maps fetch failures and non-JSON bodies to network errors without exposing the PAT", async () => {
    const rejected = createAzureProvider(settings, async () => Promise.reject(new Error(settings.pat)));
    const nonJson = createAzureProvider(settings, async () => new Response("not json"));

    for (const provider of [rejected, nonJson]) {
      try {
        await provider.listRepos();
        throw new Error("expected provider request to fail");
      } catch (error) {
        expect(error).toMatchObject({ code: "network" });
        expect(error instanceof Error && error.message).not.toContain(settings.pat);
      }
    }
  });
});
