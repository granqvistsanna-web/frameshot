#!/usr/bin/env node
import { buildProgram, getCurrentSpinner } from './src/cli.js';
import { formatError } from './src/cli/format.js';

const program = buildProgram();
await program.parseAsync(process.argv).catch((err) => {
  const spinner = getCurrentSpinner();
  if (spinner?.isSpinning) { spinner.fail(); }
  console.error(formatError(err));
  process.exit(1);
});
