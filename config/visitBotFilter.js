/**
 * 识别爬虫、扫描器、非真实用户访问，保证访问统计可用于数据分析。
 */

const BOT_UA_PATTERNS = [
  /\bbot\b/i,
  /crawl/i,
  /spider/i,
  /slurp/i,
  /scanner/i,
  /Go-http-client/i,
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /aiohttp/i,
  /java\//i,
  /headless/i,
  /phantomjs/i,
  /selenium/i,
  /TLM-Audit-Scanner/i,
  /ahrefs/i,
  /semrush/i,
  /petalbot/i,
  /bytespider/i,
  /bingpreview/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /Googlebot/i,
  /Baiduspider/i,
  /YandexBot/i,
  /DuckDuckBot/i,
  /Applebot/i,
  /GPTBot/i,
  /ClaudeBot/i,
  /anthropic/i,
  /scrapy/i,
  /httpclient/i,
  /libwww/i,
  /zgrab/i,
  /masscan/i,
  /nmap/i,
  /nikto/i,
  /l9explore/i,
  /CensysInspect/i,
  /Expanse/i,
  /DataForSeoBot/i,
  /PetalBot/i,
  /DotBot/i,
  /MJ12bot/i,
  /SeznamBot/i,
  /Sogou/i,
  /360Spider/i,
  /archive\.org_bot/i,
  /ia_archiver/i,
  /HubSpot/i,
  /Pingdom/i,
  /UptimeRobot/i,
  /StatusCake/i,
  /SiteAuditBot/i,
  /Screaming Frog/i,
];

/** 非 80/443 端口访问视为端口扫描，不是真实网页浏览（本地开发端口除外） */
const isPortScanHost = (host) => {
  if (!host) return false;
  const hostLower = String(host).toLowerCase();
  if (hostLower.startsWith('localhost') || hostLower.startsWith('127.0.0.1')) {
    return false;
  }
  const match = hostLower.match(/:(\d+)$/);
  if (!match) return false;
  const port = Number(match[1]);
  return port !== 80 && port !== 443;
};

/** workers.dev 预览域名不计入正式访问 */
const isPreviewHost = (host) => /\.workers\.dev$/i.test(host || '');

const isBotUserAgent = (userAgent) => {
  const ua = String(userAgent || '').trim();
  if (!ua || ua.length < 12) return true;
  if (ua === 'Mozilla/5.0') return true;
  return BOT_UA_PATTERNS.some((pattern) => pattern.test(ua));
};

/**
 * @param {{ user_agent?: string, visit_host?: string, path?: string }} visit
 * @returns {{ isBot: boolean, reason: string }}
 */
const classifyVisit = (visit = {}) => {
  const host = visit.visit_host || '';
  const ua = visit.user_agent || '';

  if (isPortScanHost(host)) {
    return { isBot: true, reason: 'port_scan' };
  }
  if (isPreviewHost(host)) {
    return { isBot: true, reason: 'preview_host' };
  }
  if (isBotUserAgent(ua)) {
    return { isBot: true, reason: 'bot_user_agent' };
  }
  return { isBot: false, reason: '' };
};

const isBotVisit = (visit = {}) => classifyVisit(visit).isBot;

const filterRealVisits = (visits = []) => visits.filter((visit) => !isBotVisit(visit));

/**
 * 仅接受浏览器端主动上报（能执行 JS 的真实用户）
 * @param {object} payload
 */
const isValidClientBeacon = (payload = {}) => {
  if (payload.client_verified !== true) {
    return { valid: false, reason: 'not_client_verified' };
  }

  const screenWidth = Number(payload.screen_width);
  const screenHeight = Number(payload.screen_height);
  if (!Number.isFinite(screenWidth) || !Number.isFinite(screenHeight)) {
    return { valid: false, reason: 'missing_screen' };
  }
  if (screenWidth < 320 || screenHeight < 240) {
    return { valid: false, reason: 'invalid_screen' };
  }

  const timezone = String(payload.timezone || '').trim();
  if (!timezone) {
    return { valid: false, reason: 'missing_timezone' };
  }

  const path = String(payload.path || '');
  if (path.startsWith('/system') || path === '/login') {
    return { valid: false, reason: 'excluded_path' };
  }

  if (isBotVisit({
    user_agent: payload.user_agent,
    visit_host: payload.visit_host,
    path,
  })) {
    return { valid: false, reason: 'bot_detected' };
  }

  return { valid: true, reason: '' };
};

module.exports = {
  BOT_UA_PATTERNS,
  isBotUserAgent,
  isBotVisit,
  classifyVisit,
  filterRealVisits,
  isValidClientBeacon,
};
