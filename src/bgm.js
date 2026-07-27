const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// BGMは「プール(assets/bgm/*.mp3)＋従来の単曲(assets/bgm.mp3)」から日替わりで1曲選ぶ。
// プールが空でも従来曲にフォールバックするので、音源が無くても壊れない。
const BGM_DIR = path.join(__dirname, "../assets/bgm");
const LEGACY_BGM = path.join(__dirname, "../assets/bgm.mp3");
const BGM_VOLUME = 0.09;

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 利用可能なBGMトラック一覧（従来の単曲＋プール）。
function listTracks() {
  const tracks = [];
  if (fs.existsSync(LEGACY_BGM)) tracks.push(LEGACY_BGM);
  if (fs.existsSync(BGM_DIR)) {
    for (const f of fs.readdirSync(BGM_DIR).sort()) {
      if (/\.mp3$/i.test(f)) tracks.push(path.join(BGM_DIR, f));
    }
  }
  return tracks;
}

// seed(=その日の日付文字列 "YYYY-MM-DD")で決定的に1曲選ぶ。seed無しならランダム。
// 連日で同じ曲に当たらないよう、前日と同じインデックスなら1つずらす（体感の変化を増やす）。
function pickTrack(seed) {
  const tracks = listTracks();
  if (tracks.length === 0) return null;
  if (!seed) return tracks[Math.floor(Math.random() * tracks.length)];

  let idx = hashStr(String(seed)) % tracks.length;
  if (tracks.length > 1) {
    const y = new Date(`${seed}T00:00:00Z`);
    if (!Number.isNaN(y.getTime())) {
      y.setUTCDate(y.getUTCDate() - 1);
      const prevIdx = hashStr(y.toISOString().slice(0, 10)) % tracks.length;
      if (idx === prevIdx) idx = (idx + 1) % tracks.length;
    }
  }
  return tracks[idx];
}

async function mixBGM(speechPath, seed) {
  const bgmPath = pickTrack(seed);
  if (!bgmPath) {
    console.log("⚠️ BGMファイルが見つからないためスキップします");
    return speechPath;
  }

  const outputPath = speechPath.replace(".mp3", "_with_bgm.mp3");

  console.log(`🎵 BGMを合成中... (${path.basename(bgmPath)})`);
  try {
    // 単純ミックス（volume=0.09 + amix duration=first）。無限ループ入力に重いフィルタを載せない。
    // ※現行プール(Pixabay)は loudness 正規化が未実施。曲間で音量差が出うるので、
    //   ffmpeg 導入後に取り込み側で一括 loudnorm するのが望ましい（CREDITS.md 参照）。
    // -map "[mix]" で音声のみ出力（曲にアルバムアート画像が埋まっていても、
    // -stream_loop がそれを無限ループして暴走するのを防ぐ）。
    execSync(
      `ffmpeg -y -i "${speechPath}" -stream_loop -1 -i "${bgmPath}" \
      -filter_complex "[1:a]volume=${BGM_VOLUME}[bgm];[0:a][bgm]amix=inputs=2:duration=first[mix]" \
      -map "[mix]" -c:a libmp3lame -q:a 2 "${outputPath}"`,
      { stdio: "pipe" }
    );

    fs.unlinkSync(speechPath);
    fs.renameSync(outputPath, speechPath);
    console.log("✅ BGM合成完了！");
  } catch (error) {
    console.error("❌ BGM合成に失敗しました（音声のみで続行）:", error.message);
  }

  return speechPath;
}

module.exports = { mixBGM };
