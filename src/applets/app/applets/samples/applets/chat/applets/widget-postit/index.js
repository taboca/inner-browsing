import { fileURLToPath } from 'node:url';

export const widgetPostitApplet = Object.freeze({
  path: 'app/samples/chat/widget-postit',
  instanceMode: 'projected',
  parentPath: null,
  parentAnchor: null,
  clientModule: '/applets/app/samples/chat/widget-postit/client/index.js',
  clientFile: fileURLToPath(new URL('./client/index.js', import.meta.url)),
  createServer: () => import('./server/index.js').then(({ createServerApplet }) => createServerApplet()),
  accepts: Object.freeze({}),
});
