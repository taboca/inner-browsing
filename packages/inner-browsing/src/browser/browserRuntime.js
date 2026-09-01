import { createNavigator } from './navigator.js';

// Transport-neutral browser assembly. A transport adapter supplies operation
// senders and may call apply() whenever a new snapshot arrives.
export function createBrowserRuntime({
  initialSnapshot,
  document,
  host,
  loadClientModule,
  sendAppletOperation,
  sendProjectionOperation,
  onLifecycle,
  renderSnapshot = () => {},
  onError = (error) => console.error(error),
} = {}) {
  if (!initialSnapshot) throw new Error('Browser runtime requires an initialSnapshot');
  if (!document || !host) throw new Error('Browser runtime requires document and host');

  const navigator = createNavigator({
    document,
    host,
    loadClientModule,
    sendAppletOperation,
    sendProjectionOperation,
    onLifecycle,
  });
  let reconciliation = Promise.resolve();

  function apply(snapshot) {
    const result = reconciliation.then(async () => {
      await navigator.reconcile(snapshot);
      renderSnapshot(snapshot);
      return snapshot;
    });
    reconciliation = result.catch((error) => {
      onError(error);
    });
    return result;
  }

  apply(initialSnapshot).catch(() => {});
  return Object.freeze({
    navigator,
    apply,
    idle: () => reconciliation,
  });
}
