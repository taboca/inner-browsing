import assert from 'node:assert/strict';
import test from 'node:test';
import { createNavigator } from '../public/runtime/navigator.js';

test('navigator gives a canonical client an operation sender scoped to its path', async () => {
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
    roots: [{ path: 'app', parentPath: null, clientModule: '/app.js', state: {}, stateHash: 'app-1', children: [] }],
    projectionMap: { records: [] },
  });
  await clientContext.appletOperation.send('Do work', { amount: 2 });
  assert.deepEqual(sentEnvelope, { path: 'app', operation: 'Do work', data: { amount: 2 } });
});

test('navigator gives a projected client an operation sender scoped to projectionKey', async () => {
  let projectedContext;
  let sentEnvelope;
  const target = { append() {} };
  const navigator = createNavigator({
    document: {},
    host: {},
    loadClientModule: async (specifier) => ({
      createClientApplet() {
        if (specifier === '/host.js') {
          return {
            init({ projectionMap }) {
              const frame = projectionMap.beginBindingFrame();
              frame.bind('projection-1', target);
              frame.commit();
            },
          };
        }
        return { init(context) { projectedContext = context; } };
      },
    }),
    sendProjectionOperation: async (envelope) => { sentEnvelope = envelope; return { ok: true }; },
  });

  await navigator.reconcile({
    roots: [{ path: 'app', parentPath: null, clientModule: '/host.js', state: {}, stateHash: 'app-1', children: [] }],
    projectionMap: {
      records: [{
        projectionKey: 'projection-1',
        hostPath: 'app',
        targetKey: 'target-1',
        appletPath: 'app/widget',
        clientModule: '/widget.js',
        hostData: {},
        appletState: { text: 'Projected' },
        hostDataHash: 'host-1',
        appletStateHash: 'state-1',
      }],
    },
  });

  await projectedContext.appletOperation.send('Act', { value: 3 });
  assert.deepEqual(sentEnvelope, { projectionKey: 'projection-1', operation: 'Act', data: { value: 3 } });
});
