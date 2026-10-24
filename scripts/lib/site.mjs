// Turns site.config.json into every address the product uses. Pure (no Node APIs), so the browser bundle can use it
// too. This is the only place that knows how a GitHub release URL, an npm command or a download path is formed.

/** @param {import('./site.d.mts').SiteConfig} config */
export function resolveSite(config) {
  const siteUrl = config.siteUrl.replace(/\/$/, '');
  const githubUrl = `https://github.com/${config.github.owner}/${config.github.repo}`;
  const branch = config.github.branch ?? 'main';
  const inRepo = (path) => path.replace(/^\/+/, '');
  return {
    ...config,
    siteUrl,
    githubUrl,
    branch,
    issuesUrl: `${githubUrl}/issues`,
    /** GitHub's private vulnerability report form (the "Security" tab of the repository). */
    securityUrl: `${githubUrl}/security/advisories/new`,
    fileUrl: (path) => `${githubUrl}/blob/${branch}/${inRepo(path)}`,
    dirUrl: (path) => `${githubUrl}/tree/${branch}/${inRepo(path)}`,
    releasesUrl: `${githubUrl}/releases`,
    /** GitHub serves the newest published release's file directly, as a download, with no GitHub page in between. */
    releaseDownloadUrl: `${githubUrl}/releases/latest/download/${config.download.asset}`,
    /** The address people click. On our own domain, it redirects to releaseDownloadUrl. */
    downloadUrl: `${siteUrl}${config.download.path}`,
    appUrl: `${siteUrl}/app`,
    installUrl: `${siteUrl}/install`,
    npmUrl: `https://www.npmjs.com/package/${config.npmPackage}`,
    host: new URL(siteUrl).host,
  };
}
