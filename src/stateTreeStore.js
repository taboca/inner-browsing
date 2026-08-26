import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export function normalizeAppletPath(value) {
  const normalized = String(value || '').trim().replace(/^\/+|\/+$/g, '');
  if (!normalized || !normalized.split('/').every((item) => /^[a-z][a-z0-9-]*$/.test(item))) {
    throw new Error(`Invalid applet path: ${value || '(empty)'}`);
  }
  return normalized;
}

export function createStateTreeStore({ stateRoot, registry, now = () => new Date().toISOString() }) {
  fs.mkdirSync(stateRoot, { recursive: true });

  function nodeFile(appletPath) {
    const normalized = normalizeAppletPath(appletPath);
    if (!registry.has(normalized)) throw new Error(`Unknown applet: ${normalized}`);
    return path.join(stateRoot, ...normalized.split('/'), 'root.json');
  }

  function readState(appletPath) {
    const filename = nodeFile(appletPath);
    return fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : null;
  }

  function writeState(appletPath, state) {
    const filename = nodeFile(appletPath);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, `${JSON.stringify(stable(state), null, 2)}\n`);
  }

  function activePaths() {
    return registry.paths().filter((appletPath) => readState(appletPath)?.present === true);
  }

  function snapshot() {
    const active = activePaths();
    const nodesByPath = new Map();
    [...active].sort((a, b) => b.split('/').length - a.split('/').length).forEach((appletPath) => {
      const definition = registry.get(appletPath);
      const state = readState(appletPath);
      const children = [...nodesByPath.values()]
        .filter((node) => node.parentPath === appletPath)
        .sort((a, b) => a.path.localeCompare(b.path));
      const stateHash = hash(state);
      const treeHash = hash({ stateHash, children: children.map(({ name, hash: childHash }) => ({ name, hash: childHash })) });
      nodesByPath.set(appletPath, {
        name: appletPath.split('/').at(-1),
        path: appletPath,
        parentPath: definition.parentPath,
        parentAnchor: definition.parentAnchor,
        clientModule: definition.clientModule,
        state,
        stateHash,
        hash: treeHash,
        children,
      });
    });
    const roots = [...nodesByPath.values()].filter((node) => node.parentPath === null);
    const rootHash = roots.length ? hash(roots.map(({ name, hash: treeHash }) => ({ name, hash: treeHash }))) : hash([]);
    return { version: 1, hash: rootHash, activePaths: active, roots };
  }

  function load(appletPath, inputState = {}) {
    const normalized = normalizeAppletPath(appletPath);
    if (!registry.has(normalized)) throw new Error(`Unknown applet: ${normalized}`);
    const added = [];
    for (const item of registry.lineage(normalized)) {
      const previous = readState(item);
      if (previous?.present) continue;
      writeState(item, {
        ...(item === normalized && inputState && typeof inputState === 'object' ? inputState : {}),
        present: true,
        activatedAt: now(),
      });
      added.push(item);
    }
    return { added, removed: [], snapshot: snapshot() };
  }

  function destroy(appletPath) {
    const normalized = normalizeAppletPath(appletPath);
    if (!registry.has(normalized)) throw new Error(`Unknown applet: ${normalized}`);
    const removed = activePaths()
      .filter((item) => item === normalized || item.startsWith(`${normalized}/`))
      .sort((a, b) => b.split('/').length - a.split('/').length);
    const targetDirectory = path.dirname(nodeFile(normalized));
    fs.rmSync(targetDirectory, { recursive: true, force: true });
    return { added: [], removed, snapshot: snapshot() };
  }

  return { load, destroy, snapshot, readState };
}
