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

test('an active applet operation can compose another applet', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'progressive-operation-'));
  try {
    const registry = createAppletRegistry();
    const store = createStateTreeStore({ stateRoot: directory, registry });
    const runtime = createAppletRuntime({ registry, store, log() {} });
    await runtime.load('app/live');
    await runtime.idle();
    const result = await runtime.operate('app/live/menu', 'Add widgets');
    assert.equal(result.command, 'load app/live/widgets');
    assert.deepEqual(result.activePaths, ['app', 'app/live', 'app/live/menu', 'app/live/widgets']);
    assert.deepEqual(runtime.instancePaths(), ['app', 'app/live', 'app/live/menu', 'app/live/widgets']);
    await assert.rejects(runtime.operate('app/live/menu', 'Surprise me'), /Unknown menu operation/);
    await assert.rejects(runtime.operate('app/live', 'Add widgets'), /does not accept operations/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
