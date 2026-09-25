# Degu Desktop for Real

壁紙を変えず、リアルなデグーがときどきデスクトップに現れるアプリです。透明なクリック透過ウィンドウで3種類の短い動きを再生します。Mac と Windows に対応します。Mac 版は Intel・Apple Silicon の両方を用意し、macOS 12 Monterey 以降で動作します。

**[紹介ページ](https://udteach.github.io/DeguDesktopForReal/)** · **[English site](https://udteach.github.io/DeguDesktopForReal/index-en.html)** · **[Mac / Windows ダウンロード](https://udteach.github.io/DeguDesktopForReal/download.html)** · **[Mac 初回起動の手順](https://udteach.github.io/DeguDesktopForReal/download.html#mac-first-open)** · **[更新履歴](CHANGELOG.md)**

Mac のダウンロードでは、Intel 搭載機は Intel 用 DMG、M1 以降の Apple Silicon 搭載機は Apple Silicon 用 DMG を選んでください。対応 OS は macOS 12 Monterey 以降です。

## バージョンアップ履歴

- **v0.6.2（2026-09-25）**：Mac版の署名整合性を修正。初回起動時はmacOSの「このまま開く」で許可できます。
- **v0.6.1（2026-09-25）**：16色×3動作、全48本の透過動画を1080pに統一。
- **v0.6.0（2026-09-24）**：イエローサンド、単色クリーム、バイオレットパイドを追加。16色それぞれに3動作を収録。
- **v0.5.1（2026-09-24）**：大発生モードで、横からのデグーを左右端、下からのデグーを下端に固定。
- **v0.5.0（2026-09-24）**：ポモドーロ、残り時間表示、デグー大発生モードを追加。

[すべての更新履歴](CHANGELOG.md) · [配布版の履歴](https://github.com/UDteach/DeguDesktopForReal/releases)

## 使い方

通常モードではアプリを起動すると1回デグーが現れ、その後は選んだ間隔で現れます。ポモドーロの集中中は自動表示を休みます。メニューバー（Mac）または通知領域（Windows）の肉球アイコンから「今すぐ表示」「一時停止」「毛色」「出現間隔」「表示サイズ」「ポモドーロ」「デグー大発生モード」「モードの設定」「言語」「終了」を選べます。出現間隔は「1〜30秒」「1〜3分」「3〜6分」「5〜10分」「10〜20分」のランダム範囲、またはカスタムで固定値・任意のランダム範囲を設定できます。言語は日本語と英語に対応します。毛色メニューでは「1色だけ表示」、複数選択した毛色からランダムに表示、「全色ランダム」を選べます。

アグーチ、サンド、イエローサンド、クリーム、ホワイト、ブラック、ブルー（グレー）、チョコレート、ライラック、バイオレットと、6種類のパイドを収録しています。16色それぞれに3動作があり、3本そろった毛色だけアプリのメニューに表示されます。イエローサンドはサンドを黄色寄りにした見た目のバリエーションです。毛色と動画の対応は [制作台帳](variants/ledger.json) に記録しています。

## モード

メニューバー（Mac）または通知領域（Windows）の肉球アイコンから、ポモドーロとデグー大発生モードを切り替えられます。「モードの設定」ではポモドーロの集中・休憩・長い休憩の長さを決められます。初期値は集中25分、休憩5分、4回目の長い休憩15分です。集中中はデグーが自動表示されず、休憩開始時に現れます。残り時間を画面右上に表示するかどうかも選べます。

デグー大発生モードでは5匹が同時に現れ、動きが終わって1〜4秒後に次の群れが出ます。ポモドーロの集中中は大発生モードも休みます。

## 開発

Node.js 24 で実行します。

```sh
npm ci
npm start
```

配布物は GitHub Actions がタグ `v*` のプッシュで Mac（Apple Silicon / Intel）と Windows（x64）をビルドし、GitHub Releases に追加します。サイトは `docs/` を GitHub Pages に公開します。リリースファイル名はバージョンによらず固定し、専用ページから最新版を直接ダウンロードできるようにします。

動画素材は `assets/videos/{毛色}-{動作}.webm` に置きます。動作名は `a-bottom-pop`、`b-side-peek`、`c-center-hop`。VP9 のアルファ付き WebM を使います。Flow で生成した緑背景の MP4 を保存したら、`python3 scripts/process_clip.py 入力.mp4 assets/videos/毛色-動作.webm --keep-source` で透過動画にできます。配布前に `python3 scripts/audit_videos.py` で全48本を検査します。詳しくは [制作メモ](concept/README.md) と [クロマキー処理](scripts/key_chroma.py) を参照してください。

## 配布について

Mac版はアプリ内部の整合性のためにアドホック署名していますが、Apple Developer ID署名・公証は行っていません。初回起動時に「マルウェアが含まれていないことを検証できません」と表示されたら、[Mac 初回起動の手順](https://udteach.github.io/DeguDesktopForReal/download.html#mac-first-open)をご覧ください。Windows版もコード署名は行っていないため、SmartScreenの案内を確認してください。

アプリはローカルで動作し、壁紙・他のアプリ・デスクトップのファイルを変更しません。
