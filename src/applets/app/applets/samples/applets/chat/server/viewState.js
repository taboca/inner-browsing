export function createChatViewState(messages, { selectedMessageId = null } = {}) {
  const ordered = [...messages].sort((left, right) => left.sequence - right.sequence);
  return {
    chat: {
      messages: ordered,
      messageCount: ordered.length,
      selectedMessageId,
    },
  };
}
