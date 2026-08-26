import assert from 'node:assert/strict';
import test from 'node:test';
import { createNavigator } from '../public/runtime/navigator.js';
import { createClientApplet as createMenuClient } from '../src/applets/app/applets/live/applets/menu/client/index.js';

test('navigator gives a client applet an operation sender scoped to its own path', async () => {
  let clientContext;
  let sentEnvelope;
  const navigator = createNavigator({
    document: {},
    host: {},
    loadClientModule: async () => ({
      createClientApplet: () => ({ init(context) { clientContext = context; } }),
    }),
    sendAppletOperation: async (envelope) => { sentEnvelope = envelope; return { ok: true }; },
  });
  await navigator.reconcile({
    roots: [{ path: 'app', parentPath: null, parentAnchor: 'root', clientModule: '/app.js', state: {}, children: [] }],
  });
  await clientContext.appletOperation.send('Do work', { amount: 2 });
  assert.deepEqual(sentEnvelope, { path: 'app', operation: 'Do work', data: { amount: 2 } });
});

test('menu button sends the Add widgets operation', async () => {
  const elements = [];
  const refDoc = {
    create(tagName, attributes = {}) {
      const listeners = new Map();
      const element = {
        tagName,
        children: [],
        textContent: attributes.text || '',
        addEventListener(name, listener) { listeners.set(name, listener); },
        removeEventListener(name) { listeners.delete(name); },
        async trigger(name) { await listeners.get(name)?.(); },
        append(child) { this.children.push(child); },
        remove() {},
      };
      elements.push(element);
      return element;
    },
    append(element, target) { target?.append(element); },
  };
  const sent = [];
  const instance = createMenuClient();
  await instance.init({
    refDoc,
    appletOperation: { async send(operation) { sent.push(operation); } },
  });
  const button = elements.find((element) => element.tagName === 'button');
  await button.trigger('click');
  assert.deepEqual(sent, ['Add widgets']);
  assert.equal(button.disabled, false);
});
