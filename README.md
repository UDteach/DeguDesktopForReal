# Degu Gatekeeper

壁紙を変えず、リアルなデグーがときどきデスクトップに現れるアプリです。透明なクリック透過ウィンドウで3種類の短い動きを再生します。Mac と Windows に対応します。Mac 版は Intel・Apple Silicon の両方を用意し、macOS 12 Monterey 以降で動作します。

**[紹介ページ](https://udteach.github.io/DeguGatekeeper/)** · **[Mac / Windows ダウンロード](https://github.com/UDteach/DeguGatekeeper/releases/latest)**

Mac のダウンロードでは、Intel 搭載機は名前に `arm64` が付かない DMG、M1 以降の Apple Silicon 搭載機は `arm64.dmg` を選んでください。対応 OS は macOS 12 Monterey 以降です。

## 使い方

アプリを起動すると、1回デグーが現れます。その後はランダムな間隔で現れます。メニューバー（Mac）または通知領域（Windows）の肉球アイコンから「今すぐ表示」「一時停止」「毛色」「出現間隔」「表示サイズ」「終了」を選べます。毛色メニューでは「1色だけ表示」、複数選択した毛色からランダムに表示、「全色ランダム」を選べます。

アグーチ、サンド、ホワイト、ブラック、ブルー（グレー）、チョコレート、ライラック、バイオレットと、5種類のパイドを収録しています。13色それぞれに3動作があり、3本そろった毛色だけアプリのメニューに表示されます。毛色と動画の対応は [制作台帳](variants/ledger.json) に記録しています。

## 開発

Node.js 24 で実行します。

```sh
npm ci
npm start
```

配布物は GitHub Actions がタグ `v*` のプッシュで Mac（Apple Silicon / Intel）と Windows（x64）をビルドし、GitHub Releases に追加します。サイトは `docs/` を GitHub Pages に公開します。

動画素材は `assets/videos/{毛色}-{動作}.webm` に置きます。動作名は `a-bottom-pop`、`b-side-peek`、`c-center-hop`。VP9 のアルファ付き WebM を使います。Flow で生成した緑背景の MP4 を保存したら、`python3 scripts/process_clip.py 入力.mp4 assets/videos/毛色-動作.webm --keep-source` で透過動画にできます。配布前に `python3 scripts/audit_videos.py` で全39本を検査します。詳しくは [制作メモ](concept/README.md) と [クロマキー処理](scripts/key_chroma.py) を参照してください。

## 配布について

現在の配布物は Apple Developer ID 署名・公証、Windows コード署名を行っていません。初回起動時にOSの警告が表示される場合があります。Mac では Finder でアプリを右クリックして「開く」を選びます。Windows では SmartScreen の案内を確認してください。

アプリはローカルで動作し、壁紙・他のアプリ・デスクトップのファイルを変更しません。
