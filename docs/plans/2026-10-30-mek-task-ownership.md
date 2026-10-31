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

Every new durable result carries explicit owner-review instructions, with work/root identities and the existing `revise_bot_task` repair route. Request missing documentation from the existing result; do not repeat completed external actions or cancel solely because evidence is missing. Acceptance still requires valid structured reports and criterion evidence. Group aggregates cannot describe missing member reports as completed.

Recovery sends one durable reminder to the original delegator for legacy returned work. Reminder identity and outgoing intent share a snapshot, delivery uses the existing outbox/reconciliation, and uncertain original results are reconciled first. Group member results are reviewed through their aggregate. No worker request, automatic acceptance/cancellation or fabricated report is created by recovery. Existing execution limits and approvals apply to any subsequently requested revision.

In chat, a task-list disclosure keeps the count visible and remembers folding per Bot in tab-local session storage. It folds task rows only; approvals/secure credential requests remain visible. The complete team ledger remains expanded and separate.

Regression checks include missing/malformed evidence, mixed active/returned/failed work, owner-only repair and acceptance, legacy reminders across repeated recovery/restarts, unchanged final results, and UI folding with conversation switching/remount.
