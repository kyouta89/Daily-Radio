# BGM プール音源

すべて **Pixabay Content License**（商用利用可・**帰属表示は不要**だが出典を記録）。
出典: Pixabay（https://pixabay.com/music/）。明るい朝向けのインストゥルメンタルで統一（uplifting / corporate / positive 系）。全19曲を日替わりでローテーション。

## Uplifting
- **Uplifting** — JonasBlakewood — jonasblakewood-uplifting-562853
- **Corporate Uplifting** — JonasBlakewood — jonasblakewood-corporate-uplifting-562851
- **Uplifting** — NastelBom — nastelbom-uplifting-327471
- **Uplifting Corporate Startup Music** — alex-morgan — alex-morgan-uplifting-corporate-startup-music-564242
- **Uplifting Inspirational** — leberch — leberch-uplifting-inspirational-262900
- **Uplifting Pop** — eliveta — eliveta-uplifting-pop-491240
- **Inspiring Uplifting** — AtlasAudio — atlasaudio-inspiring-uplifting-511864

## Corporate
- **Upbeat Happy Corporate** — kornevmusic — kornevmusic-upbeat-happy-corporate-487426
- **Corporate** — SigmaMusicArt — sigmamusicart-corporate-corporate-music-537730
- **Corporate** — AtlasAudio — atlasaudio-corporate-491319
- **Corporate** — ARPMedia — arpmedia-corporate-569460
- **Corporate Presentation** — alex-morgan — alex-morgan-corporate-presentation-568147
- **Corporate** — JonasBlakewood — jonasblakewood-corporate-557633
- **Corporate** — leberch — leberch-corporate-509707

## Positive
- **Upbeat Positive** — Kulakovka — kulakovka-upbeat-positive-275623
- **Funky Positive** — Kulakovka — kulakovka-funky-positive-266609
- **Positive Summer** — Kulakovka — kulakovka-positive-summer-269073
- **Positive** — AlexGrohl — alexgrohl-positive-181753
- **Optimistic** — MondaMusic — mondamusic-optimistic-optimistic-positive-music-560121

## 注記
- 一部トラックは **YouTube Content ID に登録済み**の場合がある。本番組は音声ポッドキャスト（Apple Podcasts / RSS）なので実害はほぼ無いが、YouTube にクロス投稿する場合は自動クレームが付き得る（Pixabay ライセンスで使用権はあり、証明書で異議可）。ユーザー了承済み。
- ⚠️ **ラウドネス正規化は未実施**。従来プールは取り込み時に `-vn + loudnorm` していたが、今回はローカルに ffmpeg が無く未処理。曲ごとの音量差が出うるので、ffmpeg 導入後に一括 loudnorm を推奨（`mixBGM` は volume=0.12 で敷くだけ）。
- プールは日替わりで1曲選択（`src/bgm.js` の pickTrack。連日同曲は回避）。曲は聴いた上で随時入れ替え・追加してよい（`assets/bgm/` に mp3 を置くだけ）。
