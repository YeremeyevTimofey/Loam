import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { mcpName, REGISTRY_DESCRIPTION, REGISTRY_SCHEMA, serverJson } from '../lib/registry.mjs';
import { site } from '../lib/site-node.mjs';

const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../../apps/mcp-server/manifest.json'), 'utf8')) as { version: string };
// The registry's own schema for server.json, saved from https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json
const schema = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/mcp-server.schema.2025-12-11.json'), 'utf8'));

describe('server.json for the official MCP Registry', () => {
  const doc = serverJson({ site, version: manifest.version });

  it("is valid against the registry's schema", () => {
    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(schema);
    expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
    expect(doc.$schema).toBe(REGISTRY_SCHEMA);
  });

  it('describes the package that is published: name, version, repository and the way to start it', () => {
    expect(doc.name).toBe(mcpName(site));
    expect(doc.name).toBe(`io.github.${site.github.owner}/loam`); // GitHub sign-in only allows this namespace
    expect(doc.version).toBe(manifest.version);
    expect(doc.repository).toEqual({ url: site.githubUrl, source: 'github' });
    const [pkg] = doc.packages;
    expect(pkg).toMatchObject({ registryType: 'npm', identifier: site.npmPackage, version: manifest.version, transport: { type: 'stdio' } });
    // the server finds its folder through LOAM_FOLDER, which the registry asks the person for
    expect(pkg!.environmentVariables).toEqual([expect.objectContaining({ name: 'LOAM_FOLDER', isRequired: true, format: 'filepath' })]);
  });

  it('keeps the description inside the registry limit', () => {
    expect(REGISTRY_DESCRIPTION.length).toBeLessThanOrEqual(100);
    expect(doc.description).toBe(REGISTRY_DESCRIPTION);
  });
});
