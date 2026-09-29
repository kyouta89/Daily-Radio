// src/weather.js
// 地点は src/config.js の LOCATION、表示言語は src/i18n.js に従う。
const { LOCATION } = require("./config");
const { t } = require("./i18n");

async function fetchWeather() {
  try {
    const { lat, lon } = LOCATION;
    // Open-Meteo APIから本日の天気、最高/最低気温、降水確率を取得
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo`;

    // タイムアウトを付与（無応答時にパイプラインを止めない）
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await response.json();

    const today = data.daily;
    const weatherCode = today.weathercode[0];
    const maxTemp = today.temperature_2m_max[0];
    const minTemp = today.temperature_2m_min[0];
    const rainProb = today.precipitation_probability_max[0];

    // 天気コードを表示名に変換（簡易版）。文言は言語別（i18n）。
    const c = t.weatherConditions;
    let condition = c.clear;
    if (weatherCode >= 1 && weatherCode <= 3) condition = c.cloudy;
    if (weatherCode >= 51 && weatherCode <= 67) condition = c.rain;
    if (weatherCode >= 71 && weatherCode <= 77) condition = c.snow;
    if (weatherCode >= 80 && weatherCode <= 82) condition = c.shower;
    if (weatherCode >= 95) condition = c.thunder;

    return {
      condition,
      maxTemp,
      minTemp,
      rainProb,
    };
  } catch (error) {
    console.error("⚠️ 天気情報の取得に失敗しました:", error);
    return null; // エラー時はnullを返す
  }
}

module.exports = { fetchWeather };
