// What the official MCP Registry (https://registry.modelcontextprotocol.io) is told about the server. Pure, so the
// packing script and its test use the same code. The registry only stores this description; the code stays on npm.

/** The name of the server in the registry. It must equal "mcpName" in the npm package: the registry checks. */
export const mcpName = (site) => `io.github.${site.github.owner}/loam`;

/** The registry allows at most 100 characters here. */
export const REGISTRY_DESCRIPTION = 'Work context for AI agents: your processes, examples and corrections as plain files you own.';

export const REGISTRY_SCHEMA = 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';

/**
 * server.json for `mcp-publisher publish`. `version` is the version of the package already published to npm.
 * @param {{ site: import('./site.d.mts').Site, version: string }} input
 */
export function serverJson({ site, version }) {
  return {
    $schema: REGISTRY_SCHEMA,
    name: mcpName(site),
    title: site.name,
    description: REGISTRY_DESCRIPTION,
    repository: { url: site.githubUrl, source: 'github' },
    websiteUrl: site.siteUrl,
    version,
    packages: [
      {
        registryType: 'npm',
        identifier: site.npmPackage,
        version,
        runtimeHint: 'npx',
        transport: { type: 'stdio' },
        environmentVariables: [
          {
            name: 'LOAM_FOLDER',
            description: 'The full path of the folder you set up in the Loam app (the one that has AGENTS.md in it).',
            isRequired: true,
            format: 'filepath',
            placeholder: '/Users/you/Documents/Loam',
          },
        ],
      },
    ],
  };
}
