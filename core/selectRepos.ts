import type { AppConfig, RepoInfo } from "../shared/types";

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Resolves the configured watch list against repositories that still exist,
 * then gives providers a bounded, stable fetch order.
 */
export function selectRepos(repos: RepoInfo[], config: AppConfig): RepoInfo[] {
  let selected: RepoInfo[];

  if (config.watchedRepoIds === null) {
    selected = [...repos];
  } else {
    const watchedIds: Record<string, true> = Object.create(null);
    for (const id of config.watchedRepoIds) watchedIds[id] = true;
    selected = repos.filter((repo) => Object.hasOwn(watchedIds, repo.id));
  }

  selected.sort((left, right) => compareText(left.name, right.name) || compareText(left.id, right.id));

  const limit = Number.isFinite(config.maxRepos) ? Math.max(0, Math.floor(config.maxRepos)) : 0;
  return selected.slice(0, limit);
}
