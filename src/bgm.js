const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BGM_PATH = path.join(__dirname, "../assets/bgm.mp3");
const BGM_VOLUME = 0.12;

async function mixBGM(speechPath) {
  if (!fs.existsSync(BGM_PATH)) {
    console.log("⚠️ BGMファイルが見つからないためスキップします:", BGM_PATH);
    return speechPath;
  }

  const outputPath = speechPath.replace(".mp3", "_with_bgm.mp3");

  console.log("🎵 BGMを合成中...");
  try {
    execSync(
      `ffmpeg -y -i "${speechPath}" -stream_loop -1 -i "${BGM_PATH}" \
      -filter_complex "[1:a]volume=${BGM_VOLUME}[bgm];[0:a][bgm]amix=inputs=2:duration=first" \
      -c:a libmp3lame -q:a 2 "${outputPath}"`,
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
