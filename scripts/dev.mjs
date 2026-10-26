// Modo desenvolvimento: recompila o TypeScript a cada alteração e mantém o
// servidor local no ar. Basta recarregar o navegador depois de salvar.
import { spawn } from 'node:child_process';

const children = [
  spawn('tsc', ['-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
  spawn(process.execPath, ['scripts/serve.mjs'], { stdio: 'inherit' }),
];

const stop = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
