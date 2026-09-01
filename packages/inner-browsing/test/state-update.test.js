import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createNavigator } from '../src/browser/navigator.js';
import { createAppletRuntime } from '../src/core/appletRuntime.js';
import { createStateTreeStore } from '../src/node/stateTreeStore.js';
import { createTestRegistry } from './testRegistry.js';

function nodeAt(snapshot, appletPath) {
  let match = null;
  function visit(node) {
    if (node.path === appletPath) match = node;
    node.children.forEach(visit);
  }
  snapshot.roots.forEach(visit);
  return match;
}

function stateFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inner-browsing-update-'));
  const registry = createTestRegistry();
  const store = createStateTreeStore({
    stateRoot: directory,
    registry,
    now: () => '2026-08-29T12:00:00.000Z',
  });
  return { directory, registry, store };
}

function oneAppletRegistry({ onInit = () => {}, handle = null } = {}) {
  const definition = {
    path: 'app',
    parentPath: null,
    parentAnchor: 'root',
    clientModule: '/applets/app/client/index.js',
    accepts: {},
    async createServer() {
      return {
        init(context) {
          onInit(context);
          return { retained: true };
        },
      };
    },
    async createServerOperations() {
      return handle ? { handle } : null;
    },
  };
  return {
    get(appletPath) { return appletPath === 'app' ? definition : null; },
    has(appletPath) { return appletPath === 'app'; },
    hasCanonical(appletPath) { return appletPath === 'app'; },
    paths() { return ['app']; },
    canonicalPaths() { return ['app']; },
    lineage() { return ['app']; },
  };
}

test('update replaces active applet state while preserving tree and framework metadata', () => {
  const { directory, store } = stateFixture();
  try {
    const before = store.load('app/workspace/chat', {
      stale: 'remove-me',
      nested: { value: 'before' },
    }).snapshot;
    const beforeTarget = nodeAt(before, 'app/workspace/chat');
    const beforeParent = nodeAt(before, 'app/workspace');
    const result = store.update('app/workspace/chat', {
      nested: { value: 'after' },
      present: false,
      activatedAt: 'caller-cannot-replace-this',
    });
    const after = result.snapshot;
    const afterTarget = nodeAt(after, 'app/workspace/chat');
    const afterParent = nodeAt(after, 'app/workspace');

    assert.deepEqual(result.updated, ['app/workspace/chat']);
    assert.deepEqual(after.activePaths, before.activePaths);
    assert.equal(afterTarget.parentPath, beforeTarget.parentPath);
    assert.equal(afterTarget.parentAnchor, beforeTarget.parentAnchor);
    assert.deepEqual(afterParent.children.map((child) => child.path), beforeParent.children.map((child) => child.path));
    assert.notEqual(afterTarget.stateHash, beforeTarget.stateHash);
    assert.notEqual(after.hash, before.hash);
    assert.deepEqual(afterTarget.state, {
      activatedAt: '2026-08-29T12:00:00.000Z',
      nested: { value: 'after' },
      present: true,
    });
    assert.equal('stale' in afterTarget.state, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('update rejects unknown, inactive, and non-object targets without changing state', () => {
  const { directory, store } = stateFixture();
  try {
    assert.throws(() => store.update('app/missing', {}), /Unknown applet/);
    assert.throws(() => store.update('app/workspace', {}), /inactive applet/);
    store.load('app/workspace');
    const before = store.snapshot();
    assert.throws(() => store.update('app/workspace', []), /plain object/);
    assert.equal(store.snapshot().hash, before.hash);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a no-op replacement retains hashes and reports no changed node', () => {
  const { directory, store } = stateFixture();
  try {
    const before = store.load('app', { title: 'Same' }).snapshot;
    const result = store.update('app', { title: 'Same' });
    assert.deepEqual(result.updated, []);
    assert.equal(result.snapshot.hash, before.hash);
    assert.equal(nodeAt(result.snapshot, 'app').stateHash, nodeAt(before, 'app').stateHash);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('runtime retains the server instance, refreshes operation state, and does not call init twice', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inner-browsing-runtime-update-'));
  let initCount = 0;
  const observedStates = [];
  const registry = oneAppletRegistry({
    onInit() { initCount += 1; },
    handle({ state }) {
      observedStates.push(state);
      return { title: state.title };
    },
  });
  const store = createStateTreeStore({ stateRoot: directory, registry, now: () => '2026-08-29T12:00:00.000Z' });
  const runtime = createAppletRuntime({ registry, store, log() {} });
  try {
    await runtime.load('app', { title: 'Before' });
    await runtime.update('app', { title: 'After' });
    const operationResult = await runtime.operate('app', 'Read state');
    assert.equal(initCount, 1);
    assert.deepEqual(runtime.instancePaths(), ['app']);
    assert.equal(operationResult.title, 'After');
    assert.equal(observedStates[0].title, 'After');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('queued load, update, and destroy commands remain ordered', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inner-browsing-update-order-'));
  const registry = oneAppletRegistry();
  const baseStore = createStateTreeStore({ stateRoot: directory, registry });
  const order = [];
  const store = {
    ...baseStore,
    load(...args) { order.push('load'); return baseStore.load(...args); },
    update(...args) { order.push('update'); return baseStore.update(...args); },
    destroy(...args) { order.push('destroy'); return baseStore.destroy(...args); },
  };
  const runtime = createAppletRuntime({ registry, store, log() {} });
  try {
    await Promise.all([
      runtime.load('app', { value: 1 }),
      runtime.update('app', { value: 2 }),
      runtime.destroy('app'),
    ]);
    assert.deepEqual(order, ['load', 'update', 'destroy']);
    assert.deepEqual(runtime.snapshot().activePaths, []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a rejected runtime update neither changes state nor publishes a successful snapshot', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inner-browsing-update-failure-'));
  const registry = oneAppletRegistry();
  const store = createStateTreeStore({ stateRoot: directory, registry });
  const published = [];
  const runtime = createAppletRuntime({ registry, store, publish: (envelope) => published.push(envelope), log() {} });
  try {
    await runtime.load('app', { value: 1 });
    published.length = 0;
    const before = runtime.snapshot();
    await assert.rejects(runtime.update('app', []), /plain object/);
    assert.equal(runtime.snapshot().hash, before.hash);
    assert.deepEqual(published, []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('navigator updates only the retained client whose state hash changed', async () => {
  const instances = new Map();
  let createCount = 0;
  const navigator = createNavigator({
    document: {},
    host: {},
    loadClientModule: async (specifier) => ({
      createClientApplet() {
        createCount += 1;
        const record = { updates: [], specifier };
        instances.set(specifier, record);
        return {
          init() {},
          update({ state }) { record.updates.push(state.value); },
        };
      },
    }),
  });
  const snapshot = (leftHash, leftValue, rightHash, rightValue) => ({
    roots: [
      { path: 'left', parentPath: null, parentAnchor: 'root', clientModule: '/left.js', state: { value: leftValue }, stateHash: leftHash, children: [] },
      { path: 'right', parentPath: null, parentAnchor: 'root', clientModule: '/right.js', state: { value: rightValue }, stateHash: rightHash, children: [] },
    ],
  });

  await navigator.reconcile(snapshot('left-1', 1, 'right-1', 1));
  const retainedLeft = navigator.records.get('left').instance;
  await navigator.reconcile(snapshot('left-2', 2, 'right-1', 1));

  assert.equal(createCount, 2);
  assert.equal(navigator.records.get('left').instance, retainedLeft);
  assert.deepEqual(instances.get('/left.js').updates, [2]);
  assert.deepEqual(instances.get('/right.js').updates, []);
});
