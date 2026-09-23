# Degu Gatekeeper

壁紙を変えず、リアルなデグーがときどきデスクトップに現れるアプリです。透明なクリック透過ウィンドウで3種類の短い動きを再生します。Mac と Windows に対応します。

**[紹介ページ](https://udteach.github.io/DeguGatekeeper/)** · **[Mac / Windows ダウンロード](https://github.com/UDteach/DeguGatekeeper/releases/latest)**

## 使い方

アプリを起動すると、1回デグーが現れます。その後はランダムな間隔で現れます。メニューバー（Mac）または通知領域（Windows）の肉球アイコンから「今すぐ表示」「一時停止」「毛色」「出現間隔」「表示サイズ」「終了」を選べます。毛色は複数選択でき、選択中の毛色から毎回ランダムに現れます。「全色ランダム」を選ぶと収録済みの全毛色を使います。

アグーチ、サンド、ホワイト、ブラック、ブルー（グレー）の各3動作を収録しています。ほかの毛色は [制作台帳](variants/ledger.json) と [ImageGenの基準画像](variants/imagegen) をもとに動画を制作中です。3つの動画が揃った毛色だけアプリのメニューに表示されます。

## 開発

Node.js 24 で実行します。

```sh
npm ci
npm start
```

配布物は GitHub Actions がタグ `v*` のプッシュで Mac（Apple Silicon / Intel）と Windows（x64）をビルドし、GitHub Releases に追加します。サイトは `docs/` を GitHub Pages に公開します。

動画素材は `assets/videos/{毛色}-{動作}.webm` に置きます。動作名は `a-bottom-pop`、`b-side-peek`、`c-center-hop`。VP9 のアルファ付き WebM を使います。Flow で生成した緑背景の MP4 を保存したら、`python3 scripts/process_clip.py 入力.mp4 assets/videos/毛色-動作.webm --keep-source` で透過動画にできます。詳しくは [制作メモ](concept/README.md) と [クロマキー処理](scripts/key_chroma.py) を参照してください。

## 配布について

現在の配布物は Apple Developer ID 署名・公証、Windows コード署名を行っていません。初回起動時にOSの警告が表示される場合があります。Mac では Finder でアプリを右クリックして「開く」を選びます。Windows では SmartScreen の案内を確認してください。

アプリはローカルで動作し、壁紙・他のアプリ・デスクトップのファイルを変更しません。
