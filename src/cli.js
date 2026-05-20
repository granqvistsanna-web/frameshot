import { Command } from 'commander';
import { resolve } from 'node:path';

export function buildProgram() {
  const program = new Command();

  program
    .name('framershot')
    .description('Clean retina screenshots of Framer sites')
    .version('0.1.0', '-v, --version');

  program
    .command('capture <config>')
    .description('Parse a config file, validate, and (later) capture')
    .action(async (configArg) => {
      const absPath = resolve(process.cwd(), configArg);
      console.log(absPath);
    });

  return program;
}
