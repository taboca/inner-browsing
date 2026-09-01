import { fileURLToPath } from 'node:url';

export const browserRuntimeDirectory = fileURLToPath(new URL('../browser/', import.meta.url));
