# Inner Browsing

Inner Browsing is a small framework for server-directed, lifecycle-managed
applet composition. Its default and only demonstration is a retained Chat
whose messages materialize repeated projected Post-it applets.

Open <http://localhost:4420/> after starting the server. The page contains the
sample itself—there is no demonstration picker, outer header, footer, or
inspector competing with the applet surface.

## Run and verify

```bash
npm install
npm start
```

```bash
npm run check
```

Node.js 20 or newer is required. Persistence can be isolated with three
independent roots:

```bash
STATE_ROOT=/tmp/inner-browsing-state \
PROJECTION_ROOT=/tmp/inner-browsing-projections \
SAMPLE_DATA_ROOT=/tmp/inner-browsing-samples \
npm start
```

- `STATE_ROOT` owns canonical composition and applet state.
- `PROJECTION_ROOT` owns durable projected applet records.
- `SAMPLE_DATA_ROOT` owns the Chat application's durable messages.

The application also exposes `/api/snapshot`, `/api/commands`, Socket.IO
navigation and applet-operation transports, and a command-line composer:

```bash
npm run command -- load app/samples/chat
npm run command -- update app/samples/chat '{"selectedMessageId":null}'
npm run command -- destroy app/samples/chat
```

## Two state domains

The canonical composition is deliberately small:

```text
app
└── app/samples
    └── app/samples/chat
```

Canonical nodes are addressed by registered paths, persisted by
`stateTreeStore`, and reconciled by parent/child anchors. The snapshot's
`hash` remains the canonical tree hash for compatibility; `treeHash` exposes
the same value explicitly.

Projected applets live in a separate state domain. A Projection Map record is
self-sufficient:

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

The identities are intentionally distinct:

- `appletPath` identifies a registered applet definition.
- A canonical path identifies one composed canonical instance.
- `projectionKey` identifies one projected instance.
- `targetKey` identifies one logical slot within a host.
- `appletStateHash` identifies content only; equal Post-its can share it.
- A DOM element is an ephemeral browser binding, never persisted state.

Projection-owned `appletState` is authoritative for the projected runtime
instance. It is durable and rehydratable without entering the canonical tree
or propagating through `treeHash`. It is therefore not a duplicate of a
second applet-instance record. A future model that shares one instance across
multiple placements would need a separate instance store and `instanceId`.

## Independent hashes

Canonical and projected state publish together but hash independently:

```js
{
  hash: treeHash,
  treeHash,
  projectionHash,
  projectionMap: { hash: projectionHash, records }
}
```

There is intentionally no combined navigation hash. A projection-only change
must not make routing consumers believe that canonical composition changed.
The navigator receives each published snapshot and reconciles canonical
records and Projection Map records separately, so it does not need a combined
hash as a delivery gate.

`projectionHash` remains useful for diagnostics, equality checks, tests,
cache/change detection for projection consumers, and eventual selective
transport. The Chat case changes it whenever a message projection is added or
its Post-it state changes, but does not consume it to render or rehydrate. It
is not identity; the records themselves provide identity and persistence.

## Projection lifecycle

The server gives each canonical applet a host-scoped Projection Manager:

```text
register / ensure / updateState / updateHostData / destroy / list
```

Projection mutations share the runtime's serialized publication queue with
canonical mutations but do not share the canonical hash tree. Durable records
survive server restart; runtime records survive browser reload only while the
server process remains alive.

A projected server companion is retained by `projectionKey`. Registration or
restore initializes it, state replacement refreshes its runtime state, and
destroy cleans it up. Projected operations are likewise bound to
`projectionKey`, never to a caller-selected path or content hash.

In the browser, the host receives a safe path-scoped Projection Map view.
Bindings use an exact-frame contract:

```text
begin frame
  → bind every currently visible projectionKey to its content element
commit frame
  → materialize new bindings
  → retain unchanged bindings
  → destroy only true orphans
```

An uncommitted render cannot accidentally remove live projected clients. A
projection without a current DOM binding is valid pending state; pagination
can later bind and rematerialize it under the same identity.

## Default Chat case

Chat is both the default route and the framework's acceptance case. It owns
message ordering, green shells, metadata, selection, the composer, and the
last-ten visible window. Each shell contributes one content target. The
projected `widget-postit` definition owns only the inner `<article><em>`
subtree and its cleanup.

The definition is physically nested under Chat because it belongs to this
sample:

```text
src/applets/app/applets/samples/applets/chat/
├── client/
├── server/
└── applets/
    └── widget-postit/
        ├── client/
        └── server/
```

Its logical address is `app/samples/chat/widget-postit`, but its
`instanceMode: 'projected'` means it is not a canonical child and cannot be
loaded through the composition tree. Hundreds of instances may share this
definition while remaining separately addressable by projection key.

See [README.sample.chat.md](README.sample.chat.md) for the complete executable
flow and [Chapter 7](../labs-meetingbro/project/README_MEMO_2026_08_30_100_chapter_7_projected_applet_materialization_and_chat_framework_update_plan.md)
for the architectural decision record.

## Source map

```text
server.js                         HTTP and Socket.IO boundary
commander/                        canonical composition CLI and scenarios
src/appletRegistry.js             canonical/projected definition registry
src/stateTreeStore.js             canonical state and tree hashing
src/projectionStore.js            durable/runtime Projection Map records
src/appletRuntime.js              serialization and server lifecycles
src/stableJson.js                 shared JSON validation and hashing
public/runtime/navigator.js       canonical and projected client reconciliation
public/runtime/projectionMap.js   safe views and atomic binding frames
src/applets/.../chat/             default Chat host sample
test/                             store, runtime, browser, Chat, and CLI coverage
```

This prototype is intentionally a shared single-application runtime. Each
browser has independent DOM bindings and client companions, while canonical
state and the server Projection Map are shared. Authentication, per-user
projection filtering, multi-process coordination, viewport virtualization,
and general transactions remain outside this pass.

License: AGPL-3.0-or-later.
