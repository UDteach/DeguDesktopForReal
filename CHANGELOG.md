# 更新履歴 / Changelog

## v0.6.2 — 2026-09-25

### 日本語

- Mac版のアプリ全体をアドホック署名し、配布後に「壊れている」と判定される原因となっていた署名の不整合を修正しました。AppleのDeveloper ID署名・公証は行っていないため、初回起動時はmacOSの「プライバシーとセキュリティ」から「このまま開く」を選んでください。
- ダウンロードページに初回起動の手順を追加しました。Windows版と全48本の1080p動画はv0.6.1と同じです。

### English

- Applied a consistent ad-hoc signature to the entire Mac app bundle, fixing the invalid signature that could make the downloaded app appear damaged. The app does not have an Apple Developer ID signature or notarization; on first launch, approve it with Open Anyway in macOS Privacy & Security.
- Added first-launch instructions to the download pages. The Windows build and all 48 1080p clips are unchanged from v0.6.1.

## v0.6.1 — 2026-09-25

### 日本語

- 16色×3動作の全48本を、Google Flowの1080p版から作り直した透過WebMに統一しました。従来720pだった22本を更新しています。
- 配布前の動画検査で、解像度、透過情報、長さと毛色台帳の記載が一致することを確認します。

### English

- Updated the 22 clips that were still 720p. All 48 transparent WebM clips across 16 coats and three motions now use Google Flow's 1080p exports.
- The pre-release video audit now checks resolution, transparency, duration, and the coat ledger.

## v0.6.0 — 2026-09-24

### 日本語

- イエローサンド、単色クリーム、バイオレットパイドの3色を追加し、16色×3動作になりました。各毛色の基準画像をImageGenで作り、Google Flowで動きを生成した透過WebMを収録しています。
- イエローサンドはサンドを黄色寄りにした見た目のバリエーションです。単色クリームはLINEスタンプのクリームパイドを、バイオレットパイドは同名のLINEスタンプを参考に制作しました。
- 日本語・英語の紹介ページとGitHubのREADMEに更新履歴を追加しました。

### English

- Added Yellow Sand, solid Cream, and Violet Pied, bringing the app to 16 coats with three motions each. Each coat has an ImageGen appearance reference and transparent motion clips generated with Google Flow.
- Yellow Sand is a more golden visual variation of Sand. Solid Cream takes its color from the Cream Pied LINE sticker; Violet Pied references the sticker of the same name.
- Added an update history to the Japanese and English website and the GitHub README.

## v0.5.1 — 2026-09-24

### 日本語

- デグー大発生モードで、横から顔を出すデグーを画面の左右端に、下から出るデグーを画面下端に固定しました。左端のデグーは動画を左右反転して表示します。画面の途中で身体が切れて見える配置を修正しました。

### English

- Anchored side-peeking degus to the left and right screen edges and bottom-popping degus to the bottom edge in swarm mode. The left-side clip is mirrored. This fixes animals appearing cut off in the middle of the screen.

## v0.5.0 — 2026-09-24

### 日本語

- ポモドーロモードを追加しました。集中25分、短い休憩5分、4回目の長い休憩15分が初期値です。集中中はデグーの自動表示を休み、休憩開始時に現れます。各時間は変更できます。
- 集中・休憩の残り時間を画面右上に表示する切り替えを追加しました。タイマー表示はクリックを妨げません。
- デグー大発生モードを追加しました。5匹が同時に現れ、動きが終わると1〜4秒後に次の群れが出ます。
- 紹介ページに、MacのメニューバーとWindowsの通知領域から設定する手順を日本語・英語で追加しました。

### English

- Added Pomodoro mode with 25-minute focus, 5-minute breaks, and a 15-minute break after every fourth focus period by default. Degus stay away during focus and appear when a break begins. Durations are adjustable.
- Added an optional countdown at the top right of the screen. It does not block clicks.
- Added Degu swarm mode: five degus appear together, followed by another swarm 1–4 seconds after they finish.
- Added Japanese and English instructions for the Mac menu bar and Windows system tray to the product page.

## v0.4.1 — 2026-09-24

### 日本語

- 出現間隔に「1〜30秒」「1〜3分」を追加しました。カスタム設定では固定間隔、または最短・最長を指定したランダム間隔を選べます。
- アプリのメニューと設定画面に英語表示を追加しました。紹介・ダウンロードページも日本語と英語を切り替えられます。
- スマートフォン版の紹介ページで、動画の操作ボタンがデモ画面に重なる問題を修正しました。
- サンドパイドの胸元を中心に、5本の動画で残っていた緑色の映り込みを補正しました。

### English

- Added 1–30 second and 1–3 minute appearance presets. Custom settings can use a fixed interval or a random range with chosen minimum and maximum values.
- Added English to the app menu and interval settings. The website now has Japanese and English pages.
- Fixed preview controls overlapping the desktop mockup on narrow mobile screens.
- Reduced green spill in five videos, especially around the Sand Pied degu's chest.

## v0.4.0 — 2026-09-23

### 日本語

- アプリ名を Degu Desktop for Real に統一し、設定を旧名称から引き継げるようにしました。
- 13色×3動作の透過動画を収録し、1色・複数色・全色ランダムで表示できるようにしました。
- Intel Mac、Apple Silicon Mac、Windows のダウンロードを公開しました。Mac は macOS 12 Monterey 以降に対応します。

### English

- Renamed the app Degu Desktop for Real and added migration for settings saved under its former name.
- Included three transparent motions for each of 13 coat colors, with single, multiple, and all-color selection.
- Published Intel Mac, Apple Silicon Mac, and Windows downloads. The Mac app supports macOS 12 Monterey and later.
