import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createNavigator } from '../src/browser/navigator.js';
import { createAppletRuntime } from '../src/core/appletRuntime.js';
import { createProjectionStore } from '../src/node/projectionStore.js';
import { createStateTreeStore } from '../src/node/stateTreeStore.js';
import { createTestRegistry } from './testRegistry.js';

function serverFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inner-browsing-projection-'));
  const registry = createTestRegistry();
  const store = createStateTreeStore({ stateRoot: path.join(directory, 'state'), registry });
  const projectionRoot = path.join(directory, 'projections');
  const projectionStore = createProjectionStore({ projectionRoot, registry, now: () => '2026-08-30T12:00:00.000Z' });
  const runtime = createAppletRuntime({ registry, store, projectionStore, log() {} });
  return { directory, registry, store, projectionRoot, projectionStore, runtime };
}

function projection(projectionKey, targetKey, text, persistence = 'durable') {
  return {
    projectionKey,
    hostPath: 'app/workspace/chat',
    targetKey,
    appletPath: 'presentation/note',
    hostData: { messageId: targetKey, sequence: Number(targetKey.split('-').at(-1)) || 1 },
    appletState: { text },
    persistence,
  };
}

test('Projection Store keeps self-sufficient durable state and independent identities', () => {
  const { directory, registry, projectionRoot, projectionStore } = serverFixture();
  try {
    projectionStore.register(projection('projection-1', 'message-1', 'Same'));
    projectionStore.register(projection('projection-2', 'message-2', 'Same'));
    projectionStore.register(projection('projection-runtime', 'message-3', 'Runtime', 'runtime'));
    const before = projectionStore.snapshot();
    assert.equal(before.records[0].appletStateHash, before.records[1].appletStateHash);
    assert.notEqual(before.records[0].projectionKey, before.records[1].projectionKey);
    assert.deepEqual(before.records[0].appletState, { text: 'Same' });

    const restored = createProjectionStore({ projectionRoot, registry });
    assert.deepEqual(restored.snapshot().records.map((record) => record.projectionKey), ['projection-1', 'projection-2']);
    assert.equal(restored.snapshot().records[0].appletPath, 'presentation/note');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('projection-only mutation changes projectionHash without changing canonical treeHash', async () => {
  const { directory, runtime } = serverFixture();
  try {
    await runtime.load('app/workspace/chat');
    await runtime.idle();
    const before = runtime.snapshot();
    await runtime.projectionManagerFor('app/workspace/chat').register(
      projection('projection-1', 'message-1', 'Projected only'),
    );
    const after = runtime.snapshot();
    assert.equal(after.treeHash, before.treeHash);
    assert.equal(after.hash, before.hash);
    assert.notEqual(after.projectionMap.hash, before.projectionMap.hash);

    const stateHash = after.projectionMap.records[0].appletStateHash;
    await runtime.projectionManagerFor('app/workspace/chat').updateHostData('projection-1', {
      messageId: 'message-1', sequence: 2,
    });
    assert.equal(runtime.snapshot().projectionMap.records[0].appletStateHash, stateHash);
    await runtime.projectionManagerFor('app/workspace/chat').updateState('projection-1', { text: 'Changed' });
    assert.notEqual(runtime.snapshot().projectionMap.records[0].appletStateHash, stateHash);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function browserSnapshot(records) {
  return {
    roots: [{ path: 'app', parentPath: null, clientModule: '/host.js', state: {}, stateHash: 'tree-state', children: [] }],
    projectionMap: { hash: `map-${records.map((record) => record.appletStateHash).join('-')}`, records },
  };
}

function browserProjection(stateHash, text = 'Text') {
  return {
    projectionKey: 'projection-1',
    hostPath: 'app',
    targetKey: 'message-1',
    appletPath: 'app/widget',
    clientModule: '/widget.js',
    hostData: { messageId: 'message-1', sequence: 1 },
    appletState: { text },
    hostDataHash: 'host-1',
    appletStateHash: stateHash,
    hash: `record-${stateHash}`,
  };
}

test('navigator retains, updates, and destroys a projected client from binding commits', async () => {
  const target = { append() {} };
  const widget = { creates: 0, updates: [], destroys: 0 };
  let hostProjectionChanges = 0;
  const navigator = createNavigator({
    document: {},
    host: {},
    loadClientModule: async (specifier) => ({
      createClientApplet() {
        if (specifier === '/host.js') {
          const bindVisible = (projectionMap) => {
            const frame = projectionMap.beginBindingFrame();
            for (const item of projectionMap.list()) frame.bind(item.projectionKey, target);
            frame.commit();
          };
          return {
            init({ projectionMap }) { bindVisible(projectionMap); },
            projectionsChanged({ projectionMap }) { hostProjectionChanges += 1; bindVisible(projectionMap); },
          };
        }
        widget.creates += 1;
        return {
          update({ state }) { widget.updates.push(state.text); },
          destroy() { widget.destroys += 1; },
        };
      },
    }),
  });

  await navigator.reconcile(browserSnapshot([browserProjection('state-1', 'First')]));
  const retained = navigator.projectedRecords.get('projection-1').instance;
  await navigator.reconcile(browserSnapshot([browserProjection('state-2', 'Second')]));
  assert.equal(navigator.projectedRecords.get('projection-1').instance, retained);
  assert.deepEqual(widget.updates, ['Second']);
  assert.equal(hostProjectionChanges, 1);

  await navigator.reconcile(browserSnapshot([]));
  assert.equal(widget.destroys, 1);
  assert.equal(navigator.projectedRecords.size, 0);
});
