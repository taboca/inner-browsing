import fs from 'node:fs/promises';
import path from 'node:path';
import { isComposerOperation } from '@taboca/inner-browsing';

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validateScenario(value, filename = 'scenario') {
  if (!value || typeof value !== 'object' || !Array.isArray(value.steps) || !value.steps.length) {
    throw new Error(`${filename} requires a non-empty steps array`);
  }
  const ids = new Set();
  const steps = value.steps.map((step, index) => {
    const label = `${filename} step ${index + 1}`;
    if (!step || typeof step !== 'object') throw new Error(`${label} must be an object`);
    if (!isComposerOperation(step.operation)) throw new Error(`${label} has an invalid operation`);
    if (typeof step.path !== 'string' || !step.path.trim()) throw new Error(`${label} requires a path`);
    const id = String(step.id || `step-${index + 1}`).trim();
    if (!id || ids.has(id)) throw new Error(`${label} has a missing or duplicate id`);
    ids.add(id);
    const expectedPaths = step.expect?.activePaths;
    if (expectedPaths !== undefined && !Array.isArray(expectedPaths)) {
      throw new Error(`${label} expect.activePaths must be an array`);
    }
    return {
      id,
      operation: step.operation,
      path: step.path.trim(),
      state: step.state && typeof step.state === 'object' ? step.state : {},
      expect: expectedPaths === undefined ? {} : { activePaths: expectedPaths.map(String) },
    };
  });
  const delayMs = value.delayMs === undefined ? 0 : Number(value.delayMs);
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 60_000) {
    throw new Error(`${filename} delayMs must be between 0 and 60000`);
  }
  return { name: String(value.name || path.basename(filename)), delayMs, steps };
}

export async function loadScenario(filename, cwd = process.cwd()) {
  const resolved = path.resolve(cwd, filename);
  const source = await fs.readFile(resolved, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`${filename} is not valid JSON: ${error.message}`);
  }
  return { filename: resolved, scenario: validateScenario(parsed, filename) };
}

export async function runScenario({
  scenario,
  send,
  onStep = () => {},
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const results = [];
  for (let index = 0; index < scenario.steps.length; index += 1) {
    const step = scenario.steps[index];
    onStep({ phase: 'start', index, step });
    const response = await send(step);
    if (!response?.ok) throw new Error(`${step.id} failed: ${response?.error || 'unknown command error'}`);
    if (step.expect.activePaths && !sameArray(response.activePaths || [], step.expect.activePaths)) {
      throw new Error(
        `${step.id} expected [${step.expect.activePaths.join(', ')}] but received [${(response.activePaths || []).join(', ')}]`,
      );
    }
    const result = { id: step.id, hash: response.hash, activePaths: response.activePaths || [] };
    results.push(result);
    onStep({ phase: 'pass', index, step, result });
    if (scenario.delayMs > 0 && index < scenario.steps.length - 1) {
      onStep({ phase: 'delay', index, step, delayMs: scenario.delayMs });
      await wait(scenario.delayMs);
    }
  }
  return { name: scenario.name, passed: results.length, results };
}
