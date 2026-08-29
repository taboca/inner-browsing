# Sample · Retained one-user Chat

## Purpose

The `app/samples/chat` applet is the executable use case for Inner Browsing's
`update` command. It demonstrates how one explicitly registered applet can be
activated dynamically, perform durable server work through a path-scoped
operation, and receive complete replacement state without recreating its
server or client companion.

The sample is deliberately small:

* one local user, `sample-self`;
* text messages of at most 500 characters;
* one durable JSON message store;
* one `self.text` renderer;
* one optional selected-message action; and
* no authentication, presence, typing feed, edits, attachments, or multiple
  Chat participants.

## Run the sample

```bash
npm install
npm start
```

Open <http://localhost:4420/app/samples/chat>.

If another demonstration subtree is already active in the persisted state,
it may remain visible beside the sample. The framework intentionally preserves
active context. To start from an empty tree, use the commander before opening
the Chat URL:

```bash
npm run command -- destroy app
```

The checked-in seed message lives at:

```text
db/samples/chat/messages.json
```

For an isolated run, point both persistent surfaces at temporary directories:

```bash
STATE_ROOT=/tmp/inner-browsing-state \
SAMPLE_DATA_ROOT=/tmp/inner-browsing-samples \
npm start
```

`STATE_ROOT` contains active applet state. `SAMPLE_DATA_ROOT` contains durable
sample messages. They have deliberately different ownership.

## Registered composition

The logical tree is:

```text
app
└── app/samples
    └── app/samples/chat
```

Its physical ownership is:

```text
src/applets/app/applets/samples/
├── index.js
├── client/
├── server/
└── applets/
    └── chat/
        ├── index.js
        ├── client/
        └── server/
```

Both applets are explicit registry definitions. `app` accepts `samples` at its
`content` anchor, and `app/samples` accepts `chat` at its own `content` anchor.
The command:

```text
load app/samples/chat
```

creates the missing registered lineage and starts one server/client instance
for every newly active canonical path.

Registration does not prevent dynamic activation. It defines which applet may
be activated, its owner, and its legal mount point. V1 does not create multiple
keyed instances of the same definition: there is one active instance for the
canonical path `app/samples/chat`.

## Two-region layout

The Chat client owns one behavior-bearing surface with two vertical regions:

```text
┌─────────────────────────────────┐
│ message flow                    │
│                                 │
│ scrollable ordered messages     │
│                                 │
├─────────────────────────────────┤
│ N messages                      │
│ [Write a message…]       [Send] │
└─────────────────────────────────┘
```

CSS grid uses `minmax(0, 1fr) auto`. The flow scrolls while the composer stays
in the lower row of the applet-owned panel. It is not fixed to the browser
viewport.

## Initialization and ordinary update

Loading creates an active Chat node before its server companion reads the
sample message store. The `init` lifecycle then enqueues the same ordinary
active-node update used after later operations:

```text
load app/samples/chat
  → Chat node becomes active
  → Chat server init reads durable messages
  → server creates complete initial applet view state
  → update app/samples/chat
```

This can produce two progressive snapshots:

```text
snapshot 1  Chat exists with bootstrap state
snapshot 2  same Chat instance contains its server-resolved view state
```

The phrase **initial applet view state** is intentional. Inner Browsing
`update` does not define a formal Projection, Projection Mapping, Projection
Registration, or Projection Manager. An application may later supply the
output of such a projection as applet state, but projection calculation and
state delivery remain separate layers.

## Sending a message

The browser draft remains local until the form is submitted:

```js
appletOperation.send('Send message', { text });
```

The navigator binds this operation sender to `app/samples/chat`; the client
cannot substitute another applet path. The server flow is:

```text
Send message intent
  → app/samples/chat operations companion
  → validate bounded text
  → append durable message with server identity, sequence, actor, and time
  → read the complete ordered message list
  → construct complete Chat applet view state
  → update app/samples/chat
  → publish normal navigator.snapshot
```

The resulting state shape is application-owned:

```js
{
  chat: {
    messages: [
      {
        messageId: 'message-...',
        sequence: 2,
        createdAt: '2026-08-29T13:00:00.000Z',
        actorId: 'sample-self',
        rendererKey: 'self.text',
        text: 'Hello'
      }
    ],
    messageCount: 2,
    selectedMessageId: null
  }
}
```

V1 replacement semantics mean the server supplies the complete `chat` value
on every update. Stale applet-owned fields do not survive accidentally. The
state store preserves only framework metadata such as `present` and
`activatedAt` from the previous node.

## From applet state to the proper message element

Inner Browsing stops at applet delivery:

```text
snapshot contains changed app/samples/chat stateHash
  → navigator finds the retained app/samples/chat client record
  → navigator calls Chat update({ state })
```

The framework does not inspect the message array and does not choose a DOM
element. The Chat client owns item reconciliation:

```text
messageId → browser-local DOM content target
rendererKey → bounded browser-local rendering function
```

For each state replacement, the client:

1. sorts messages by server sequence;
2. removes targets whose IDs disappeared;
3. reuses an existing shell when `messageId` is already mapped;
4. creates a shell and content target for a new ID;
5. selects the bounded renderer through `rendererKey`;
6. appends shells in authoritative order; and
7. updates the count shown in the lower bar.

No DOM reference is stored in JSON or sent to the server.

## Per-message operation

Each message shell includes a `Select` action. It demonstrates item identity
inside an applet-scoped operation:

```js
appletOperation.send('Select message', {
  messageId: 'message-2',
});
```

The operation still reaches the `app/samples/chat` server companion. The
server validates that the message exists and replaces Chat state with
`selectedMessageId`. The retained client then marks the matching shell.

This is different from dynamically loading an applet into the message DOM
element. Current Inner Browsing supports dynamic activation of registered
canonical applets, not arbitrary repeated instances addressed by dynamic DOM
tags. Such a feature would need a separate instance-identity and dynamic-mount
proposal.

## What the sample proves

The automated checks prove:

* `app/samples/chat` creates its registered lineage;
* initialization supplies server-read applet view state through `update`;
* `Send message` appends a durable record;
* state and snapshot hashes change while active paths and instances remain;
* `Select message` carries item identity through the scoped Chat operation;
* the client retains an existing message shell across state updates;
* a new message creates a new target;
* `rendererKey` selects bounded inner rendering; and
* blank and over-limit messages are rejected.

Run the complete suite with:

```bash
npm run check
```

## Current boundary

The sample demonstrates the runtime contract, not a production Chat system.
It has one process, one shared snapshot, one sample user, synchronous JSON
persistence, and no expected-hash conflict handling. The durable message file
is application/sample truth; `db/state/app/samples/chat/root.json` is retained
applet state and can be reconstructed from the messages.
