import { httpServerHandler } from 'cloudflare:node';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const app = require('./app.js');

const PORT = Number(process.env.PORT || 8787);

app.listen(PORT, () => {
  console.log(`Cloudflare Worker API listening on port ${PORT}`);
});

export default httpServerHandler({ port: PORT });
