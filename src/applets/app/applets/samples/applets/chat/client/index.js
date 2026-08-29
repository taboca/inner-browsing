function orderedMessages(state) {
  return [...(state.chat?.messages || [])].sort((left, right) => left.sequence - right.sequence);
}

export function createClientApplet() {
  let element;
  let flow;
  let count;
  let form;
  let input;
  let sendButton;
  let status;
  let appletOperation;
  const recordsByMessageId = new Map();
  const renderersByKey = new Map([
    ['self.text', (target, message) => { target.textContent = message.text; }],
  ]);

  function createMessageRecord(message, refDoc) {
    const shell = refDoc.create('li', {
      className: 'chat-message',
      'data-message-id': message.messageId,
      'data-renderer-key': message.rendererKey,
    });
    const header = refDoc.create('div', { className: 'chat-message-header' });
    const metadata = refDoc.create('span', {
      className: 'chat-message-metadata',
      text: `#${message.sequence} · ${message.actorId}`,
    });
    const selectButton = refDoc.create('button', { type: 'button', className: 'chat-message-action', text: 'Select' });
    const content = refDoc.create('div', { className: 'chat-message-content' });
    const select = async () => {
      selectButton.disabled = true;
      try {
        await appletOperation.send('Select message', { messageId: message.messageId });
      } catch (error) {
        status.textContent = error.message;
      } finally {
        selectButton.disabled = false;
      }
    };
    selectButton.addEventListener('click', select);
    refDoc.append(metadata, header);
    refDoc.append(selectButton, header);
    refDoc.append(header, shell);
    refDoc.append(content, shell);
    return { shell, content, metadata, selectButton, select };
  }

  function render(state, refDoc) {
    const messages = orderedMessages(state);
    const activeIds = new Set(messages.map((message) => message.messageId));
    for (const [messageId, record] of recordsByMessageId) {
      if (activeIds.has(messageId)) continue;
      record.selectButton.removeEventListener('click', record.select);
      record.shell.remove();
      recordsByMessageId.delete(messageId);
    }
    for (const message of messages) {
      let record = recordsByMessageId.get(message.messageId);
      if (!record) {
        record = createMessageRecord(message, refDoc);
        recordsByMessageId.set(message.messageId, record);
      }
      record.metadata.textContent = `#${message.sequence} · ${message.actorId}`;
      record.shell.setAttribute('data-renderer-key', message.rendererKey);
      record.shell.className = message.messageId === state.chat?.selectedMessageId
        ? 'chat-message is-selected'
        : 'chat-message';
      const renderMessage = renderersByKey.get(message.rendererKey);
      if (renderMessage) renderMessage(record.content, message);
      else record.content.textContent = `Renderer unavailable: ${message.rendererKey}`;
      flow.append(record.shell);
    }
    count.textContent = `${messages.length} ${messages.length === 1 ? 'message' : 'messages'}`;
    flow.dataset.messageCount = String(messages.length);
  }

  async function submit(event) {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.disabled = true;
    sendButton.disabled = true;
    status.textContent = 'Sending…';
    try {
      await appletOperation.send('Send message', { text });
      input.value = '';
      status.textContent = 'Message stored; retained Chat state updated.';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      input.disabled = false;
      sendButton.disabled = false;
      input.focus?.();
    }
  }

  return {
    init(context) {
      const { state, refDoc } = context;
      appletOperation = context.appletOperation;
      element = refDoc.create('section', { className: 'applet chat-sample-applet' });
      const label = refDoc.create('span', { className: 'applet-label', text: 'APP / SAMPLES / CHAT' });
      const heading = refDoc.create('h3', { text: 'Retained one-user Chat' });
      const shell = refDoc.create('div', { className: 'chat-sample-shell' });
      flow = refDoc.create('ol', { className: 'chat-flow', 'aria-live': 'polite' });
      form = refDoc.create('form', { className: 'chat-composer' });
      const summary = refDoc.create('div', { className: 'chat-composer-summary' });
      count = refDoc.create('strong', { className: 'chat-message-count', text: '0 messages' });
      status = refDoc.create('span', { className: 'chat-operation-status', text: 'Ready.' });
      const controls = refDoc.create('div', { className: 'chat-composer-controls' });
      input = refDoc.create('input', {
        type: 'text',
        name: 'message',
        maxlength: '500',
        autocomplete: 'off',
        placeholder: 'Write a message…',
        'aria-label': 'New Chat message',
      });
      sendButton = refDoc.create('button', { type: 'submit', text: 'Send' });
      refDoc.append(count, summary);
      refDoc.append(status, summary);
      refDoc.append(input, controls);
      refDoc.append(sendButton, controls);
      refDoc.append(summary, form);
      refDoc.append(controls, form);
      refDoc.append(flow, shell);
      refDoc.append(form, shell);
      refDoc.append(label, element);
      refDoc.append(heading, element);
      refDoc.append(shell, element);
      form.addEventListener('submit', submit);
      render(state, refDoc);
    },
    mount({ refDoc }) {
      refDoc.append(element);
    },
    update({ state, refDoc }) {
      render(state, refDoc);
    },
    destroy() {
      form?.removeEventListener('submit', submit);
      for (const record of recordsByMessageId.values()) {
        record.selectButton.removeEventListener('click', record.select);
      }
      recordsByMessageId.clear();
      element?.remove();
    },
  };
}
