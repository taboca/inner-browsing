import { fileURLToPath } from 'node:url';

export const appApplet = Object.freeze({
  path: 'app',
  parentPath: null,
  parentAnchor: 'root',
  clientModule: '/applets/app/client/index.js',
  clientFile: fileURLToPath(new URL('./client/index.js', import.meta.url)),
  createServer: () => import('./server/index.js').then(({ createServerApplet }) => createServerApplet()),
  accepts: Object.freeze({
    live: 'content',
  }),
});
