# MakeEpoch team operations

This downstream design is authorized by the MakeEpoch maintainer. It builds on the task ownership adapter and retains the upstream entry, storage, sessions, memory, capability and scheduling services. DSH itself is unchanged.

## Ownership and informed supervision

The original user contact owns a task and its decisions. The selected supervisor can query authorized summaries, but gains no permission to read unrelated private transcripts, change another owner's task, approve tools or obtain credentials. Summary sharing is enabled for team work by default in this downstream; the user can disable it globally or per Bot. Configuration changes belong to the user interface, not model tools. Disabling sharing immediately excludes that Bot's records from supervisor queries and cancels undelivered notifications. It cannot erase information already delivered.

Substantive direct work has an explicit task ID, goal and acceptance criteria. Casual conversation is not automatically promoted to a task. Models register substantive work with begin_bot_task, keep progress with report_team_activity, and finish through the same acceptance protocol as delegated work. No raw private turn is automatically copied into a shared ledger. Ordinary task transitions create records without waking the supervisor. Failed, blocked or explicitly escalated work produces a deduplicated notification. The supervisor reads the current record before acting and never steals ownership. User read state and supervisor handled state are separate.

## Reliable execution

State transitions and outgoing messages are prepared together before persistence. Resume, question, revision and group delivery use stable identities and durable acknowledgement checks. Unknown delivery is not permission to repeat an external action. Group delegation tracks native member sessions until actual results arrive; a relay round ending is not task completion. Different roots cannot merge merely because they share a sender and worker. Failed, aborted, deleted and unknown work retain explicit non-success states.

The policy extension applies task deadlines, measured token budgets, parallelism and revision limits at supported execution boundaries. Measured request boundaries may exceed a token limit by one in-flight request. Resource leases serialize supported browser and workspace mutation tools and explicitly configured account tools. Leases are coordination controls, not operating-system isolation or a replacement for DSH approvals. A lease owned by unresolved work cannot silently expire into duplicate work after restart.

## Native user experience

Keep the existing Bot rail, collapsible sidebar and native main pane. Add a compact team overview, history filters, explicit attention state, task artifacts, approved knowledge and reusable workflow versions. Reuse DSH workspace-file APIs for bounded previews and downloads, keeping artifact producer Session identity. Opening an artifact is explicit; do not execute HTML or fetch remote links in the server.

Native approval notifications are mounted once and disposed on pane exit. A visible current task stays quiet; routine worker decisions do not become human approval notifications. Web browser observation uses the plugin's already-open optional browser session. It does not launch a browser to draw a panel. Takeover pauses Bot input, serializes user input, and releases explicitly. Without the browser plugin or bridge, the UI explains what is unavailable. No nested DSH or Bot iframe is added.

## Reuse and knowledge

Workflows are versioned drafts with inputs, steps, validation and approval boundaries. Activation requires an explicit successful validation record; runs preserve owner/task identity. Existing DSH automation can invoke activated workflows. No second scheduler or removed Bot scheduling menu is introduced. External event wiring remains with existing connector or automation services rather than an unauthenticated new webhook server.

Project facts preserve source, owner, version, expiry and conflicting alternatives. Facts are explicitly recorded; private conversations and unfinished results are not silently promoted into team knowledge. Existing Bot/team/group memory remains available. Role profiles add concise general, coding or custom responsibilities through scoped plugin prompt sections while preserving DSH execution and safety requirements.

## Acceptance

Use isolated mock profiles only. Cover crash cut points, independent queued roots, late group results, question/resume/cancel, failure recovery, direct task supervision and sharing revocation, ordinary-event silence, duplicate important-event delivery, artifact provenance, native notification lifecycle, browser takeover races, resource conflict, bounded policy, workflow version/validation/run and fact conflicts. Run the complete suite, build check, lint and isolated end-to-end mock/browser flows. Publish only reviewed source and a hashed standalone package; install into the user's existing profile without source links after live work becomes idle. Preserve all existing user configuration and team data.
