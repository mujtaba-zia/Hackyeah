import { describe, expect, it } from "vitest";
import { createGitHubProvider } from "../../../server/providers/github";
import { githubSettingsFromEnv, type GitHubSettings } from "../../../server/providers/github/settings";
import { ProviderError, type FetchFn } from "../../../server/providers/types";

const settings: GitHubSettings = {
  token: "secret-token",
  owner: "octo",
  repos: [],
  apiUrl: "https://api.github.com",
  graphqlUrl: "https://api.github.com/graphql",
};

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function restRepository(name: string, owner = "octo", extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name,
    owner: { login: owner },
    html_url: `https://github.com/${owner}/${name}`,
    default_branch: "main",
    archived: false,
    disabled: false,
    ...extra,
  };
}

function graphRepository(name: string, pullRequests: unknown[] = [], owner = "octo"): Record<string, unknown> {
  return {
    data: {
      repository: {
        name,
        url: `https://github.com/${owner}/${name}`,
        isArchived: false,
        isDisabled: false,
        owner: { login: owner },
        defaultBranchRef: { name: "main" },
        pullRequests: { nodes: pullRequests },
      },
    },
  };
}

function pullRequest(number: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/octo/app/pull/${number}`,
    isDraft: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    author: { login: "octocat" },
    reviewDecision: null,
    mergeable: "MERGEABLE",
    reviewRequests: { totalCount: 0, nodes: [] },
    latestReviews: { nodes: [] },
    commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
    ...extra,
  };
}

function workflowRun(id: number, workflowId: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    workflow_id: workflowId,
    name: "CI",
    path: ".github/workflows/ci.yml",
    status: "completed",
    conclusion: "success",
    created_at: `2026-01-${String(id).padStart(2, "0")}T00:00:00Z`,
    run_started_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:01:00Z",
    head_branch: "main",
    html_url: `https://github.com/octo/app/actions/runs/${id}`,
    ...extra,
  };
}

describe("githubSettingsFromEnv", () => {
  it("requires credentials and a repository scope, validates repos, and derives GHE GraphQL URLs", () => {
    expect(githubSettingsFromEnv({ GITHUB_OWNER: "octo" })).toBeNull();
    expect(githubSettingsFromEnv({ GITHUB_TOKEN: "token" })).toBeNull();
    expect(githubSettingsFromEnv({ GITHUB_TOKEN: "token", GITHUB_REPOS: "octo/app,bad value" })).toBeNull();
    expect(githubSettingsFromEnv({
      GITHUB_TOKEN: "token",
      GITHUB_REPOS: "octo/app,octo/other",
      GITHUB_API_URL: "https://github.example.test/api/v3/",
    })).toMatchObject({
      owner: null,
      repos: ["octo/app", "octo/other"],
      apiUrl: "https://github.example.test/api/v3",
      graphqlUrl: "https://github.example.test/api/graphql",
    });
  });
});

describe("GitHubProvider.listRepos", () => {
  it("falls back from orgs to users, follows pagination, and skips archived repositories", async () => {
    const requested: string[] = [];
    const fakeFetch: FetchFn = async (input, init) => {
      requested.push(input);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret-token");
      if (input.endsWith("/user")) return json({ login: "someone-else" });
      if (input.includes("/orgs/octo/repos")) return json({ message: "Not Found" }, { status: 404 });
      if (input.includes("page=2")) return json([restRepository("second")]);
      return json([restRepository("first"), restRepository("old", "octo", { archived: true })], {
        headers: { link: '<https://api.github.com/users/octo/repos?per_page=100&type=owner&page=2>; rel="next"' },
      });
    };

    const repos = await createGitHubProvider(settings, fakeFetch).listRepos();
    expect(repos.map((repo) => repo.id)).toEqual(["gh:octo/first", "gh:octo/second"]);
    expect(requested).toHaveLength(4);
  });

  it("uses the authenticated owner endpoint for private repositories and caches the login lookup", async () => {
    const requested: string[] = [];
    const fakeFetch: FetchFn = async (input) => {
      requested.push(input);
      if (input.endsWith("/user")) return json({ login: "octo" });
      if (input.includes("/user/repos?affiliation=owner")) return json([restRepository("private-app")]);
      throw new Error(`Unexpected URL ${input}`);
    };

    const provider = createGitHubProvider(settings, fakeFetch);
    await expect(provider.listRepos()).resolves.toMatchObject([{ id: "gh:octo/private-app" }]);
    await provider.listRepos();
    expect(requested.filter((url) => url.endsWith("/user"))).toHaveLength(1);
    expect(requested.filter((url) => url.includes("/user/repos?affiliation=owner"))).toHaveLength(2);
  });
});

describe("GitHubProvider.fetchSnapshot", () => {
  it("maps PR state, caps ordered workflow histories, and resolves configured coverage", async () => {
    const requested: string[] = [];
    const runs = Array.from({ length: 11 }, (_, offset) => workflowRun(offset + 1, 7));
    runs.push(workflowRun(12, 8, {
      name: "Deploy production",
      path: ".github/workflows/deploy.yml",
      status: "queued",
      conclusion: null,
    }));

    const fakeFetch: FetchFn = async (input, init) => {
      requested.push(input);
      if (input.endsWith("/graphql")) {
        const request = JSON.parse(String(init?.body)) as { variables: { name: string } };
        if (request.variables.name === "app") {
          return json(graphRepository("app", [
            pullRequest(1, {
              reviewDecision: "APPROVED",
              reviewRequests: { totalCount: 1, nodes: [{ requestedReviewer: { login: "octocat" } }] },
              latestReviews: { nodes: [{ author: { login: "octocat" } }, { author: { login: "reviewer" } }] },
            }),
            pullRequest(2, {
              reviewDecision: "CHANGES_REQUESTED",
              commits: { nodes: [{ commit: { statusCheckRollup: { state: "PENDING" } } }] },
            }),
            pullRequest(3, {
              isDraft: true,
              author: null,
              mergeable: "CONFLICTING",
              commits: { nodes: [{ commit: { statusCheckRollup: { state: "ERROR" } } }] },
            }),
            pullRequest(4, {
              commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE" } } }] },
            }),
            pullRequest(5, {
              commits: { nodes: [{ commit: { statusCheckRollup: { state: "EXPECTED" } } }] },
            }),
            pullRequest(6, {
              commits: { nodes: [] },
            }),
          ]));
        }
        return json(graphRepository("other", [], "octo"));
      }
      if (input.includes("/octo/app/actions/runs")) return json({ workflow_runs: runs });
      return json({ workflow_runs: [] });
    };

    const snapshot = await createGitHubProvider(settings, fakeFetch).fetchSnapshot({
      repoIds: ["gh:octo/app", "gh:octo/other"],
      maxPrsPerRepo: 40,
      coverage: { CI: ["other"], "Deploy production": ["octo/other"] },
    });

    expect(snapshot.pullRequests.map(({ verdict, draft, hasConflicts, checks, author, reviewers }) => ({
      verdict,
      draft,
      hasConflicts,
      checks,
      author,
      reviewers,
    }))).toEqual([
      { verdict: "approved", draft: false, hasConflicts: false, checks: "success", author: "octocat", reviewers: 2 },
      { verdict: "changesRequested", draft: false, hasConflicts: false, checks: "pending", author: "octocat", reviewers: 0 },
      { verdict: "none", draft: true, hasConflicts: true, checks: "failure", author: "ghost", reviewers: 0 },
      { verdict: "none", draft: false, hasConflicts: false, checks: "failure", author: "octocat", reviewers: 0 },
      { verdict: "none", draft: false, hasConflicts: false, checks: "pending", author: "octocat", reviewers: 0 },
      { verdict: "none", draft: false, hasConflicts: false, checks: "none", author: "octocat", reviewers: 0 },
    ]);
    const ci = snapshot.pipelines.find((pipeline) => pipeline.name === "CI");
    const deploy = snapshot.pipelines.find((pipeline) => pipeline.name === "Deploy production");
    expect(ci?.runs).toHaveLength(10);
    expect(ci?.runs[0]?.id).toContain("run:11");
    expect(ci?.coversRepoIds).toEqual(["gh:octo/app", "gh:octo/other"]);
    expect(deploy).toMatchObject({
      kind: "release",
      coversRepoIds: ["gh:octo/app", "gh:octo/other"],
      runs: [{ result: "queued" }],
    });
    expect(requested.filter((url) => url.includes("/repos/")).every((url) => url.includes("/octo/app/") || url.includes("/octo/other/"))).toBe(true);
  });

  it("maps workflow status and only requests the selected repository", async () => {
    const requested: string[] = [];
    const statuses = [
      ["queued", null, "queued"],
      ["waiting", null, "queued"],
      ["requested", null, "queued"],
      ["pending", null, "queued"],
      ["in_progress", null, "running"],
      ["completed", "success", "success"],
      ["completed", "failure", "failure"],
      ["completed", "timed_out", "failure"],
      ["completed", "startup_failure", "failure"],
      ["completed", "cancelled", "cancelled"],
      ["completed", "skipped", "none"],
      ["completed", "neutral", "none"],
      ["completed", "action_required", "none"],
      ["completed", "stale", "none"],
    ] as const;
    const fakeFetch: FetchFn = async (input) => {
      requested.push(input);
      if (input.endsWith("/graphql")) return json(graphRepository("one"));
      return json({
        workflow_runs: statuses.map(([status, conclusion], index) => workflowRun(index + 1, index + 1, { status, conclusion })),
      });
    };

    const snapshot = await createGitHubProvider(settings, fakeFetch).fetchSnapshot({
      repoIds: ["gh:octo/one"],
      maxPrsPerRepo: 1,
      coverage: {},
    });
    expect(snapshot.pipelines.map((pipeline) => pipeline.runs[0]?.result)).toEqual(statuses.map(([, , result]) => result));
    expect(requested).toEqual([
      "https://api.github.com/graphql",
      "https://api.github.com/repos/octo/one/actions/runs?per_page=50",
    ]);
  });
});

describe("GitHubProvider errors", () => {
  it("maps 403 rate limits from reset headers without exposing the token", async () => {
    const configured: GitHubSettings = { ...settings, owner: null, repos: ["octo/app"] };
    const reset = Math.floor(Date.now() / 1000) + 30;
    const provider = createGitHubProvider(configured, async () => json({ message: "secret-token" }, {
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
    }));

    await expect(provider.listRepos()).rejects.toMatchObject<Partial<ProviderError>>({
      code: "throttled",
      retryAfterSeconds: 30,
    });
    await provider.listRepos().catch((error: unknown) => {
      expect(error).toBeInstanceOf(ProviderError);
      if (error instanceof Error) expect(error.message).not.toContain("secret-token");
    });
    expect(provider.label).not.toContain("secret-token");
  });

  it("maps an ordinary 403 to auth without exposing response data", async () => {
    const configured: GitHubSettings = { ...settings, owner: null, repos: ["octo/app"] };
    const provider = createGitHubProvider(configured, async () => json({ message: "secret-token" }, { status: 403 }));
    await expect(provider.listRepos()).rejects.toMatchObject<Partial<ProviderError>>({ code: "auth" });
    await provider.listRepos().catch((error: unknown) => {
      if (error instanceof Error) expect(error.message).not.toContain("secret-token");
    });
  });
});
