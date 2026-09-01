import { createBrowserRuntime } from '/inner-browsing/browser/browserRuntime.js';

const initialSnapshot = JSON.parse(document.getElementById('initial-snapshot').textContent);
const host = document.getElementById('applet-host');
const socket = window.io();

function request(eventName, envelope, failureMessage) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(eventName, envelope, (error, response) => {
      if (error) return reject(new Error(`${failureMessage} acknowledgement timed out`));
      if (!response?.ok) return reject(new Error(response?.error || failureMessage));
      return resolve(response);
    });
  });
}

const browserRuntime = createBrowserRuntime({
  initialSnapshot,
  document,
  host,
  sendAppletOperation: (envelope) => request('applet.operation', envelope, 'Applet operation failed'),
  sendProjectionOperation: (envelope) => request('projection.operation', envelope, 'Projected operation failed'),
  renderSnapshot(snapshot) {
    document.body.dataset.treeHash = snapshot.treeHash || snapshot.hash;
    document.body.dataset.projectionHash = snapshot.projectionMap?.hash || '';
  },
  onError(error) {
    document.body.dataset.runtimeError = error.message;
    console.error(error);
  },
});

socket.on('navigator.snapshot', (envelope) => browserRuntime.apply(envelope.snapshot));
socket.on('connect', () => socket.emit('navigator.subscribe', {}, (response) => {
  if (response?.ok) browserRuntime.apply(response.snapshot);
}));

window.AppletNavigator = Object.freeze({ browserRuntime, navigator: browserRuntime.navigator, socket });
