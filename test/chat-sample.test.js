import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRefDoc } from '../public/runtime/refDoc.js';
import { createAppletRegistry } from '../src/appletRegistry.js';
import { createAppletRuntime } from '../src/appletRuntime.js';
import { createClientApplet as createChatClient } from '../src/applets/app/applets/samples/applets/chat/client/index.js';
import { createClientApplet as createPostitClient } from '../src/applets/app/applets/samples/applets/chat/applets/widget-postit/client/index.js';
import { createProjectionStore } from '../src/projectionStore.js';
import { createChatMessageStore } from '../src/samples/chatMessageStore.js';
import { createStateTreeStore } from '../src/stateTreeStore.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.parent = null;
    this.className = '';
    this.textContent = '';
    this.value = '';
    this.disabled = false;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  append(child) {
    if (child.parent) child.parent.children = child.parent.children.filter((item) => item !== child);
    child.parent = this;
    this.children.push(child);
  }

  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((item) => item !== this);
    this.parent = null;
  }

  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name) { this.listeners.delete(name); }
  async trigger(name) { await this.listeners.get(name)?.({ preventDefault() {} }); }
  focus() {}
}

function descendants(root) {
  return [root, ...root.children.flatMap(descendants)];
}

function clientProjection(message) {
  return {
    projectionKey: `projection-${message.sequence}`,
    hostPath: 'app/samples/chat',
    targetKey: message.messageId,
    appletPath: 'app/samples/chat/widget-postit',
    clientModule: '/postit.js',
    hostData: message,
    hostDataHash: `host-${message.sequence}`,
    appletStateHash: `state-${message.sequence}`,
    hash: `record-${message.sequence}`,
    persistence: 'durable',
  };
}

function projectionMapFixture(initial = []) {
  let records = initial;
  let bindings = new Map();
  return {
    service: {
      list: () => records,
      beginBindingFrame() {
        const next = new Map();
        return {
          bind(key, element) { next.set(key, element); },
          commit() { bindings = next; },
        };
      },
    },
    set(next) { records = next; },
    bindings: () => bindings,
  };
}

test('Chat send persists a message, a self-sufficient projection, and retained Chat state', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inner-browsing-chat-'));
  const chatMessageStore = createChatMessageStore({
    filename: path.join(directory, 'sample-data', 'messages.json'),
    now: () => '2026-08-30T13:00:00.000Z',
    createId: () => 'message-test-1',
  });
  const registry = createAppletRegistry({ chatMessageStore });
  const store = createStateTreeStore({ stateRoot: path.join(directory, 'state'), registry });
  const projectionStore = createProjectionStore({ projectionRoot: path.join(directory, 'projections'), registry });
  const runtime = createAppletRuntime({ registry, store, projectionStore, log() {} });
  try {
    await runtime.load('app/samples/chat');
    await runtime.idle();
    const beforeProjectionHash = runtime.snapshot().projectionMap.hash;

    const result = await runtime.operate('app/samples/chat', 'Send message', { text: 'Hello projected Chat' });
    assert.equal(result.message.messageId, 'message-test-1');
    assert.equal(result.messageCount, 1);
    assert.equal(chatMessageStore.list()[0].text, 'Hello projected Chat');

    const [projection] = projectionStore.snapshot().records;
    assert.equal(projection.projectionKey, 'chat.message.message-test-1.widget-postit');
    assert.equal(projection.appletPath, 'app/samples/chat/widget-postit');
    assert.deepEqual(projection.appletState, { text: 'Hello projected Chat' });
    assert.equal(projection.hostData.messageId, 'message-test-1');
    assert.notEqual(runtime.snapshot().projectionMap.hash, beforeProjectionHash);
    assert.deepEqual(runtime.projectionInstanceKeys(), [projection.projectionKey]);
    assert.equal(store.readState('app/samples/chat').chat.lastAction.type, 'sent');

    await runtime.operate('app/samples/chat', 'Select message', { messageId: 'message-test-1' });
    assert.equal(store.readState('app/samples/chat').chat.selectedMessageId, 'message-test-1');
    await assert.rejects(
      runtime.operate('app/samples/chat', 'Select message', { messageId: 'missing' }),
      /Unknown Chat message/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Chat owns and retains randomly colored shells while committing projected Post-it bindings', async () => {
  const document = { createElement: (tagName) => new FakeElement(tagName) };
  const host = new FakeElement('host');
  const refDoc = createRefDoc({ document, host, path: 'app/samples/chat' });
  const sent = [];
  const appletOperation = { async send(operation, data) { sent.push({ operation, data }); return { ok: true }; } };
  const firstMessage = { messageId: 'message-1', sequence: 1, actorId: 'sample-self', createdAt: 'now' };
  const projections = projectionMapFixture([clientProjection(firstMessage)]);
  const randomValues = [0.1, 0.5];
  const instance = createChatClient({ random: () => randomValues.shift() });
  const firstState = { chat: { selectedMessageId: null, lastAction: null } };
  await instance.init({ state: firstState, refDoc, appletOperation, projectionMap: projections.service });
  await instance.mount({ refDoc });

  const firstShell = descendants(host).find((element) => element.dataset.messageId === 'message-1');
  assert.ok(firstShell);
  assert.equal(firstShell.attributes.get('style'), '--chat-shell-border: hsl(36 78% 68%);');
  assert.ok(projections.bindings().has('projection-1'));

  const input = descendants(host).find((element) => element.tagName === 'input');
  const form = descendants(host).find((element) => element.tagName === 'form');
  input.value = 'Second';
  await form.trigger('submit');
  assert.deepEqual(sent[0], { operation: 'Send message', data: { text: 'Second' } });

  const secondMessage = { messageId: 'message-2', sequence: 2, actorId: 'sample-self', createdAt: 'now' };
  projections.set([clientProjection(firstMessage), clientProjection(secondMessage)]);
  const secondState = { chat: { selectedMessageId: 'message-1', lastAction: { type: 'selected' } } };
  await instance.projectionsChanged({ state: secondState, refDoc, projectionMap: projections.service });
  const retainedFirstShell = descendants(host).find((element) => element.dataset.messageId === 'message-1');
  const secondShell = descendants(host).find((element) => element.dataset.messageId === 'message-2');
  assert.equal(retainedFirstShell, firstShell);
  assert.equal(retainedFirstShell.attributes.get('style'), '--chat-shell-border: hsl(36 78% 68%);');
  assert.ok(secondShell);
  assert.equal(secondShell.attributes.get('style'), '--chat-shell-border: hsl(180 78% 68%);');
  assert.match(retainedFirstShell.className, /is-selected/);
  assert.equal(projections.bindings().size, 2);

  const selectButton = retainedFirstShell.children[0].children.find((element) => element.tagName === 'button');
  await selectButton.trigger('click');
  assert.deepEqual(sent[1], { operation: 'Select message', data: { messageId: 'message-1' } });

  const reloadedHost = new FakeElement('host');
  const reloadedRefDoc = createRefDoc({ document, host: reloadedHost, path: 'app/samples/chat' });
  const reloadedProjections = projectionMapFixture([clientProjection(firstMessage), clientProjection(secondMessage)]);
  const reloadedInstance = createChatClient({ random: () => 0.75 });
  await reloadedInstance.init({
    state: secondState,
    refDoc: reloadedRefDoc,
    appletOperation,
    projectionMap: reloadedProjections.service,
  });
  await reloadedInstance.mount({ refDoc: reloadedRefDoc });
  const reloadedFirstShell = descendants(reloadedHost)
    .find((element) => element.dataset.messageId === 'message-1');
  assert.equal(reloadedFirstShell.attributes.get('style'), '--chat-shell-border: hsl(270 78% 68%);');
  assert.notEqual(reloadedFirstShell.attributes.get('style'), firstShell.attributes.get('style'));
});

test('Chat materializes only the ten most recent projection bindings', async () => {
  const document = { createElement: (tagName) => new FakeElement(tagName) };
  const host = new FakeElement('host');
  const refDoc = createRefDoc({ document, host, path: 'app/samples/chat' });
  const records = Array.from({ length: 11 }, (_, index) => clientProjection({
    messageId: `message-${index + 1}`,
    sequence: index + 1,
    actorId: 'sample-self',
    createdAt: 'now',
  }));
  const projections = projectionMapFixture(records);
  const instance = createChatClient();
  await instance.init({
    state: { chat: { selectedMessageId: null } },
    refDoc,
    appletOperation: { async send() {} },
    projectionMap: projections.service,
  });
  await instance.mount({ refDoc });
  assert.equal(projections.bindings().size, 10);
  assert.equal(projections.bindings().has('projection-1'), false);
  assert.equal(projections.bindings().has('projection-11'), true);
});

test('Widget Post-it owns italic inner content', async () => {
  const document = { createElement: (tagName) => new FakeElement(tagName) };
  const host = new FakeElement('host');
  const refDoc = createRefDoc({ document, host, path: 'app/samples/chat/widget-postit' });
  const instance = createPostitClient();
  await instance.init({ state: { text: 'Italic projection' }, refDoc });
  await instance.mount({ refDoc });
  const article = host.children[0];
  assert.equal(article.tagName, 'article');
  assert.equal(article.children[0].tagName, 'em');
  assert.equal(article.children[0].textContent, 'Italic projection');
});

test('Chat message store validates bounded text', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inner-browsing-chat-store-'));
  const chatMessageStore = createChatMessageStore({ filename: path.join(directory, 'messages.json') });
  try {
    assert.throws(() => chatMessageStore.append({ text: '   ' }), /required/);
    assert.throws(() => chatMessageStore.append({ text: 'x'.repeat(501) }), /at most 500/);
    assert.deepEqual(chatMessageStore.list(), []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
