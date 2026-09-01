import fs from 'node:fs';
import path from 'node:path';
import { hash, isPlainObject, stable } from './stableJson.js';

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
    if (!registry.hasCanonical(normalized)) throw new Error(`Unknown canonical applet: ${normalized}`);
    return path.join(stateRoot, ...normalized.split('/'), 'root.json');
  }

  function readState(appletPath) {
    const filename = nodeFile(appletPath);
    return fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : null;
  }

  function writeState(appletPath, state) {
    const filename = nodeFile(appletPath);
    const serialized = `${JSON.stringify(stable(state), null, 2)}\n`;
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(temporary, serialized);
      fs.renameSync(temporary, filename);
    } finally {
      if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    }
  }

  function activePaths() {
    return registry.canonicalPaths().filter((appletPath) => readState(appletPath)?.present === true);
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
    if (!registry.hasCanonical(normalized)) throw new Error(`Unknown applet: ${normalized}`);
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

  function update(appletPath, inputState = {}) {
    const normalized = normalizeAppletPath(appletPath);
    if (!registry.hasCanonical(normalized)) throw new Error(`Unknown applet: ${normalized}`);
    const previous = readState(normalized);
    if (!previous?.present) throw new Error(`Cannot update inactive applet: ${normalized}`);
    if (!isPlainObject(inputState)) throw new Error('Applet update state must be a plain object');
    const next = {
      ...inputState,
      present: true,
      activatedAt: previous.activatedAt,
    };
    const changed = hash(previous) !== hash(next);
    if (changed) writeState(normalized, next);
    return {
      added: [],
      removed: [],
      updated: changed ? [normalized] : [],
      snapshot: snapshot(),
    };
  }

  function destroy(appletPath) {
    const normalized = normalizeAppletPath(appletPath);
    if (!registry.hasCanonical(normalized)) throw new Error(`Unknown applet: ${normalized}`);
    const removed = activePaths()
      .filter((item) => item === normalized || item.startsWith(`${normalized}/`))
      .sort((a, b) => b.split('/').length - a.split('/').length);
    const targetDirectory = path.dirname(nodeFile(normalized));
    fs.rmSync(targetDirectory, { recursive: true, force: true });
    return { added: [], removed, snapshot: snapshot() };
  }

  return { load, update, destroy, snapshot, readState };
}
