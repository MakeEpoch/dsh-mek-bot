# MakeEpoch task ownership and review

This downstream design is authorized by the MakeEpoch maintainer. It extends the upstream 2026-10-16 handoff design without changing the retained upstream entry or DSH.

## Contract

The Bot originally contacted by the user owns the task. A new direct turn does not inherit another turn's work. Delegated questions suspend the open handoff and go to the owner through a separate decision channel; a decision is not a result and does not create a cyclic handoff. User answers remain in the owner's conversation. Native approvals still require the human and secure credential values never enter Bot messages.

Each delegated attempt keeps the upstream exchange identity. A resumed question uses a fresh delivery identity with the same upstream work identity, so repeated questions cannot collide. Revision attempts have new exchanges linked to the same root and previous attempt. The owner checks returned results and explicitly accepts the root; open work, questions, failed outcomes and uncertain deliveries prevent acceptance. Cancellation invalidates decisions and removes matching queued work, without stopping unrelated direct turns in the worker's long-lived session.

## Persistence and seams

`src/host/mek-coordination.js` is installed by `mek.js` after the upstream runtime. It wraps handoff creation/closure and result delivery, registers task tools and supplies stable prompt rules. Small optional hooks cover question/view/credential routing, turn completion, restart reconciliation, approval presentation and the existing authenticated channel. The client adds only a native task summary and reuses existing approval/credential cards. There is no iframe, DSH patch, global DOM replacement or production source link.

A reply is durably recorded before its upstream work closes. Delivery states distinguish pending, sending, sent, taken and uncertain. Restart recovery checks inbox and durable history before repeating an uncertain delivery; unreadable or bounded history is not proof of absence. Work and decisions stay local with the team. Long result previews are marked by their length and read_task retrieves the persisted message when available. Existing handoffs remain upstream-managed until a new delegation is created.

## Validation

Cover repeated questions and a user escalation, nested delegation, direct conversations while delegated work waits, revisions, rejected premature completion, restart with a pending question, delivery failure with unreadable history, cancellation, real user approval routing, secure credentials and group report-back. Exercise native rendering with the actual React bundle and run the host against a local scripted model. Never send test prompts to the user's running DSH or real model.

## Returned-result recovery and display (2026-10-31)

A plain-text reply is retained, but is not a structured completed report. The read model derives `needs_report` for returned work missing a nonempty completed summary/evidence and `review` when returned work is ready for acceptance. Active execution, decisions, failures and uncertain outcomes remain distinct; historical completed/cancelled roots are unchanged. Durable work retains its existing schema and outcome, so old records do not need a destructive migration.

Durable results carry the work and root IDs for review. The panel and `supplement_bot_report` record missing documentation on the exact returned assignment from its retained outcome and verified evidence. Supplementing preserves the original result, evidence artifacts and deliveries, and does not start a worker turn. Reserve `revise_bot_task` for actual corrections and retrying blockers after the prerequisite changes. Acceptance still requires valid structured reports and criterion evidence. Group aggregates cannot describe missing member reports as completed.

Recovery sends one durable reminder to the original delegator for legacy returned work. Reminder identity and outgoing intent share a snapshot, delivery uses the existing outbox/reconciliation, and uncertain original results are reconciled first. Group member results are reviewed through their aggregate. No worker request, automatic acceptance/cancellation or fabricated report is created by recovery. Existing execution limits and approvals apply to any subsequently requested revision.

In chat, a task-list disclosure keeps the count visible and remembers folding per Bot in tab-local session storage. It folds task rows only; approvals/secure credential requests remain visible. The complete team ledger remains expanded and separate.

Regression checks include missing/malformed evidence, mixed active/returned/failed work, owner-only repair and acceptance, legacy reminders across repeated recovery/restarts, unchanged final results, and UI folding with conversation switching/remount.


## Conversation to-dos (2026-11-03)

The native adapter now layers persistent conversation plans over the existing root/work coordinator. Stable child ids retain their independent work attempts. Group-local plans use the current group administrator, while private task ownership remains unchanged; a handover retains running work and routes results to the new administrator. Accepted predecessor versions gate dispatch and supported tool execution. Paused or unknown work is never treated as success. The native pane exposes the same task records in group and assigned-member views.

DSH remains the clock owner. The optional schedule adapter uses public durable delivery history and change events to deduplicate occurrences, then creates a pending main plan or durably notifies its coordinator. The original clock wake is not a business dispatch and cannot call tools. Existing permissions, evidence checks, resource leases and cancellation continue to apply. See the [complete design and implementation limits](2026-11-03-mek-conversation-tasks.md); do not infer full design acceptance from this first implementation.

## Group dispatch return chain (2026-11-03 hotfix)

A group administrator's first `message_bot` is now a tracked dispatch even when the incoming turn is an ordinary group round. Session preparation precedes creating the root; root, work and outbox intent are saved together before delivery. The root retains the user goal and originating group Session rather than only the first worker instruction. Further dispatches in the same task retain the root. This creates an executing task, not another future to-do. Ordinary discussions, announcements and plain mentions do not create formal tasks. A member without a current assignment must ask the administrator to arrange work instead of starting an independent root.

Nested group delegations retain their immediate parent. Repair results return to the reviewer, whose report returns to the original coordinator in the group; neither a returned result nor a quiet round accepts the user goal. Ancestor delegation remains forbidden: return a structured report and let the ancestor inspect/revise the same assignment. Plain mentions inside a tracked turn remain display-only; dispatch uses `message_bot`. Group records retain structured evidence even when the report tool concludes the turn without a final text reply.

Group-local questions go to the coordinator's group Session. Revisions retain the group return route. Planned task delivery still follows current-administrator handover, but nested replies return to their immediate reviewer first; decisions and final child results remain with the coordinator. Failed/blocked/uncertain work continues to prevent acceptance. Existing completed/cancelled history and untracked ordinary group rounds are not replayed or automatically converted on upgrade.

Regression coverage includes administrator-first dispatch without planning tools, named-request deduplication, Tester → Coder → Tester → administrator, cycle refusal, same-root revision in the original group, group-local decisions and blocked acceptance, and nested returns within a planned task. The opt-in `MEK_MOCK_GROUP_RETURN=1` scenario and `dev/mek-group-return-smoke.mjs` exercise the packaged plugin against an isolated DSH and scripted model, not real business execution.

Bot group announcements are quiet unless `post_to_group` explicitly opts into dispatch with `report_back: true`. Continuations keep their root title. Within one root, the same sender, target, parent and exact normalized instruction reuse the current assignment receipt; real corrections use revision. No task history is reclassified or archived on upgrade.
