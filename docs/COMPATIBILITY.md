# Compatibility contract

## Tested baseline

- DeepSeek Harness: `0.1.5-rc.1`
- Node.js: 22+
- Client: Chromium/Edge through the Harness web app
- Package form: Host + Client DSH plugin

## Stable integration points

The plugin registers themes through the Harness theme service and mounts controls through `sidebar.footer.action` and `shell.overlay`. Session lifecycle comes from the active `sessions` binding, Chat nodes and running calls come from the `uiConversation` `chat` target, and pending interactions come from `uiSession`. It recognizes native interaction surfaces through the documented data attributes `data-approval-key`, `data-question-key`, and `data-plan-review-key`.

It does not replace message submission, approval decisions, questions, plan review, tool execution, goals, or subagent orchestration. When a projection is absent, its associated HUD element is hidden or marked unavailable.

## Projection mapping

| Harness state | Craft UI representation |
| --- | --- |
| `contextPressure.projectedTokens/contextWindow` | XP bar |
| latest assistant request provenance/config | model equipment |
| reasoning effort/thinking | enchantment |
| Chat target `legacy.runningCalls` | hotbar and tool toast |
| todos and plan projections | quest log |
| goal rounds | Boss Bar |
| subagent catalog | companion list |
| `uiSession.pendingInteractions` | approval indicator |

## Degradation rules

- No current session: no gameplay HUD.
- No context telemetry: `CONTEXT --`, with no fabricated value.
- No local item directory: original fallback icons only.
- Non-loopback connection: item import disabled.
- Bundled WOFF2 unavailable in the browser: system monospace/CJK fallback.
- Reduced-motion request: animations removed even if the plugin setting says full.

Before supporting a new Harness release, run the full verification suite and a real canary capture of both themes, all settings tabs, narrow layout, and native interaction cards.
