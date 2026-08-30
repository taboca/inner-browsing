import { createChatViewState, createMessageProjection } from './viewState.js';

export function createServerApplet({ chatMessageStore } = {}) {
  if (!chatMessageStore) throw new Error('Chat sample requires chatMessageStore');
  return {
    init({ path, appComposer, projectionManager, log }) {
      const messages = chatMessageStore.list();
      log('init', { path, messageCount: messages.length });
      for (const message of messages) {
        projectionManager.ensure(createMessageProjection(message)).catch((error) => {
          log('projection:error', { messageId: message.messageId, error: error.message });
        });
      }
      appComposer.command('update app/samples/chat', createChatViewState()).catch((error) => {
        log('command:error', { command: 'update app/samples/chat', error: error.message });
      });
      return { role: 'sample-chat' };
    },
    destroy({ path, log }) {
      log('destroy', { path });
    },
  };
}
