export function createServerApplet() {
  return {
    init({ path, state, log }) {
      log('init', { path, present: state.present });
      return { role: 'root-host', initializedAt: new Date().toISOString() };
    },
    destroy({ path, log }) {
      log('destroy', { path });
    },
  };
}
