export function createChatViewState({ selectedMessageId = null, lastAction = null } = {}) {
  return {
    chat: {
      selectedMessageId,
      lastAction,
    },
  };
}

export function createMessageProjection(message) {
  return {
    projectionKey: `chat.message.${message.messageId}.widget-postit`,
    targetKey: message.messageId,
    appletPath: 'app/samples/chat/widget-postit',
    hostData: {
      messageId: message.messageId,
      sequence: message.sequence,
      actorId: message.actorId,
      createdAt: message.createdAt,
    },
    appletState: { text: message.text },
    persistence: 'durable',
  };
}
