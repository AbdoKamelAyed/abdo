// Builds the schema registry from already-parsed schema objects (the Node build reads them from
// disk, the browser admin fetches them), so neither needs the other's file access.

import { SchemaRegistry } from '../lib/jsonschema.mjs';

export function createRegistryFromSchemas(schemas) {
  const registry = new SchemaRegistry();
  for (const schema of schemas) registry.add(schema);
  return registry;
}
