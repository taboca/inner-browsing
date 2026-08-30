import { createNavigator } from './navigator.js';

const initialSnapshot = JSON.parse(document.getElementById('initial-snapshot').textContent);
const host = document.getElementById('applet-host');
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

function sendProjectionOperation(envelope) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit('projection.operation', envelope, (error, response) => {
      if (error) return reject(new Error('Projected operation acknowledgement timed out'));
      if (!response?.ok) return reject(new Error(response?.error || 'Projected operation failed'));
      resolve(response);
    });
  });
}

function renderSnapshot(snapshot) {
  document.body.dataset.treeHash = snapshot.treeHash || snapshot.hash;
  document.body.dataset.projectionHash = snapshot.projectionMap?.hash || '';
}

const navigator = createNavigator({
  document,
  host,
  sendAppletOperation,
  sendProjectionOperation,
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
