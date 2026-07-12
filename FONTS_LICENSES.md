# Font Licenses (`public/fonts/`)

All faces are self-hosted latin-subset woff2 files served to the renderer by
the Node service itself (no network font fetch during a render). Every face
is licensed under the **SIL Open Font License 1.1 (OFL)**, which permits
bundling and commercial use. Files were obtained from Google Fonts
(fonts.gstatic.com latin subsets) on the dates below.

Font packs (copilot.md §4.7) map these files to the three role aliases
`Explainer Display` / `Explainer Body` / `Explainer Mono` — see `src/fonts.ts`.

| File | Family | Weights | Role / pack | License | Source / fetched |
|---|---|---|---|---|---|
| `bricolage-grotesque.woff2` | Bricolage Grotesque | 600–800 (variable) | display / editorial | OFL 1.1 | Google Fonts, 2026-07-09 |
| `instrument-sans.woff2` | Instrument Sans | 400–600 (variable) | body / editorial + classic | OFL 1.1 | Google Fonts, 2026-07-09 |
| `space-mono-regular.woff2` | Space Mono | 400 | mono / editorial + classic | OFL 1.1 | Google Fonts, 2026-07-09 |
| `space-mono-bold.woff2` | Space Mono | 700 | mono / editorial + classic | OFL 1.1 | Google Fonts, 2026-07-09 |
| `fraunces.woff2` | Fraunces | 600–800 (variable) | display / classic | OFL 1.1 | Google Fonts, 2026-07-12 |
| `space-grotesk.woff2` | Space Grotesk | 500–700 (variable) | display / tech | OFL 1.1 | Google Fonts, 2026-07-12 |
| `inter.woff2` | Inter | 400–600 (variable) | body / tech | OFL 1.1 | Google Fonts, 2026-07-12 |
| `jetbrains-mono-regular.woff2` | JetBrains Mono | 400 | mono / tech | OFL 1.1 | Google Fonts, 2026-07-12 |
| `jetbrains-mono-bold.woff2` | JetBrains Mono | 700 | mono / tech | OFL 1.1 | Google Fonts, 2026-07-12 |

OFL 1.1 full text: <https://openfontlicense.org/open-font-license-official-text/>
