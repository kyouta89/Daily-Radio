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
- ✅ **ラウドネス正規化 実施済み**。全19曲を `ffmpeg -vn -af loudnorm=I=-16:TP=-1.5:LRA=11`（＋アートワーク除去）で一括正規化し、各トラックを統合ラウドネス −16 LUFS 近辺（実測 −15.8〜−15.9 LUFS）に揃えた。日替わりで曲が変わっても音量差が出にくい。以後、新規トラックを `assets/bgm/` に追加する際は同じコマンドで正規化してから置くこと（`mixBGM` は volume=0.09 で敷くだけ）。
- プールは日替わりで1曲選択（`src/bgm.js` の pickTrack。連日同曲は回避）。曲は聴いた上で随時入れ替え・追加してよい（`assets/bgm/` に mp3 を置くだけ）。
