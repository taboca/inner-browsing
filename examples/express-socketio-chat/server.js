import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createAppletRuntime, createRuntimeProtocol } from '@taboca/inner-browsing';
import {
  browserRuntimeDirectory,
  createProjectionStore,
  createStateTreeStore,
} from '@taboca/inner-browsing/node';
import { createAppletRegistry } from './src/appletRegistry.js';
import { createChatMessageStore } from './src/samples/chatMessageStore.js';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 4420;
const host = process.env.HOST || '127.0.0.1';
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);
const sampleDataRoot = process.env.SAMPLE_DATA_ROOT
  ? path.resolve(process.env.SAMPLE_DATA_ROOT)
  : path.join(rootDir, 'db', 'samples');
const chatMessageStore = createChatMessageStore({ filename: path.join(sampleDataRoot, 'chat', 'messages.json') });
const registry = createAppletRegistry({ chatMessageStore });
const stateRoot = process.env.STATE_ROOT ? path.resolve(process.env.STATE_ROOT) : path.join(rootDir, 'db', 'state');
const store = createStateTreeStore({ stateRoot, registry });
const projectionRoot = process.env.PROJECTION_ROOT
  ? path.resolve(process.env.PROJECTION_ROOT)
  : path.join(rootDir, 'db', 'projections');
const projectionStore = createProjectionStore({ projectionRoot, registry });
const runtime = createAppletRuntime({
  registry,
  store,
  projectionStore,
  publish: (envelope) => io.emit('navigator.snapshot', envelope),
});
const protocol = createRuntimeProtocol({ runtime });

function serialize(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function page(snapshot) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inner Browsing Chat</title><link rel="stylesheet" href="/style.css"><script src="/socket.io/socket.io.js"></script></head>
<body><main><div id="applet-host"></div></main>
<script id="initial-snapshot" type="application/json">${serialize(snapshot)}</script><script type="module" src="/bootstrap.js"></script></body></html>`;
}

app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(rootDir, 'public')));
app.use('/inner-browsing/browser', express.static(browserRuntimeDirectory));
for (const appletPath of registry.paths()) {
  const definition = registry.get(appletPath);
  app.get(definition.clientModule, (_request, response) => {
    response.sendFile(definition.clientFile);
  });
}

app.get('/api/snapshot', (_request, response) => response.json({ ok: true, snapshot: protocol.snapshot() }));
app.post('/api/commands', async (request, response) => {
  try {
    response.json({ ok: true, ...await protocol.composerCommand(request.body) });
  } catch (error) {
    response.status(400).json({ ok: false, error: error.message });
  }
});

app.get(/^\/(app(?:\/[a-z][a-z0-9-]*)*)$/, async (request, response, next) => {
  try {
    await runtime.load(request.params[0]);
    response.send(page(protocol.snapshot()));
  } catch (error) {
    next(error);
  }
});
app.get('/', async (_request, response, next) => {
  try {
    await runtime.load('app/samples/chat');
    await runtime.idle();
    response.send(page(protocol.snapshot()));
  } catch (error) {
    next(error);
  }
});

io.on('connection', (socket) => {
  socket.on('navigator.subscribe', (_payload = {}, acknowledge = () => {}) => {
    acknowledge({ ok: true, snapshot: protocol.snapshot() });
  });
  socket.on('navigator.command', async (payload = {}, acknowledge = () => {}) => {
    try {
      acknowledge({ ok: true, ...await protocol.composerCommand(payload) });
    } catch (error) {
      acknowledge({ ok: false, error: error.message });
    }
  });
  socket.on('applet.operation', async (payload = {}, acknowledge = () => {}) => {
    try {
      acknowledge({ ok: true, ...await protocol.appletOperation(payload) });
    } catch (error) {
      acknowledge({ ok: false, error: error.message });
    }
  });
  socket.on('projection.operation', async (payload = {}, acknowledge = () => {}) => {
    try {
      acknowledge({ ok: true, ...await protocol.projectionOperation(payload) });
    } catch (error) {
      acknowledge({ ok: false, error: error.message });
    }
  });
});

app.use((error, _request, response, _next) => {
  response.status(400).send(`<pre>${String(error.message).replaceAll('<', '&lt;')}</pre>`);
});

await runtime.restore();
server.listen(port, host, () => {
  console.log(`Inner Browsing Express + Socket.IO example running at http://${host}:${port}`);
  console.log(`Known applets: ${registry.paths().join(', ')}`);
});
