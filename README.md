# Inner Browsing

Inner Browsing is a small framework for server-directed, lifecycle-managed
applet composition. It supports ordinary canonical applets and repeated
projected applet instances without turning dynamic browser targets into routes
or duplicating projected state in the canonical tree.

The repository includes one focused sample case: a retained Chat in which each
message shell hosts a projected Widget Post-it.

## Framework key points

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
