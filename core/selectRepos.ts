import type { AppConfig, RepoInfo } from "../shared/types";

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Whether a watch-list entry names this repo. Entries are repo ids (what the
 * Settings panel writes) or, for hand-written config files, plain repo names
 * (`payments`) or `project/name` (`Contoso/payments`), case-insensitive.
 */
export function isWatched(repo: Pick<RepoInfo, "id" | "name" | "project">, watched: readonly string[]): boolean {
  const name = repo.name.toLowerCase();
  const qualified = `${repo.project}/${repo.name}`.toLowerCase();
  return watched.some((entry) => {
    if (entry === repo.id) return true;
    const lowered = entry.toLowerCase();
    return lowered === name || lowered === qualified;
  });
}

/**
 * Resolves the configured watch list against repositories that still exist,
 * then gives providers a bounded, stable fetch order.
 */
export function selectRepos(repos: RepoInfo[], config: AppConfig): RepoInfo[] {
  const watched = config.watchedRepoIds;
  const selected = watched === null ? [...repos] : repos.filter((repo) => isWatched(repo, watched));

  selected.sort((left, right) => compareText(left.name, right.name) || compareText(left.id, right.id));

  const limit = Number.isFinite(config.maxRepos) ? Math.max(0, Math.floor(config.maxRepos)) : 0;
  return selected.slice(0, limit);
}
