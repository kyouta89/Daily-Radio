# BGM プール音源

すべて **Pixabay Content License**（商用利用可・**帰属表示は不要**だが出典を記録）。
出典: Pixabay（https://pixabay.com/music/）。明るい朝向けのインストゥルメンタルで統一。

- **Uplifting** — JonasBlakewood (Pixabay) — jonasblakewood-uplifting-562853
- **Corporate Uplifting** — JonasBlakewood (Pixabay) — jonasblakewood-corporate-uplifting-562851
- **Uplifting** — NastelBom (Pixabay) — nastelbom-uplifting-327471
- **Uplifting Corporate Startup Music** — alex-morgan (Pixabay) — alex-morgan-uplifting-corporate-startup-music-564242
- **Uplifting Inspirational** — leberch (Pixabay) — leberch-uplifting-inspirational-262900
- **Uplifting Pop** — eliveta (Pixabay) — eliveta-uplifting-pop-491240
- **Inspiring Uplifting** — AtlasAudio (Pixabay) — atlasaudio-inspiring-uplifting-511864

## 注記
- 一部トラックは **YouTube Content ID に登録済み**の場合がある。本番組は音声ポッドキャスト（Apple Podcasts / RSS）なので実害はほぼ無いが、YouTube にクロス投稿する場合は自動クレームが付き得る（Pixabay ライセンスで使用権はあり、証明書で異議可）。
- ⚠️ **ラウドネス正規化は未実施**。従来プールは取り込み時に `-vn + loudnorm` していたが、今回はローカルに ffmpeg が無く未処理。曲ごとの音量差が出うるので、ffmpeg 導入後に一括 loudnorm を推奨（`mixBGM` は volume=0.12 で敷くだけ）。
- プールは日替わりで1曲選択（`src/bgm.js` の pickTrack。連日同曲は回避）。曲は聴いた上で随時入れ替え・追加してよい（`assets/bgm/` に mp3 を置くだけ）。
