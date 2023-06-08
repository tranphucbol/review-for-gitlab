import { execa } from 'execa';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
export const root = resolve(dir, '..', '..');

export const run = (file, args, options) => execa(file, args, { stdio: 'inherit', ...options });
