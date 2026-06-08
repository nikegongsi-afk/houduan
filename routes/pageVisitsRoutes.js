const express = require('express');
const router = express.Router();
const { select, count } = require('../config/supabase');
const { authenticateUser, authorizeAdmin } = require('../middleware/auth');
const { toCountryZh, enrichVisitLocationZh } = require('../config/visitLocationZh');
const { filterRealVisits } = require('../config/visitBotFilter');

const displayVisit = (visit) => ({
  ...visit,
  visitor_label: visit.visitor_label || '游客',
  visit_count: Number(visit.visit_count) > 0 ? Number(visit.visit_count) : 1,
  first_visited_at: visit.first_visited_at || visit.visited_at,
  country: visit.country_zh || toCountryZh(visit.country) || visit.country || '',
  city: visit.city_zh || visit.city || '',
});

const enrichVisitList = async (visits = []) => {
  const formatted = visits.map(displayVisit);
  const needResolve = formatted.filter((visit) => !visit.city_zh && visit.city);

  if (!needResolve.length) return formatted;

  const resolved = await Promise.all(
    formatted.map((visit) => enrichVisitLocationZh(visit))
  );

  return resolved.map((visit) => ({
    ...visit,
    country: visit.country_zh || toCountryZh(visit.country) || visit.country || '',
    city: visit.city_zh || visit.city || '',
  }));
};

let traderNameCache = null;
let traderNameCacheAt = 0;
const TRADER_CACHE_TTL_MS = 5 * 60 * 1000;

const loadTraderNameMap = async () => {
  const now = Date.now();
  if (traderNameCache && now - traderNameCacheAt < TRADER_CACHE_TTL_MS) {
    return traderNameCache;
  }

  const profiles = await select(
    'trader_profiles',
    'trader_uuid, trader_name, website_title',
    [{ type: 'eq', column: 'isdel', value: false }],
    null,
    null,
    null
  );

  const map = new Map();
  (profiles || []).forEach((profile) => {
    if (!profile.trader_uuid) return;
    map.set(
      profile.trader_uuid,
      profile.trader_name || profile.website_title || profile.trader_uuid
    );
  });

  traderNameCache = map;
  traderNameCacheAt = now;
  return map;
};

const enrichWithTraderInfo = async (visits = []) => {
  const traderMap = await loadTraderNameMap();
  return visits.map((visit) => ({
    ...visit,
    trader_name: traderMap.get(visit.trader_uuid) || visit.visit_host || '未知交易员',
  }));
};

const isSuperAdmin = (user) => user?.role === 'superadmin';

/** 交易员管理员只能看自己站点；超级管理员看全部 */
const buildTraderFilter = (req, queryTraderUuid = '') => {
  const user = req.user;
  const conditions = [];

  if (!user) return conditions;

  if (isSuperAdmin(user)) {
    if (queryTraderUuid) {
      conditions.push({ type: 'eq', column: 'trader_uuid', value: queryTraderUuid });
    }
    return conditions;
  }

  if (!user.trader_uuid) {
    // 未绑定交易员的管理员不返回任何数据
    conditions.push({
      type: 'eq',
      column: 'trader_uuid',
      value: '00000000-0000-0000-0000-000000000000',
    });
    return conditions;
  }

  conditions.push({ type: 'eq', column: 'trader_uuid', value: user.trader_uuid });
  return conditions;
};

const daysAgoIso = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - Number(days || 7));
  return date.toISOString();
};

/** 统计重置时间：只展示此时间之后的访问（用于清空历史后重新统计） */
const getStatsStartAt = () => {
  const resetAt = process.env.VISIT_STATS_START_AT;
  if (!resetAt) return null;
  const parsed = new Date(resetAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const applyTimeFilters = (conditions, days) => {
  const statsStartAt = getStatsStartAt();
  const rangeStart = daysAgoIso(days);
  const effectiveStart = statsStartAt && statsStartAt > rangeStart ? statsStartAt : rangeStart;
  conditions.push({ type: 'gte', column: 'visited_at', value: effectiveStart });
  return conditions;
};

router.get('/summary', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const days = Number(req.query.days || 7);
    const conditions = buildTraderFilter(req, req.query.trader_uuid);
    applyTimeFilters(conditions, days);

    const rawVisits = await select('page_visits', '*', conditions, 10000, 0, {
      column: 'visited_at',
      ascending: false,
    });
    const visits = filterRealVisits(rawVisits || []);
    const filteredBotCount = (rawVisits?.length || 0) - visits.length;

    const cityMap = new Map();
    const ipSet = new Set();
    const countrySet = new Set();
    let totalVisitCount = 0;

    visits.forEach((visit) => {
      if (visit.ip_address) ipSet.add(visit.ip_address);
      if (visit.country) countrySet.add(visit.country);
      totalVisitCount += Number(visit.visit_count) > 0 ? Number(visit.visit_count) : 1;

      const lat = Number(visit.latitude);
      const lng = Number(visit.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const visitTimes = Number(visit.visit_count) > 0 ? Number(visit.visit_count) : 1;
      const key = `${visit.city_zh || visit.city || 'Unknown'}|${visit.country_zh || visit.country || ''}|${lat}|${lng}`;
      const existing = cityMap.get(key);
      if (existing) {
        existing.count += visitTimes;
        existing.lastVisitedAt = visit.visited_at;
      } else {
        cityMap.set(key, {
          city: visit.city_zh || visit.city || 'Unknown',
          country: visit.country_zh || toCountryZh(visit.country) || visit.country || '',
          latitude: lat,
          longitude: lng,
          count: visitTimes,
          lastVisitedAt: visit.visited_at,
        });
      }
    });

    const recent = await enrichWithTraderInfo(await enrichVisitList(visits.slice(0, 20)));

    res.status(200).json({
      success: true,
      data: {
        totalVisits: ipSet.size,
        uniqueIps: ipSet.size,
        totalVisitCount,
        uniqueCountries: countrySet.size,
        cities: Array.from(cityMap.values()).sort((a, b) => b.count - a.count),
        recent,
        filteredBotCount,
        isSuperAdmin: isSuperAdmin(req.user),
        traderUuid: isSuperAdmin(req.user) ? null : req.user.trader_uuid,
        statsStartAt: getStatsStartAt(),
      },
    });
  } catch (error) {
    console.error('获取访问地图汇总失败:', error);
    res.status(500).json({ success: false, message: '获取访问地图汇总失败', details: error.message });
  }
});

router.get('/', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { offset = 0, limit = 20, days = 7, search = '', trader_uuid: queryTraderUuid = '' } = req.query;
    const conditions = buildTraderFilter(req, queryTraderUuid);
    applyTimeFilters(conditions, days);

    if (search) {
      conditions.push({ type: 'ilike', column: 'ip_address', value: `%${search}%` });
    }

    const rawVisits = await select(
      'page_visits',
      '*',
      conditions,
      10000,
      0,
      { column: 'visited_at', ascending: false }
    );
    const realVisits = filterRealVisits(rawVisits || []);
    const pageOffset = Number(offset);
    const pageLimit = Number(limit);
    const pagedVisits = realVisits.slice(pageOffset, pageOffset + pageLimit);
    const total = realVisits.length;

    const enriched = await enrichWithTraderInfo(await enrichVisitList(pagedVisits));

    res.status(200).json({
      success: true,
      data: enriched,
      total,
      pages: Math.ceil(total / pageLimit),
      filteredBotCount: (rawVisits?.length || 0) - total,
      isSuperAdmin: isSuperAdmin(req.user),
    });
  } catch (error) {
    console.error('获取访问记录失败:', error);
    res.status(500).json({ success: false, message: '获取访问记录失败', details: error.message });
  }
});

module.exports = router;
