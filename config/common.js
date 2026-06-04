const crypto = require('crypto');
const axios = require('axios');

// 存储印度股票价格列表
let India_price_List = {};

/**
 * 生成设备指纹
 * @param {Object} request - Express请求对象
 * @returns {string} - 设备指纹哈希值
 */
function get_device_fingerprint(request) {
  if (!request) {
    throw new Error('Request object is required');
  }
  
  const user_agent =  request.headers['user-agent']; 
  const ip = request.ip;
  
  // 可以添加更多设备特征
  const fingerprint_data = `${ip}:${user_agent}`;
  return crypto.createHash('sha256').update(fingerprint_data).digest('hex');
}

/**
 * 获取印度股票价格
 */
async function get_India_price() {
 
  const token = "jggf1-iglcjq-ykgka";
  const url = `http://india-api.allyjp.site/exchange-whitezzzs/lhms-api/list?token=${token}`;
  try {
    const resp = await axios.get(url, { timeout: 15000 });
    const data = resp.data;
    const sdata = data.data;
    for (const item of sdata) {
      try {
        const symbol = item.co.split('.')[0];
        India_price_List[symbol] = item.a;
      } catch (error) {
        // 忽略错误，继续处理下一个项目
      }
    }
  } catch (error) {
    console.error('Error fetching India prices:', error);
    return null;
  }
}

/**
 * 统一交易市场标识（后台常见 US，Polygon 走 usa）
 */
function normalize_market(market) {
  const value = String(market || '').trim().toLowerCase();
  if (['usa', 'us', 'u.s.', 'united states', 'america', '美股', '美国'].includes(value)) {
    return 'usa';
  }
  if (['india', 'in', 'ind', '印度'].includes(value)) {
    return 'india';
  }
  return value;
}

function get_massive_api_bases() {
  const bases = [
    process.env.MASSIVE_API_BASE,
    'https://api.massive.com',
    'https://api.polygon.io',
  ]
    .filter(Boolean)
    .map((b) => String(b).replace(/\/$/, ''));
  return [...new Set(bases)];
}

function get_massive_api_key() {
  const key = (
    process.env.MASSIVE_API_KEY ||
    process.env.POLYGON_API_KEY ||
    process.env.STOCK_REALTIME_API_KEY ||
    ''
  ).trim();
  return key || null;
}

async function fetch_us_price_from_massive(symbol, api_key, api_base, attempt = 1) {
  const snapshotUrl = `${api_base}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${api_key}`;
  try {
    const snapshotResp = await axios.get(snapshotUrl, { timeout: 12000 });
    if (snapshotResp.data?.status === 'ERROR') {
      console.error(
        `Massive snapshot error for ${symbol} @ ${api_base}:`,
        snapshotResp.data?.error || 'unknown'
      );
      return null;
    }
    const snapshotPrice = parse_polygon_snapshot_price(snapshotResp.data?.ticker);
    const lastTradePrice = await fetch_polygon_last_trade_price(symbol, api_key, api_base);
    const merged = pick_us_stock_price(snapshotPrice, lastTradePrice);
    if (merged !== null) {
      return merged;
    }
  } catch (error) {
    const status = error.response?.status;
    const msg = error.response?.data?.error || error.message;
    console.error(
      `Error fetching snapshot for ${symbol} @ ${api_base} (attempt ${attempt}):`,
      status,
      msg
    );
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return fetch_us_price_from_massive(symbol, api_key, api_base, attempt + 1);
    }
  }

  const lastTradePrice = await fetch_polygon_last_trade_price(symbol, api_key, api_base);
  if (lastTradePrice !== null) {
    return lastTradePrice;
  }
  return null;
}

async function fetch_polygon_last_trade_price(symbol, api_key, api_base) {
  const lastTradeUrl = `${api_base}/v2/last/trade/${symbol}?apiKey=${api_key}`;
  try {
    const resp = await axios.get(lastTradeUrl, { timeout: 12000 });
    return parse_polygon_last_trade_price(resp.data);
  } catch (error) {
    console.error(`Error fetching last trade for ${symbol}:`, error.message);
    return null;
  }
}

/** 买卖价差过大时不用中间价（如 BIOA 16/19 会算出 17.5） */
function is_tight_quote_spread(bid, ask) {
  const mid = (bid + ask) / 2;
  const spread = ask - bid;
  const maxSpread = Math.max(0.03 * mid, 0.15);
  return spread <= maxSpread;
}

function pick_us_stock_price(snapshotPrice, lastTradePrice) {
  // 有最近成交时优先用成交（LIVE）；无成交再用 snapshot 解析结果
  return lastTradePrice ?? snapshotPrice;
}

/**
 * 从 Polygon snapshot 解析价格（最近成交 > 合理价差中间价 > 收盘价）
 */
function parse_polygon_snapshot_price(ticker) {
  if (!ticker) return null;

  const lastTradePx = parseFloat(ticker.lastTrade?.p);
  if (Number.isFinite(lastTradePx) && lastTradePx > 0) {
    return Math.round(lastTradePx * 10000) / 10000;
  }

  const lastQuote = ticker.lastQuote;
  if (lastQuote) {
    const bid = parseFloat(lastQuote.p);
    const ask = parseFloat(lastQuote.P);
    if (Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask > 0) {
      if (is_tight_quote_spread(bid, ask)) {
        return Math.round(((bid + ask) / 2) * 10000) / 10000;
      }
    }
  }

  const fmv = parseFloat(ticker.fmv);
  if (Number.isFinite(fmv) && fmv > 0) return fmv;

  const candidates = [
    ticker.min?.c,
    ticker.day?.c,
    ticker.prevDay?.c,
  ];
  for (const value of candidates) {
    const price = parseFloat(value);
    if (Number.isFinite(price) && price > 0) {
      return price;
    }
  }
  return null;
}

function parse_polygon_last_trade_price(data) {
  if (!data) return null;
  const price = parseFloat(data.results?.p ?? data.last?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/**
 * 获取实时股票价格
 * @param {string} market - 市场类型 (usa/us/印度等)
 * @param {string} symbol - 股票代码
 * @returns {Promise<number|null>} - 实时价格或null
 */
async function get_real_time_price(market, symbol, attempt = 1) {
  symbol = String(symbol).toUpperCase().split(':')[0];
  const normalizedMarket = normalize_market(market);

  if (normalizedMarket === 'usa') {
    const api_key = get_massive_api_key();
    if (!api_key) {
      console.error('MASSIVE_API_KEY（或 POLYGON_API_KEY）未配置');
      return null;
    }

    const api_bases = get_massive_api_bases();
    for (const api_base of api_bases) {
      const price = await fetch_us_price_from_massive(symbol, api_key, api_base, attempt);
      if (price !== null) {
        return price;
      }
    }

    return null;
  } else if (normalizedMarket === 'india') {
    // 获取印度股票价格
    try {
      // 如果价格列表为空，尝试获取
      if (Object.keys(India_price_List).length === 0) {
        await get_India_price();
      }
      
      const price_value = India_price_List[symbol.split(".")[0]];
      return price_value !== undefined ? parseFloat(price_value) : null;
    } catch (error) {
      console.error(`Error getting price for ${symbol}:`, error);
      return null;
    }
  }

  console.warn(`Unknown trade market "${market}" for symbol ${symbol}`);
  return null;
}

function normalizeShareSize(value) {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function isShareSizeDbTypeError(error) {
  const message = String(error?.message || error?.details || '');
  return error?.code === '22P02' && message.includes('integer');
}

function shareSizeDbTypeErrorMessage() {
  return '数据库 trades1.size 字段仍为整数类型，无法保存小数。请在 Supabase SQL Editor 执行 scripts/upgrade-trades1-size-decimal.sql';
}

/**
 * 为未平仓交易并行拉取实时价，并回写数据库
 */
async function refresh_holding_trade_prices(trades, updateFn) {
  if (!Array.isArray(trades) || trades.length === 0) {
    return trades;
  }

  const holdingTrades = trades.filter((trade) => !trade.exit_price && !trade.exit_date);
  if (holdingTrades.length === 0) {
    return trades;
  }

  await Promise.allSettled(
    holdingTrades.map(async (trade) => {
      try {
        const latestPrice = await get_real_time_price(trade.trade_market, trade.symbol);
        if (latestPrice && latestPrice > 0) {
          trade.current_price = latestPrice;
          trade.price_is_live = true;
          if (typeof updateFn === 'function' && trade.id) {
            await updateFn(trade.id, latestPrice);
          }
          console.log(`✅ 实时获取 ${trade.symbol} 价格: $${latestPrice}`);
          return;
        }
        trade.price_is_live = false;
        console.warn(
          `⚠️ ${trade.symbol} 实时价获取失败，使用数据库价格 $${trade.current_price}`
        );
      } catch (error) {
        trade.price_is_live = false;
        console.error(`❌ 获取 ${trade.symbol} 价格失败:`, error.message);
      }
    })
  );

  return trades;
}

module.exports = {
  get_device_fingerprint,
  get_real_time_price,
  get_India_price,
  normalizeShareSize,
  isShareSizeDbTypeError,
  shareSizeDbTypeErrorMessage,
  refresh_holding_trade_prices,
};