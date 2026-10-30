/** Start only the PHP API (used by `npm run api:dev` and by CI). */
import process from 'node:process';
import { startApiServer } from './php.mjs';

const port = Number(process.env.API_PORT || 8090);
const api = await startApiServer({ port });
console.log(`[api] listening on http://127.0.0.1:${api.port}`);

const stop = () => {
  api.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
