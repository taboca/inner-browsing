# App Composer Progressive 020

This iteration starts from `labs-pattern-appcomposer-010-streamer` and adds a progressive composition loop: applet-owned server code can compose more of the application, and applet-owned browser code can ask its own server companion to perform an operation.

The demonstration begins at `app/live`:

```text
load app/live
  → app/live server init
  → appComposer.command("load app/live/menu")
  → red menu mounts in live.left

click “Add widgets”
  → menu client JS
  → appletOperation.send("Add widgets")
  → Socket.IO applet.operation envelope
  → menu/server/operations.js
  → appComposer.command("load app/live/widgets")
  → widgets mount in live.right
```

The URL or an external commander is therefore needed only to start the composition. Once `app/live` exists, its paired applets can progressively build the next UI state.

## Chapter 1 — server-initiated composition

Every server companion lifecycle now receives a root-scoped `appComposer` service:

```js
init({ path, state, appComposer, log }) {
  appComposer.command('load app/live/menu').catch((error) => {
    log('command:error', { error: error.message });
  });
}
```

`app/live` uses that service in its `init` lifecycle. The command enters the same serialized mutation queue used by HTTP, Socket.IO, and the command-line commander. It is dispatched without awaiting it inside `init`: the current `load app/live` transaction must finish before the nested `load app/live/menu` command can run.

The live layout owns the placement policy:

```js
accepts: {
  menu: 'left',
  widgets: 'right',
}
```

The menu definition declares `parentPath: 'app/live'` and `parentAnchor: 'left'`. The browser runtime checks both sides of that contract before giving the menu a scoped DOM reference. The menu owns its red presentation and its HTML, including the initially rendered `Add widgets` button.

This makes applet server code part of the app's body of work without giving it direct access to the store, Socket.IO, Express, or another applet's implementation.

## Chapter 2 — client-to-server applet operations

The browser runtime gives each client companion an `appletOperation` service bound to that applet's canonical path:

```js
init({ refDoc, appletOperation }) {
  button.addEventListener('click', () => {
    appletOperation.send('Add widgets');
  });
}
```

The client cannot choose a different applet identity through this lifecycle service. The runtime builds the transport envelope:

```js
{
  path: 'app/live/menu',
  operation: 'Add widgets',
  data: {}
}
```

The server accepts `applet.operation`, verifies that the target applet is active and has a declared operations companion, then routes it to:

```text
src/applets/app/live/menu/server/operations.js
```

That handler owns the meaning of `Add widgets`:

```js
async handle({ operation, appComposer }) {
  if (operation !== 'Add widgets') throw new Error(...);
  return appComposer.command('load app/live/widgets');
}
```

The operation handler receives the same root composer service as lifecycle code. It still does not manipulate the tree or another applet directly. Its command produces a normal snapshot broadcast, so the existing client reconciler mounts the widgets applet in `app/live.right`.

Unknown operations, inactive targets, and applets without an operations companion are rejected and acknowledged as errors. The menu button displays success or failure and prevents duplicate clicks while its request is pending.

## Responsibility boundaries

```text
Applet definition
  canonical path, parent contract, client module, companion factories

Server lifecycle companion
  init/destroy behavior; may issue root appComposer commands

Client lifecycle companion
  applet HTML and interaction; may send path-scoped applet operations

Server operations companion
  validates local operation names and translates them into domain/app commands

App composer runtime
  serializes load/destroy, owns state and server instances, publishes snapshots

Navigator runtime
  reconciles snapshots, resolves parent anchors, scopes DOM and operation services
```

The important distinction is between an app command and an applet operation. `load app/live/widgets` is a root-level composition command. `Add widgets` is a menu-local intent. Only the menu's server operations companion translates between them.

## Run the demonstration

```bash
cd /home/taboca/taboca-meetings/labs-pattern-appcomposer-020-progressive
npm install
npm start
```

Open <http://localhost:4420/app/live>. The live server companion automatically adds the red menu on the left. Click `Add widgets`; the menu operation reaches its server companion and the yellow widgets applet appears on the right.

The inherited external command paths remain available:

```bash
npm run command -- load app/live
npm run command -- destroy app/live/widgets
npm run scenario -- commander/scenarios/test1.json
```

HTTP commands remain available through `POST /api/commands`, and the current state through `GET /api/snapshot`.
For isolated runs, `STATE_ROOT` can point the server at a different state directory and `NAVIGATOR_URL` can point the commander at a non-default server URL.

## Verify

```bash
npm run check
```

The tests cover the inherited state-tree and scenario behavior plus:

- the `app/live` init command progressively adding `app/live/menu`;
- dispatching `Add widgets` to the active menu server operations companion;
- rejecting an unknown menu operation;
- binding the browser operation service to the current applet path;
- wiring the menu's HTML button to `Add widgets`.

## Intentional boundary

As in 010, this prototype has one shared application snapshot. Applet operation authorization is structural—active path plus declared handler—not yet user/session authorization. A production continuation should bind commands and operations to a session/runtime identity, add expected-hash preconditions, and define permission checks for each operations companion.
