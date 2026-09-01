import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeProtocol } from '../src/core/runtimeProtocol.js';

test('runtime protocol exposes transport-neutral composer and operation handlers', async () => {
  const calls = [];
  const snapshot = { activePaths: ['app'], hash: 'tree', projectionMap: { hash: 'projections' } };
  const runtime = {
    snapshot: () => snapshot,
    async load(path, state) {
      calls.push(['load', path, state]);
      return { hash: 'tree', treeHash: 'tree', projectionHash: 'projections', snapshot };
    },
    async operate(path, operation, data) {
      calls.push(['operate', path, operation, data]);
      return { accepted: true };
    },
    async operateProjection(key, operation, data) {
      calls.push(['projection', key, operation, data]);
      return { projected: true };
    },
  };
  const protocol = createRuntimeProtocol({ runtime });
  assert.equal(protocol.snapshot(), snapshot);
  assert.deepEqual(await protocol.composerCommand({ operation: 'load', path: 'app', state: { value: 1 } }), {
    hash: 'tree',
    treeHash: 'tree',
    projectionHash: 'projections',
    activePaths: ['app'],
    snapshot,
  });
  assert.deepEqual(await protocol.appletOperation({ path: 'app', operation: 'Act' }), { accepted: true });
  assert.deepEqual(await protocol.projectionOperation({ projectionKey: 'p1', operation: 'Act' }), { projected: true });
  assert.deepEqual(calls, [
    ['load', 'app', { value: 1 }],
    ['operate', 'app', 'Act', {}],
    ['projection', 'p1', 'Act', {}],
  ]);
  await assert.rejects(protocol.composerCommand({ operation: 'missing', path: 'app' }), /Unknown operation/);
});
