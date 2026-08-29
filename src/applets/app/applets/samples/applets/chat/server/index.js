import { createChatViewState } from './viewState.js';

export function createServerApplet({ chatMessageStore } = {}) {
  if (!chatMessageStore) throw new Error('Chat sample requires chatMessageStore');
  return {
    init({ path, appComposer, log }) {
      const messages = chatMessageStore.list();
      log('init', { path, messageCount: messages.length });
      appComposer.command('update app/samples/chat', createChatViewState(messages)).catch((error) => {
        log('command:error', { command: 'update app/samples/chat', error: error.message });
      });
      return { role: 'sample-chat' };
    },
    destroy({ path, log }) {
      log('destroy', { path });
    },
  };
}
