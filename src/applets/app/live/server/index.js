export function createServerApplet() {
  return {
    init({ path, state, appComposer, log }) {
      log('init', { path, layout: 'two-columns', present: state.present });
      appComposer.command('load app/live/menu').catch((error) => {
        log('command:error', { command: 'load app/live/menu', error: error.message });
      });
      return { role: 'live-layout', columns: ['left', 'right'] };
    },
    destroy({ path, log }) {
      log('destroy', { path });
    },
  };
}
