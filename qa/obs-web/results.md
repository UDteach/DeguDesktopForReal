# OBS Web QA — 2026-09-27

## Local checks

- `npm run check:obs`: 16 coats, 48 motion references, generated files match source; 8 tests pass.
- `npm test`: 18 tests pass, including the existing Electron behavior.
- 48 published 720p VP9 files were decoded at the 2-second frame with `libvpx-vp9`; each frame contained transparent pixels. Total published video size: about 31 MiB.
- Local browser at `http://127.0.0.1:4174/obs/`: 16 coat cards and 48 motion choices load. Generated URL opens a text-free, transparent overlay; a screenshot with `omitBackground` has alpha values from 0 to 255.
- Clearing all coats disables URL copy and shows an error; selecting one coat restores the URL. The selected coat and motion appear in the overlay.
- A blocked WebM request switches to the coat PNG. Image-only mode shows a PNG with no video element. Invalid configuration leaves the overlay paused with no media.
- A named preset saved and loaded; importing the generated URL restored its settings. English labels switched with the language selector.
- Desktop 1280 px and mobile 320 px screenshots reviewed. The mobile document width equals the viewport width.

## OBS checks to perform on Mac and Windows

- Add the generated URL as a Browser Source at 1920 × 1080 and confirm the video remains transparent over a scene.
- Check all three motions on both sides, plus a restricted display area and the portrait canvas.
- Hide/show the source and switch scenes with “Shutdown source when not visible” enabled; confirm the first appearance follows the chosen start setting.
- Leave the source running for two hours and observe memory/CPU use and whether assets recover after a network interruption.

OBS Studio was not installed in this workspace, so these application-level checks remain open.
