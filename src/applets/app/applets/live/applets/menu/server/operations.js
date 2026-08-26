export function createServerOperations() {
  return Object.freeze({
    async handle({ operation, appComposer, log }) {
      if (operation !== 'Add widgets') throw new Error(`Unknown menu operation: ${operation}`);
      const command = 'load app/live/widgets';
      log('operation', { operation, command });
      const envelope = await appComposer.command(command);
      return {
        operation,
        command,
        hash: envelope.hash,
        activePaths: envelope.snapshot.activePaths,
      };
    },
  });
}
