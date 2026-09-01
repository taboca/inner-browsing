import assert from 'node:assert/strict';
import test from 'node:test';
import { createAppletRegistry } from '../src/core/appletRegistry.js';
import { createTestRegistry, testDefinitions } from './testRegistry.js';

test('registry validates canonical lineage and projected definitions without owning source files', () => {
  const registry = createTestRegistry();
  assert.deepEqual(registry.canonicalPaths(), ['app', 'app/workspace', 'app/workspace/chat']);
  assert.deepEqual(registry.projectedPaths(), ['presentation/note']);
  assert.deepEqual(registry.lineage('app/workspace/chat'), ['app', 'app/workspace', 'app/workspace/chat']);
  assert.equal(registry.get('app/workspace/chat').clientModule, '/clients/chat.js');
  assert.throws(() => registry.lineage('presentation/note'), /no canonical lineage/);
});

test('registry injects application services while keeping authored definitions reusable', async () => {
  const service = { value: 'injected' };
  const definition = {
    path: 'app',
    parentPath: null,
    parentAnchor: 'root',
    clientModule: '/app.js',
    accepts: {},
    createWithServices(services) {
      return { ...this, createServer: async () => ({ init: () => services.service.value }) };
    },
  };
  const registry = createAppletRegistry({ definitions: [definition], services: { service } });
  const server = await registry.get('app').createServer();
  assert.equal(server.init(), 'injected');
});

test('registry rejects invalid parent placement', () => {
  const definitions = testDefinitions.map((definition) => (
    definition.path === 'app/workspace/chat'
      ? { ...definition, parentAnchor: 'missing' }
      : definition
  ));
  assert.throws(() => createAppletRegistry({ definitions }), /is not accepted/);
});
