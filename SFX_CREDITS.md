# SFX library — provenance & the studio-pack drop-in contract

## Default pack: procedural (license-free)

Every file in `public/sfx/*.wav` is **synthesized from first principles** by
`scripts/gen-sfx.ts` (pink noise → swept band-pass whooshes, exponential sine
drops, sub+burst impacts, detuned partials). Deterministic seeds, no samples,
no third-party material — **zero licensing obligations**. Regenerate any time:

```
npx tsx scripts/gen-sfx.ts
```

### Manifest (durations must stay in sync with `src/sfx.ts`)

| file | duration | used for |
|---|---|---|
| whoosh_soft.wav | 1.1s | standard canvas hops, slide transitions |
| whoosh_deep.wav | 1.3s | zoom_nest dives, heavy transitions |
| whoosh_rise.wav | 1.4s | pull_reveal / callback flights |
| whoosh_impact.wav | 1.0s | consequence arrivals, kinetic breaks |
| pop_a/b/c.wav | 0.3s | (kept for manifest parity — per-bullet pops are user-rejected; do not wire) |
| stamp.wav | 0.7s | punchline stamps, #1-rank landings |
| shimmer.wav | 1.0s | cold open, punchline plates |
| tick.wav | 0.14s | checklist marks, map pins |
| riser.wav | 1.6s | leads INTO chapter boundaries/covers |
| sub_boom.wav | 0.9s | chapter boundary/title landing |
| paper_slide.wav | 0.35s | photo-stack slides, print moves |
| tick_loop.wav | 1.0s | counter rollups (loopable, silent ends) |
| chime.wav | 0.9s | completions: outro CTA, chart fills, meters |

## Optional: the "studio" pack (curated drop-in)

To upgrade to real recorded sounds, drop a complete set into
`public/sfx/studio/` using the **exact same file names** (48 kHz stereo WAV
recommended; any Chrome-decodable WAV works). Rules:

1. **All 15 files are required.** `src/render.ts::resolveSfxPack()` vets the
   directory before every render and silently falls back to the procedural
   pack when any file is missing — a partial pack would otherwise 404
   mid-render and kill it with an opaque delayRender timeout.
2. Selection: project setting `sfx_pack` = `auto` (default — studio when the
   directory is complete, else procedural) | `studio` | `procedural`.
3. Match the mix expectations: files are played through per-sound gains in
   `src/sfx.ts` tuned for peaks around −6…−12 dBFS. Wildly hotter files will
   sit on top of the narration — normalize before dropping in.
4. **Licensing is on the operator.** Only use CC0 / properly licensed sounds
   (freesound.org CC0 filter, or a purchased pack) and record the source +
   license for every file in the table below.

### Studio pack provenance (fill in when adding files)

| file | source URL | license |
|---|---|---|
| _(none installed yet)_ | | |
