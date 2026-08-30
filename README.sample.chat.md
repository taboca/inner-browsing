# Sample · Chat with projected Post-it applets

## Purpose

`app/samples/chat` is the default executable case for both retained canonical
updates and projected applet materialization. It demonstrates three ownership
layers without duplicating their state:

| Layer | Owns |
| --- | --- |
| Chat message store | durable application messages |
| canonical Chat state | selection and last-action state participating in the composition tree |
| Projection Map | rehydratable Post-it instance identity, placement metadata, and projected `appletState` |

The sample has one local actor, plain text of at most 500 characters, durable
JSON storage, and no authentication, presence, edits, attachments, or
multi-user isolation.

## Run

```bash
npm install
npm start
```

Open <http://localhost:4420/>. The root loads `app/samples/chat`; the explicit
route <http://localhost:4420/app/samples/chat> remains available.

The checked-in messages live at `db/samples/chat/messages.json`. Canonical
state, projections, and sample data can be isolated independently:

```bash
STATE_ROOT=/tmp/inner-browsing-state \
PROJECTION_ROOT=/tmp/inner-browsing-projections \
SAMPLE_DATA_ROOT=/tmp/inner-browsing-samples \
npm start
```

## Definitions and instances

The canonical tree is:

```text
app → app/samples → app/samples/chat
```

`app/samples/chat/widget-postit` is a registered projected definition. Its
source is nested physically under Chat because it is a Chat-owned sample
widget, but it has no canonical parent or anchor. It cannot be loaded into the
canonical tree.

Each message gets a record like:

```js
{
  projectionKey: `chat.message.${messageId}.widget-postit`,
  hostPath: 'app/samples/chat',
  targetKey: messageId,
  appletPath: 'app/samples/chat/widget-postit',
  hostData: { messageId, sequence, actorId, createdAt },
  appletState: { text },
  persistence: 'durable'
}
```

`projectionKey`, rather than the applet path or a state hash, identifies the
instance. Many messages share the same definition. Multiple messages with
the same text also share an `appletStateHash`, but remain different instances.

## Initialization and rehydration

On the first load, the Chat server reads durable messages and calls
`projectionManager.ensure` for each one. Existing durable projections are
left intact; missing seed or migration records are created. The canonical
Chat state is then updated with only its own selected-message and last-action
values.

On restart or browser reload:

```text
projection record restores projectionKey + definition + appletState + slot
  → projected server companion is restored by projectionKey
  → Chat renders its current visible shells
  → Chat commits projectionKey-to-element bindings
  → navigator materializes Post-it clients into those elements
```

No DOM reference is serialized. Off-page records remain durable pending
state and materialize if a later page binds them.

## Sending a message

The draft remains browser-local until Chat sends its path-scoped operation:

```text
Send message
  → validate text
  → append the durable application message
  → register its durable Post-it projection
  → update retained canonical Chat last-action state
  → publish serialized snapshots
```

The Projection Map drives count, ordering, and visible message metadata, so
projected content is not duplicated inside canonical Chat state. A later edit
would use `projectionManager.updateState(projectionKey, { text })`; that would
change `projectionHash` while leaving `treeHash` unchanged.

## Browser ownership and pagination

Chat owns each green rounded `<li>`, its header, metadata, Select button, and
empty content target. The projected Post-it owns only the subtree inside that
target:

```text
li.chat-message                          Chat
  div.chat-message-header                Chat
  div.chat-message-content               Chat binding target
    article.projected-widget-postit      Post-it
      em                                 Post-it italic text
```

Chat renders the ten most recent records. It retains shells by `messageId`
and commits one exact binding frame after each render. Moving from records
91–100 to 92–101 retains nine projected clients, removes the local client for
91, and materializes 101. The durable projection for 91 is not destroyed and
can be rebound later.

Selection is still an ordinary Chat operation. It updates canonical Chat
state and its tree hash without rewriting Post-it state.

## Hash behavior

The navigation envelope exposes independent domains:

```text
snapshot.hash  = treeHash
treeHash       canonical composition and state
projectionHash projected identity, state, and placement records
```

There is no combined navigation hash. The navigator reconciles every
published snapshot by the two record sets, which keeps projection churn from
changing the canonical routing contract. `projectionHash` is still exercised
by every projection registration or projected-state update and is useful to
projection-aware consumers as a compact change detector.

## Verification

```bash
npm run check
```

Coverage includes durable/runtime restoration, JSON validation, equal state
hashes with distinct projection identities, independent hash evolution,
server companion retention and cleanup, exact browser binding frames,
last-ten reconciliation, projected italic content, Chat validation, and the
existing canonical load/update/destroy and commander behavior.
