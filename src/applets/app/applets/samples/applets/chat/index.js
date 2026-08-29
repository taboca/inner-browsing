import { fileURLToPath } from 'node:url';

export const chatApplet = Object.freeze({
  path: 'app/samples/chat',
  parentPath: 'app/samples',
  parentAnchor: 'content',
  clientModule: '/applets/app/samples/chat/client/index.js',
  clientFile: fileURLToPath(new URL('./client/index.js', import.meta.url)),
  createWithServices(services) {
    return Object.freeze({
      ...chatApplet,
      createServer: () => import('./server/index.js')
        .then(({ createServerApplet }) => createServerApplet(services)),
      createServerOperations: () => import('./server/operations.js')
        .then(({ createServerOperations }) => createServerOperations(services)),
    });
  },
  accepts: Object.freeze({}),
});
