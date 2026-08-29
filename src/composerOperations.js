export const COMPOSER_OPERATIONS = Object.freeze(['load', 'update', 'destroy']);

const operationSet = new Set(COMPOSER_OPERATIONS);

export function isComposerOperation(value) {
  return operationSet.has(value);
}
