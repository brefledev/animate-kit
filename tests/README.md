# Local regression checks

From the repository root, with Node, ffmpeg/ffprobe and Playwright Chromium installed:

```sh
node --test tests/gpu.test.mjs
node tests/rendering.mjs
node tests/world-map.mjs
```

The renderer check writes to a new temporary directory and prints its path. Supply a directory as its argument to retain results at a chosen location. It builds a copy of the optional world-map demo, compares exact-audio hashes across browser launches, checks audio graph disconnection, renders two aspect ratios with captions, exercises decoded-AAC peak correction, and compares master/share AAC streams. `commands.log` and `result.json` hold the evidence.

The GPU unit tests cover launch failure, missing WebGL, successful hardware selection and software fallback through a mocked Chromium interface. Run a WebGL piece on Linux to establish actual driver support on that machine; these mocks verify control flow.

The world-map browser check compares the same timestamp after three different frame histories and checks reused coastline keys with translated geometry.

Publishing-studio tests and build commands live in [its documentation](../plugins/animate/skills/publish/SKILL.md). Platform tests use local fixtures and mocked HTTP responses. A real account connection and an authorized test post provide separate evidence of provider acceptance.
