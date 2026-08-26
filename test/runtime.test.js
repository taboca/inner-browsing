import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAppletRegistry } from '../src/appletRegistry.js';
import { createAppletRuntime } from '../src/appletRuntime.js';
import { createStateTreeStore } from '../src/stateTreeStore.js';

test('server companions follow parent-first init and child-first destroy', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'navigator-runtime-'));
  try {
    const registry = createAppletRegistry();
    const store = createStateTreeStore({ stateRoot: directory, registry });
    const runtime = createAppletRuntime({ registry, store, log() {} });
    await runtime.load('app/live/widgets');
    assert.deepEqual(runtime.instancePaths(), ['app', 'app/live', 'app/live/widgets']);
    await runtime.destroy('app/live');
    assert.deepEqual(runtime.instancePaths(), ['app']);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a server companion can progressively compose a child through appComposer', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'progressive-runtime-'));
  try {
    const registry = createAppletRegistry();
    const store = createStateTreeStore({ stateRoot: directory, registry });
    const runtime = createAppletRuntime({ registry, store, log() {} });
    await runtime.load('app/live');
    await runtime.idle();
    assert.deepEqual(runtime.snapshot().activePaths, ['app', 'app/live', 'app/live/menu']);
    assert.deepEqual(runtime.instancePaths(), ['app', 'app/live', 'app/live/menu']);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
