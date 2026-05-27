const countryDisplayNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' });

const toCountryZh = (countryCode) => {
  if (!countryCode) return '';
  const code = String(countryCode).trim().toUpperCase();
  if (code.length !== 2) return countryCode;
  try {
    return countryDisplayNames.of(code) || countryCode;
  } catch {
    return countryCode;
  }
};

const resolveCityZh = async (city, latitude, longitude) => {
  if (!city && !Number.isFinite(latitude)) return city || '';

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    try {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/reverse');
      url.searchParams.set('latitude', String(latitude));
      url.searchParams.set('longitude', String(longitude));
      url.searchParams.set('language', 'zh');
      url.searchParams.set('count', '1');

      const response = await fetch(url.toString(), { signal: AbortSignal.timeout(4000) });
      if (response.ok) {
        const data = await response.json();
        const name = data?.results?.[0]?.name;
        if (name) return name;
      }
    } catch (error) {
      console.warn('城市中文名解析失败:', error.message);
    }
  }

  if (city) {
    try {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
      url.searchParams.set('name', String(city));
      url.searchParams.set('language', 'zh');
      url.searchParams.set('count', '1');

      const response = await fetch(url.toString(), { signal: AbortSignal.timeout(4000) });
      if (response.ok) {
        const data = await response.json();
        const name = data?.results?.[0]?.name;
        if (name) return name;
      }
    } catch (error) {
      console.warn('城市中文名搜索失败:', error.message);
    }
  }

  return city || '';
};

const enrichVisitLocationZh = async (visit) => {
  if (!visit) return visit;

  const countryZh = visit.country_zh || toCountryZh(visit.country);
  const cityZh = visit.city_zh || await resolveCityZh(
    visit.city,
    Number(visit.latitude),
    Number(visit.longitude)
  );

  return {
    ...visit,
    country_zh: countryZh,
    city_zh: cityZh,
    country: countryZh || visit.country,
    city: cityZh || visit.city,
  };
};

module.exports = {
  toCountryZh,
  resolveCityZh,
  enrichVisitLocationZh,
};
