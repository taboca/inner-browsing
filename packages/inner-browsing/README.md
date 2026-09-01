# `@taboca/inner-browsing`

Inner Browsing is a server-directed applet composition runtime. The server
retains canonical applet state and repeated projected applet instances; the
browser navigator materializes those snapshots into client applet lifecycles.

The package does not depend on Express, Socket.IO, or another application
server. Applications supply their definitions, persistence adapters, and
transport boundary.

The repository keeps the runnable Express + Socket.IO application in a
separate private workspace. It is a consumer of this package, not part of the
published tarball.

## Exports

```js
import {
  createAppletRegistry,
  createAppletRuntime,
  createRuntimeProtocol,
} from '@taboca/inner-browsing';

import {
  createBrowserRuntime,
  createNavigator,
} from '@taboca/inner-browsing/browser';

import {
  createStateTreeStore,
  createProjectionStore,
} from '@taboca/inner-browsing/node';
```

The default and `/core` exports contain no Express, Socket.IO, filesystem, or
DOM imports. `/browser` provides the DOM navigator with injected operation
senders. `/node` provides the current synchronous filesystem stores and Node
SHA-256 implementation.

## Server assembly

```js
const registry = createAppletRegistry({ definitions, services });
const stateStore = createStateTreeStore({ stateRoot, registry });
const projectionStore = createProjectionStore({ projectionRoot, registry });
const runtime = createAppletRuntime({
  registry,
  store: stateStore,
  projectionStore,
  publish: (envelope) => transport.publish(envelope),
});
const protocol = createRuntimeProtocol({ runtime });
```

An HTTP, WebSocket, Socket.IO, test, or in-process adapter can call the same
protocol methods. See the repository's private `express-socketio-chat`
workspace for a complete application.

On the browser side, a transport supplies operation senders and applies each
received snapshot:

```js
const browserRuntime = createBrowserRuntime({
  initialSnapshot,
  document,
  host,
  sendAppletOperation: (envelope) => transport.request('applet.operation', envelope),
  sendProjectionOperation: (envelope) => transport.request('projection.operation', envelope),
});

transport.onSnapshot((snapshot) => browserRuntime.apply(snapshot));
```

## Store boundary

The runtime accepts State Tree and Projection Store implementations through
its constructor. The `/node` implementations persist JSON atomically on the
local filesystem. Their current contract is synchronous; remote database
adapters require a future asynchronous store contract and are not claimed by
version `0.1.0`.

## Verify and publish

From the repository root:

```bash
npm run check:package
npm run pack:check
```

`npm pack` and `npm publish` also run the package checks through `prepack`.
The release command is intentionally workspace-scoped:

```bash
npm publish --workspace @taboca/inner-browsing --access public
```

## License

Copyright (C) 2026 Marcio Galli. Licensed under the GNU Affero General Public
License, version 3 or later.
