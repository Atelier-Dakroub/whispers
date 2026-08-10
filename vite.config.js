// Build settings the framework does not set. Vite loads this on its own —
// `transclude-build` runs Vite from this directory without disabling config
// files — so nothing has to be wired up for it to apply.

export default {
  build: {
    // Browsers with native `light-dark()`. Without this, Vite's default target
    // is old enough that LightningCSS rewrites every `light-dark()` into
    //
    //   var(--lightningcss-light, A) var(--lightningcss-dark, B)
    //
    // while emitting neither switch variable, so both halves land in the value
    // at once. That is invalid, and an invalid `var()` inside a shorthand voids
    // the whole declaration — `border: 1px solid var(--rule)` became
    // `border-style: none`. Every rule and every input border disappeared, and
    // the palette went with them: the page looked dark only because
    // `color-scheme` had darkened the browser's own canvas.
    //
    // The polyfill would be wrong even if it were complete. It keys off
    // `prefers-color-scheme`, which is the reader's setting, while this app
    // themes on `color-scheme`, which the owner pins in Settings. A site pinned
    // to light would follow the reader's laptop instead.
    //
    // Raise these only alongside a check that `light-dark()` survives the
    // build; test/app.test.js has one.
    cssTarget: ['chrome123', 'edge123', 'firefox120', 'safari17.5'],
  },
};
