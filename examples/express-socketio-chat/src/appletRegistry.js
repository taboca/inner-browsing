import { createAppletRegistry as createRegistry } from '@taboca/inner-browsing';
import { assertAppletClientFiles } from '@taboca/inner-browsing/node';
import { appApplet } from './applets/app/index.js';
import { samplesApplet } from './applets/app/applets/samples/index.js';
import { chatApplet } from './applets/app/applets/samples/applets/chat/index.js';
import { widgetPostitApplet } from './applets/app/applets/samples/applets/chat/applets/widget-postit/index.js';

const definitions = [appApplet, samplesApplet, chatApplet, widgetPostitApplet];

export function createAppletRegistry(services = {}) {
  const registry = createRegistry({
    definitions,
    services,
    validateDefinition(definition) {
      const expectedClientModule = `/applets/${definition.path}/client/index.js`;
      if (definition.clientModule !== expectedClientModule) {
        throw new Error(`${definition.path} must expose its client at ${expectedClientModule}`);
      }
    },
  });
  return assertAppletClientFiles(registry);
}
