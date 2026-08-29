import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createAppletRegistry } from '../src/appletRegistry.js';

test('nested source ownership preserves canonical applet paths and public module URLs', () => {
  const registry = createAppletRegistry();
  const expected = [
    ['app', '/applets/app/client/index.js'],
    ['app/live', '/applets/app/live/client/index.js'],
    ['app/live/menu', '/applets/app/live/menu/client/index.js'],
    ['app/live/widgets', '/applets/app/live/widgets/client/index.js'],
    ['app/samples', '/applets/app/samples/client/index.js'],
    ['app/samples/chat', '/applets/app/samples/chat/client/index.js'],
  ];

  for (const [appletPath, clientModule] of expected) {
    const definition = registry.get(appletPath);
    assert.equal(definition.clientModule, clientModule);
    assert.equal(path.isAbsolute(definition.clientFile), true);
  }

  const menu = registry.get('app/live/menu');
  assert.equal(menu.parentPath, 'app/live');
  assert.equal(menu.parentAnchor, 'left');
  assert.equal(menu.clientFile.endsWith(path.join('app', 'applets', 'live', 'applets', 'menu', 'client', 'index.js')), true);

  const chat = registry.get('app/samples/chat');
  assert.equal(chat.parentPath, 'app/samples');
  assert.equal(chat.parentAnchor, 'content');
  assert.equal(chat.clientFile.endsWith(path.join('app', 'applets', 'samples', 'applets', 'chat', 'client', 'index.js')), true);
});
