#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import chromium from 'playwright-chromium';
import sharp from 'sharp';
import { Command } from 'commander';
import yaml from 'js-yaml';
import { z } from 'zod';
import chalk from 'chalk';
import ora from 'ora';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(join(__dirname, 'package.json'), 'utf8'));

console.log(`${pkg.name} v${pkg.version}`);
