import esbuild from 'esbuild';
import tracePlugin from './ts-transformers/esbuild-trace-plugin.js';

esbuild.build({
  entryPoints: ['./src/**/**.ts'],
  bundle: false,
  outdir: 'dist',
  format: 'esm',
  platform: 'node',
  sourcemap: true,
  plugins: [tracePlugin],
  loader: {
    '.ts': 'ts'
  }
}).catch(() => process.exit(1));
