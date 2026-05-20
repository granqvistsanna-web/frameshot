import { Command } from 'commander';
import { loadConfig } from './config/load.js';
import { resolveTemplate } from './output/template.js';

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
      const config = await loadConfig(configArg);
      const date = new Date().toISOString().slice(0, 10);
      const viewport = config.viewport.name ?? 'default';
      const page = config.page.name;
      const resolvedOutput = resolveTemplate(config.output, { date, viewport, page });
      console.log(JSON.stringify({ ...config, _resolvedOutput: resolvedOutput }, null, 2));
    });

  return program;
}
