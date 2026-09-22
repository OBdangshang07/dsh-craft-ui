# Compatibility contract

## Tested baseline

- DeepSeek Harness: `0.1.7-alpha.1` (upstream `alpha` channel, checked 2026-09-22)
- Craft UI: `0.4.0`
- Node.js: 22+
- Client: Chromium/Edge through the Harness web app
- Package form: Host + Client DSH plugin

## Stable integration points

The plugin registers themes through the Harness theme service and mounts controls through `sidebar.footer.action` and `shell.overlay`. The selected Session is the catalog row with a `retainedBy.mainView` reference; its binding remains owned by Harness. Chat nodes and running calls come from the `uiConversation` `chat` target, and pending interactions come from `uiSession.sessionStatus`. Gameplay overlays hide on global settings/plugin panels. It recognizes native interaction surfaces through the data attributes `data-approval-key`, `data-question-key`, and `data-plan-review-key`.

The settings dialog is portalled into `document.body`, outside the sidebar's animation and clipping ancestors. React and React DOM are provided by the Harness module loader, not bundled into the plugin.

Native control styling is scoped to `body.craft-ui-enabled` and targets semantic roles/state attributes rather than generated class hashes. Switches keep their native button event handlers and accessible names; their square thumbs remain within 48×26 pixel tracks. Segmented tabs do not target DockKit editor strips. The font-size stepper lacks a semantic hook, so its local CSS-module name suffix is matched only inside the public `settings.general.item` slot. Selected preset cards that are disabled solely to prevent re-selection (`aria-disabled="false"`) are not styled as unavailable.

Resource operations use exact POST routes under `/api/craft-ui/`, registered through `connection.fetch.register`. This retains Harness authentication, origin checks, body limits, and the Connection RPC envelope. It also avoids the custom-channel `webServer` injection failure in the 0.1.7 Cordis/Connection combination. Import UI controls remain disabled off loopback; the Host's `allowLocalOfficialAssets` setting independently controls imports.

It does not replace message submission, approval decisions, questions, plan review, tool execution, goals, or subagent orchestration. When a projection is absent, its associated HUD element is hidden or marked unavailable.

## Maps & Quills integration

The optional reasoning slider shadows the single `conversation.input.model` seat at priority -100. Its `modelDirectories` service is the same directory used by the native composer and `/model`; both catalog levels and durable selection remain Host-owned. The service's `remote` / `remote.session` dependencies are explicitly injected because 0.1.7 Cordis traces calls through the caller context. Selecting legacy mode or disabling Craft UI removes the override, leaving the original control intact. Missing services leave the native seat untouched. Models without reasoning metadata expose no slider; unknown advertised/current values are never guessed. Pointer moves preview locally, release/keyboard completion submits once through `directory.select`, and stale gestures cannot overwrite a changed route/catalog/effort. This is included in 0.4.0, not a new release number.

The image view registers the keyed `tool.call.toolview` slot for `read_image` at priority -100. Disabling the image journal removes that registration and restores the upstream renderer. No duplicate `tool.call.images` ownership or replacement Chat Group Definition is registered. `conversation.chat.turnTail` subscribes to the public `nodes.turnDataSource(turn, 'tool-call')` observable and recursively collects compatible nested results. Native collapsed groups remain native; the turn-tail gallery supplies the visible summary.

`conversation.session.header.actions` hosts the notebook opener and `conversation.chat.assistant-actions` hosts the reply bookmark button. Standard Session props supply `useChat`, `useInput`, `inputActions`, and `sessionId`. Images use the supplied `loadImage` or `uiConversation.imageUrl(sessionId, attachment)`; arbitrary local paths/remote URLs are never fetched. Image admission requires supported raster media, at most 40 MP and 32 MiB. Thumbnail loading is visibility-driven. The shared attachment service owns its URL cache. PNG export is a separate, bounded 4 MP / 4096-side canvas download.

Notebook routes use the authenticated `/api` carrier at `craft-ui/notebook/{read,mutate,source}`. The Host declares `connection` and `sessionQuery` dependencies; the standard 0.1.7 web profile provides both. Custom compositions without Session Query are not supported. Session availability, excerpt inclusion and annotation attachment identity are verified against persisted source events. Only visible message text is returned, never system messages or reasoning. Note metadata is stored under `profileContext.dir/craft-notebooks/`, with hashed Session filenames, schema checks, revision CAS, cross-process write locks and synced atomic replacement. Existing damaged/unknown-schema data and crash locks are retained for review rather than silently reset.

Draft feedback uses only `inputActions.insertText` with the current `draftRev` and an end-of-draft range. It never calls submit, replaces the draft, attaches images, edits source files or invokes a model. Source lookup is an exact event read inside the notebook, not a Chat scroll jump. Notes do not automatically transfer to forked Sessions. Backups contain private excerpts; import is same-Session only and does not restore historical revisions or replacement links.

## Projection mapping

| Harness state | Craft UI representation |
| --- | --- |
| `contextPressure.projectedTokens/contextWindow` | XP bar |
| latest assistant `requestConfig` / `providerMetadata` | model equipment |
| reasoning effort/thinking | enchantment |
| Chat target `legacy.runningCalls` | hotbar and tool toast |
| todos and plan projections | quest log |
| goal projection | native goal task panel and reserved XP footer |
| `projectionValues.subagentCatalog` + Session status | companion list |
| `uiSession.sessionStatus.get(id).pendingInteraction` | approval indicator |

## Degradation rules

- No current session: no gameplay HUD.
- No context telemetry: `CONTEXT --`, with no fabricated value.
- No local item directory: original fallback icons only.
- Non-loopback connection: item import disabled.
- Bundled WOFF2 unavailable in the browser: system monospace/CJK fallback.
- Reduced-motion request: animations removed even if the plugin setting says full.

Before supporting a new Harness release, run the full verification suite and a real canary capture of both themes, all settings tabs, narrow layout, and native interaction cards.

`node scripts/verify-live-canary.mjs <startup-log>` uses an isolated headless Edge profile and privately reads the authenticated URL from the local log. It verifies plugin loading, both themes, all Craft settings pages, topmost/clickable dialog placement, narrow layout, the real Host status RPC, and mixed Chinese/Latin composer text. Screenshots are saved under `.generated/compatibility-captures/`. It never submits a model request. Session/HUD mappings and resource envelope failures are covered by automated behavior tests; a live model turn is not part of this smoke test. Compatibility fallbacks for 0.1.5 snapshot shapes remain, but this release's live baseline is 0.1.7.

`node scripts/verify-native-controls.mjs <isolated-startup-log>` additionally visits native General, Plugins, Agent Presets, and Models settings, guide tabs, and permission/model menus. It tests the real switch with Space and real guide tabs with ArrowRight. A separate fixture matrix covers disabled/mixed/invalid states, both themes, and 1440/640/390-pixel widths; these fixture cases are not claimed as live model interactions. It checks reduced motion and restoration when the theme is disabled. Screenshots go to `.generated/native-controls/`. Use an **isolated DSH home**: this test toggles and restores its developer-tools preference. No model requests are submitted. `--local-css` injects the built stylesheet for development; omit it for installed-package verification.

`node scripts/verify-workbench.mjs <isolated-startup-log>` mounts the actual new components with synthetic Session props. It covers gallery/compare/annotation, preserving a draft, export/import, keyboard focus, responsive widths and opt-out. This is explicitly a fixture, not an online model turn. `node scripts/verify-workbench-live.mjs <isolated-seeded-startup-log>` additionally uses a synthetic history persisted by the real DSH Session/attachment services to exercise native slots, authenticated notebook writes, source lookup and reload. It must only target the disposable seeded profile; seed data and browser profiles are excluded from the package.

`node scripts/verify-reasoning.mjs <isolated-seeded-startup-log>` checks the real model directory, keyboard and pointer selection, persistence after reload, default reset, model-list navigation, narrow popover bounds, both themes and the legacy setting's persistence/restoration. It changes only the isolated fixture Session's model-selection metadata and submits no model prompt. Screenshots are written to `.generated/native-controls/reasoning-*.png`.

`node scripts/verify-reasoning-fixture.mjs <isolated-startup-log>` supplements this with six-level, single-level, missing-metadata and unknown-effort catalogs, selection failure/retry, Escape cancellation and narrow layouts. Those catalogs are synthetic; they make no network selections.
