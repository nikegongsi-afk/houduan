/** 与前端 Cloudflare Worker 域名映射保持一致 */
const TRADER_UUID_BY_HOST = {
  'stevencress.com': 'c5e01236-d681-4343-8386-f9e17748f81f',
  'www.stevencress.com': 'c5e01236-d681-4343-8386-f9e17748f81f',
  'thomas-forte.com': 'c5e01236-d681-4343-8386-f9e17748f81f',
  'www.thomas-forte.com': 'c5e01236-d681-4343-8386-f9e17748f81f',
  'allenklee.com': 'ef59ab89-c338-4b64-a988-9a19446df14b',
  'www.allenklee.com': 'ef59ab89-c338-4b64-a988-9a19446df14b',
  'ben-snide.com': 'fe9af579-c264-46aa-afc9-4ebfeda17d06',
  'www.ben-snide.com': 'fe9af579-c264-46aa-afc9-4ebfeda17d06',
};

const resolveTraderUuidFromHost = (host) => {
  if (!host) return null;
  return TRADER_UUID_BY_HOST[String(host).toLowerCase()] || null;
};

module.exports = {
  TRADER_UUID_BY_HOST,
  resolveTraderUuidFromHost,
};
