import config from '../../../../../site.config.json';
import { resolveSite } from '../../../../../scripts/lib/site.mjs';

/** Every address comes from site.config.json (see scripts/lib/site.mjs). Nothing here is typed by hand. */
export const site = resolveSite(config);

/** The extension for Claude Desktop. Our own address; it redirects to the file in GitHub Releases. */
export const MCPB_URL = site.download.path;
export const REPO_URL = site.githubUrl;
export const NPM_PACKAGE = site.npmPackage;
export const INTERVIEW_COMMAND = 'Run my Loam onboarding interview';

/** "Weekly client report" → "Do my weekly client report" */
export const runCommand = (title: string): string => `Do my ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
export const reviewCommand = (name: string): string => `Review the imported skill ${name} in my Loam base`;
