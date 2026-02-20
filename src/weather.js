// src/weather.js
async function fetchWeather() {
  try {
    // 緯度・経度（神奈川県周辺）
    const lat = 35.5206;
    const lon = 139.7172;
    // Open-Meteo APIから本日の天気、最高/最低気温、降水確率を取得
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo`;

    const response = await fetch(url);
    const data = await response.json();

    const today = data.daily;
    const weatherCode = today.weathercode[0];
    const maxTemp = today.temperature_2m_max[0];
    const minTemp = today.temperature_2m_min[0];
    const rainProb = today.precipitation_probability_max[0];

    // 天気コードを日本語に変換（簡易版）
    let condition = "晴れ";
    if (weatherCode >= 1 && weatherCode <= 3) condition = "曇り";
    if (weatherCode >= 51 && weatherCode <= 67) condition = "雨";
    if (weatherCode >= 71 && weatherCode <= 77) condition = "雪";
    if (weatherCode >= 80 && weatherCode <= 82) condition = "にわか雨";
    if (weatherCode >= 95) condition = "雷雨";

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
