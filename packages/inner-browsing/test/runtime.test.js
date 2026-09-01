import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAppletRuntime } from '../src/core/appletRuntime.js';
import { createProjectionStore } from '../src/node/projectionStore.js';
import { createStateTreeStore } from '../src/node/stateTreeStore.js';
import { createTestRegistry } from './testRegistry.js';

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inner-browsing-runtime-'));
  const registry = createTestRegistry();
  const store = createStateTreeStore({ stateRoot: path.join(directory, 'state'), registry });
  const projectionStore = createProjectionStore({ projectionRoot: path.join(directory, 'projections'), registry });
  const runtime = createAppletRuntime({ registry, store, projectionStore, log() {} });
  return { directory, store, projectionStore, runtime };
}

test('runtime activates canonical parents first and destroys children first', async () => {
  const { directory, runtime } = fixture();
  try {
    await runtime.load('app/workspace/chat');
    assert.deepEqual(runtime.instancePaths(), ['app', 'app/workspace', 'app/workspace/chat']);
    await runtime.destroy('app/workspace');
    assert.deepEqual(runtime.instancePaths(), ['app']);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('runtime materializes a retained projected server instance through a host-scoped manager', async () => {
  const { directory, runtime } = fixture();
  try {
    await runtime.load('app/workspace/chat');
    await runtime.projectionManagerFor('app/workspace/chat').ensure({
      projectionKey: 'event-1.note',
      targetKey: 'event-1',
      appletPath: 'presentation/note',
      hostData: { sequence: 1 },
      appletState: { text: 'Hello' },
      persistence: 'durable',
    });
    assert.deepEqual(runtime.projectionInstanceKeys(), ['event-1.note']);
    assert.equal(runtime.snapshot().projectionMap.records[0].hostPath, 'app/workspace/chat');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
