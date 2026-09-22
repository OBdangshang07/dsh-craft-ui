[English](README.md) | [简体中文](README.zh-CN.md)

# DSH Craft UI

An unofficial, high-fidelity Minecraft-inspired interface and gameplay layer for DeepSeek Harness. It keeps Harness actions and state authoritative while presenting them as a productive game HUD.

The published package is self-contained: it includes the original MIT-licensed pixel artwork, the OFL-1.1-licensed Fusion Pixel UI font, and synthesized Web Audio cues. It does not contain Minecraft textures, sounds, fonts, logos, or other Mojang/Microsoft files.

## What it changes

- Reversible `Overworld Day` and `Deepslate Night` themes.
- Original nine-slice panels, buttons, tooltips, icons, slots, and world textures.
- Bundled Fusion Pixel Simplified Chinese WOFF2 font for consistent offline rendering.
- Context pressure as an XP bar; unknown telemetry is shown as unavailable, never invented.
- Running tool calls as a hotbar and tool toast.
- Model/provider as equipment and reasoning effort as an enchantment.
- Todos and plans as a quest log.
- Harness's native active-goal dock restyled as a Minecraft task panel with a reserved Context XP footer.
- Subagents as a companion list and pending interactions as an approval warning.
- Turn completion as an advancement toast.
- Original synthesized click and advancement sounds, disabled by default.
- Minecraft-styled settings, approval, question, and plan-review surfaces without replacing native actions or risk copy.
- Java Edition-style Options navigation: centered two-column option buttons, dedicated HUD and resource-pack subpages, and a bottom Done/Back action instead of desktop-style tabs and dropdowns.

## Install and develop

Requires Node.js 22 or newer and a compatible DeepSeek Harness build.

```sh
pnpm install
pnpm run verify
pnpm pack --pack-destination .generated/packs
dsh plugin --profile craft-ui-canary add .generated/packs/dsh-craft-ui-0.3.0.tgz
```

The plugin is a DSH Host + Client combo package. `cordis.patch.yml` inserts its stable bundle layer; the client uses documented theme, slot, connection, session, and conversation services.

## Local Minecraft item mode

Open **Craft UI → 素材**, paste the absolute path of a lawfully possessed `textures` or `items` directory, then choose **导入物品贴图**. Import is available only through a loopback Harness connection. The built-in UI frame, button, slot, bar, and background artwork remains original; only individual item icons are read from this directory.

The importer:

- reads a fixed semantic allowlist of item names rather than walking or copying the whole directory;
- requires an absolute directory path and resolves every selected file with `realpath`, rejecting symbolic links or other paths that escape the chosen directory;
- validates the PNG/IHDR header, square power-of-two dimensions from 16–256 pixels, and a 64 KB per-item limit;
- hashes the selected bytes and stores a private cache under `$DSH_HOME/craft-ui/resource-packs/<sha256>`;
- sends only the selected item PNGs to the loopback browser as capped data URLs;
- does not persist the selected source path in new cache manifests, never exposes it to the client, and never adds imported files to the npm tarball.

Recognized item semantics include command execution, editing, search/read, web access, image work, model equipment, goals, quests, subagents, approval, and advancement states. Runtime audio remains original synthesis.

Use **清除缓存** to remove the whole private Craft UI resource cache and restore the original asset kit.

## Interface size

**Craft UI → 外观 → 界面尺寸** provides three real layout scales: **紧凑**, **标准**, and **大号**. The setting scales both the HUD and Craft UI panels rather than only changing border thickness. Narrow viewports automatically use a safe responsive size so native Harness controls remain reachable.

## Font behavior

The client embeds `Fusion Pixel 10px Monospaced zh-Hans` as WOFF2 at build time, so the UI does not depend on a system font or a network font service. The same reviewed file, its SIL Open Font License 1.1 text, and bundled-component license notices are included under `assets/fonts/`. If the browser cannot load WOFF2, the stylesheet falls back to readable system monospace/CJK fonts.

## Accessibility and safety

- Full, reduced, and off motion modes are available; the operating-system reduced-motion preference wins.
- Keyboard focus remains visible.
- HUD elements are pointer-transparent and dynamically clear native tasks, running status, and action controls.
- Responsive layouts hide nonessential HUD elements before shrinking core controls.
- Approval, question, and plan-review behavior remains owned by Harness.
- Disabling or unloading the plugin restores the previous Harness theme and document color scheme.

## Compatibility

Version `0.3.0` targets DeepSeek Harness `0.1.7-alpha.1`, available on the upstream `alpha` channel (`npm install -g @deepseek-ai/dsh@0.1.7-alpha.1`). It adapts main-view Session ownership, unified Session status, subagent catalogs, model metadata, and authenticated resource routes. The settings screen stays above the redesigned sidebar at every width. See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the integration contract and [docs/ASSET_POLICY.md](docs/ASSET_POLICY.md) for the asset boundary.

## Verification

`pnpm run verify` regenerates original assets, embeds every runtime texture and the reviewed font, builds Host and Client bundles, type-checks, and runs package-contract and security tests. `pnpm run audit:pack` then inspects the npm tarball against an explicit file allowlist, verifies the packaged and embedded font hashes, and rejects imported assets, caches, archives, unreviewed fonts/audio, source maps, unexpected tar entry types, and oversized embedded binaries. The packed client bundle has a 900 KB budget.

## License and trademark

Plugin source and original generated assets are MIT licensed. Fusion Pixel Font is distributed under SIL Open Font License 1.1; see `assets/fonts/OFL.txt` and `THIRD_PARTY_NOTICES.md`. Minecraft is a trademark of Microsoft Corporation. This project is unofficial and is not affiliated with, approved by, or sponsored by Mojang or Microsoft. Users are responsible for complying with the Minecraft EULA and the licenses of resource packs they import.
