import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAppletRegistry } from '../src/appletRegistry.js';
import { createAppletRuntime } from '../src/appletRuntime.js';
import { createProjectionStore } from '../src/projectionStore.js';
import { createChatMessageStore } from '../src/samples/chatMessageStore.js';
import { createStateTreeStore } from '../src/stateTreeStore.js';

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inner-browsing-runtime-'));
  const chatMessageStore = createChatMessageStore({ filename: path.join(directory, 'messages.json') });
  const registry = createAppletRegistry({ chatMessageStore });
  const store = createStateTreeStore({ stateRoot: path.join(directory, 'state'), registry });
  const projectionStore = createProjectionStore({ projectionRoot: path.join(directory, 'projections'), registry });
  const runtime = createAppletRuntime({ registry, store, projectionStore, log() {} });
  return { directory, registry, store, projectionStore, runtime };
}

test('canonical Chat companions follow parent-first activation and child-first removal', async () => {
  const { directory, runtime } = fixture();
  try {
    await runtime.load('app/samples/chat');
    await runtime.idle();
    assert.deepEqual(runtime.instancePaths(), ['app', 'app/samples', 'app/samples/chat']);
    await runtime.destroy('app/samples');
    assert.deepEqual(runtime.instancePaths(), ['app']);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Chat initialization progressively ensures durable message projections', async () => {
  const { directory, runtime, projectionStore } = fixture();
  try {
    const chatMessageStore = createChatMessageStore({ filename: path.join(directory, 'messages.json') });
    chatMessageStore.append({ text: 'Seeded before Chat activation' });
    await runtime.load('app/samples/chat');
    await runtime.idle();
    assert.equal(projectionStore.snapshot().records.length, 1);
    assert.deepEqual(runtime.projectionInstanceKeys(), [projectionStore.snapshot().records[0].projectionKey]);
    assert.equal(runtime.snapshot().treeHash, runtime.snapshot().hash);
    assert.match(runtime.snapshot().projectionMap.hash, /^[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
