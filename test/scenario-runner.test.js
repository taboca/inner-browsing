import assert from 'node:assert/strict';
import test from 'node:test';
import { runScenario, validateScenario } from '../commander/scenarioRunner.js';

test('scenario commands execute sequentially and validate active paths', async () => {
  const scenario = validateScenario({
    name: 'sequential test',
    steps: [
      { id: 'app', operation: 'load', path: 'app', expect: { activePaths: ['app'] } },
      { id: 'app-update', operation: 'update', path: 'app', state: { title: 'Updated' }, expect: { activePaths: ['app'] } },
      { id: 'chat', operation: 'load', path: 'app/samples/chat', expect: { activePaths: ['app', 'app/samples', 'app/samples/chat'] } },
    ],
  });
  const order = [];
  const result = await runScenario({
    scenario,
    async send(step) {
      order.push(`start:${step.id}`);
      await Promise.resolve();
      order.push(`finish:${step.id}`);
      return {
        ok: true,
        hash: `hash-${step.id}`,
        activePaths: step.expect.activePaths,
      };
    },
  });
  assert.deepEqual(order, [
    'start:app',
    'finish:app',
    'start:app-update',
    'finish:app-update',
    'start:chat',
    'finish:chat',
  ]);
  assert.equal(result.passed, 3);
});

test('scenario stops at the first failed expectation', async () => {
  const scenario = validateScenario({
    steps: [
      { id: 'wrong', operation: 'load', path: 'app', expect: { activePaths: ['app'] } },
      { id: 'never', operation: 'load', path: 'app/samples/chat' },
    ],
  });
  let calls = 0;
  await assert.rejects(
    runScenario({
      scenario,
      async send() {
        calls += 1;
        return { ok: true, hash: 'empty', activePaths: [] };
      },
    }),
    /expected \[app\] but received \[\]/,
  );
  assert.equal(calls, 1);
});

test('scenario waits between acknowledged steps but not after the final step', async () => {
  const scenario = validateScenario({
    delayMs: 1000,
    steps: [
      { id: 'app', operation: 'load', path: 'app' },
      { id: 'samples', operation: 'load', path: 'app/samples' },
      { id: 'chat', operation: 'load', path: 'app/samples/chat' },
    ],
  });
  const events = [];
  await runScenario({
    scenario,
    async send(step) {
      events.push(`send:${step.id}`);
      return { ok: true, hash: step.id, activePaths: [] };
    },
    async wait(milliseconds) {
      events.push(`wait:${milliseconds}`);
    },
  });
  assert.deepEqual(events, [
    'send:app',
    'wait:1000',
    'send:samples',
    'wait:1000',
    'send:chat',
  ]);
});
