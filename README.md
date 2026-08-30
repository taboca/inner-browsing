# Inner Browsing

## Introduction

Modern web applications are increasingly built around rich client-side
runtimes. Frameworks such as React made it practical to describe interfaces as
functions of state, while patterns associated with Redux and similar
architectures helped developers centralize state changes and make complex
interfaces more predictable. This model has been enormously productive. But as
applications grow, more responsibility tends to accumulate inside the browser:
routing, state coordination, component identity, lifecycle, synchronization
with the server, recovery after reload, and the reconciliation of increasingly
dynamic interface regions.

The complication is that these concerns do not always belong to the same
layer. Application state is not necessarily navigation state. A component that
appears dynamically inside another component does not necessarily deserve to
become a route. Server-authoritative state should not have to be reconstructed
from a browser's component tree. And when many independently stateful pieces of
UI need to appear, disappear, reload, or move within application-controlled
layouts, developers can end up building increasingly elaborate client-side
coordination machinery simply to keep the interface and the server describing
the same application.

This raises a broader architectural question: **can a web application retain
the flexibility of component-based interfaces while giving the server a
stronger role in composition, state ownership, lifecycle, and recovery?**

**Inner Browsing** is an exploration of that model. It is a small framework for
server-directed, lifecycle-managed applet composition. Instead of treating the
browser as the sole owner of application structure, Inner Browsing gives
applications explicit primitives for canonical composition, repeated projected
applets, durable state, deterministic lifecycle behavior, and browser-local
placement. The browser still owns the DOM and interaction surface, but it
participates in a larger runtime contract rather than reconstructing the
application's architecture by itself.

### A. Why: separate concerns that modern web apps often collapse

Inner Browsing distinguishes several things that are commonly made to travel
together: routing topology, application state, repeated component identity,
projected state, and actual DOM placement. Canonical applets use registered
paths and the familiar `load`, `update`, and `destroy` lifecycle, while
projected applets can exist in large numbers without becoming artificial
routes. Canonical state and projected state also remain separate change
domains.

The result is a framework where:

```text
routing structure       ≠ every component instance
server state            ≠ browser DOM
projected widget state  ≠ canonical route state
logical placement       ≠ HTMLElement identity
```

This separation is the central architectural idea.

### B. How: the Chat and Post-it example

The included Chat sample makes that model concrete. Chat itself is a canonical
applet. It owns the message list, ordering, selection, composer, layout, and the
visible ten-message window. Each message shell can then host a projected Widget
Post-it, which owns only the inner rendered content.

When a new message is sent:

```text
persist application message
        ↓
register projected Post-it
        ↓
publish framework state
        ↓
Chat creates the message shell
        ↓
Chat binds the projection to its DOM target
        ↓
navigator materializes the Post-it
```

Pagination, reload, and repeated instances all follow from the same model. A
projected widget can disappear from the browser while its durable projection
remains available to be materialized again later.

### C. Where this can go

Chat is deliberately a small proving ground. The same primitives point toward
applications composed from independently stateful tools, panels, documents,
assistants, media, inspectors, or generated UI without requiring every dynamic
instance to become a route or forcing all of their state into one client-side
store.

Inner Browsing is therefore less an attempt to replace component frameworks
than an experiment in **changing where application coordination lives**:
keeping the browser expressive, while making composition, lifecycle,
persistence, and projected materialization explicit framework concepts.

## Framework solution: key contracts

The framework separates composition, projected materialization, application
data, and browser placement:

```text
canonical App Composer state          Projection Map
paths + parent/child topology         keyed projected instances + state
             │                                      │
             └──────── navigation snapshot ─────────┘
                                │
                         browser navigator
                                │
             canonical clients + bound projected clients
```

| Concern | Framework contract |
| --- | --- |
| Registration | Every applet definition is explicitly registered as `canonical` or `projected`. |
| Canonical composition | `load`, `update`, and `destroy` operate on registered paths and preserve lifecycle order. |
| Projected instances | The Projection Map owns repeated instance identity, state, host metadata, and logical destination. |
| Identity | A canonical path identifies a composed canonical applet; `projectionKey` identifies one projected instance. |
| Placement | `hostPath + targetKey` names a logical host slot; the actual `HTMLElement` remains browser-local. |
| State ownership | Canonical state belongs to the App Composer tree. Projected `appletState` belongs to the Projection Map. |
| Hashing | `treeHash` and `projectionHash` are independent change domains. Hashes detect content changes; they are not entity identities. |
| Operations | Canonical operations are bound to a path; projected operations are bound to a `projectionKey`. |
| Rehydration | Canonical nodes restore from the state tree. Durable projections restore from self-sufficient Projection Map records. |
| Publication | Canonical and projection mutations share one serialized runtime queue and publish complete snapshots in order. |

### Canonical composition

Canonical applets form the routing and composition hierarchy. Registry
definitions declare their parent path, accepted child segment, and static
parent anchor. The runtime retains one server and browser companion per active
canonical path and applies lifecycle work in a deterministic order:

```text
load       create missing lineage → initialize → mount
update     replace state → retain companion → notify client
destroy    destroy descendants first → destroy parent
```

Canonical state is persisted by `stateTreeStore`. Updating one node changes
its `stateHash`, ancestor hashes, and `treeHash`.

### Projected materialization

A projected definition can have many simultaneous instances. Each Projection
Map record is self-sufficient:

```js
{
  projectionKey: 'chat.message.message-157.widget-postit',
  hostPath: 'app/samples/chat',
  targetKey: 'message-157',
  appletPath: 'app/samples/chat/widget-postit',
  hostData: { messageId, sequence, actorId, createdAt },
  appletState: { text },
  persistence: 'durable'
}
```

The server gives each canonical host a path-scoped Projection Manager:

```text
register / ensure / updateState / updateHostData / destroy / list
```

`appletState` intentionally remains inside the record. It is authoritative for
that projected runtime instance and can rehydrate it after browser reload or
server restart without entering the canonical routing tree. This is not a
duplicate of a separate applet-instance record. A future model that shares one
instance across several placements would require another store and an
`instanceId`.

`projectionKey` is stable while state changes. `appletPath` identifies the
shared definition, while `appletStateHash` identifies current serialized
content only. Hundreds of projected instances may share both the applet path
and content hash while retaining different projection keys.

### Independent hash contract

The navigation envelope transports both state domains without combining their
identity:

```js
{
  hash: treeHash,
  treeHash,
  projectionHash,
  projectionMap: { hash: projectionHash, records }
}
```

`snapshot.hash` remains the canonical `treeHash` for compatibility. A
projection-only change leaves canonical routing hashes unchanged. The browser
navigator reconciles every published snapshot by its canonical and projected
records, so it does not need a combined navigation hash as a delivery gate.

`projectionHash` remains a compact change detector for diagnostics, tests,
caches, and eventual selective transport. It is not required for identity or
rehydration.

### Browser bindings and projected lifecycle

The host applet receives a read-only, path-scoped Projection Map view. It owns
its surrounding layout and associates visible projection keys with current DOM
targets through an exact binding frame:

```text
begin frame
  → bind every currently visible projectionKey to its content target
commit frame
  → materialize new projected clients
  → retain unchanged clients
  → destroy only clients absent from the final frame
```

An abandoned render cannot remove live projected clients. A projection without
a binding is valid pending state: pagination can later create a new target and
materialize the same projection again. The server never stores or inspects DOM
references.

## Sample case: Chat with projected Post-its

Chat is the default route, the only browser demonstration, and the framework's
main acceptance case. Open <http://localhost:4420/> after starting the server.
The page contains only the sample surface—there is no demo selector, outer
header, footer, or permanent inspector.

![Inner Browsing Chat showing three message shells with projected Widget Post-it content](./image.png)

The canonical sample tree is:

```text
app
└── app/samples
    └── app/samples/chat
```

Chat owns message ordering, green message shells, metadata, selection, the
composer, and the ten-most-recent visible window. Each shell exposes one
content target. A projected `app/samples/chat/widget-postit` instance owns only
the inner `<article><em>…</em></article>` subtree.

The sample keeps three ownership layers explicit:

| Layer | Sample responsibility |
| --- | --- |
| Chat message store | Durable application messages. The checked-in seed is `#1`, `hello`, and `world`. |
| Canonical Chat state | Selected message and last-action state participating in `treeHash`. |
| Projection Map | Rehydratable Post-it identity, placement metadata, text state, and `projectionHash`. |

Sending a message exercises both framework domains:

```text
Send message
  → validate and persist the application message
  → register its durable Widget Post-it projection
  → update retained canonical Chat activity state
  → publish ordered snapshots
  → Chat creates or retains the shell and commits its binding frame
  → navigator materializes the projected Widget Post-it inside the target
```

Chat displays the ten most recent Projection Map records. Moving from records
91–100 to 92–101 retains nine projected clients, removes only the off-page
client for 91, and mounts 101. Projection 91 remains durable and can be
materialized again when a later page binds it.

The projected widget is physically nested under Chat because it belongs to
this sample, while `instanceMode: 'projected'` keeps it outside the canonical
tree:

```text
src/applets/app/applets/samples/applets/chat/
├── client/
├── server/
└── applets/
    └── widget-postit/
        ├── client/
        └── server/
```

See [README.sample.chat.md](README.sample.chat.md) for the detailed executable
flow. The architectural decision record is
[Chapter 7 — Projected Applet Materialization](https://github.com/taboca/labs-meetingbro/blob/main/project/README_MEMO_2026_08_30_100_chapter_7_projected_applet_materialization_and_chat_framework_update_plan.md).

## Run and verify

Node.js 20 or newer is required.

```bash
npm install
npm start
```

```bash
npm run check
```

Use independent persistence roots for isolated runs:

```bash
STATE_ROOT=/tmp/inner-browsing-state \
PROJECTION_ROOT=/tmp/inner-browsing-projections \
SAMPLE_DATA_ROOT=/tmp/inner-browsing-samples \
npm start
```

- `STATE_ROOT` owns canonical composition and canonical applet state.
- `PROJECTION_ROOT` owns durable projected records.
- `SAMPLE_DATA_ROOT` owns the Chat application's durable messages.

The server also exposes `/api/snapshot`, `/api/commands`, Socket.IO navigation
and operation transports, and the canonical composer CLI:

```bash
npm run command -- load app/samples/chat
npm run command -- update app/samples/chat '{"chat":{"selectedMessageId":null,"lastAction":"README example"}}'
npm run command -- destroy app/samples/chat
```

## Source map

```text
server.js                         HTTP and Socket.IO boundary
commander/                        canonical composition CLI and scenarios
src/appletRegistry.js             canonical/projected definition registry
src/stateTreeStore.js             canonical state and tree hashing
src/projectionStore.js            durable/runtime Projection Map records
src/appletRuntime.js              mutation serialization and server lifecycles
src/stableJson.js                 shared JSON validation and stable hashing
public/runtime/navigator.js       canonical and projected client reconciliation
public/runtime/projectionMap.js   safe host views and atomic binding frames
src/applets/.../chat/             default Chat host and projected widget sample
test/                             store, runtime, browser, Chat, and CLI coverage
```

## Prototype boundary

This repository implements a shared single-application runtime. Each browser
has independent DOM bindings and client companions, while canonical state and
the server Projection Map are shared. Authentication, per-user projection
filtering, multi-process coordination, viewport virtualization, multiple
placements for one projected instance, and general transactions remain outside
this pass.

License: AGPL-3.0-or-later.
