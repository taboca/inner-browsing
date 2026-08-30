import fs from 'node:fs';
import nodePath from 'node:path';
import { appApplet } from './applets/app/index.js';
import { samplesApplet } from './applets/app/applets/samples/index.js';
import { chatApplet } from './applets/app/applets/samples/applets/chat/index.js';
import { widgetPostitApplet } from './applets/app/applets/samples/applets/chat/applets/widget-postit/index.js';

const baseDefinitions = [appApplet, samplesApplet, chatApplet, widgetPostitApplet];

export function createAppletRegistry(services = {}) {
  const definitions = baseDefinitions.map((definition) => {
    const configured = typeof definition.createWithServices === 'function'
      ? definition.createWithServices(services)
      : definition;
    return Object.freeze({ instanceMode: 'canonical', ...configured });
  });
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
    if (definition.instanceMode === 'projected') {
      if (definition.parentPath || definition.parentAnchor) {
        throw new Error(`${definition.path} is projected and cannot declare a canonical parent anchor`);
      }
      continue;
    }
    if (definition.instanceMode !== 'canonical') throw new Error(`${definition.path} has an invalid instanceMode`);
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
    hasCanonical(path) {
      return byPath.get(path)?.instanceMode === 'canonical';
    },
    paths() {
      return [...byPath.keys()];
    },
    canonicalPaths() {
      return definitions.filter((definition) => definition.instanceMode === 'canonical').map((definition) => definition.path);
    },
    projectedPaths() {
      return definitions.filter((definition) => definition.instanceMode === 'projected').map((definition) => definition.path);
    },
    lineage(path) {
      if (byPath.get(path)?.instanceMode !== 'canonical') throw new Error(`Projected applet has no canonical lineage: ${path}`);
      const segments = String(path).split('/');
      const lineage = segments.map((_, index) => segments.slice(0, index + 1).join('/'));
      if (!lineage.every((item) => byPath.get(item)?.instanceMode === 'canonical')) {
        throw new Error(`Canonical lineage is not registered: ${path}`);
      }
      return lineage;
    },
  });
}
