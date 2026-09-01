import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserRuntime } from '../src/browser/browserRuntime.js';

test('browser runtime reconciles its initial snapshot without choosing a transport', async () => {
  const rendered = [];
  const initialSnapshot = {
    hash: 'tree-1',
    treeHash: 'tree-1',
    roots: [{
      path: 'app',
      parentPath: null,
      parentAnchor: 'root',
      clientModule: '/app.js',
      state: { value: 1 },
      stateHash: 'state-1',
      children: [],
    }],
    projectionMap: { hash: 'projection-1', records: [] },
  };
  const instance = createBrowserRuntime({
    initialSnapshot,
    document: {},
    host: {},
    loadClientModule: async () => ({ createClientApplet: () => ({ init() {}, mount() {} }) }),
    renderSnapshot: (snapshot) => rendered.push(snapshot.hash),
  });
  await instance.idle();
  assert.deepEqual(rendered, ['tree-1']);
  assert.deepEqual([...instance.navigator.records.keys()], ['app']);
});
