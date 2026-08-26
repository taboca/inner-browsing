# App Composer Streamer 010

App Composer Streamer is a small pattern for composing a running application from independently activated applets. One canonical path—such as `app/live/widgets`—connects persisted state, server behavior, client behavior, ownership, and placement.

The central idea is simple:

> Change the application tree, produce a new content hash, and stream that snapshot to runtimes that reconcile themselves.

The URL may establish an initial tree, but it is not the application state. After startup, commands evolve the tree directly.

## Basic architecture

The system has four layers:

```text
Command
  load app/live/widgets
          │
          ▼
State tree and Merkle snapshot
  app → live → widgets
          │
          ▼
Paired applet runtimes
  server companion + client companion
          │
          ▼
Anchored presentation
  app.content → live.right → widgets
```

### 1. Command layer

The commander sends a small operation over Socket.IO:

```js
{
  operation: 'load', // or 'destroy'
  path: 'app/live/widgets',
  state: {}
}
```

`load` is additive: it ensures that the requested applet and all its ancestors are present. `destroy` removes only the selected applet and its descendants. It never implicitly removes ancestors.

### 2. State and hash layer

Presence is persisted as a filesystem tree:

```text
db/state/
└── app/
    ├── root.json
    └── live/
        ├── root.json
        └── widgets/
            └── root.json
```

Each `root.json` begins with `present: true` and may hold applet-specific state. Every node receives:

- a state hash derived from its canonical JSON,
- a tree hash derived from its state hash and sorted child hashes.

The top hash is derived from the root nodes. A change anywhere below therefore changes the identity of the entire snapshot, following the same essential Merkle-tree property that makes Git trees useful.

This prototype stores the current working tree. The hash identifies a snapshot, but the system does not yet retain commits or historical objects.

### 3. Paired runtime layer

Every applet has one definition and two companions:

```text
src/applets/app/live/widgets/
├── index.js          definition and parent contract
├── server/index.js   server lifecycle
└── client/index.js   browser lifecycle
```

The definition describes the stable composition contract:

```js
{
  path: 'app/live/widgets',
  parentPath: 'app/live',
  parentAnchor: 'right',
  clientModule: '/applets/app/live/widgets/client/index.js',
  createServer,
  accepts: {}
}
```

The server companion is dynamically instantiated when the state node appears:

```text
create → init → active → destroy
```

The client companion is dynamically imported when the streamed snapshot reaches the browser:

```text
create → init → mount → active → destroy
```

Initialization runs parent-first so every child has a host. Destruction runs child-first so a parent never removes an anchor while a child still owns mounted content inside it.

### 4. Presentation and anchor layer

An applet does not query the page to discover where it belongs. The runtime resolves its placement and gives it a scoped `refDoc`:

```js
refDoc.create(tag, attributes)
refDoc.append(element, target?)
refDoc.registerAnchor(name, element)
refDoc.anchor(name)
```

A parent owns its layout and registers named anchors. The runtime—not the child—maps a child into the accepted anchor:

```text
app
  registers: content

app/live
  mounts in: app.content
  registers: left, right

app/live/widgets
  mounts in: app/live.right
```

The child knows how to render itself but does not know its global DOM location. The parent knows its layout but does not instantiate child implementation code. The runtime joins those two facts.

## Why the model is elegant

The design gains leverage from a few shared invariants instead of many special cases:

- **One path, several meanings.** `app/live/widgets` is the state address, runtime identity, ownership chain, and command target.
- **Parents own space; children own content.** Layout decisions remain local to the component that creates the layout.
- **State drives lifecycles.** Companions exist because a state node exists, not because unrelated routing code happened to instantiate them.
- **Snapshots are values.** The top hash names the entire composed state, making transitions explicit and comparable.
- **Streaming is reconciliation.** The server broadcasts what is true; the browser calculates the minimal lifecycle change.
- **Composition is validated.** A child can mount only when its registered parent explicitly accepts it at the declared anchor.
- **Server code stays private.** Only declared client companion modules are exposed by HTTP.

The resulting core loop is compact:

```text
operation → persisted mutation → server lifecycle → new hash
          → snapshot broadcast → client reconciliation → DOM lifecycle
```

## Example transition

Starting from an empty tree:

```bash
npm run command -- load app
npm run command -- load app/live
npm run command -- load app/live/widgets
```

The presentation becomes a green root host containing a blue two-column live layout, with a yellow widget list in the right column.

Removing only the widgets:

```bash
npm run command -- destroy app/live/widgets
```

produces:

```text
app
└── live
```

The widget server companion is destroyed, a new hash is emitted, and the browser destroys only the widget client companion. The root host and live layout remain mounted.

## Run

```bash
cd /home/taboca/taboca-meetings/labs-pattern-appcomposer-streamer-010
npm install
npm start
```

Open <http://localhost:4410>. Use a second terminal for one-shot commands:

```bash
npm run command -- load app/live/widgets
npm run command -- destroy app/live/widgets
```

Or open the interactive commander:

```bash
npm run command
```

### Synchronous JSON scenarios

A scenario file can execute and verify a sequence one step at a time. The next command is not emitted until the server acknowledges the current command and its expected active paths pass.

Run the included example:

```bash
npm run scenario -- commander/scenarios/test1.json
```

The file format is:

```json
{
  "name": "compose an application",
  "delayMs": 1000,
  "steps": [
    {
      "id": "load-app",
      "operation": "load",
      "path": "app",
      "expect": { "activePaths": ["app"] }
    }
  ]
}
```

The runner fails immediately on a command error, a five-second acknowledgement timeout, or an `activePaths` mismatch, and exits non-zero. `delayMs` pauses only between acknowledged steps; it never overlaps operations. `test1.json` uses a one-second delay, first destroys `app` to establish a deterministic empty baseline, then visibly loads `app`, `app/live`, and `app/live/widgets` in sequence.

GET routes can establish initial state through `/app`, `/app/live`, or `/app/live/widgets`. Socket.IO commands then mutate and stream the application independently from the browser URL.

The same protocol is available over HTTP:

- `GET /api/snapshot`
- `POST /api/commands`

## Current boundary

This version intentionally models one shared application snapshot. The next architectural step would be to address trees by session or runtime ID, reject stale mutations with an expected-hash precondition, and retain immutable snapshot objects as commit history. Multiple server processes should also use isolated state roots or a coordinated storage lock.
