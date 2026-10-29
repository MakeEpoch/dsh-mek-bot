# MakeEpoch execution policies, workflows and project facts

This downstream extension is authorized by the MakeEpoch maintainer. It supplements task ownership through optional adapter hooks and public DSH `tools.guard`, `tools/execute`, and `llm/stream` APIs. DSH and the retained upstream entry remain unchanged.

## Execution policy

The authenticated user can configure a Bot as general, coding, or custom, add role instructions, and deny exact tool names. A role describes responsibility; it cannot grant sandbox permission or tool approval. Custom roles require instructions. Bots cannot widen these policies themselves.

New delegations default to at most four open leaf assignments and three revision attempts after the first attempt. Group aggregate records and parents awaiting their own children are not counted twice. Optional task limits include a deadline and a token budget. New delegation, revision, resume, tool dispatch and model requests check the applicable limits. Reporting, asking for necessary input, cancellation and final acceptance remain available as appropriate; the owner can still deliver the final answer after acceptance.

Token accounting records usage reported for tracked task model requests. It is not a currency-cost cap, and it cannot stop provider output already in flight. Missing provider usage remains unknown; a configured token budget fails closed on later requests when accounting is incomplete. Auxiliary model calls and external services are not included in this task total. A user may adjust the budget from the task controls.

## Resource leases

Known workspace mutation tools acquire an exclusive canonical working-directory lease before dispatch. Symbolic-link aliases and parent/child directory overlap conflict. Browser tools acquire their Bot browser lease. The user may bind additional exact tool names to workspace, browser or account-label resources, with optional Bot selection. Explicit acquire/list/release tools are also available. Account keys are labels, never credentials.

A resource belongs to a task, a Bot, and its execution session. Private and group sessions of the same Bot therefore cannot operate on the same leased resource concurrently. Acquisition updates shared state before awaiting persistence; dispatch waits for persistence. Another holder is refused. The holder can renew; cancellation/completion releases leases, but an executing tool retains its lease until its wrapper settles. After lease expiry an unfinished task retains a visible stale lease rather than allowing another Bot to steal an uncertain resource. The user can release it after checking the old operation, or the original holder can renew it.

These are cooperative coordination leases, not filesystem or account isolation. They do not inspect arbitrary shell scripts, infer every path a command may touch, or fence background OS processes after a shell tool returns. Separate worktrees/workspaces and DSH sandbox policies remain necessary when work must be isolated. There is no claim that an expired command has stopped. Unsupported external tools require explicit resource bindings.

## Reusable workflows

A workflow has an owner and immutable versions. Each version contains a template, named non-secret text inputs, and acceptance checks. Saving creates a draft; it does not execute anything. An explicit validation run starts an ordinary coordinated task with workflow id, version and digest attached before dispatch. Validation requires that exact run to be accepted with worker verification evidence. Activation refers to the validated digest; older versions remain readable, and editing creates a new draft without replacing the active version.

Running an active version uses the same task, approval, question, result and review path as ordinary work. Only declared inputs are accepted, placeholders are substituted once, and input values are checked for known/likely secrets. A stable request id deduplicates retries. An uncertain start remains inspectable and is never automatically repeated. The existing DSH automation system may invoke `run_workflow`; this module adds no scheduler and does not automatically run a newly saved workflow.

Validation records actual task acceptance and evidence; it does not prove that a model's claim is factually correct. The task owner remains responsible for checking the result. No remote verification or arbitrary test command is executed by the workflow registry itself.

## Project facts

The authenticated user explicitly creates a project knowledge scope, names its owner, and selects members. Bots may read/propose facts only inside existing authorized scopes and cannot grant themselves membership. Existing Bot/group/team memory continues unchanged; private chats are not harvested or automatically shared.

Each fact retains its key, value, source, source version, author, timestamp, optional expiry, and monotonically increasing version. An optimistic `expectedVersion` prevents stale edits. Different current values become visible conflicts; the owner or user resolves them with evidence. Superseded versions remain in history. Expired facts remain visible and are marked stale so the reader knows to recheck them. Facts and workflow templates reject known secrets through the existing secure-store redactor as well as likely credential patterns.

All three stores use versioned extension fields in the existing team state. Unknown future schema versions fail closed rather than being overwritten. No separate scheduler or database is introduced.
