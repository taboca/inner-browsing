import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRefDoc } from '../public/runtime/refDoc.js';
import { createAppletRegistry } from '../src/appletRegistry.js';
import { createAppletRuntime } from '../src/appletRuntime.js';
import { createClientApplet as createChatClient } from '../src/applets/app/applets/samples/applets/chat/client/index.js';
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

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  removeEventListener(name) {
    this.listeners.delete(name);
  }

  async trigger(name) {
    await this.listeners.get(name)?.({ preventDefault() {} });
  }

  focus() {}
}

function descendants(root) {
  return [root, ...root.children.flatMap(descendants)];
}

test('Chat sample persists a message and updates one retained applet state', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inner-browsing-chat-'));
  const chatMessageStore = createChatMessageStore({
    filename: path.join(directory, 'sample-data', 'messages.json'),
    now: () => '2026-08-29T13:00:00.000Z',
    createId: () => 'message-test-1',
  });
  const registry = createAppletRegistry({ chatMessageStore });
  const store = createStateTreeStore({
    stateRoot: path.join(directory, 'state'),
    registry,
    now: () => '2026-08-29T12:00:00.000Z',
  });
  const runtime = createAppletRuntime({ registry, store, log() {} });
  try {
    await runtime.load('app/samples/chat');
    await runtime.idle();
    const beforeHash = runtime.snapshot().hash;
    assert.deepEqual(runtime.snapshot().activePaths, ['app', 'app/samples', 'app/samples/chat']);
    assert.equal(store.readState('app/samples/chat').chat.messageCount, 0);

    const result = await runtime.operate('app/samples/chat', 'Send message', { text: 'Hello retained Chat' });
    assert.equal(result.message.messageId, 'message-test-1');
    assert.equal(result.messageCount, 1);
    assert.equal(chatMessageStore.list()[0].text, 'Hello retained Chat');
    assert.equal(store.readState('app/samples/chat').chat.messages[0].rendererKey, 'self.text');
    assert.notEqual(runtime.snapshot().hash, beforeHash);
    assert.deepEqual(runtime.instancePaths(), ['app', 'app/samples', 'app/samples/chat']);

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

test('Chat client retains message targets and sends item identity through its scoped operation service', async () => {
  const document = { createElement: (tagName) => new FakeElement(tagName) };
  const host = new FakeElement('host');
  const refDoc = createRefDoc({ document, host, path: 'app/samples/chat' });
  const sent = [];
  const appletOperation = {
    async send(operation, data) {
      sent.push({ operation, data });
      return { ok: true };
    },
  };
  const first = {
    chat: {
      messages: [{
        messageId: 'message-1',
        sequence: 1,
        actorId: 'sample-self',
        rendererKey: 'self.text',
        text: 'First',
      }],
      messageCount: 1,
      selectedMessageId: null,
    },
  };
  const instance = createChatClient();
  await instance.init({ state: first, refDoc, appletOperation });
  await instance.mount({ refDoc });

  const firstShell = descendants(host).find((element) => element.dataset.messageId === 'message-1');
  const input = descendants(host).find((element) => element.tagName === 'input');
  const form = descendants(host).find((element) => element.tagName === 'form');
  input.value = 'Second';
  await form.trigger('submit');
  assert.deepEqual(sent[0], { operation: 'Send message', data: { text: 'Second' } });

  const second = {
    chat: {
      messages: [
        first.chat.messages[0],
        { messageId: 'message-2', sequence: 2, actorId: 'sample-self', rendererKey: 'self.text', text: 'Second' },
      ],
      messageCount: 2,
      selectedMessageId: 'message-1',
    },
  };
  await instance.update({ state: second, refDoc, appletOperation });
  const retainedFirstShell = descendants(host).find((element) => element.dataset.messageId === 'message-1');
  const secondShell = descendants(host).find((element) => element.dataset.messageId === 'message-2');
  assert.equal(retainedFirstShell, firstShell);
  assert.ok(secondShell);
  assert.match(retainedFirstShell.className, /is-selected/);

  const selectButton = retainedFirstShell.children[0].children.find((element) => element.tagName === 'button');
  await selectButton.trigger('click');
  assert.deepEqual(sent[1], {
    operation: 'Select message',
    data: { messageId: 'message-1' },
  });
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
