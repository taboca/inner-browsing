import fs from 'node:fs';
import nodePath from 'node:path';
import { appApplet } from './applets/app/index.js';
import { liveApplet } from './applets/app/applets/live/index.js';
import { menuApplet } from './applets/app/applets/live/applets/menu/index.js';
import { widgetsApplet } from './applets/app/applets/live/applets/widgets/index.js';

const definitions = [appApplet, liveApplet, menuApplet, widgetsApplet];

export function createAppletRegistry() {
  const byPath = new Map(definitions.map((definition) => [definition.path, definition]));
  if (byPath.size !== definitions.length) throw new Error('Applet paths must be unique');

  for (const definition of definitions) {
    const expectedClientModule = `/applets/${definition.path}/client/index.js`;
    if (definition.clientModule !== expectedClientModule) {
      throw new Error(`${definition.path} must expose its client at ${expectedClientModule}`);
    }
    if (!nodePath.isAbsolute(definition.clientFile) || !fs.existsSync(definition.clientFile)) {
      throw new Error(`${definition.path} does not declare an existing absolute clientFile`);
    }
    if (!definition.parentPath) continue;
    const parent = byPath.get(definition.parentPath);
    const segment = definition.path.split('/').at(-1);
    if (!parent) throw new Error(`Applet parent is not registered: ${definition.parentPath}`);
    if (parent.accepts[segment] !== definition.parentAnchor) {
      throw new Error(`${definition.path} is not accepted by ${definition.parentPath}`);
    }
  }

  return Object.freeze({
    get(path) {
      return byPath.get(path) || null;
    },
    has(path) {
      return byPath.has(path);
    },
    paths() {
      return [...byPath.keys()];
    },
    lineage(path) {
      const segments = String(path).split('/');
      return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
    },
  });
}
