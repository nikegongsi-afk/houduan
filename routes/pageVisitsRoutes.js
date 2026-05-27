const express = require('express');
const router = express.Router();
const { select, count } = require('../config/supabase');
const { getUserFromSession, authenticateUser, authorizeAdmin } = require('../middleware/auth');
const { toCountryZh, enrichVisitLocationZh } = require('../config/visitLocationZh');

const displayVisit = (visit) => ({
  ...visit,
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

const buildTraderFilter = async (req) => {
  const user = await getUserFromSession(req);
  const conditions = [];
  if (user.role !== 'superadmin') {
    conditions.push({ type: 'eq', column: 'trader_uuid', value: user.trader_uuid });
  }
  return conditions;
};

const daysAgoIso = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - Number(days || 7));
  return date.toISOString();
};

router.get('/summary', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const days = Number(req.query.days || 7);
    const conditions = await buildTraderFilter(req);
    conditions.push({ type: 'gte', column: 'visited_at', value: daysAgoIso(days) });

    const visits = await select('page_visits', '*', conditions, 5000, 0, {
      column: 'visited_at',
      ascending: false,
    });

    const cityMap = new Map();
    const ipSet = new Set();
    const countrySet = new Set();

    (visits || []).forEach((visit) => {
      if (visit.ip_address) ipSet.add(visit.ip_address);
      if (visit.country) countrySet.add(visit.country);

      const lat = Number(visit.latitude);
      const lng = Number(visit.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const key = `${visit.city_zh || visit.city || 'Unknown'}|${visit.country_zh || visit.country || ''}|${lat}|${lng}`;
      const existing = cityMap.get(key);
      if (existing) {
        existing.count += 1;
        existing.lastVisitedAt = visit.visited_at;
      } else {
        cityMap.set(key, {
          city: visit.city_zh || visit.city || 'Unknown',
          country: visit.country_zh || toCountryZh(visit.country) || visit.country || '',
          latitude: lat,
          longitude: lng,
          count: 1,
          lastVisitedAt: visit.visited_at,
        });
      }
    });

    res.status(200).json({
      success: true,
      data: {
        totalVisits: visits?.length || 0,
        uniqueIps: ipSet.size,
        uniqueCountries: countrySet.size,
        cities: Array.from(cityMap.values()).sort((a, b) => b.count - a.count),
        recent: await enrichVisitList((visits || []).slice(0, 20)),
      },
    });
  } catch (error) {
    console.error('获取访问地图汇总失败:', error);
    res.status(500).json({ success: false, message: '获取访问地图汇总失败', details: error.message });
  }
});

router.get('/', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { offset = 0, limit = 20, days = 7, search = '' } = req.query;
    const conditions = await buildTraderFilter(req);
    conditions.push({ type: 'gte', column: 'visited_at', value: daysAgoIso(days) });

    if (search) {
      conditions.push({ type: 'ilike', column: 'ip_address', value: `%${search}%` });
    }

    const orderBy = { column: 'visited_at', ascending: false };
    const visits = await select(
      'page_visits',
      '*',
      conditions,
      Number(limit),
      Number(offset),
      orderBy
    );
    const total = await count('page_visits', conditions);

    res.status(200).json({
      success: true,
      data: await enrichVisitList(visits || []),
      total: total || 0,
      pages: Math.ceil((total || 0) / Number(limit)),
    });
  } catch (error) {
    console.error('获取访问记录失败:', error);
    res.status(500).json({ success: false, message: '获取访问记录失败', details: error.message });
  }
});

module.exports = router;
