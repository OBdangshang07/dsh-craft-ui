# Release checklist

- [ ] `pnpm run verify` passes from a clean install.
- [ ] Packed tarball contains only allowlisted source-built artifacts and original assets.
- [ ] Only the reviewed Fusion Pixel WOFF2 and its OFL text are present; no TTF, imported PNG/OGG, JAR, ZIP, cache, or absolute local path is present.
- [ ] Built client contains exactly one embedded font matching the packaged WOFF2 hash and no unresolved `__ASSET_*__` placeholder.
- [ ] Plugin loads in an isolated Harness profile.
- [ ] Day and Deepslate themes render and restore correctly after disable/unload.
- [ ] Java Edition-style Options, HUD/gameplay, and resource-pack pages work at desktop and narrow widths, including Escape/Back navigation.
- [ ] Compact, standard, and large interface sizes visibly resize both settings panels and HUD; narrow viewports use the safe responsive size.
- [ ] Native approval, question, and plan-review cards preserve all copy and actions.
- [ ] Context, tools, todos, goal, subagents, and pending-interaction HUD states use real data.
- [ ] Local-item and fallback-icon modes both render; clearing cache restores fallback mode.
- [ ] Local-item import rejects relative paths, escaping symlinks, malformed PNGs, invalid dimensions, and oversized files; cache manifests contain no source path.
- [ ] Idle or passive historical sessions do not leave a nine-slot hotbar covering message actions; active HUD does not overlap the composer.
- [ ] Keyboard focus and reduced-motion behavior are verified.
- [ ] Version, compatibility baseline, notices, and screenshots are current.
