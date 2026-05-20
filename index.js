#!/usr/bin/env node
import { buildProgram } from './src/cli.js';

const program = buildProgram();
await program.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
