import { createNavigator } from './navigator.js';

const initialSnapshot = JSON.parse(document.getElementById('initial-snapshot').textContent);
const host = document.getElementById('applet-host');
const hash = document.getElementById('snapshot-hash');
const tree = document.getElementById('snapshot-tree');
const lifecycle = document.getElementById('lifecycle-log');
const socket = window.io();

function sendAppletOperation(envelope) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit('applet.operation', envelope, (error, response) => {
      if (error) return reject(new Error('Applet operation acknowledgement timed out'));
      if (!response?.ok) return reject(new Error(response?.error || 'Applet operation failed'));
      resolve(response);
    });
  });
}

function renderSnapshot(snapshot) {
  hash.textContent = snapshot.hash;
  tree.textContent = snapshot.activePaths.length ? snapshot.activePaths.join('\n') : '(empty tree)';
  document.body.dataset.snapshotHash = snapshot.hash;
}

const navigator = createNavigator({
  document,
  host,
  sendAppletOperation,
  onLifecycle(event) {
    lifecycle.textContent = `${event.side}:${event.path}:${event.phase}\n${lifecycle.textContent}`.trim();
  },
});

let reconciliation = Promise.resolve();
function apply(snapshot) {
  reconciliation = reconciliation.then(async () => {
    await navigator.reconcile(snapshot);
    renderSnapshot(snapshot);
  }).catch((error) => {
    document.body.dataset.runtimeError = error.message;
    console.error(error);
  });
}

socket.on('navigator.snapshot', (envelope) => apply(envelope.snapshot));
socket.on('connect', () => socket.emit('navigator.subscribe', {}, (response) => {
  if (response?.ok) apply(response.snapshot);
}));
apply(initialSnapshot);

window.AppletNavigator = Object.freeze({ navigator, socket });
