import { fileURLToPath } from 'node:url';

export const samplesApplet = Object.freeze({
  path: 'app/samples',
  parentPath: 'app',
  parentAnchor: 'content',
  clientModule: '/applets/app/samples/client/index.js',
  clientFile: fileURLToPath(new URL('./client/index.js', import.meta.url)),
  createServer: () => import('./server/index.js').then(({ createServerApplet }) => createServerApplet()),
  accepts: Object.freeze({
    chat: 'content',
  }),
});
