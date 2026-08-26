# Inner Browsing

Inner Browsing is an experimental runtime for evolving a web application without replacing its surrounding page context. A canonical applet path connects persistent state, server behavior, browser behavior, ownership, and placement. Server companions can progressively compose the application, while browser companions can send path-scoped operations back to their own server handlers.

The new focus is not simply loading data into a page. It is loading and removing independently developed pieces of application behavior—paired server and client applets—with explicit lifecycles, parent-owned mount anchors, hash-addressed state, and streamed reconciliation.

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

The server accepts `applet.operation`, verifies that the target applet is active and has a declared operations companion, then routes it to the menu-owned handler:

```text
src/applets/app/applets/live/applets/menu/server/operations.js
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

## Architecture playbook — physical ownership and logical composition

An applet's own implementation and its child applets are different kinds of content. They should not be siblings with indistinguishable names. Every applet package follows this shape:

```text
<applet>/
├── index.js       definition and composition contract
├── client/        this applet's browser companion
├── server/        this applet's private server companions
└── applets/       independently activated child applets
```

Applied to this example:

```text
src/applets/app/
├── index.js
├── client/
├── server/
└── applets/
    └── live/
        ├── index.js
        ├── client/
        ├── server/
        └── applets/
            ├── menu/
            │   ├── index.js
            │   ├── client/
            │   └── server/
            └── widgets/
                ├── index.js
                ├── client/
                └── server/
```

Use `applets/` for independently activated children. Reserve a possible `src/` directory for implementation modules that belong only to the current applet; a `src/` module does not get its own state node, lifecycle, operation endpoint, or mount contract.

### The filesystem does not define the application path

Physical nesting expresses source ownership. The applet definition remains the source of truth for logical identity and placement:

```js
// app/index.js
accepts: Object.freeze({
  live: 'content',
})

// app/applets/live/index.js
{
  path: 'app/live',
  parentPath: 'app',
  parentAnchor: 'content',
}
```

The parent-side entry `live: 'content'` means “accept the logical child segment `live` at my `content` anchor.” It does not mean that the runtime should search for a physical `./live` directory. The same rule gives `menu: 'left'` and `widgets: 'right'` their mount points inside `app/live`.

This produces three related but separate addresses:

```text
Physical ownership  src/applets/app/applets/live/applets/menu
Logical identity    app/live/menu
Mount placement     app/live.left
```

Moving source files must not change the logical path or mount placement unless the application composition itself is changing.

### Public module URL versus private source file

Each definition declares two client locations:

```js
{
  clientModule: '/applets/app/live/menu/client/index.js',
  clientFile: fileURLToPath(new URL('./client/index.js', import.meta.url)),
}
```

- `clientModule` is the stable logical URL streamed to browsers. It follows the canonical applet path.
- `clientFile` is the private absolute file location used only by Express to serve that URL. It follows the physical ownership tree.

The registry verifies that every `clientModule` matches its canonical applet path and that every `clientFile` exists. Snapshots include `clientModule` but never expose `clientFile`. This prevents a source reorganization from changing browser protocol addresses or leaking server filesystem paths.

### Adding a child applet

1. Create it under `<parent>/applets/<child-name>/` with `index.js`, `client/`, and `server/` companions as needed.
2. Give it the canonical `path`, `parentPath`, and `parentAnchor` in its definition.
3. Add `<child-name>: '<anchor>'` to the parent's `accepts` contract.
4. Keep `clientModule` based on the canonical path and `clientFile` relative to the definition file.
5. Register the definition explicitly in `appletRegistry.js`.
6. Test both the logical mount contract and any lifecycle or operation behavior.

## Responsibility boundaries

```text
Applet definition
  canonical path, parent contract, public client URL, private client file, companion factories

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
git clone git@github.com:taboca/inner-browsing.git
cd inner-browsing
npm install
npm start
```

Open <http://localhost:4420/app/live>. The live server companion automatically adds the red menu on the left. Click `Add widgets`; the menu operation reaches its server companion and the yellow widgets applet appears on the right.

External command paths are also available:

```bash
npm run command -- load app/live
npm run command -- destroy app/live/widgets
npm run scenario -- commander/scenarios/test1.json
```

HTTP commands remain available through `POST /api/commands`, and the current state through `GET /api/snapshot`.
For isolated runs, `STATE_ROOT` can point the server at a different state directory and `INNER_BROWSING_URL` can point the commander at a non-default server URL. The older `NAVIGATOR_URL` name remains accepted for compatibility.

## Verify

```bash
npm run check
```

The tests cover state-tree and scenario behavior plus:

- the separation between nested physical ownership and stable logical module URLs;
- the `app/live` init command progressively adding `app/live/menu`;
- dispatching `Add widgets` to the active menu server operations companion;
- rejecting an unknown menu operation;
- binding the browser operation service to the current applet path;
- wiring the menu's HTML button to `Add widgets`.

## Intentional boundary

This prototype has one shared application snapshot. Applet operation authorization is structural—active path plus declared handler—not yet user/session authorization. A production continuation should bind commands and operations to a session/runtime identity, add expected-hash preconditions, and define permission checks for each operations companion.

## License

Copyright (C) 2026 Marcio Galli. Inner Browsing is free software licensed under the [GNU Affero General Public License, version 3 or later](LICENSE).

## Historical background

The name revisits the 2003 article [“Inner-Browsing: Extending Web Browsing the Navigation Paradigm”](https://web.archive.org/web/20040619061949/http://devedge.netscape.com/viewsource/2003/inner-browsing/) by Marcio Galli, Roger Soares, and Ian Oeschger, published on 16 May 2003. That original vision preserved page context by separating contextual data loading—using techniques such as hidden iframes or `XMLHttpRequest`—from DOM binding instead of replacing the whole page; this 2026 project takes a different step, applying the context-preserving idea to server-directed composition of lifecycle-managed applets and their ongoing client-to-server operations.
