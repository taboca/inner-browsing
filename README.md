# Inner Browsing

## Introduction

Web interfaces begin with HTML elements: a message list, a form, a panel, a
button, or a region where another tool should appear. As those elements gain
application behavior, developers usually turn them into components with local
state and lifecycle methods.

The difficult part begins when the interface must remain consistent with work
performed on the server. The browser may be reloaded, a server process may
change the application without a click, several components may depend on one
accepted operation, and a dynamic component may need to reappear in a newly
created part of the layout. If the browser is the only place that remembers
component structure and context, recovery and synchronization become separate
application problems.

Inner Browsing keeps that context on the server. It represents each managed UI
unit as an **applet** with a server side and a client side. The server maintains
the registered applet structure and its state. The browser receives snapshots
of that structure and materializes the corresponding HTML and interactions.
The result is a component model in which browser behavior remains flexible but
is derived from server-held application context.

The model is built from four supporting ideas.

### 1. Client applets are bound to server applets

An applet is a registered unit of application behavior. It has one definition,
a server companion, and a browser companion:

```text
applet/
├── index.js                 registration and shared identity
├── server/index.js          server lifecycle companion
├── server/operations.js     optional operation handling
└── client/index.js          browser lifecycle companion
```

When the application activates an applet, its server companion is initialized
and retained by the server runtime. A browser receiving that application state
initializes the matching client companion and gives it a small lifecycle for
initializing, mounting, updating, and destroying its local interface.

The client is therefore a materialization of a server-held applet, rather than
an unrelated component that the server must rediscover. Every materialized
client applet has a server counterpart. The reverse does not have to be true at
every moment: a server applet can remain active while a browser reloads or
while its client is temporarily outside the visible layout. This asymmetry is
what allows the interface to be reconstructed from retained context.

The App Composer manages the registered application tree with three commands:

```text
load       activate an applet and any missing parents
update     replace the state of an active applet
destroy    remove an applet and its active descendants
```

Those commands keep the server lifecycle and the browser lifecycle aligned.
They can be requested by application code, an external control surface, or a
server companion; composition does not have to begin with a UI interaction.

### 2. Components follow server-held state

The server keeps state next to the applet structure. Each active applet has a
scoped state value and a hash of that value. The full application tree also has
a hash. Repeated projected applets are kept in a separate server map, where
each projected instance has its own key, state, and state hash.

After an accepted change, the runtime publishes a complete snapshot. The
browser compares the new hashes with the ones it previously materialized:

```text
new applet path          → initialize and mount its client
changed state hash       → update the retained client
missing applet path      → destroy the client
unchanged state hash     → retain the client as it is
```

This makes browser synchronization a consequence of server state. The browser
does not need a second business-state protocol to decide which managed
components changed, and a new browser can rebuild the same application from a
current snapshot.

An operation is not itself a state snapshot. An operation, lifecycle method,
or other server event may perform application work and then request one or more
state or structure changes. Each accepted framework change produces the next
ordered snapshot:

```text
operation or server event
        ↓
application work
        ↓
App Composer or Projection Manager change
        ↓
server snapshot
        ↓
browser lifecycle updates
```

### 3. Operations provide a server boundary for application behavior

Interactive applets often need more than generic `load`, `update`, and
`destroy` commands. A Chat applet, for example, needs an operation such as
`Send message`. The client sends the operation name and its input through a
service already scoped to that applet. It does not directly edit server state
or call another applet.

The runtime delivers the request to the corresponding server operations
companion. That companion is the place to validate the request, call
application or business services, and translate the result into App Composer
or Projection Manager changes:

```text
client interaction
  → applet-scoped operation request
  → matching server operations companion
  → application logic and persistence
  → state or structure change
  → published snapshot
  → browser reconciliation
```

Not every applet needs an operations companion. When an applet accepts
interactive operations, however, its server companion is the required
boundary. Business rules do not have to be distributed among buttons, event
handlers, and unrelated client components.

The same model also allows changes from the inside out. Server lifecycle code,
operation handlers, background integrations, or other authorized server code
can use the runtime without fabricating a browser event. The current commander
demonstrates external composition by sending `load`, `update`, and `destroy`.
Named applet operations use separate browser-to-server operation transports;
the commander does not expose those named operations yet.

### 4. Projections allow the client layout to be composed and recomposed

Some applets belong to the registered application tree. Others may appear many
times inside a host: one widget per message, one card per record, or one tool
per workspace item. The server must retain the identity and state of these
instances, but it should not dictate an exact `HTMLElement` or require every
instance to become an application route.

A **projection** holds the server-side part that can exist before, after, or
without a current browser mount:

```js
{
  projectionKey: 'chat.message.message-157.widget-postit',
  hostPath: 'app/samples/chat',
  targetKey: 'message-157',
  appletPath: 'app/samples/chat/widget-postit',
  appletState: { text: 'hello' }
}
```

The projected applet keeps its state in that local scope. Its host client
receives the available projection records, creates or rearranges the
surrounding layout, and binds each visible `projectionKey` to an actual DOM
element. The navigator then joins the server record with that browser binding
and mounts the client applet there:

```text
server projection                         client layout
identity + state + logical target         projectionKey + HTMLElement
                      \                    /
                       navigator joins them
                                ↓
                    projected client applet
```

This intermediate binding is what lets a layout be recomposed. After a reload,
pagination change, or local rearrangement, the host may create different DOM
elements and bind the same retained projections again. The server continues to
control applet identity and state, while the client controls the concrete
arrangement appropriate to that browser.

Projection is used here as a materialization concept. It does not necessarily
mean an application-domain read model or data calculation, although such a
calculation may produce the state placed in a projection.

## Sample case: Chat with projected Post-its

Chat is the default route, the only browser demonstration, and the framework's
main acceptance case. Open <http://localhost:4420/> after starting the server.
The page contains only the sample surface—there is no demo selector, outer
header, footer, or permanent inspector.

![Inner Browsing Chat showing three message shells with projected Widget Post-it content](./image.png)

The registered application tree is:

```text
app
└── app/samples
    └── app/samples/chat
```

Chat owns message ordering, green message shells, metadata, selection, the
composer, and the ten-most-recent visible window. Each shell exposes one
content target. A projected `app/samples/chat/widget-postit` applet owns only
the inner `<article><em>…</em></article>` subtree.

The sample keeps three areas of state separate:

| Area | Responsibility |
| --- | --- |
| Chat message store | Durable application messages. The checked-in seed is `#1`, `hello`, and `world`. |
| Chat applet state | Selected message and last action in the registered applet tree. |
| Projection Map | Retained Post-it identity, placement information, text state, and change hash. |

Sending a message follows the complete server-led path:

```text
Send message
  → validate and persist the application message
  → register its durable Widget Post-it projection
  → update the retained Chat applet state
  → publish ordered snapshots
  → Chat creates or retains the shell and binds its content target
  → navigator materializes the projected Widget Post-it inside the target
```

Chat displays the ten most recent projection records. Moving from records
91–100 to 92–101 retains nine projected clients, removes only the off-page
client for 91, and mounts 101. Projection 91 remains on the server and can be
materialized again when a later page binds it.

The projected widget is physically nested under Chat because it belongs to
this sample, while `instanceMode: 'projected'` keeps it outside the registered
application tree:

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

- `STATE_ROOT` owns the registered applet tree and its state.
- `PROJECTION_ROOT` owns retained projection records.
- `SAMPLE_DATA_ROOT` owns the Chat application's durable messages.

The server also exposes `/api/snapshot`, `/api/commands`, Socket.IO navigation
and operation transports, and the App Composer CLI:

```bash
npm run command -- load app/samples/chat
npm run command -- update app/samples/chat '{"chat":{"selectedMessageId":null,"lastAction":"README example"}}'
npm run command -- destroy app/samples/chat
```

## Source map

```text
server.js                         HTTP and Socket.IO boundary
commander/                        composition CLI and scenarios
src/appletRegistry.js             registered applet definitions
src/stateTreeStore.js             application tree state and hashing
src/projectionStore.js            retained/runtime projection records
src/appletRuntime.js              mutation ordering and server lifecycles
src/stableJson.js                 shared JSON validation and stable hashing
public/runtime/navigator.js       snapshot-to-client reconciliation
public/runtime/projectionMap.js   host views and atomic DOM binding frames
src/applets/.../chat/             Chat host and projected widget sample
test/                             store, runtime, browser, Chat, and CLI coverage
```

## Prototype boundary

This repository implements one shared application runtime. Each browser has
independent DOM bindings and client companions, while the registered applet
state and server projection records are shared. Authentication, per-user
projection filtering, multi-process coordination, viewport virtualization,
multiple placements for one projected instance, and general transactions
remain outside this pass.

## License

Copyright (C) 2026 Marcio Galli. Inner Browsing is free software licensed under
the [GNU Affero General Public License, version 3 or later](LICENSE).

## Historical background

The name revisits the 2003 article
[“Inner-Browsing: Extending Web Browsing the Navigation Paradigm”](https://web.archive.org/web/20040619061949/http://devedge.netscape.com/viewsource/2003/inner-browsing/)
by Marcio Galli, Roger Soares, and Ian Oeschger, published on 16 May 2003. That
original vision preserved page context by separating contextual data
loading—using techniques such as hidden iframes or `XMLHttpRequest`—from DOM
binding instead of replacing the whole page; this 2026 project takes a
different step, applying the context-preserving idea to server-directed
composition of lifecycle-managed applets and their ongoing client-to-server
operations.
