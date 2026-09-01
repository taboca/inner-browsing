function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validAppletPath(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.split('/').every((segment) => /^[a-z][a-z0-9-]*$/.test(segment));
}

// Application definitions and services are supplied by the consumer. The
// registry owns logical validation; server adapters may add physical-file or
// bundler validation without coupling the core package to Node or Express.
export function createAppletRegistry({ definitions: authoredDefinitions, services = {}, validateDefinition = () => {} } = {}) {
  if (!Array.isArray(authoredDefinitions) || authoredDefinitions.length === 0) {
    throw new Error('Applet registry requires a non-empty definitions array');
  }
  if (typeof validateDefinition !== 'function') throw new Error('validateDefinition must be a function');

  const definitions = authoredDefinitions.map((authored) => {
    if (!authored || typeof authored !== 'object') throw new Error('Applet definition must be an object');
    const configured = typeof authored.createWithServices === 'function'
      ? authored.createWithServices(services)
      : authored;
    const definition = Object.freeze({ instanceMode: 'canonical', ...configured });
    if (!validAppletPath(definition.path)) throw new Error(`Invalid applet definition path: ${definition.path || '(empty)'}`);
    if (typeof definition.clientModule !== 'string' || !definition.clientModule.trim()) {
      throw new Error(`${definition.path} requires a clientModule`);
    }
    if (typeof definition.createServer !== 'function') throw new Error(`${definition.path} requires createServer`);
    if (!isPlainObject(definition.accepts)) throw new Error(`${definition.path} requires an accepts map`);
    validateDefinition(definition);
    return definition;
  });

  const byPath = new Map(definitions.map((definition) => [definition.path, definition]));
  if (byPath.size !== definitions.length) throw new Error('Applet paths must be unique');

  for (const definition of definitions) {
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
    if (parent.instanceMode !== 'canonical') throw new Error(`Applet parent must be canonical: ${definition.parentPath}`);
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
