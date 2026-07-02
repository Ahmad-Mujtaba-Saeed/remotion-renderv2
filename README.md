# remotion-render

Standalone Node/Remotion render service for the **AI Explainer Video** template.
Laravel (`RemotionRenderService`) POSTs a validated shot list; this service
renders the MP4 to a shared path and returns when done.

## Why a separate service
Remotion needs a Node + headless-Chromium toolchain that doesn't belong inside
the Laravel app or the Python FastAPI service. It mirrors the existing pattern:
Laravel calls it over HTTP exactly like it calls the Python AI service.

## Setup
```bash
cd remotion-render
npm install          # installs Remotion + Chromium headless shell
npm start            # starts the HTTP server on :3020
```
First `npm install` downloads a Chromium build used for rendering.

## Configure Laravel
In `viralforgebackend/.env`:
```
REMOTION_SERVICE_URL=http://localhost:3020
# Public base URL the renderer uses to fetch uploaded assets (defaults to APP_URL):
REMOTION_ASSET_BASE_URL=http://localhost:8000
OPENAI_EXPLAINER_MODEL=gpt-4o-mini
```
`REMOTION_ASSET_BASE_URL` must be reachable from this service and serve
`/storage/...` (i.e. `php artisan storage:link` has been run).

## Endpoints
- `GET /health` → `{ status: "ok" }`
- `POST /render` → `{ project_id, output_path (absolute), fps, width, height, shot_list }`
  renders and returns `{ success, output_path }`.

## Develop the visuals
```bash
npm run studio      # opens Remotion Studio with the Explainer composition
```
Paste a shot list into the props panel to preview layouts.

## Layouts
- `single_focus` → `src/layouts/SingleFocus.tsx`
- `split_side_by_side` → `src/layouts/SplitSideBySide.tsx`
- `split_top_bottom` → `src/layouts/SplitTopBottom.tsx`
- `full_bleed_with_side_panel` → `src/layouts/FullBleedWithSidePanel.tsx` (floating glass explanation box, docks left/right)
- `full_bleed_with_banner` → `src/layouts/FullBleedWithBanner.tsx` (glass banner, docks top/bottom)

Add a new layout = a component + a `case` in `src/components/SceneRouter.tsx`,
matching a new entry in the PHP `explainer_registry.json`.

## Visual system
- **Themes** (`src/theme.tsx`): colours come from the shot list (`theme`), chosen
  randomly per video in Laravel. Applied everywhere via `useTheme()`.
- **Motion / glass**: `AmbientBackground` (animated gradient + drifting orbs +
  vignette + grain), `MotionGraphics` (orbs + rotating ring), `KineticText`
  (word-by-word headings), `GlassCard`/`ExplanationBox` (glassmorphism),
  per-scene entrance animation, and a global progress bar.
- **Camera moves** (`src/components/CameraMove.tsx`) and **transitions**
  (`src/transitions.ts`: fade / slide / wipe).
