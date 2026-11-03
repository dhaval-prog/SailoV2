const OPEN_METEO_BASE_URL = import.meta.env.VITE_OPEN_METEO_BASE_URL || "https://api.open-meteo.com/v1/forecast";
const RAIN_CODES = /* @__PURE__ */ new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]);
const THUNDERSTORM_CODES = /* @__PURE__ */ new Set([95, 96, 99]);
const SNOW_CODES = /* @__PURE__ */ new Set([71, 73, 75, 77, 85, 86]);
const CLOUDY_CODES = /* @__PURE__ */ new Set([1, 2, 3, 45, 48]);
const RAIN_LIGHT_CODES = /* @__PURE__ */ new Set([51, 56, 61, 80]);
const RAIN_HEAVY_CODES = /* @__PURE__ */ new Set([55, 65, 66, 67, 82]);
const SNOW_LIGHT_CODES = /* @__PURE__ */ new Set([71, 77, 85]);
const SNOW_HEAVY_CODES = /* @__PURE__ */ new Set([75, 86]);
const THUNDERSTORM_HEAVY_CODES = /* @__PURE__ */ new Set([96, 99]);
const LIGHT_PRECIP_MAX_MM = 2.5;
const HEAVY_PRECIP_MIN_MM = 7.6;
const STRONG_WIND_KPH = 30;
const HEAVY_WIND_KPH = 55;
function intensityRank(i) {
  return i === "light" ? 0 : i === "medium" ? 1 : 2;
}
function higherIntensity(a, b) {
  return intensityRank(b) > intensityRank(a) ? b : a;
}
function intensityFromPrecipitationMm(mm) {
  if (mm >= HEAVY_PRECIP_MIN_MM) return "heavy";
  if (mm <= LIGHT_PRECIP_MAX_MM) return "light";
  return "medium";
}
function intensityFromWindKph(kph) {
  if (kph >= HEAVY_WIND_KPH) return "heavy";
  if (kph < STRONG_WIND_KPH + 10) return "light";
  return "medium";
}
function conditionIntensity(weatherCode, precipitationMm, windSpeedKph, isDay) {
  if (RAIN_CODES.has(weatherCode)) {
    const fromCode = RAIN_LIGHT_CODES.has(weatherCode) ? "light" : RAIN_HEAVY_CODES.has(weatherCode) ? "heavy" : "medium";
    return { condition: "rain", intensity: higherIntensity(fromCode, intensityFromPrecipitationMm(precipitationMm)) };
  }
  if (THUNDERSTORM_CODES.has(weatherCode)) {
    return { condition: "thunderstorm", intensity: THUNDERSTORM_HEAVY_CODES.has(weatherCode) ? "heavy" : "medium" };
  }
  if (SNOW_CODES.has(weatherCode)) {
    const fromCode = SNOW_LIGHT_CODES.has(weatherCode) ? "light" : SNOW_HEAVY_CODES.has(weatherCode) ? "heavy" : "medium";
    return { condition: "snow", intensity: windSpeedKph >= HEAVY_WIND_KPH ? higherIntensity(fromCode, "medium") : fromCode };
  }
  if (windSpeedKph >= STRONG_WIND_KPH && (CLOUDY_CODES.has(weatherCode) || weatherCode === 0)) {
    return { condition: "wind", intensity: intensityFromWindKph(windSpeedKph) };
  }
  if (CLOUDY_CODES.has(weatherCode)) return { condition: "cloudy", intensity: "light" };
  return { condition: isDay ? "sunny" : "clear", intensity: "light" };
}
function normalizeWeatherCondition(raw) {
  const { weatherCode, precipitationMm, windSpeedKph, windDirectionDeg, temperatureC, humidityPct, isDay } = raw;
  const { condition, intensity } = conditionIntensity(weatherCode, precipitationMm, windSpeedKph, isDay);
  return { condition, intensity, windSpeedKph, windDirectionDeg, precipitationMm, temperatureC, humidityPct };
}
async function getCurrentWeather(latitude, longitude) {
  try {
    const fields = "precipitation,weather_code,wind_speed_10m,wind_direction_10m,temperature_2m,relative_humidity_2m,is_day";
    const url = `${OPEN_METEO_BASE_URL}?latitude=${latitude}&longitude=${longitude}&current=${fields}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const current = data?.current;
    if (!current || typeof current.weather_code !== "number") return null;
    const num = (v, fallback) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
    return {
      weatherCode: current.weather_code,
      precipitationMm: num(current.precipitation, 0),
      windSpeedKph: num(current.wind_speed_10m, 0),
      windDirectionDeg: num(current.wind_direction_10m, 0),
      temperatureC: num(current.temperature_2m, 20),
      humidityPct: num(current.relative_humidity_2m, 50),
      isDay: current.is_day === 1 || current.is_day === true
    };
  } catch (e) {
    console.warn("[WeatherService] getCurrentWeather failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
export {
  getCurrentWeather,
  normalizeWeatherCondition
};
