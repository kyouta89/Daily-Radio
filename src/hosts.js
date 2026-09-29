// 2人パーソナリティの定義。台本生成(script.js)と音声合成(audio.js)で共有する。
// 実体は src/config.js の HOSTS にあります（番組ごとに編集するのはそちら）。
// ここは既存コードとの互換のために HOST_A / HOST_B という名前で再エクスポートするだけ。
// name は「台本の話者ラベル」と「音声の声の割り当て」を結ぶ契約なので、
// 変更すると script.js のプロンプトと audio.js の話者ラベル正規表現の両方が自動追従する。
const { HOSTS } = require("./config");

const HOST_A = HOSTS.A;
const HOST_B = HOSTS.B;

module.exports = { HOST_A, HOST_B };
