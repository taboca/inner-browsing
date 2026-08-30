import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAppletRegistry } from '../src/appletRegistry.js';
import { createStateTreeStore } from '../src/stateTreeStore.js';

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inner-browsing-state-'));
  const registry = createAppletRegistry();
  const store = createStateTreeStore({ stateRoot: directory, registry, now: () => '2026-08-26T00:00:00.000Z' });
  return { directory, store };
}

test('load creates its lineage and a deterministic Merkle snapshot', () => {
  const { directory, store } = fixture();
  try {
    const first = store.load('app/samples/chat').snapshot;
    assert.deepEqual(first.activePaths, ['app', 'app/samples', 'app/samples/chat']);
    assert.equal(first.roots[0].children[0].children[0].path, 'app/samples/chat');
    assert.equal('clientFile' in first.roots[0].children[0].children[0], false);
    assert.match(first.hash, /^[a-f0-9]{64}$/);
    assert.equal(store.snapshot().hash, first.hash);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'app/samples/root.json'))).present, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('destroy removes the selected subtree and changes the top hash', () => {
  const { directory, store } = fixture();
  try {
    const before = store.load('app/samples/chat').snapshot;
    const result = store.destroy('app/samples');
    assert.deepEqual(result.removed, ['app/samples/chat', 'app/samples']);
    assert.deepEqual(result.snapshot.activePaths, ['app']);
    assert.notEqual(result.snapshot.hash, before.hash);
    assert.equal(fs.existsSync(path.join(directory, 'app/samples')), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('caller state cannot override the presence invariant', () => {
  const { directory, store } = fixture();
  try {
    const result = store.load('app', { present: false, title: 'Still active' });
    assert.deepEqual(result.snapshot.activePaths, ['app']);
    assert.equal(store.readState('app').present, true);
    assert.equal(store.readState('app').title, 'Still active');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
