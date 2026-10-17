export interface GitHubSettings {
  token: string;
  owner: string | null;
  repos: string[];
  apiUrl: string;
  graphqlUrl: string;
}

type Env = Record<string, string | undefined>;

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function parseRepo(value: string): string | null {
  const parts = value.trim().split("/");
  const [owner, name] = parts;
  if (parts.length !== 2 || owner === undefined || name === undefined) return null;
  if (!OWNER_PATTERN.test(owner) || !REPOSITORY_PATTERN.test(name)) return null;
  return `${owner}/${name}`;
}

function apiUrls(value: string | undefined): { apiUrl: string; graphqlUrl: string } | null {
  const raw = value?.trim() || "https://api.github.com";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";

  const apiUrl = url.toString().replace(/\/$/, "");
  const enterprisePath = url.pathname === "/api/v3";
  const graphqlPath = enterprisePath ? "/api/graphql" : `${url.pathname === "/" ? "" : url.pathname}/graphql`;
  const graphqlUrl = `${url.origin}${graphqlPath}`;
  return { apiUrl, graphqlUrl };
}

/** Reads a complete, secret-bearing GitHub server configuration from environment variables. */
export function githubSettingsFromEnv(env: Env): GitHubSettings | null {
  const token = env.GITHUB_TOKEN?.trim();
  if (!token) return null;

  const ownerValue = env.GITHUB_OWNER?.trim();
  const owner = ownerValue && OWNER_PATTERN.test(ownerValue) ? ownerValue : null;
  if (ownerValue && !owner) return null;

  const repoValues = env.GITHUB_REPOS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  const distinct: Record<string, true> = {};
  for (const value of repoValues) {
    const repo = parseRepo(value);
    if (!repo) return null;
    distinct[repo] = true;
  }
  const distinctRepos = Object.keys(distinct);
  if (!owner && distinctRepos.length === 0) return null;

  const urls = apiUrls(env.GITHUB_API_URL);
  if (!urls) return null;

  return { token, owner, repos: distinctRepos, ...urls };
}
