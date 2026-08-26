import { fileURLToPath } from 'node:url';

export const menuApplet = Object.freeze({
  path: 'app/live/menu',
  parentPath: 'app/live',
  parentAnchor: 'left',
  clientModule: '/applets/app/live/menu/client/index.js',
  clientFile: fileURLToPath(new URL('./client/index.js', import.meta.url)),
  createServer: () => import('./server/index.js').then(({ createServerApplet }) => createServerApplet()),
  createServerOperations: () => import('./server/operations.js').then(({ createServerOperations }) => createServerOperations()),
  accepts: Object.freeze({}),
});
