export function createServerApplet() {
  return {
    init({ projectionKey, state, log }) {
      log('init', { projectionKey, hasText: Boolean(state.text) });
      return { role: 'chat-widget-postit' };
    },
    destroy({ projectionKey, log }) {
      log('destroy', { projectionKey });
    },
  };
}
