import { readStdin } from './stdin.ts';
import { main } from './index.ts';

readStdin()
  .then(raw => main(raw))
  .then(output => process.stdout.write(output))
  .catch(() => process.stdout.write('vitals: error'));
