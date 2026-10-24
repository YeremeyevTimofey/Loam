export interface SiteConfig {
  name: string;
  siteUrl: string;
  github: { owner: string; repo: string; branch?: string };
  npmPackage: string;
  contactEmail: string;
  author: string;
  analytics: { domain: string; origin: string; script: string };
  download: { path: string; asset: string };
}
export interface Site extends SiteConfig {
  githubUrl: string;
  /** The branch that file links point at (default: main). */
  branch: string;
  issuesUrl: string;
  securityUrl: string;
  releasesUrl: string;
  releaseDownloadUrl: string;
  downloadUrl: string;
  appUrl: string;
  installUrl: string;
  llmsInstallUrl: string;
  agentSetupMessage: string;
  npmUrl: string;
  host: string;
  /** A file in the repository, optionally with a #heading: https://github.com/<owner>/<repo>/blob/<branch>/<path> */
  fileUrl(path: string): string;
  /** A folder in the repository. */
  dirUrl(path: string): string;
}
export function resolveSite(config: SiteConfig): Site;
