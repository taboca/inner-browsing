import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createAppletRegistry } from '../src/appletRegistry.js';

test('nested source ownership preserves canonical applet paths and public module URLs', () => {
  const registry = createAppletRegistry();
  const expected = [
    ['app', '/applets/app/client/index.js'],
    ['app/samples', '/applets/app/samples/client/index.js'],
    ['app/samples/chat', '/applets/app/samples/chat/client/index.js'],
    ['app/samples/chat/widget-postit', '/applets/app/samples/chat/widget-postit/client/index.js'],
  ];

  for (const [appletPath, clientModule] of expected) {
    const definition = registry.get(appletPath);
    assert.equal(definition.clientModule, clientModule);
    assert.equal(path.isAbsolute(definition.clientFile), true);
  }

  const chat = registry.get('app/samples/chat');
  assert.equal(chat.parentPath, 'app/samples');
  assert.equal(chat.parentAnchor, 'content');
  assert.equal(chat.clientFile.endsWith(path.join('app', 'applets', 'samples', 'applets', 'chat', 'client', 'index.js')), true);

  const postit = registry.get('app/samples/chat/widget-postit');
  assert.equal(postit.instanceMode, 'projected');
  assert.equal(postit.parentPath, null);
  assert.equal(postit.clientFile.endsWith(path.join('chat', 'applets', 'widget-postit', 'client', 'index.js')), true);
  assert.deepEqual(registry.canonicalPaths(), ['app', 'app/samples', 'app/samples/chat']);
  assert.deepEqual(registry.projectedPaths(), ['app/samples/chat/widget-postit']);
  assert.throws(() => registry.lineage(postit.path), /no canonical lineage/);
});
