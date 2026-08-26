import { appApplet } from './applets/app/index.js';
import { liveApplet } from './applets/app/live/index.js';
import { widgetsApplet } from './applets/app/live/widgets/index.js';

const definitions = [appApplet, liveApplet, widgetsApplet];

export function createAppletRegistry() {
  const byPath = new Map(definitions.map((definition) => [definition.path, definition]));

  for (const definition of definitions) {
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
