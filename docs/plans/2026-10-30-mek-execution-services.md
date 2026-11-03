# MakeEpoch execution policies, workflows and project facts

This downstream extension is authorized by the MakeEpoch maintainer. It supplements task ownership through optional adapter hooks and public DSH `tools.guard`, `tools/execute`, and `llm/stream` APIs. DSH and the retained upstream entry remain unchanged.

## Execution policy

The authenticated user can configure a Bot as general, coding, or custom, add role instructions, and deny exact tool names. A role describes responsibility; it cannot grant sandbox permission or tool approval. Custom roles require instructions. Bots cannot widen these policies themselves.

New delegations default to at most four open leaf assignments and three revision attempts after the first attempt. Group aggregate records and parents awaiting their own children are not counted twice. Optional task limits include a deadline and a token budget. New delegation, revision, resume, tool dispatch and model requests check the applicable limits. Reporting, asking for necessary input, cancellation and final acceptance remain available as appropriate; the owner can still deliver the final answer after acceptance.

Token accounting records usage reported for tracked task model requests. It is not a currency-cost cap, and it cannot stop provider output already in flight. Missing provider usage remains unknown; a configured token budget fails closed on later requests when accounting is incomplete. Auxiliary model calls and external services are not included in this task total. A user may adjust the budget from the task controls.

## Resource leases

Known workspace mutation tools acquire an exclusive canonical working-directory lease before dispatch. Symbolic-link aliases and parent/child directory overlap conflict. Browser tools acquire their Bot browser lease. The user may bind additional exact tool names to workspace, browser or account-label resources, with optional Bot selection. Explicit acquire/list/release tools are also available. Account keys are labels, never credentials.

A resource belongs to a task, a Bot, and its execution session. Automatic claims are scoped to a tool call, not to the entire task awaiting review. A successful synchronous dispatch releases its automatic claim after settlement; an overlapping call already waiting on a live holder proceeds once released, with cancellation and policy rechecked before dispatch. Multiple required resources are checked together so a waiter does not retain a partial set. Acquisition is persisted before execution. Private and group sessions therefore cannot mutate one resource concurrently.

An explicit acquire keeps a reservation across calls until its holder or the user releases it. Registered DSH background jobs retain automatic claims until their public settlement events; a job still running cannot be released. Missing job state, an interrupted call or an older lease without lifecycle metadata remains uncertain/stale and requires checked explicit release. Expiry alone never proves that a command stopped. The resource list is scoped to the calling Bot; the user can inspect all holders in Team overview. Completion/cancellation requests release, but cannot force release of an in-flight or uncertain operation. These fields extend the existing version-1 records without interpreting old holds as safely finished.

These are cooperative coordination leases, not filesystem or account isolation. They do not inspect arbitrary shell scripts, infer every path a command may touch, or fence background OS processes after a shell tool returns. Separate worktrees/workspaces and DSH sandbox policies remain necessary when work must be isolated. There is no claim that an expired command has stopped. Unsupported external tools require explicit resource bindings.

## Reusable workflows

A workflow has an owner and immutable versions. Each version contains a template, named non-secret text inputs, and acceptance checks. Saving creates a draft; it does not execute anything. An explicit validation run starts an ordinary coordinated task with workflow id, version and digest attached before dispatch. Validation requires that exact run to be accepted with worker verification evidence. Activation refers to the validated digest; older versions remain readable, and editing creates a new draft without replacing the active version.

Running an active version uses the same task, approval, question, result and review path as ordinary work. Only declared inputs are accepted, placeholders are substituted once, and input values are checked for known/likely secrets. A stable request id deduplicates retries. An uncertain start remains inspectable and is never automatically repeated. The existing DSH automation system may invoke `run_workflow`; this module adds no scheduler and does not automatically run a newly saved workflow.

Validation records actual task acceptance and evidence; it does not prove that a model's claim is factually correct. The task owner remains responsible for checking the result. No remote verification or arbitrary test command is executed by the workflow registry itself.

## Project facts

The authenticated user explicitly creates a project knowledge scope, names its owner, and selects members. Bots may read/propose facts only inside existing authorized scopes and cannot grant themselves membership. Existing Bot/group/team memory continues unchanged; private chats are not harvested or automatically shared.

Each fact retains its key, value, source, source version, author, timestamp, optional expiry, and monotonically increasing version. An optimistic `expectedVersion` prevents stale edits. Different current values become visible conflicts; the owner or user resolves them with evidence. Superseded versions remain in history. Expired facts remain visible and are marked stale so the reader knows to recheck them. Facts and workflow templates reject known secrets through the existing secure-store redactor as well as likely credential patterns.

All three stores use versioned extension fields in the existing team state. Unknown future schema versions fail closed rather than being overwritten. No separate scheduler or database is introduced.
