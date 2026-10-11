export interface SiteConfig {
  name: string;
  siteUrl: string;
  github: { owner: string; repo: string };
  npmPackage: string;
  contactEmail: string;
  author: string;
  analytics: { domain: string; origin: string; script: string };
  download: { path: string; asset: string };
}
export interface Site extends SiteConfig {
  githubUrl: string;
  issuesUrl: string;
  releasesUrl: string;
  releaseDownloadUrl: string;
  downloadUrl: string;
  appUrl: string;
  installUrl: string;
  npmUrl: string;
  host: string;
}
export function resolveSite(config: SiteConfig): Site;
