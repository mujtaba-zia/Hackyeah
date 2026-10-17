export interface AzureSettings {
  org: string;
  projects: string[];
  pat: string;
  baseUrl: string;
}

const DEFAULT_BASE_URL = "https://dev.azure.com";

/** Reads the server-only Azure DevOps credentials and repository scope. */
export function azureSettingsFromEnv(env: Record<string, string | undefined>): AzureSettings | null {
  const org = env.AZURE_DEVOPS_ORG?.trim();
  const pat = env.AZURE_DEVOPS_PAT?.trim();
  const projects = uniqueProjects(env.AZURE_DEVOPS_PROJECTS);
  if (!org || !pat || projects.length === 0) return null;

  const configuredBaseUrl = env.AZURE_DEVOPS_URL?.trim() || DEFAULT_BASE_URL;
  return {
    org,
    projects,
    pat,
    baseUrl: configuredBaseUrl.replace(/\/+$/, ""),
  };
}

function uniqueProjects(value: string | undefined): string[] {
  if (!value) return [];
  const projects: string[] = [];
  for (const project of value.split(",")) {
    const trimmed = project.trim();
    if (trimmed && !projects.includes(trimmed)) projects.push(trimmed);
  }
  return projects;
}
