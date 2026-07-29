# 死活監視（Healthchecks.io）セットアップ

Daily-Radio が「平日朝に**そもそも動かなかった**」ことを検知するための外部監視。
赤ジョブ通知は「動いた上で失敗した」ときしか飛ばない。GitHub は60日リポジトリ無活動で
scheduled ワークフローを自動停止し、cron も best-effort（遅延・抜けあり）なので、
**動かなかったケースは GitHub の外から見張る**必要がある。

## 仕組み

`index.js` が `main()` 完了後に **Healthchecks.io の ping URL** を1回叩く:

| 結果 | ping | 意味 |
|---|---|---|
| 正常完了 | `HEALTHCHECK_URL`（成功） | エピソードを配信できた |
| 意図したスキップ（祝日 / 本日分済み） | `HEALTHCHECK_URL`（成功） | 動いた上で正しくスキップ＝健全 |
| エラー | `HEALTHCHECK_URL/fail` | 失敗（即アラート） |

ping は best-effort（10秒タイムアウト・失敗は握りつぶし・`HEALTHCHECK_URL` 未設定なら何もしない）。
監視の不調でパイプライン本体は絶対に止めない。

平日朝に成功 ping が来なければ Healthchecks 側がアラート → ワークフロー自動停止・cron 抜け・
クラッシュ（＝ジョブから通知できないケース）をまとめて検知できる。

## セットアップ手順（ユーザー作業）

1. **Healthchecks.io に登録**（無料）: https://healthchecks.io/
2. **Check を1つ作成**し、設定を以下にする:
   - **Schedule**: `Cron` を選択
   - **Cron expression**: `0 6 * * 1-5`（平日 6:00）
   - **Timezone**: `Asia/Tokyo`
   - **Grace Time**: `3 hours`（GitHub cron の遅延＋TTSリトライの間延びを吸収し誤報を防ぐ）
     - 祝日は「ジョブは動いて成功/スキップ ping を送る」ので誤報にならない。
3. **Ping URL をコピー**（`https://hc-ping.com/<uuid>` の形）。
4. **GitHub の Secret に登録**: リポジトリ → Settings → Secrets and variables → Actions →
   `New repository secret` → 名前 `HEALTHCHECK_URL`、値に ping URL を貼る。
5. **通知先を設定**: Healthchecks の該当 Check → `Integrations` でメール（既定で登録メールに届く）や
   Slack 等を有効化。
6. （任意）**ローカルでも試す場合**は `.env` に `HEALTHCHECK_URL=...` を追加して `node index.js`。
   成功すると Healthchecks のダッシュボードが緑（"up"）になる。

## 動作確認

- Secret 登録後、GitHub Actions で `Run workflow`（workflow_dispatch）を手動実行 →
  Healthchecks のダッシュボードで最後の ping が記録されれば OK。
- わざと失敗させたい場合は不要。`/fail` ping はエラー時のみ自動送信される。

## 補足

- **keepalive（60日自動停止の"予防"）は今回未実装**。停止しても Healthchecks が検知してくれるので、
  まずは検知だけ。予防を足すなら別途 keepalive ワークフローを追加する。
- スケジュール定義（cron / TZ / grace）は `.github/workflows/daily-radio.yml` の cron と `index.js` の
  スキップ判定に整合させること。CI 側の cron は UTC `0 21 * * 0-4`（= JST 平日 06:00）。
