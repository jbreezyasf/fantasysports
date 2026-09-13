#!/usr/bin/env node
import { main } from './stress-season/runner.mjs';

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
