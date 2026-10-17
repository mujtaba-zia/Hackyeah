import { describe, expect, it } from "vitest";
import { azureSettingsFromEnv } from "../../../server/providers/azure/settings";

describe("azureSettingsFromEnv", () => {
  it("returns null until every required Azure value is present", () => {
    expect(azureSettingsFromEnv({})).toBeNull();
    expect(azureSettingsFromEnv({ AZURE_DEVOPS_ORG: "team", AZURE_DEVOPS_PROJECTS: "web" })).toBeNull();
    expect(azureSettingsFromEnv({ AZURE_DEVOPS_ORG: "team", AZURE_DEVOPS_PAT: "secret" })).toBeNull();
  });

  it("trims and de-duplicates projects and normalizes the base URL", () => {
    expect(azureSettingsFromEnv({
      AZURE_DEVOPS_ORG: " team ",
      AZURE_DEVOPS_PROJECTS: " web, api , web, ,ops ",
      AZURE_DEVOPS_PAT: " secret ",
      AZURE_DEVOPS_URL: "https://ado.example.test///",
    })).toEqual({
      org: "team",
      projects: ["web", "api", "ops"],
      pat: "secret",
      baseUrl: "https://ado.example.test",
    });
  });

  it("uses the Azure public URL when no base URL is configured", () => {
    expect(azureSettingsFromEnv({
      AZURE_DEVOPS_ORG: "team",
      AZURE_DEVOPS_PROJECTS: "web",
      AZURE_DEVOPS_PAT: "secret",
    })?.baseUrl).toBe("https://dev.azure.com");
  });
});
