import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createAppletRegistry } from './src/appletRegistry.js';
import { createStateTreeStore } from './src/stateTreeStore.js';
import { createAppletRuntime } from './src/appletRuntime.js';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 4420;
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);
const registry = createAppletRegistry();
const stateRoot = process.env.STATE_ROOT ? path.resolve(process.env.STATE_ROOT) : path.join(rootDir, 'db', 'state');
const store = createStateTreeStore({ stateRoot, registry });
const runtime = createAppletRuntime({ registry, store, publish: (envelope) => io.emit('navigator.snapshot', envelope) });

function serialize(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function page(snapshot) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inner Browsing</title><link rel="stylesheet" href="/style.css"><script src="/socket.io/socket.io.js"></script></head>
<body><header><div><h1>Inner Browsing</h1><p class="subtitle">Context-preserving navigation · streamed applets · progressive composition</p></div>
<div class="snapshot"><strong>Snapshot</strong><br><code id="snapshot-hash">${snapshot.hash}</code></div></header>
<main><div id="applet-host"></div><aside class="inspector"><section><h3>Active state tree</h3><pre id="snapshot-tree"></pre></section>
<section><h3>Client lifecycle</h3><pre id="lifecycle-log"></pre></section><p class="hint">Open /app/live, then use “Add widgets” in the red menu.</p></aside></main>
<footer><small>Copyright (C) 2026 Marcio Galli · <a href="https://github.com/taboca/inner-browsing">Source</a> · <a href="https://www.gnu.org/licenses/agpl-3.0.html">AGPL-3.0-or-later</a></small></footer>
<script id="initial-snapshot" type="application/json">${serialize(snapshot)}</script><script type="module" src="/runtime/bootstrap.js"></script></body></html>`;
}

app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(rootDir, 'public')));
for (const appletPath of registry.paths()) {
  const definition = registry.get(appletPath);
  app.get(definition.clientModule, (_request, response) => {
    response.sendFile(definition.clientFile);
  });
}

app.get('/api/snapshot', (_request, response) => response.json({ ok: true, snapshot: runtime.snapshot() }));
app.post('/api/commands', async (request, response) => {
  try {
    const { operation, path: appletPath, state = {} } = request.body || {};
    if (!['load', 'destroy'].includes(operation)) throw new Error(`Unknown operation: ${operation}`);
    const envelope = await runtime[operation](appletPath, state);
    response.json({ ok: true, ...envelope });
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message });
  }
});

app.get(/^\/(app(?:\/[a-z][a-z0-9-]*)*)$/, async (request, response, next) => {
  try {
    const appletPath = request.params[0];
    await runtime.load(appletPath);
    response.send(page(runtime.snapshot()));
  } catch (error) {
    next(error);
  }
});
app.get('/', (_request, response) => response.send(page(runtime.snapshot())));

io.on('connection', (socket) => {
  socket.on('navigator.subscribe', (_payload = {}, acknowledge = () => {}) => {
    acknowledge({ ok: true, snapshot: runtime.snapshot() });
  });
  socket.on('navigator.command', async (payload = {}, acknowledge = () => {}) => {
    try {
      const { operation, path: appletPath, state = {} } = payload;
      if (!['load', 'destroy'].includes(operation)) throw new Error(`Unknown operation: ${operation}`);
      const envelope = await runtime[operation](appletPath, state);
      acknowledge({ ok: true, hash: envelope.hash, activePaths: envelope.snapshot.activePaths });
    } catch (error) {
      acknowledge({ ok: false, error: error.message });
    }
  });
  socket.on('applet.operation', async (payload = {}, acknowledge = () => {}) => {
    try {
      const { path: appletPath, operation, data = {} } = payload;
      const result = await runtime.operate(appletPath, operation, data);
      acknowledge({ ok: true, ...result });
    } catch (error) {
      acknowledge({ ok: false, error: error.message });
    }
  });
});

app.use((error, _request, response, _next) => {
  response.status(400).send(`<pre>${String(error.message).replaceAll('<', '&lt;')}</pre>`);
});

await runtime.restore();
server.listen(port, () => {
  console.log(`Inner Browsing running at http://localhost:${port}`);
  console.log(`Known applets: ${registry.paths().join(', ')}`);
});
