# Compatibility contract

## Tested baseline

- DeepSeek Harness: `0.1.7-alpha.1` (upstream `alpha` channel, checked 2026-09-22)
- Craft UI: `0.3.1`
- Node.js: 22+
- Client: Chromium/Edge through the Harness web app
- Package form: Host + Client DSH plugin

## Stable integration points

The plugin registers themes through the Harness theme service and mounts controls through `sidebar.footer.action` and `shell.overlay`. The selected Session is the catalog row with a `retainedBy.mainView` reference; its binding remains owned by Harness. Chat nodes and running calls come from the `uiConversation` `chat` target, and pending interactions come from `uiSession.sessionStatus`. Gameplay overlays hide on global settings/plugin panels. It recognizes native interaction surfaces through the data attributes `data-approval-key`, `data-question-key`, and `data-plan-review-key`.

The settings dialog is portalled into `document.body`, outside the sidebar's animation and clipping ancestors. React and React DOM are provided by the Harness module loader, not bundled into the plugin.

Native control styling is scoped to `body.craft-ui-enabled` and targets semantic roles/state attributes rather than generated class hashes. Switches keep their native button event handlers and accessible names; their square thumbs remain within 48×26 pixel tracks. Segmented tabs do not target DockKit editor strips. The font-size stepper lacks a semantic hook, so its local CSS-module name suffix is matched only inside the public `settings.general.item` slot. Selected preset cards that are disabled solely to prevent re-selection (`aria-disabled="false"`) are not styled as unavailable.

Resource operations use exact POST routes under `/api/craft-ui/`, registered through `connection.fetch.register`. This retains Harness authentication, origin checks, body limits, and the Connection RPC envelope. It also avoids the custom-channel `webServer` injection failure in the 0.1.7 Cordis/Connection combination. Import UI controls remain disabled off loopback; the Host's `allowLocalOfficialAssets` setting independently controls imports.

It does not replace message submission, approval decisions, questions, plan review, tool execution, goals, or subagent orchestration. When a projection is absent, its associated HUD element is hidden or marked unavailable.

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
