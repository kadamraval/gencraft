# Agent flow: audit and plan

## What was there (audit, 2026-10-13)

- A hand-written tool loop (`src/lib/agent/tool-loop.ts`): non-streaming fetch calls to a chat endpoint, tools described as raw JSON schema.
- No Vercel AI SDK, no AI Elements. Steps shown by a small custom list (`agent-steps.tsx`).
- Each message started a new run with only the goal: **no conversation memory**, no follow-ups ("make it darker").
- **No plan step**, no approval before spending: one overall budget, checked inside the tool.
- No streaming text, no reasoning, no stop button, no per-step cost.
- Tools: image, video, audio, load a skill. No way to look at what was already made, edit or extend a result, or ask the person a question.
- Provider chat models only through the chat-completions format.

## Plan (built)

1. **Core on the AI SDK (v7).** `ToolLoopAgent` with zod tools, `isStepCount` limit, `toolApproval`, the user's own key through `@ai-sdk/openai`, `@ai-sdk/google` or `@openrouter/ai-sdk-provider`, with the app's fetch (desktop HTTP plugin, dev proxies in a browser).
2. **Tools.** `propose_plan` (the person approves the plan before anything is made), `generate_image` / `generate_video` / `generate_audio` (approval when a result costs more than the auto-approve limit; denied when it would pass the budget), `list_results`, `load_skill`, `ask_user` (a question the person answers in the chat).
3. **Approval policy as data.** Auto-approve limit and budget from Settings; the policy is a pure function, tested.
4. **Chat on `useChat` + `DirectChatTransport`.** The agent runs in the app, streams text, reasoning and tool parts; approvals go back with `addToolApprovalResponse`; the conversation keeps its messages so a follow-up continues the work.
5. **AI Elements.** Conversation, Message (Streamdown), Reasoning, Tool, Plan, Task, Confirmation, Queue-free, Checkpoint, Suggestion, Shimmer, Loader, Image, Context, adapted to the app's design tokens (Tailwind 3). Results appear as cards under the step that made them.
6. **Persistence.** The conversation's UI messages are saved with the conversation; old agent conversations (steps list) still open.
7. **Tests.** Mock language model: plan approval, auto-approve under the limit, ask-for-approval over the limit, denial past the budget, follow-up memory, tool error recovery, stop.

## Limits

- Needs a chat model that supports tool calling, from OpenAI, OpenRouter or Gemini. A Replicate chat model cannot run the agent.
- Nothing here could be run live with the keys on this machine (Replicate only); behaviour is covered by tests against a mock model and by the app's UI with a scripted model.
