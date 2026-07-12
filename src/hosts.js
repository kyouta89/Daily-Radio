// 2人パーソナリティの定義。台本生成(script.js)と音声合成(audio.js)で共有する。
// voice は OpenAI TTS のボイス名。nova(明るい女性)/ onyx(落ち着いた男性)は安定して使える組み合わせ。
// 好みで coral / ash / sage / shimmer などに差し替え可。
const HOST_A = {
  name: "ミナ",
  voice: "nova",
  persona:
    "明るくテンポの良いメインMC。専門的な内容をかみ砕いて、エンジニアや経営者の視点で要点を解説する。",
  ttsInstructions: "明るくエネルギッシュな女性ラジオDJ。テンポよく、親しみやすく。",
};

const HOST_B = {
  name: "リク",
  voice: "onyx",
  persona:
    "素朴な聞き手役の相棒。難しい用語が出たら『それってどういうこと?』とリスナー目線で質問し、話を引き出す。時々ユーモアを挟む。",
  ttsInstructions: "落ち着いた男性の相棒パーソナリティ。自然な相槌と素朴な好奇心を込めて。",
};

module.exports = { HOST_A, HOST_B };
