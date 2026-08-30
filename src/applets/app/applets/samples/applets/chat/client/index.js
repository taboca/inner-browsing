function orderedProjections(projectionMap) {
  return [...projectionMap.list()].sort((left, right) => left.hostData.sequence - right.hostData.sequence);
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
  const recordsByProjectionKey = new Map();

  function createMessageRecord(projection, refDoc) {
    const message = projection.hostData;
    const shell = refDoc.create('li', {
      className: 'chat-message',
      'data-message-id': message.messageId,
      'data-projection-key': projection.projectionKey,
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
    return { shell, content, metadata, selectButton, select, messageId: message.messageId };
  }

  function render(state, refDoc, projectionMap) {
    const all = orderedProjections(projectionMap);
    const visible = all.slice(-10);
    const activeKeys = new Set(visible.map((projection) => projection.projectionKey));
    for (const [projectionKey, record] of recordsByProjectionKey) {
      if (activeKeys.has(projectionKey)) continue;
      record.selectButton.removeEventListener('click', record.select);
      record.shell.remove();
      recordsByProjectionKey.delete(projectionKey);
    }

    const frame = projectionMap.beginBindingFrame();
    for (const projection of visible) {
      let record = recordsByProjectionKey.get(projection.projectionKey);
      if (!record) {
        record = createMessageRecord(projection, refDoc);
        recordsByProjectionKey.set(projection.projectionKey, record);
      }
      const message = projection.hostData;
      record.messageId = message.messageId;
      record.metadata.textContent = `#${message.sequence} · ${message.actorId}`;
      record.shell.className = message.messageId === state.chat?.selectedMessageId
        ? 'chat-message is-selected'
        : 'chat-message';
      flow.append(record.shell);
      frame.bind(projection.projectionKey, record.content);
    }
    frame.commit();
    count.textContent = `${all.length} ${all.length === 1 ? 'message' : 'messages'}`;
    flow.dataset.messageCount = String(all.length);
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
      status.textContent = 'Message stored and projected.';
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
      const { state, refDoc, projectionMap } = context;
      appletOperation = context.appletOperation;
      element = refDoc.create('section', { className: 'chat-sample-applet' });
      const heading = refDoc.create('h1', { text: 'Inner Browsing Chat' });
      const intro = refDoc.create('p', {
        className: 'chat-intro',
        text: 'Chat owns each message shell. A projected Widget Post-it owns its inner content.',
      });
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
      refDoc.append(heading, element);
      refDoc.append(intro, element);
      refDoc.append(shell, element);
      form.addEventListener('submit', submit);
      render(state, refDoc, projectionMap);
    },
    mount({ refDoc }) {
      refDoc.append(element);
    },
    update({ state, refDoc, projectionMap }) {
      render(state, refDoc, projectionMap);
    },
    projectionsChanged({ state, refDoc, projectionMap }) {
      render(state, refDoc, projectionMap);
    },
    destroy() {
      form?.removeEventListener('submit', submit);
      for (const record of recordsByProjectionKey.values()) {
        record.selectButton.removeEventListener('click', record.select);
      }
      recordsByProjectionKey.clear();
      element?.remove();
    },
  };
}
