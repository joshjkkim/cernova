import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],          // stdio server, launched directly — no CJS consumers
  target: 'node18',
  clean: true,       // the shebang in src/index.ts is preserved by tsup — do not
});                  // add a banner one too, or the output gets two and won't parse
