import { createChatViewState, createMessageProjection } from './viewState.js';

export function createServerOperations({ chatMessageStore } = {}) {
  if (!chatMessageStore) throw new Error('Chat sample requires chatMessageStore');
  return {
    async handle({ operation, data, state, appComposer, projectionManager, log }) {
      if (operation === 'Send message') {
        const message = chatMessageStore.append({ text: data.text });
        const messages = chatMessageStore.list();
        await projectionManager.register(createMessageProjection(message));
        await appComposer.command('update app/samples/chat', createChatViewState({
          selectedMessageId: state.chat?.selectedMessageId || null,
          lastAction: { type: 'sent', messageId: message.messageId },
        }));
        log('operation', { operation, messageId: message.messageId, sequence: message.sequence });
        return { operation, message, messageCount: messages.length };
      }

      if (operation === 'Select message') {
        const messageId = typeof data.messageId === 'string' ? data.messageId : '';
        if (!chatMessageStore.find(messageId)) throw new Error(`Unknown Chat message: ${messageId || '(empty)'}`);
        await appComposer.command('update app/samples/chat', createChatViewState({
          selectedMessageId: messageId,
          lastAction: { type: 'selected', messageId },
        }));
        log('operation', { operation, messageId });
        return { operation, messageId };
      }

      throw new Error(`Unknown Chat operation: ${operation}`);
    },
  };
}
