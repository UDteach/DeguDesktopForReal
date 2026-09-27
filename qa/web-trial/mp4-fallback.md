# Web試用のMP4フォールバック

2026-09-27、基準コミット `d4eeb18`。
参照: AnimalsDesktop2 `641078d03b5f432ac7c636f17b7ea8fd0f166a43`。Degu固有の16毛色・3動作・描画位置を維持して移植。

## 変更

- Web試用だけ `allowOpaqueVideo` を有効にし、WebM → 同じ毛色・動きのMP4 → PNGの順に切り替える。WebMの透過非対応、再生拒否、読み込み失敗とタイムアウトに対応。
- Deguには公開用の48本のMP4がなかったため、確定済みの透過WebMから明るい背景 `#f2eee6` に合成。H.264 Constrained Baseline 3.1 / yuv420p / 1280×720 / 24fps / 96フレーム / 4秒 / 無音 / faststart。48本合計27,984,454 bytes。生成・検査コマンドはREADMEに記載。
- MP4ではデコードしたフレームの隅の色を背景に設定し、背景選択を明るい背景に固定して日英の案内を表示する。PNGとWebMに戻ると保存済みの背景と操作を復元する。
- OBSのプレビュー・出力はMP4を許可せず、従来どおり透過WebM → 透過PNGにする。
- 停止・毛色変更・フォーマット変更後の古いPromise、error、loadeddata、endedを無視。2種類の動画の読み込みを5秒ずつ待ってもPNGの4秒表示を打ち切らない。
- 試用の入口スクリプト、CSS、依存モジュールに版クエリを付けて旧キャッシュとの混在を避ける。

## 確認

- Playwright WebKit 26.6 / iPhone 15設定、ローカル `http://127.0.0.1:4175/try/`。修正前は「動画を再生できないため、画像で表示しています」とPNGになる症状を再現。
- 修正後はWebKitでMP4が実際に再生され、currentTimeが進む。サンプルは agouti-b-side-peek.mp4、1280×720、muted / playsInline。動画のデコード色と表示面はともに `rgb(244, 241, 233)`。PNG失敗案内は出ない。[WebKit画面](mp4-webkit.png)で動画の四角い枠が目立たないことを確認。
- WebKitで一時停止、停止したままの毛色変更、再開、ページ内拡大と退出、MP4失敗時に同じ毛色のPNGへ切り替え、通信回復後にMP4再生、背景の復元、英語の案内、横スクロールなしを確認。
- Chromiumで通常のWebM再生、WebM 404 → MP4、両動画404 → 同じ毛色のPNG、復旧後のWebM、保存済みの暗い背景の復元、ネイティブ全画面と退出を確認。
- 新規ページでWebM・MP4・PNGすべて404にすると読み込み失敗の案内が出て、「今すぐ表示」から再試行できる。
- OBS設定画面・出力URLはWebM失敗時にPNGへ切り替わり、MP4リクエストは0件。復旧後はWebMを再生。出力の背景は `rgba(0, 0, 0, 0)`。
- 通常動作のページエラー0件。意図的な404検査時のネットワークエラーのみ。
- `npm test`: 全32件成功。新規14件は非同期レース、OBSの透過制約、フォールバック順とロード待ちを検証。`npm run check:obs` 8件、生成物一致・参照先・JavaScript構文検査・`git diff --check` も成功。
- MP4全48本をffprobeとデコードした代表フレームで検査。透明部分538,253サンプルで黒化0、4毛色のフレームを目視確認。詳細は [mp4-assets.json](mp4-assets.json)。

`xcrun simctl list devices available` は端末なし。この確認はmacOSのPlaywright WebKitによるiPhone設定であり、iPhone実機・iOS Simulator・OBS Studio実機の確認ではない。
