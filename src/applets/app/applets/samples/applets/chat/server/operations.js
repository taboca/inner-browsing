import { createChatViewState } from './viewState.js';

export function createServerOperations({ chatMessageStore } = {}) {
  if (!chatMessageStore) throw new Error('Chat sample requires chatMessageStore');
  return {
    async handle({ operation, data, state, appComposer, log }) {
      if (operation === 'Send message') {
        const message = chatMessageStore.append({ text: data.text });
        const messages = chatMessageStore.list();
        await appComposer.command('update app/samples/chat', createChatViewState(messages, {
          selectedMessageId: state.chat?.selectedMessageId || null,
        }));
        log('operation', { operation, messageId: message.messageId, sequence: message.sequence });
        return { operation, message, messageCount: messages.length };
      }

      if (operation === 'Select message') {
        const messageId = typeof data.messageId === 'string' ? data.messageId : '';
        if (!chatMessageStore.find(messageId)) throw new Error(`Unknown Chat message: ${messageId || '(empty)'}`);
        const messages = chatMessageStore.list();
        await appComposer.command('update app/samples/chat', createChatViewState(messages, { selectedMessageId: messageId }));
        log('operation', { operation, messageId });
        return { operation, messageId };
      }

      throw new Error(`Unknown Chat operation: ${operation}`);
    },
  };
}
