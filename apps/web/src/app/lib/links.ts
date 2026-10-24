import config from '../../../../../site.config.json';
import { resolveSite } from '../../../../../scripts/lib/site.mjs';

/** Every address comes from site.config.json (see scripts/lib/site.mjs). Nothing here is typed by hand. */
export const site = resolveSite(config);

/** The extension for Claude Desktop. Our own address; it redirects to the file in GitHub Releases. */
export const MCPB_URL = site.download.path;
export const REPO_URL = site.githubUrl;
export const ISSUES_URL = site.issuesUrl;
export const RELEASES_URL = site.releasesUrl;
/** A file or folder of the repository on GitHub. The path must exist: `npm run check:rules` checks every call. */
export const repoFile = (path: string): string => site.fileUrl(path);
export const repoDir = (path: string): string => site.dirUrl(path);
export const NPM_PACKAGE = site.npmPackage;
export const INTERVIEW_COMMAND = 'Run my Loam onboarding interview';
export const LLMS_INSTALL_URL = site.llmsInstallUrl;
/** The one message a person sends their agent. It reads the instructions at that address and sets Loam up, asking first. */
export const AGENT_SETUP_MESSAGE = site.agentSetupMessage;

/** "Weekly client report" → "Do my weekly client report" */
export const runCommand = (title: string): string => `Do my ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
export const reviewCommand = (name: string): string => `Review the imported skill ${name} in my Loam base`;
