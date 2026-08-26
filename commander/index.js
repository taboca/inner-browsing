import { io } from 'socket.io-client';
import readline from 'node:readline';
import { loadScenario, runScenario } from './scenarioRunner.js';

const serverUrl = process.env.NAVIGATOR_URL || 'http://localhost:4420';
const socket = io(serverUrl, { transports: ['websocket'] });
const args = process.argv.slice(2);
const scenarioFilename = args[0] === 'run' ? args[1] : null;
const oneShot = !scenarioFilename && args.length ? args.join(' ') : null;
const commandTimeout = Number(process.env.NAVIGATOR_COMMAND_TIMEOUT) || 5000;
let batchStarted = false;
let terminal = null;

function send(payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(commandTimeout).emit('navigator.command', payload, (error, response) => {
      if (error) return reject(new Error(`Command acknowledgement timed out after ${commandTimeout}ms`));
      return resolve(response);
    });
  });
}

async function execute(line) {
  const match = String(line).trim().match(/^(load|destroy)\s+(\S+)(?:\s+(.+))?$/);
  const [, operation, path, stateJson] = match || [];
  if (!['load', 'destroy'].includes(operation) || !path) {
    console.log('Usage: load <applet/path> [json] | destroy <applet/path>');
    return;
  }
  let state = {};
  try {
    if (stateJson) state = JSON.parse(stateJson);
  } catch (error) {
    console.error(`Invalid state JSON: ${error.message}`);
    return;
  }
  try {
    const response = await send({ operation, path, state });
    if (!response?.ok) throw new Error(response?.error || 'unknown error');
    console.log(`${operation} ${path}`);
    console.log(`snapshot ${response.hash}`);
    console.log(response.activePaths.length ? response.activePaths.join('\n') : '(empty tree)');
    return response;
  } catch (error) {
    console.error(`Command failed: ${error.message}`);
    throw error;
  }
}

async function executeScenario(filename) {
  const { scenario } = await loadScenario(filename);
  console.log(`Scenario: ${scenario.name}`);
  const result = await runScenario({
    scenario,
    send,
    onStep(event) {
      if (event.phase === 'start') {
        console.log(`[${event.index + 1}/${scenario.steps.length}] ${event.step.id}: ${event.step.operation} ${event.step.path}`);
      } else if (event.phase === 'pass') {
        console.log(`  PASS ${event.result.hash} [${event.result.activePaths.join(', ')}]`);
      } else if (event.phase === 'delay') {
        console.log(`  WAIT ${event.delayMs}ms`);
      }
    },
  });
  console.log(`Scenario passed: ${result.passed}/${scenario.steps.length}`);
}

socket.on('connect', async () => {
  if (scenarioFilename) {
    if (batchStarted) return;
    batchStarted = true;
    try {
      await executeScenario(scenarioFilename);
    } catch (error) {
      console.error(`Scenario failed: ${error.message}`);
      process.exitCode = 1;
    } finally {
      socket.close();
    }
    return;
  }
  if (args[0] === 'run' && !scenarioFilename) {
    console.error('Usage: npm run scenario -- <scenario.json>');
    process.exitCode = 1;
    socket.close();
    return;
  }
  if (oneShot) {
    if (batchStarted) return;
    batchStarted = true;
    try {
      await execute(oneShot);
    } catch {
      process.exitCode = 1;
    } finally {
      socket.close();
    }
    return;
  }
  if (terminal) {
    console.log('Reconnected.');
    terminal.prompt();
    return;
  }
  console.log(`Connected to ${serverUrl}`);
  console.log('Commands: load app | load app/live | load app/live/menu | load app/live/widgets | destroy <path>');
  terminal = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'navigator> ' });
  terminal.on('line', async (line) => {
    try {
      await execute(line);
    } catch {
      // The command already printed its error; keep the interactive session alive.
    }
    terminal.prompt();
  });
  terminal.on('close', () => socket.close());
  terminal.prompt();
});

socket.on('disconnect', () => {
  if (terminal) console.log('\nDisconnected; Socket.IO will attempt to reconnect.');
});

socket.on('connect_error', (error) => {
  console.error(`Cannot connect to ${serverUrl}: ${error.message}`);
  if (scenarioFilename || oneShot) process.exitCode = 1;
});
