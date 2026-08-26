import { fileURLToPath } from 'node:url';

export const liveApplet = Object.freeze({
  path: 'app/live',
  parentPath: 'app',
  parentAnchor: 'content',
  clientModule: '/applets/app/live/client/index.js',
  clientFile: fileURLToPath(new URL('./client/index.js', import.meta.url)),
  createServer: () => import('./server/index.js').then(({ createServerApplet }) => createServerApplet()),
  accepts: Object.freeze({
    menu: 'left',
    widgets: 'right',
  }),
});
