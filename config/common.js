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

/**
 * 从 Polygon snapshot 解析价格（与 Yahoo 等行情更接近）
 */
function parse_polygon_snapshot_price(ticker) {
  if (!ticker) return null;

  const lastTrade = ticker.lastTrade?.p;
  const dayClose = ticker.day?.c;
  const prevClose = ticker.prevDay?.c;
  const minuteClose = ticker.min?.c;

  const candidates = [lastTrade, minuteClose, dayClose, prevClose];
  for (const value of candidates) {
    const price = parseFloat(value);
    if (Number.isFinite(price) && price > 0) {
      return price;
    }
  }
  return null;
}

/**
 * 获取实时股票价格
 * @param {string} market - 市场类型 (usa/us/印度等)
 * @param {string} symbol - 股票代码
 * @returns {Promise<number|null>} - 实时价格或null
 */
async function get_real_time_price(market, symbol) {
  symbol = String(symbol).toUpperCase().split(':')[0];
  const normalizedMarket = normalize_market(market);

  if (normalizedMarket === 'usa') {
    const api_key = process.env.POLYGON_API_KEY;
    if (!api_key) {
      console.error('POLYGON_API_KEY 未配置');
      return null;
    }

    // 优先 snapshot（与 AI 选股模块一致，价格更贴近主流行情）
    const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${api_key}`;
    try {
      const snapshotResp = await axios.get(snapshotUrl, { timeout: 8000 });
      const snapshotPrice = parse_polygon_snapshot_price(snapshotResp.data?.ticker);
      if (snapshotPrice !== null) {
        return snapshotPrice;
      }
    } catch (error) {
      console.error(`Error fetching snapshot for ${symbol}:`, error.message);
    }

    // 兜底：最后一笔成交价
    const lastTradeUrl = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${api_key}`;
    try {
      const resp = await axios.get(lastTradeUrl, { timeout: 8000 });
      const data = resp.data;
      let price = null;

      if (data.results && typeof data.results.p !== 'undefined') {
        price = data.results.p;
      } else if (data.last && typeof data.last.price !== 'undefined') {
        price = data.last.price;
      }

      if (price !== null && price > 0) {
        return parseFloat(price);
      }
    } catch (error) {
      console.error(`Error fetching last trade for ${symbol}:`, error.message);
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

module.exports = {
  get_device_fingerprint,
  get_real_time_price,
  get_India_price,
  normalizeShareSize,
  isShareSizeDbTypeError,
  shareSizeDbTypeErrorMessage,
};