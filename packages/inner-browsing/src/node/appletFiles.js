import fs from 'node:fs';
import path from 'node:path';

export function assertAppletClientFiles(registry) {
  for (const appletPath of registry.paths()) {
    const definition = registry.get(appletPath);
    if (!path.isAbsolute(definition.clientFile || '') || !fs.existsSync(definition.clientFile)) {
      throw new Error(`${definition.path} does not declare an existing absolute clientFile`);
    }
  }
  return registry;
}
