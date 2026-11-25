// Generated from timeline/src by npm run build.
// timeline/src/config.ts
import Schema from "@deepseek-ai/schemastery";

// timeline/src/defaults.ts
var defaults_default = {
  "taskPrompt": "Use short, outcome-based titles. Break deliverables into checkable child actions. State the result or blocker in note. Use details for evidence, limits, and the effect on the goal. Explain unfamiliar names and what meaningful measurements show. Include counts only when they answer the user's question.",
  "summaryPrompt": "Focus on what changed and why it matters to the user's goal. Lead with a concrete result or finding. Add useful evidence, consequences, and remaining gaps when the record supports them."
};

// timeline/src/policy.ts
var MINUTE_MS = 6e4;
var PROMPT_LIMIT = 32768;
var defaultReportCadence = { intervalMs: 15 * MINUTE_MS, rollupFactors: [4, 4] };
var HISTORY_MS = 7 * 24 * 60 * MINUTE_MS;
var MAX_ANNOTATIONS = 512;
var outputLanguages = ["en", "zh-CN", "ja", "es", "fr", "de", "ru", "pt"];
var languages = ["ui", "chat", ...outputLanguages];
var languageText = {
  en: {
    label: "English",
    noActivity: "No activity.",
    priority: "Timeline priority changed"
  },
  "zh-CN": {
    label: "简体中文",
    noActivity: "无活动。",
    priority: "时间线优先级已更改"
  },
  ja: {
    label: "日本語",
    noActivity: "活動はありません。",
    priority: "タスクの優先度が変更されました"
  },
  es: {
    label: "Español",
    noActivity: "Sin actividad.",
    priority: "Cambió la prioridad de las tareas"
  },
  fr: {
    label: "Français",
    noActivity: "Aucune activité.",
    priority: "La priorité des tâches a changé"
  },
  de: {
    label: "Deutsch",
    noActivity: "Keine Aktivität.",
    priority: "Aufgabenpriorität geändert"
  },
  ru: {
    label: "Русский",
    noActivity: "Нет активности.",
    priority: "Приоритет задач изменён"
  },
  pt: {
    label: "Português (Brasil)",
    noActivity: "Sem atividade.",
    priority: "A prioridade das tarefas mudou"
  }
};
var progressPrecisions = [0, 1, 2, 3];
function appLanguage(locale) {
  const primary = locale.toLowerCase().split("-")[0];
  if (primary === "zh") return "zh-CN";
  return outputLanguages.find((language) => language === primary) ?? "en";
}
function outputLanguage(language, uiLanguage) {
  if (language === "chat") return void 0;
  return language === "ui" ? uiLanguage : language;
}
function fixedText(language, uiLanguage) {
  return languageText[outputLanguage(language, uiLanguage) ?? uiLanguage];
}
function taskLanguageInstruction(language) {
  return `For Timeline task-tree content only, write titles, descriptions, progress notes, results, and discussion replies in ${languageText[language].label}. Follow the user's language instructions for all other work and conversation.`;
}
function languageInstruction(language) {
  return `All titles, descriptions, user-facing texts must be written in ${languageText[language].label}.`;
}

// timeline/src/periods.ts
import { z } from "zod";
var periodPolicy = z.array(z.number().positive().max(864e5)).min(1).max(5);
function mergeRanges(ranges) {
  const result = [];
  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    if (end <= start) continue;
    const last = result.at(-1);
    if (last !== void 0 && start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}
function activeRanges(activity, start, end) {
  return mergeRanges(
    [...activity.ranges, ...activity.open === null ? [] : [[activity.open, end]]].map(([a, b]) => [Math.max(a, start), Math.min(b, end)]).filter(([a, b]) => b > a)
  );
}
function reportRanges(report, activity) {
  return report.ranges ?? (activity !== void 0 && report.start >= activity.start ? activeRanges(activity, report.start, report.end) : void 0);
}
function reportPeriods(policy) {
  const periods = [policy.intervalMs];
  let period = policy.intervalMs;
  for (const factor of policy.rollupFactors) {
    period = Math.round(period * factor);
    periods.push(period);
  }
  return periods;
}
function validReportPeriods(periods) {
  const base = periods[0];
  return base !== void 0 && base <= 864e5 && periods.length <= 5 && periods.every((period, index) => Number.isSafeInteger(period) && period >= MINUTE_MS && period <= HISTORY_MS && period > (periods[index - 1] ?? 0));
}

// timeline/src/config.ts
var Config = Schema.object({
  reportsEnabled: Schema.boolean().default(true).description("Generate new interval reports. Saved reports remain available when disabled.").volatile(),
  intervalMs: Schema.number().min(MINUTE_MS).max(864e5).step(1).default(defaultReportCadence.intervalMs).description(
    "Minimum elapsed time between reports, at least one minute. Overdue work is reported on resume."
  ).volatile(),
  rollupFactors: Schema.array(
    Schema.number().min(1 + Number.EPSILON).max(10080)
  ).max(4).default([...defaultReportCadence.rollupFactors]).description("Ratios between strictly increasing hierarchy periods. Fractional ratios are supported.").volatile(),
  language: Schema.union(languages).default("ui").description(
    "Language for Timeline task-tree text and background summaries only; other work is unchanged."
  ).volatile(),
  progressDecimals: Schema.union(progressPrecisions).default(2).description("Decimal places shown for task progress, from zero to three.").volatile(),
  segmentedProgress: Schema.boolean().default(true).description("Show completed, active, pending or paused, and blocked work as weighted progress segments.").volatile(),
  allowTodo: Schema.boolean().default(false).description("Allow agents to use Todo when it is already provided by their preset.").volatile(),
  autoOpenSidebar: Schema.boolean().default(true).description("Open the sidebar when the first task tree appears in a conversation.").volatile(),
  reminderIterations: Schema.number().min(1).max(Number.MAX_SAFE_INTEGER).step(1).default(24).description("Agent iterations without a successful task update before a task-tree reminder.").volatile(),
  maxTasks: Schema.number().min(1).max(1e3).step(1).default(500),
  maxTrees: Schema.number().min(1).max(100).step(1).default(30),
  maxConcurrent: Schema.number().min(1).max(8).step(1).default(2),
  timeoutMs: Schema.number().min(1).max(6e5).step(1).default(12e4),
  maxResponseBytes: Schema.number().min(1).max(1048576).step(1).default(65536),
  reportMaxTokens: Schema.number().min(1).max(32768).step(1).default(4096).description("Maximum model tokens in a report response."),
  reportReasoningEffort: Schema.string().max(64).required(false).description("Optional reasoning effort id supported by the report model."),
  taskPrompt: Schema.string().max(PROMPT_LIMIT).role("textarea").default(defaults_default.taskPrompt).description(
    "Task-writing guidance in the timeline_tasks tool description; not added to the system prompt."
  ).volatile(),
  summaryPrompt: Schema.string().min(1).max(PROMPT_LIMIT).role("textarea").default(defaults_default.summaryPrompt).description(
    "Instructions for both interval summaries and hierarchical rollups. Output must keep progress, uncertainties, and userActions arrays."
  ).volatile(),
  levelPrompts: Schema.array(Schema.string().max(PROMPT_LIMIT).role("textarea")).max(5).default([]).description("Optional extra instructions for each level, added to the global summaryPrompt.").volatile()
});
var standard = Config["~standard"];
Object.defineProperty(Config, "~standard", {
  value: {
    ...standard,
    validate(value) {
      const result = standard.validate(value);
      if ("value" in result) {
        const input = result.value;
        const cadence = { intervalMs: input.intervalMs.get(), rollupFactors: input.rollupFactors.get() };
        if (!validReportPeriods(reportPeriods(cadence)))
          return { issues: [{ path: ["rollupFactors"], message: "Timeline report periods must increase and stay within seven days." }] };
      }
      return result;
    }
  }
});
function liveConfig(input, readLanguage = () => Intl.DateTimeFormat().resolvedOptions().locale) {
  return {
    get reportsEnabled() {
      return input.reportsEnabled.get();
    },
    get intervalMs() {
      return input.intervalMs.get();
    },
    get rollupFactors() {
      return [...input.rollupFactors.get()];
    },
    get language() {
      return input.language.get();
    },
    get uiLanguage() {
      return appLanguage(readLanguage());
    },
    get progressDecimals() {
      return input.progressDecimals.get();
    },
    get segmentedProgress() {
      return input.segmentedProgress.get();
    },
    get allowTodo() {
      return input.allowTodo.get();
    },
    get autoOpenSidebar() {
      return input.autoOpenSidebar.get();
    },
    get reminderIterations() {
      return input.reminderIterations.get();
    },
    get maxTasks() {
      return input.maxTasks;
    },
    get maxTrees() {
      return input.maxTrees;
    },
    get maxConcurrent() {
      return input.maxConcurrent;
    },
    get timeoutMs() {
      return input.timeoutMs;
    },
    get maxResponseBytes() {
      return input.maxResponseBytes;
    },
    get summaryPrompt() {
      return input.summaryPrompt.get();
    },
    get taskPrompt() {
      return input.taskPrompt.get();
    },
    reportMaxTokens: input.reportMaxTokens,
    ...input.reportReasoningEffort === void 0 ? {} : { reportReasoningEffort: input.reportReasoningEffort },
    get levelPrompts() {
      return [...input.levelPrompts.get()];
    }
  };
}

// timeline/src/projection.ts
import { z as z3 } from "zod";
import { pluginRecordOf } from "@deepseek-ai/dsh-session";

// timeline/src/records.ts
import { randomUUID } from "@deepseek-ai/dsh-util-crypto";
import { z as z2 } from "zod";
var id = z2.string().trim().min(1).max(80);
var taskId = id.brand();
var treeId = id.brand();
var reportId = id.brand();
var statuses = ["pending", "active", "paused", "blocked", "done", "retired"];
var priorities = ["P0", "P1", "P2", "P3"];
var prioritySchema = z2.enum(priorities).nullable();
var controlTargetSchema = z2.discriminatedUnion("kind", [
  z2.object({ kind: z2.literal("tree"), tree: treeId }).strict(),
  z2.object({ kind: z2.literal("task"), tree: treeId, task: taskId }).strict()
]);
var annotationTargetSchema = z2.discriminatedUnion("kind", [
  ...controlTargetSchema.options,
  z2.object({ kind: z2.literal("report"), report: reportId }).strict()
]);
var annotationId = z2.union([z2.uuid(), z2.string().regex(/^note-[0-9a-f]{16}$/)]);
var annotationText = z2.string().trim().min(1).max(4e3);
var timestampSchema = z2.number().nonnegative().max(864e13);
var controlActionSchema = z2.enum(["pause", "resume"]);
var controlDeliverySchema = z2.enum(["sending", "accepted", "unknown"]);
var controlSchema = z2.object({
  action: controlActionSchema,
  delivery: controlDeliverySchema,
  outcome: z2.object({
    status: z2.enum(["applied", "completed", "unavailable", "answered", "superseded"]),
    at: z2.number().nonnegative()
  }).strict().nullable()
}).strict();
var annotationSchema = z2.object({
  id: annotationId,
  target: annotationTargetSchema,
  text: annotationText,
  createdAt: timestampSchema,
  reply: z2.object({ text: annotationText, createdAt: timestampSchema }).strict().nullable(),
  control: controlSchema.optional()
}).strict().refine((annotation) => annotation.control === void 0 || annotation.target.kind !== "report", {
  message: "Control requests address a task or tree"
});
var taskStateSchema = z2.object({
  id: taskId,
  parent: taskId.nullable(),
  title: z2.string().trim().min(1).max(120),
  description: z2.string().max(320),
  status: z2.enum(statuses),
  done: z2.tuple([z2.number().nonnegative(), z2.number().positive()]),
  timeShare: z2.number().positive(),
  remaining: z2.number().nonnegative().nullable(),
  mode: z2.enum(["serial", "parallel"]),
  note: z2.string().max(400),
  details: z2.string().max(4e3),
  priority: prioritySchema.default(null),
  createdAt: z2.number(),
  updatedAt: z2.number()
}).strict();
var taskRevisionSchema = taskStateSchema.omit({ id: true, createdAt: true, updatedAt: true, timeShare: true, remaining: true, mode: true }).extend({
  at: timestampSchema,
  progress: z2.number().min(0).max(1),
  previousProgress: z2.number().min(0).max(1).nullable(),
  weight: z2.number().positive()
});
var taskSchema = taskStateSchema.extend({ history: taskRevisionSchema.array().default([]) });
var patchSchema = taskSchema.omit({ createdAt: true, updatedAt: true, priority: true, history: true }).partial().extend({
  id: taskId,
  subtree: z2.boolean().optional()
}).strict();
var treeSchema = z2.object({
  id: treeId,
  title: z2.string().trim().min(1).max(120),
  description: z2.string().max(320),
  tasks: z2.array(taskSchema),
  createdAt: z2.number(),
  lastTaskUpdate: timestampSchema.optional()
}).strict();
var taskReceiptSchema = z2.object({
  version: z2.literal(1),
  tree: treeId,
  title: z2.string().min(1).max(120),
  branch: z2.string().max(120).nullable(),
  at: timestampSchema,
  previousAt: timestampSchema.nullable(),
  before: z2.number().min(0).max(1),
  after: z2.number().min(0).max(1),
  total: z2.number().int().positive().max(1e3),
  tasks: z2.array(
    z2.object({
      id: taskId,
      title: z2.string().min(1).max(120),
      note: z2.string().max(400),
      status: z2.enum(statuses),
      before: z2.number().min(0).max(1),
      after: z2.number().min(0).max(1)
    }).strict()
  ).min(1).max(6)
}).strict().refine((receipt) => receipt.total >= receipt.tasks.length);
var summarySchema = z2.object({
  progress: z2.array(z2.string().trim().min(1).max(600)).min(1).max(4),
  uncertainties: z2.array(z2.string().trim().min(1).max(600)).max(5),
  userActions: z2.array(z2.string().trim().min(1).max(600)).max(5)
}).strict();
var timeRangeSchema = z2.tuple([z2.number(), z2.number()]).refine(([start, end]) => end > start);
var activitySchema = z2.object({
  start: z2.number(),
  olderWorkMs: z2.number().nonnegative(),
  ranges: z2.array(timeRangeSchema),
  open: z2.number().nullable()
});
var reportSchema = z2.object({
  id: reportId,
  level: z2.number().int().min(0).max(4),
  start: timestampSchema,
  end: timestampSchema,
  // Coverage can precede generation; older reports use end for their elapsed threshold.
  createdAt: timestampSchema.optional(),
  policy: z2.string(),
  children: z2.array(reportId),
  source: z2.enum(["model", "no-activity"]),
  toolCount: z2.number().int().nonnegative(),
  covered: z2.number().int().nonnegative(),
  contextSeq: z2.number().int().nonnegative(),
  workMs: z2.number().nonnegative().optional(),
  ranges: z2.array(timeRangeSchema).optional(),
  summary: summarySchema
}).strict().refine(
  (report) => report.ranges?.every(([start, end]) => start >= report.start && end <= report.end) ?? true,
  {
    message: "Work ranges must stay inside report coverage"
  }
);
var viewSchema = z2.object({
  trees: z2.array(treeSchema),
  annotations: z2.array(annotationSchema).default([]),
  activeTreeId: treeId.nullable(),
  reports: z2.array(reportSchema),
  error: z2.string().nullable()
});
var importContinuationSchema = z2.object({ id: z2.uuid(), text: z2.string().min(1) });
var treeRecordSchema = z2.object({
  version: z2.literal(1),
  sessionId: z2.string(),
  callId: z2.string(),
  tree: treeSchema,
  receipt: taskReceiptSchema.nullable().optional()
});
var importRecordSchema = treeRecordSchema.extend({
  annotations: annotationSchema.array(),
  prepared: z2.literal(true).optional(),
  continuation: importContinuationSchema.optional()
});
var importReadySchema = z2.object({
  version: z2.literal(1),
  sessionId: z2.string(),
  callId: z2.string()
});
var removalRecordSchema = z2.object({ version: z2.literal(1), sessionId: z2.string(), treeId });
var selectionRecordSchema = z2.object({
  version: z2.literal(1),
  sessionId: z2.string(),
  callId: z2.string(),
  treeId
});
var annotationRecordSchema = z2.object({
  version: z2.literal(1),
  sessionId: z2.string(),
  annotation: annotationSchema
});
var replyRecordSchema = z2.object({
  version: z2.literal(1),
  sessionId: z2.string(),
  id: annotationId,
  text: annotationText,
  createdAt: z2.number().nonnegative()
});
var deliveryRecordSchema = z2.object({
  version: z2.literal(1),
  sessionId: z2.string(),
  id: annotationId,
  delivery: controlDeliverySchema.exclude(["sending"])
});
var priorityRecordSchema = z2.object({
  version: z2.literal(1),
  sessionId: z2.string(),
  treeId,
  taskId,
  priority: prioritySchema,
  createdAt: z2.number().nonnegative()
});
var reportRecordSchema = z2.object({
  version: z2.literal(1),
  sessionId: z2.string(),
  report: reportSchema
});
var failureRecordSchema = z2.object({
  version: z2.literal(1),
  sessionId: z2.string(),
  id: reportId,
  message: z2.string()
});
var requestRecordSchema = z2.object({
  version: z2.literal(1),
  sessionId: z2.string(),
  id: reportId,
  contextSeq: z2.number().int().nonnegative(),
  prefixLength: z2.number().int().nonnegative(),
  request: z2.json()
});
function newId(kind, hex = randomUUID().replaceAll("-", "")) {
  return `${kind}-${hex.slice(0, 16)}`;
}

// timeline/src/tasks.ts
var progressStates = ["done", "active", "pending", "blocked"];
function emptyParts() {
  return {
    done: { fraction: 0, leaves: 0, titles: [] },
    active: { fraction: 0, leaves: 0, titles: [] },
    pending: { fraction: 0, leaves: 0, titles: [] },
    blocked: { fraction: 0, leaves: 0, titles: [] }
  };
}
function remainderState(status) {
  return status === "active" || status === "blocked" ? status : "pending";
}
function patchTasks(previous, input, at, limit, source = "edit") {
  const patches = patchSchema.array().min(1).max(limit).parse(input);
  const tasks = new Map(previous.map((task2) => [task2.id, task2]));
  const seen = /* @__PURE__ */ new Set();
  for (const patch of patches) {
    if (patch.subtree === true && patch.status !== "retired")
      throw new Error('subtree:true requires status:"retired" and a note to retire the branch');
    if (seen.has(patch.id)) throw new Error(`Duplicate task ${patch.id}`);
    seen.add(patch.id);
    const before = tasks.get(patch.id);
    const done = patch.done ?? before?.done ?? [0, 1];
    if (done[0] > done[1]) throw new Error("Completed units cannot exceed total units");
    const status = patch.status ?? (patch.done === void 0 ? before?.status ?? "pending" : done[0] === done[1] ? "done" : done[0] > 0 ? "active" : "pending");
    if (before !== void 0 && (patch.status !== void 0 || patch.done !== void 0 || patch.parent !== void 0 || patch.timeShare !== void 0 || patch.remaining !== void 0) && !patch.note?.trim())
      throw new Error(`Task ${patch.id} needs a note explaining its change`);
    if (source === "edit" && ["blocked", "paused", "retired"].includes(status) && !patch.note?.trim() && before?.status !== status)
      throw new Error(`Task ${patch.id} needs a reason`);
    if (before?.status === "retired" && patch.status === void 0)
      throw new Error("Restoring a task needs an explicit status");
    const task2 = taskSchema.parse({
      id: patch.id,
      parent: patch.parent === void 0 ? before?.parent ?? null : patch.parent,
      title: patch.title ?? before?.title,
      description: patch.description ?? before?.description ?? "",
      status,
      done: status === "done" ? [done[1], done[1]] : done,
      timeShare: patch.timeShare ?? before?.timeShare ?? 1,
      remaining: status === "done" ? 0 : patch.remaining === void 0 ? before?.remaining ?? null : patch.remaining,
      mode: patch.mode ?? before?.mode ?? "serial",
      note: patch.note ?? before?.note ?? "",
      details: patch.details ?? before?.details ?? "",
      priority: before?.priority ?? null,
      history: before?.history ?? [],
      createdAt: before?.createdAt ?? at,
      updatedAt: at
    });
    if (status === "pending" && task2.done[0] !== 0)
      throw new Error("Pending tasks cannot have completed units");
    if (status === "done" && patch.remaining !== void 0 && patch.remaining !== 0)
      throw new Error("Done tasks have no remaining work");
    tasks.set(task2.id, task2);
  }
  if (tasks.size > limit) throw new Error(`At most ${limit} tasks per tree`);
  const parentOf = (id2) => {
    const ancestor = tasks.get(id2);
    if (ancestor === void 0) throw new Error(`Unknown parent ${id2}`);
    return ancestor.parent;
  };
  for (const task2 of tasks.values()) {
    const ancestors = /* @__PURE__ */ new Set([task2.id]);
    let parent = task2.parent;
    while (parent !== null) {
      if (ancestors.has(parent)) throw new Error("Task tree contains a cycle");
      ancestors.add(parent);
      parent = parentOf(parent);
    }
  }
  for (const patch of patches) {
    if (patch.status !== "retired" || !patch.subtree) continue;
    for (const task2 of tasks.values()) {
      let parent = task2.parent;
      while (parent !== null) {
        if (parent === patch.id) {
          tasks.set(task2.id, { ...task2, status: "retired", updatedAt: at });
          break;
        }
        parent = parentOf(parent);
      }
    }
  }
  for (const task2 of tasks.values()) {
    if (task2.status === "retired") continue;
    if (task2.parent !== null && tasks.get(task2.parent)?.status === "retired")
      throw new Error("Retire the subtree or move its children");
    const children = [...tasks.values()].filter(
      (child) => child.parent === task2.id && child.status !== "retired"
    );
    if (children.length === 0) continue;
    const patch = patches.find((item) => item.id === task2.id);
    if (patch?.done !== void 0 || patch?.remaining !== void 0 || patch?.status !== void 0) {
      throw new Error(
        `Group ${task2.id} derives progress and status from children. Keep the group; retry with state changes only on its leaves.`
      );
    }
    tasks.set(task2.id, { ...task2, done: [0, 1], remaining: null });
  }
  const result = [...tasks.values()];
  const measures = measureAll(result);
  return result.map((task2) => {
    const measure = measures.get(task2.id);
    return measure === void 0 || measure.status === task2.status ? task2 : { ...task2, status: measure.status };
  });
}
function recordTaskHistory(previous, tasks, at) {
  const before = new Map(previous.map((task2) => [task2.id, task2]));
  const oldMeasures = measureAll(previous);
  const measures = measureAll(tasks);
  const snapshot = (task2, measure) => ({
    parent: task2.parent,
    title: task2.title,
    description: task2.description,
    status: task2.status === "retired" ? "retired" : measure?.status ?? task2.status,
    progress: measure?.progress ?? task2.done[0] / task2.done[1],
    done: [...task2.done],
    weight: task2.timeShare,
    note: task2.note,
    details: "",
    priority: task2.priority
  });
  return tasks.map((task2) => {
    const old = before.get(task2.id);
    const current = snapshot(task2, measures.get(task2.id));
    const prior = old === void 0 ? void 0 : snapshot(old, oldMeasures.get(old.id));
    const history = old?.history ?? task2.history;
    const detailsChanged = task2.details !== (old?.details ?? "");
    return {
      ...task2,
      history: !detailsChanged && JSON.stringify(current) === JSON.stringify(prior) ? history : [...history, {
        ...current,
        // The full details stay in the task record. Revisions carry only a changed preview.
        details: detailsChanged ? task2.details.slice(0, 400) : "",
        at,
        previousProgress: prior?.progress ?? null
      }]
    };
  });
}
function prioritiesOf(tasks) {
  const byId = new Map(tasks.map((task2) => [task2.id, task2]));
  const result = /* @__PURE__ */ new Map();
  const visit = (task2) => {
    if (result.has(task2.id)) return result.get(task2.id) ?? null;
    const parent = task2.parent === null ? void 0 : byId.get(task2.parent);
    const priority = task2.priority ?? (parent === void 0 ? null : visit(parent));
    result.set(task2.id, priority);
    return priority;
  };
  for (const task2 of tasks) visit(task2);
  return result;
}
function prioritizedTasks(trees, limit = 12) {
  return trees.flatMap((tree) => {
    const priorities2 = prioritiesOf(tree.tasks);
    const parents = new Set(
      tree.tasks.filter((task2) => task2.status !== "retired").map((task2) => task2.parent)
    );
    return tree.tasks.filter((task2) => !parents.has(task2.id) && (task2.status === "active" || task2.status === "pending")).flatMap((task2) => {
      const priority = priorities2.get(task2.id) ?? null;
      return priority === null ? [] : [{ tree: tree.id, task: task2.id, title: task2.title, priority, status: task2.status }];
    });
  }).sort((a, b) => a.priority.localeCompare(b.priority)).slice(0, limit);
}
function measureAll(tasks, withParts = false) {
  const children = /* @__PURE__ */ new Map();
  for (const task2 of tasks) {
    if (task2.status === "retired") continue;
    const siblings = children.get(task2.parent);
    if (siblings === void 0) children.set(task2.parent, [task2]);
    else siblings.push(task2);
  }
  const result = /* @__PURE__ */ new Map();
  const visit = (id2, mode) => {
    const rows = children.get(id2);
    if (rows === void 0) return void 0;
    const values = rows.map((task2) => {
      const value2 = visit(task2.id, task2.mode) ?? {
        progress: task2.status === "done" ? 1 : task2.done[0] / task2.done[1],
        remaining: task2.status === "done" ? 0 : task2.remaining,
        status: task2.status
      };
      if (withParts && value2.parts === void 0) {
        value2.parts = emptyParts();
        value2.parts.done.fraction = value2.progress;
        value2.parts[remainderState(value2.status)].fraction = 1 - value2.progress;
        const part = value2.parts[value2.status === "done" ? "done" : remainderState(value2.status)];
        part.leaves = 1;
        part.titles = [task2.title];
      }
      result.set(task2.id, value2);
      return { task: task2, value: value2 };
    });
    const largest = Math.max(...rows.map((task2) => task2.timeShare));
    const total = values.reduce((sum, { task: task2 }) => sum + task2.timeShare / largest, 0);
    const states = values.map(({ value: value2 }) => value2.status);
    const status = states.every((state) => state === "done") ? "done" : states.includes("active") ? "active" : states.includes("blocked") ? "blocked" : states.includes("paused") ? "paused" : "pending";
    const durations = values.map(({ value: value2 }) => value2.remaining ?? 0);
    const value = {
      progress: status === "done" ? 1 : Math.min(
        0.9999,
        values.reduce(
          (sum, { task: task2, value: item }) => sum + task2.timeShare / largest * item.progress,
          0
        ) / total
      ),
      remaining: values.some(({ value: item }) => item.remaining === null) ? null : mode === "parallel" ? Math.max(...durations) : durations.reduce((sum, duration) => sum + duration, 0),
      status
    };
    if (withParts) {
      const parts = emptyParts();
      for (const { task: task2, value: item } of values) {
        const childParts = item.parts;
        for (const state of progressStates) {
          const part = childParts[state];
          parts[state].fraction += task2.timeShare / largest / total * part.fraction;
          parts[state].leaves += part.leaves;
          parts[state].titles.push(...part.titles.slice(0, 6 - parts[state].titles.length));
        }
      }
      parts.done.fraction = value.progress;
      const rest = parts.active.fraction + parts.pending.fraction + parts.blocked.fraction;
      for (const state of ["active", "pending", "blocked"])
        parts[state].fraction = rest === 0 ? 0 : parts[state].fraction / rest * (1 - value.progress);
      if (rest === 0) parts[remainderState(status)].fraction = 1 - value.progress;
      value.parts = parts;
    }
    result.set(id2, value);
    return value;
  };
  visit(null, "serial");
  return result;
}

// timeline/src/controls.ts
var CONTROL_WAIT_MS = 2 * 6e4;
function controlTargetsOverlap(left, right, trees) {
  if (left.kind === "report" || right.kind === "report" || left.tree !== right.tree) return false;
  if (left.kind === "tree" || right.kind === "tree") return true;
  const tree = trees.find((tree2) => tree2.id === left.tree);
  const contains = (parent, child) => {
    const seen = /* @__PURE__ */ new Set();
    let id2 = child;
    while (id2 !== null && !seen.has(id2)) {
      if (id2 === parent) return true;
      seen.add(id2);
      id2 = tree?.tasks.find((task2) => task2.id === id2)?.parent ?? null;
    }
    return false;
  };
  return contains(left.task, right.task) || contains(right.task, left.task);
}
function pendingControl(annotations, target, trees, now) {
  return annotations.findLast(
    (item) => item.control?.outcome === null && now - item.createdAt < CONTROL_WAIT_MS && controlTargetsOverlap(item.target, target, trees)
  );
}
function scopedLeaves(tree, target) {
  if (target.kind === "task" && !tree.tasks.some((task2) => task2.id === target.task && task2.status !== "retired"))
    return;
  const ids = /* @__PURE__ */ new Set();
  if (target.kind === "task") ids.add(target.task);
  for (let size = -1; size !== ids.size; ) {
    size = ids.size;
    for (const task2 of tree.tasks) if (task2.parent !== null && ids.has(task2.parent)) ids.add(task2.id);
  }
  const parents = new Set(tree.tasks.filter((task2) => task2.status !== "retired").map((task2) => task2.parent));
  return tree.tasks.filter(
    (task2) => task2.status !== "retired" && !parents.has(task2.id) && (target.kind === "tree" || ids.has(task2.id))
  );
}
function reconcileControl(annotation, trees, at) {
  const { control, target } = annotation;
  if (control === void 0 || target.kind === "report" || control.outcome !== null && control.outcome.status !== "answered")
    return annotation;
  const tree = trees.find((tree2) => tree2.id === target.tree);
  const leaves = tree === void 0 ? void 0 : scopedLeaves(tree, target);
  const unfinished = leaves?.filter((task2) => task2.status !== "done");
  const status = leaves === void 0 || leaves.length === 0 ? "unavailable" : unfinished?.length === 0 ? "completed" : control.action === "pause" ? unfinished?.every((task2) => task2.status === "paused" || task2.status === "blocked") ? "applied" : null : unfinished?.some((task2) => task2.status === "active") ? "applied" : null;
  if (status === null) return annotation;
  return {
    ...annotation,
    control: { ...control, outcome: { status, at: Math.max(annotation.createdAt, at) } }
  };
}

// timeline/src/projection.ts
var stateSchema = z3.object({
  sessionId: z3.string(),
  inherited: z3.number().int().nonnegative(),
  hasTurn: z3.boolean().default(false),
  toolCount: z3.number().int().nonnegative(),
  covered: z3.number().int().nonnegative(),
  lastReportEnd: z3.number(),
  activity: activitySchema,
  preparedImport: importRecordSchema.nullable(),
  calls: z3.array(z3.object({
    id: z3.string(),
    tree: treeId,
    receipt: taskReceiptSchema.nullable().optional(),
    continuation: importContinuationSchema.optional(),
    notified: z3.literal(true).optional()
  })).max(64).default([]),
  view: viewSchema
});
async function registerProjection(ctx) {
  return ctx.sessionProjections.register(createProjection());
}
function retainActivity(activity, time, coveredUntil, baseSaved = false) {
  const start = Math.max(activity.start, time - HISTORY_MS);
  let olderWorkMs = baseSaved ? 0 : activity.olderWorkMs;
  const ranges = [];
  for (const [from, to] of activity.ranges) {
    olderWorkMs += Math.max(0, Math.min(to, start) - Math.max(from, coveredUntil));
    if (to > start) ranges.push([Math.max(from, start), to]);
  }
  return { ...activity, start, olderWorkMs, ranges };
}
function createProjection() {
  return {
    key: "timeline",
    stateVersion: 9,
    stateSchema,
    wire: { viewSchema, view: (state) => state.view, summary: false },
    init: (header, inherited) => ({
      sessionId: header.id,
      inherited,
      hasTurn: inherited > 0 || header.isSeeded,
      toolCount: 0,
      covered: 0,
      lastReportEnd: header.createdAt,
      activity: { start: header.createdAt, olderWorkMs: 0, ranges: [], open: null },
      preparedImport: null,
      calls: [],
      view: {
        trees: [],
        annotations: [],
        activeTreeId: null,
        reports: [],
        error: null
      }
    }),
    apply: (state, event) => {
      if (event.type === "session/end-seed" && event.data.inherited === true) {
        const annotations = state.view.annotations.filter(
          (note) => note.control?.outcome !== null && note.control?.outcome.status !== "answered"
        );
        return { ...state, calls: [], preparedImport: null, view: { ...state.view, annotations } };
      }
      if (event.seq < state.inherited) {
        const record2 = pluginRecordOf(event);
        if (record2?.type.startsWith("plugin:timeline/") !== true) return state;
        if (record2.type === "plugin:timeline/report" || record2.type === "plugin:timeline/failure") return state;
        if (typeof record2.data !== "object" || record2.data === null) return state;
        return foldRecord(state, { type: record2.type, data: { ...record2.data, sessionId: state.sessionId } });
      }
      const { activity } = state;
      if (event.type === "turn/start")
        return {
          ...state,
          hasTurn: true,
          activity: { ...activity, open: event.time }
        };
      if (event.type === "turn/end" && activity.open !== null)
        return {
          ...state,
          activity: retainActivity({
            ...activity,
            open: null,
            ranges: mergeRanges([...activity.ranges, [activity.open, event.time]])
          }, event.time, state.lastReportEnd)
        };
      if (event.type === "tool/call") return { ...state, toolCount: state.toolCount + 1 };
      if (event.type === "agent/inbox/spliced" && event.data.inserted.length > 0) {
        const ids = new Set(event.data.inserted.map((message) => message.id));
        if (state.calls.some((call) => call.continuation !== void 0 && !call.notified && ids.has(call.continuation.id)))
          return {
            ...state,
            calls: state.calls.map((call) => call.continuation !== void 0 && ids.has(call.continuation.id) ? { ...call, notified: true } : call)
          };
      }
      const record = pluginRecordOf(event);
      if (record === void 0) return state;
      return foldRecord(state, record);
    }
  };
}
function foldRecord(state, record) {
  if (record.type === "plugin:timeline/import" || record.type === "plugin:timeline/import-ready") {
    let data;
    if (record.type === "plugin:timeline/import-ready") {
      const marker = importReadySchema.safeParse(record.data).data;
      if (marker?.sessionId !== state.sessionId || state.preparedImport?.callId !== marker.callId) return state;
      data = state.preparedImport;
    } else {
      data = importRecordSchema.safeParse(record.data).data;
    }
    if (data?.sessionId !== state.sessionId || state.view.annotations.length + data.annotations.length > MAX_ANNOTATIONS) return state;
    const ids = new Set(state.view.annotations.map((note) => note.id));
    for (const note of data.annotations) {
      const target = note.target;
      if (ids.has(note.id) || note.control !== void 0 || target.kind === "report" || target.tree !== data.tree.id || target.kind === "task" && !data.tree.tasks.some((task2) => task2.id === target.task))
        return state;
      ids.add(note.id);
    }
    if (record.type === "plugin:timeline/import" && data.prepared) return { ...state, preparedImport: data };
    const next = applyTree(state, data, data);
    return {
      ...next,
      preparedImport: record.type === "plugin:timeline/import-ready" ? null : next.preparedImport,
      view: { ...next.view, annotations: [...next.view.annotations, ...data.annotations] }
    };
  }
  if (record.type === "plugin:timeline/remove") {
    const { data } = removalRecordSchema.safeParse(record.data);
    if (data?.sessionId !== state.sessionId) return state;
    const index = state.view.trees.findIndex((tree) => tree.id === data.treeId);
    if (index < 0) return state;
    const trees = state.view.trees.filter((tree) => tree.id !== data.treeId);
    return {
      ...state,
      view: {
        ...state.view,
        trees,
        activeTreeId: state.view.activeTreeId === data.treeId ? trees[index]?.id ?? trees.at(-1)?.id ?? null : state.view.activeTreeId,
        annotations: state.view.annotations.filter(
          (note) => note.target.kind === "report" || note.target.tree !== data.treeId
        )
      }
    };
  }
  if (record.type === "plugin:timeline/annotation") {
    const { data } = annotationRecordSchema.safeParse(record.data);
    if (data?.sessionId !== state.sessionId || data.annotation.reply !== null) return state;
    if (data.annotation.control !== void 0 && (data.annotation.control.delivery !== "sending" || data.annotation.control.outcome !== null))
      return state;
    const target = data.annotation.target;
    const exists = target.kind === "report" ? state.view.reports.some((report) => report.id === target.report) : state.view.trees.some(
      (tree) => tree.id === target.tree && (target.kind === "tree" || tree.tasks.some((task2) => task2.id === target.task && task2.status !== "retired"))
    );
    if (!exists || state.view.annotations.length >= MAX_ANNOTATIONS || state.view.annotations.some((annotation2) => annotation2.id === data.annotation.id)) return state;
    const annotation = reconcileControl(data.annotation, state.view.trees, data.annotation.createdAt);
    const annotations = state.view.annotations.map((item) => {
      if (annotation.control === void 0 || item.control === void 0 || item.control.outcome !== null && item.control.outcome.status !== "answered" || !controlTargetsOverlap(item.target, annotation.target, state.view.trees))
        return item;
      return {
        ...item,
        control: { ...item.control, outcome: { status: "superseded", at: annotation.createdAt } }
      };
    });
    return { ...state, view: { ...state.view, annotations: [...annotations, annotation] } };
  }
  if (record.type === "plugin:timeline/delivery") {
    const { data } = deliveryRecordSchema.safeParse(record.data);
    if (data?.sessionId !== state.sessionId) return state;
    const annotation = state.view.annotations.find((item) => item.id === data.id);
    if (annotation?.control?.delivery !== "sending") return state;
    return {
      ...state,
      view: {
        ...state.view,
        annotations: state.view.annotations.map(
          (item) => item.id !== data.id || item.control === void 0 ? item : { ...item, control: { ...item.control, delivery: data.delivery } }
        )
      }
    };
  }
  if (record.type === "plugin:timeline/reply") {
    const { data } = replyRecordSchema.safeParse(record.data);
    if (data?.sessionId !== state.sessionId) return state;
    const annotation = state.view.annotations.find((annotation2) => annotation2.id === data.id);
    if (annotation === void 0 || annotation.reply !== null) return state;
    return {
      ...state,
      view: {
        ...state.view,
        annotations: state.view.annotations.map(
          (item) => item.id !== data.id ? item : reconcileControl(
            {
              ...item,
              reply: { text: data.text, createdAt: data.createdAt },
              ...item.control === void 0 ? {} : {
                control: {
                  ...item.control,
                  outcome: item.control.outcome ?? { status: "answered", at: data.createdAt }
                }
              }
            },
            state.view.trees,
            data.createdAt
          )
        )
      }
    };
  }
  if (record.type === "plugin:timeline/priority") {
    const { data } = priorityRecordSchema.safeParse(record.data);
    const tree = state.view.trees.find((tree2) => tree2.id === data?.treeId);
    const task2 = tree?.tasks.find((task3) => task3.id === data?.taskId);
    if (data?.sessionId !== state.sessionId || tree === void 0 || task2 === void 0 || task2.status === "retired")
      return state;
    return {
      ...state,
      view: {
        ...state.view,
        trees: state.view.trees.map(
          (item) => item.id !== tree.id ? item : {
            ...item,
            tasks: recordTaskHistory(item.tasks, item.tasks.map(
              (item2) => item2.id === task2.id ? { ...item2, priority: data.priority, updatedAt: data.createdAt } : item2
            ), data.createdAt)
          }
        )
      }
    };
  }
  if (record.type === "plugin:timeline/tree") {
    const { data } = treeRecordSchema.safeParse(record.data);
    if (data?.sessionId !== state.sessionId) return state;
    return applyTree(state, data);
  }
  if (record.type === "plugin:timeline/select") {
    const { data } = selectionRecordSchema.safeParse(record.data);
    if (data?.sessionId !== state.sessionId || !state.view.trees.some((tree) => tree.id === data.treeId))
      return state;
    return {
      ...state,
      calls: [
        ...state.calls.filter((call) => call.id !== data.callId),
        { id: data.callId, tree: data.treeId }
      ].slice(-64),
      view: { ...state.view, activeTreeId: data.treeId }
    };
  }
  if (record.type === "plugin:timeline/report") {
    const { data } = reportRecordSchema.safeParse(record.data);
    if (data?.sessionId !== state.sessionId || data.report.end < data.report.start) return state;
    const report = data.report;
    const newestEnd = Math.max(state.lastReportEnd, report.end);
    const cutoff = newestEnd - HISTORY_MS;
    const lastReportEnd = report.level === 0 ? newestEnd : state.lastReportEnd;
    const limit = 5 * Math.ceil(HISTORY_MS / MINUTE_MS);
    const previous = state.view.reports;
    const reports = previous.filter((item) => item.id !== report.id && item.end >= cutoff);
    reports.push(report);
    if (reports.length > limit) reports.splice(0, reports.length - limit);
    const { annotations } = state.view;
    const ids = reports.length <= previous.length && annotations.some((note) => note.target.kind === "report") ? new Set(reports.map((item) => item.id)) : void 0;
    return {
      ...state,
      covered: report.level === 0 ? Math.max(state.covered, Math.min(state.toolCount, report.covered)) : state.covered,
      lastReportEnd,
      activity: retainActivity(state.activity, newestEnd, lastReportEnd, report.level === 0 && report.end >= state.activity.start),
      view: {
        ...state.view,
        error: null,
        reports,
        annotations: ids === void 0 ? annotations : annotations.filter((note) => note.target.kind !== "report" || ids.has(note.target.report))
      }
    };
  }
  if (record.type === "plugin:timeline/failure") {
    const { data } = failureRecordSchema.safeParse(record.data);
    if (data?.sessionId !== state.sessionId) return state;
    return { ...state, view: { ...state.view, error: data.message } };
  }
  return state;
}
function applyTree(state, data, imported) {
  const before = state.view.trees.find((tree2) => tree2.id === data.tree.id);
  const at = Math.max(data.tree.createdAt, ...data.tree.tasks.map((task2) => task2.updatedAt));
  const tree = imported === void 0 ? { ...data.tree, tasks: recordTaskHistory(before?.tasks ?? [], data.tree.tasks, at) } : before ?? data.tree;
  const trees = before === void 0 ? [...state.view.trees, tree] : state.view.trees.map((item) => item.id === tree.id ? tree : item);
  return {
    ...state,
    calls: [
      ...state.calls.filter((call) => call.id !== data.callId),
      {
        id: data.callId,
        tree: data.tree.id,
        ...data.receipt === void 0 ? {} : { receipt: data.receipt },
        ...imported?.continuation === void 0 ? {} : { continuation: imported.continuation }
      }
    ].slice(-64),
    view: {
      ...state.view,
      activeTreeId: data.tree.id,
      trees,
      annotations: state.view.annotations.map(
        (item) => item.target.kind !== "report" && item.target.tree === data.tree.id ? reconcileControl(item, trees, at) : item
      )
    }
  };
}

// timeline/src/tools.ts
import { createHash } from "node:crypto";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { z as z4 } from "zod";

// timeline/src/receipts.ts
function taskReceipt(tree, tasks, patches, at) {
  const before = new Map(tree.tasks.map((task2) => [task2.id, task2]));
  const edited = new Set(patches.map((patch) => patch.id));
  const fields = [
    "parent",
    "title",
    "description",
    "status",
    "done",
    "timeShare",
    "remaining",
    "mode",
    "note",
    "details"
  ];
  const changes = tasks.filter((task2) => {
    const previous = before.get(task2.id);
    if (!edited.has(task2.id) && !(task2.status === "retired" && previous?.status !== "retired")) return false;
    return previous === void 0 || fields.some((field) => JSON.stringify(task2[field]) !== JSON.stringify(previous[field]));
  });
  if (changes.length === 0) return null;
  const oldMeasures = measureAll(tree.tasks);
  const measures = measureAll(tasks);
  const parent = changes[0]?.parent;
  return {
    version: 1,
    tree: tree.id,
    title: tree.title,
    branch: parent != null && changes.every((task2) => task2.parent === parent) ? tasks.find((task2) => task2.id === parent)?.title ?? null : null,
    at,
    previousAt: tree.lastTaskUpdate ?? null,
    before: oldMeasures.get(null)?.progress ?? 0,
    after: measures.get(null)?.progress ?? 0,
    total: changes.length,
    tasks: changes.slice(0, 6).map((task2) => ({
      id: task2.id,
      title: task2.title,
      note: task2.note || task2.description,
      status: task2.status === "retired" ? "retired" : measures.get(task2.id)?.status ?? task2.status,
      before: oldMeasures.get(task2.id)?.progress ?? 0,
      after: measures.get(task2.id)?.progress ?? task2.done[0] / task2.done[1]
    }))
  };
}

// timeline/src/error.ts
import { HarnessError } from "@deepseek-ai/dsh-error";
var TimelineError = class extends HarnessError {
  constructor(message, code = "TIMELINE_INVALID_ARGUMENT", options) {
    super(message, code, options);
  }
};
function parseArgument(schema2, value, field) {
  const parsed = schema2.safeParse(value);
  if (parsed.success) return parsed.data;
  const detail = parsed.error.issues.slice(0, 1).map(
    ({ path, message }) => ` ${[field, ...path].join(".")}: ${message}`
  ).join("");
  throw new TimelineError(`Invalid Timeline argument.${detail}`, "TIMELINE_INVALID_ARGUMENT", { cause: parsed.error });
}

// timeline/src/tools.ts
var output = {
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { content: { type: "string", required: true } }
  },
  render: (_args, value) => [{ type: "text", text: value.content }]
};
var taskOutputSchema = {
  ...output.schema,
  properties: { ...output.schema.properties, receipt: { type: "json", required: true } }
};
var taskOutput = {
  schema: taskOutputSchema,
  render: output.render,
  presentationMeta: (_args, value) => ({
    timeline: value.receipt
  })
};
function installTools(ctx, config, storage) {
  const ownerOf = async (session) => await ctx.get("mekTimelineRoomOwner")?.sessionFor(session.id) ?? session;
  ctx.effect(
    () => ctx.tools.register(
      defineTool({
        name: "timeline_tree",
        description: "Start and select a new task tree, or select an existing tree for the goal. Add or edit tasks with timeline_tasks.",
        parameters: {
          action: { type: "string", required: true, enum: ["start", "select"] },
          id: {
            type: "string",
            description: "Existing tree ID. Required for select. The host assigns IDs on start."
          },
          title: {
            type: "string",
            description: "For start only. Required short goal label, usually 2–5 words, at most 120 characters."
          },
          description: {
            type: "string",
            description: "For start only. Optional purpose, at most 320 characters."
          }
        },
        output,
        async execute(args, exec) {
          if (exec.agent === void 0) throw new TimelineError("timeline_tree requires an agent session");
          const session = await ownerOf(exec.agent.session);
          if (!await ctx.sessions.flush(session))
            throw new TimelineError("Timeline requires durable session persistence", "TIMELINE_PERSISTENCE");
          if (args.action === "start") {
            if (args.id?.trim()) throw new TimelineError("The host assigns new tree IDs");
            const title = parseArgument(z4.string().trim().min(1).max(120), args.title, "title");
            const description = parseArgument(z4.string().trim().max(320), args.description ?? "", "description");
            const id2 = treeId.parse(newId("tree", createHash("sha256").update(exec.callId).digest("hex")));
            await storage.append(session, "plugin:timeline/tree", (state) => {
              if (state.calls.some((call) => call.id === exec.callId)) return;
              if (!state.view.trees.some((tree) => tree.id === id2)) {
                if (state.view.trees.length >= config.maxTrees)
                  throw new TimelineError(`At most ${config.maxTrees} task trees`);
                return {
                  version: 1,
                  sessionId: session.id,
                  callId: exec.callId,
                  tree: { id: id2, title, description, tasks: [], createdAt: Date.now() }
                };
              }
              return void 0;
            });
          } else {
            if (args.title !== void 0 || args.description !== void 0)
              throw new TimelineError("Select accepts only an ID");
            const id2 = parseArgument(treeId, args.id, "id");
            await storage.append(session, "plugin:timeline/select", (state) => {
              if (state.calls.some((call) => call.id === exec.callId)) return;
              if (!state.view.trees.some((tree) => tree.id === id2)) throw new TimelineError("Unknown task tree");
              return {
                version: 1,
                sessionId: session.id,
                callId: exec.callId,
                treeId: id2
              };
            });
          }
          return {
            content: JSON.stringify({
              activeTree: storage.stateOf(session).view.activeTreeId,
              trees: storage.stateOf(session).view.trees.map(({ id: id2, title }) => ({ id: id2, title }))
            })
          };
        },
        presentCall: (args) => ({
          card: "generic",
          title: "Timeline task tree",
          kind: "other",
          rawInput: args.title ?? args.id
        })
      })
    ),
    "timeline: tree tool"
  );
  ctx.effect(() => {
    const tool = defineTool({
      name: "timeline_tasks",
      description: "Patch tasks in one tree. Send parents and children in the same batch when adding a branch. Groups derive status and progress from their leaves. The batch is atomic and omitted tasks and fields stay unchanged.",
      parameters: {
        tree: {
          type: "string",
          description: "Existing tree ID. Defaults to the selected tree. The write selects this tree."
        },
        tasks: {
          type: "array",
          required: true,
          description: "Nonempty batch. New tasks need id and title; updates need id and changed fields.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: {
                type: "string",
                required: true,
                description: "Stable task ID within this tree, 1–80 characters. Example: check-save. Reuse it for updates."
              },
              parent: {
                oneOf: [{ type: "string" }, { type: "null" }],
                description: "Parent task ID in this tree. Omit for a new root or to keep the parent on update. Use null to move to the root."
              },
              title: {
                type: "string",
                description: "Required for new tasks: 1–120 characters. Optional for updates."
              },
              description: { type: "string", description: "Task scope, at most 320 characters." },
              status: {
                type: "string",
                enum: [...statuses],
                description: "Leaf state. pending means not started, paused means deferred, blocked means waiting for a dependency, and retired means removed from the plan. For groups, omit status unless retiring with subtree: true."
              },
              done: {
                type: "array",
                items: { type: "number" },
                description: "Leaf only. [completed, total], with 0 ≤ completed ≤ total and total > 0. If status is omitted, this sets pending, active, or done. Status done completes all units."
              },
              weight: {
                type: "number",
                description: "Relative effort among siblings, including top-level tasks. A group’s weight covers all its work. Children divide that share. A group with weight 3 beside a task with weight 1 keeps its 75% share when you split its existing work into children. Use positive numbers, including fractions. New tasks default to 1."
              },
              note: {
                type: "string",
                description: "Brief result or reason, at most 400 characters. Name what changed. Required when updating status, done, parent, or weight on an existing task, or entering paused, blocked, or retired."
              },
              details: {
                type: "string",
                description: "Explain the result, evidence, limits, and impact on the goal in 2–4 self-contained sentences, at most 4000 characters."
              },
              subtree: {
                type: "boolean",
                description: "With status retired, retire all descendants too. Omit for other updates."
              }
            }
          }
        }
      },
      output: taskOutput,
      async execute(args, exec) {
        if (exec.agent === void 0) throw new TimelineError("timeline_tasks requires an agent session");
        const session = await ownerOf(exec.agent.session);
        if (!await ctx.sessions.flush(session))
          throw new TimelineError("Timeline requires durable session persistence", "TIMELINE_PERSISTENCE");
        const patches = parseArgument(
          patchSchema.array(),
          args.tasks.map(({ weight, ...patch }) => ({
            ...patch,
            ...weight === void 0 ? {} : { timeShare: weight }
          })),
          "tasks"
        );
        const requested = args.tree === void 0 ? void 0 : parseArgument(treeId, args.tree, "tree");
        let edited;
        let receipt = null;
        await storage.append(session, "plugin:timeline/tree", (state) => {
          const previous = state.calls.find((call) => call.id === exec.callId);
          if (previous !== void 0) {
            edited = previous.tree;
            receipt = previous.receipt ?? null;
            return;
          }
          const tree = state.view.trees.find((item) => item.id === (requested ?? state.view.activeTreeId));
          if (tree === void 0)
            throw new TimelineError(
              requested === void 0 ? "Start a tree with timeline_tree first" : "Unknown task tree"
            );
          edited = tree.id;
          const at = Date.now();
          let tasks;
          try {
            tasks = patchTasks(tree.tasks, patches, at, config.maxTasks);
          } catch (error) {
            throw new TimelineError(error instanceof Error ? error.message : "Invalid task update", "TIMELINE_INVALID_ARGUMENT", { cause: error });
          }
          receipt = taskReceipt(tree, tasks, patches, at);
          return {
            version: 1,
            sessionId: session.id,
            callId: exec.callId,
            tree: { ...tree, tasks: tasks.map((task2) => ({ ...task2, history: [] })), ...receipt === null ? {} : { lastTaskUpdate: at } },
            receipt
          };
        });
        const { trees } = storage.stateOf(session).view;
        const current = trees.find((item) => item.id === edited);
        const progress = current && measureAll(current.tasks).get(null);
        return {
          receipt,
          content: JSON.stringify({
            tree: edited,
            progress: progress === void 0 ? null : { progress: progress.progress, status: progress.status },
            priorities: prioritizedTasks(trees)
          })
        };
      },
      presentCall: (args) => ({
        card: "generic",
        title: "Update Timeline tasks",
        kind: "other",
        rawInput: args.tasks
      })
    });
    const description = tool.description;
    Object.defineProperty(tool, "description", {
      enumerable: true,
      get: () => {
        const prompt = config.taskPrompt.trim();
        return prompt ? `${description}

Task writing guidance:
${prompt}` : description;
      }
    });
    return ctx.tools.register(tool);
  }, "timeline: task tool");
  ctx.effect(
    () => ctx.tools.register(
      defineTool({
        name: "timeline_pull",
        description: "Check what remains before closing the current goal. Returns active or pending leaves in priority order, or blocked leaves if none are runnable. Paused leaves are counted but never suggested.",
        parameters: {
          tree: {
            type: "string",
            description: "Existing tree for the current goal; defaults to the selected tree. Does not select it."
          },
          limit: {
            type: "integer",
            description: `Maximum suggestions, 1–${config.maxTasks}. Default ${Math.min(12, config.maxTasks)}. hasMore indicates more candidates in the same category.`
          }
        },
        output,
        async execute(args, exec) {
          if (exec.agent === void 0) throw new TimelineError("timeline_pull requires an agent session");
          const { view } = storage.stateOf(await ownerOf(exec.agent.session));
          const id2 = args.tree === void 0 ? view.activeTreeId : parseArgument(treeId, args.tree, "tree");
          const tree = view.trees.find((item) => item.id === id2);
          if (args.tree !== void 0 && tree === void 0) throw new TimelineError("Unknown task tree");
          const limit = parseArgument(
            z4.number().int().min(1).max(config.maxTasks),
            args.limit ?? Math.min(12, config.maxTasks),
            "limit"
          );
          const readable = tree === void 0 ? null : readableTree(tree);
          const leaves = readable?.tasks.filter(
            (task2) => task2.kind === "leaf" && task2.status !== "retired"
          ) ?? [];
          const counts = { active: 0, pending: 0, blocked: 0, paused: 0, done: 0 };
          for (const task2 of leaves) counts[task2.status]++;
          const work = leaves.filter((task2) => task2.status === "active" || task2.status === "pending");
          const blocked = leaves.filter((task2) => task2.status === "blocked");
          const candidates = (work.length === 0 ? blocked : work).sort(
            (a, b) => (a.effectivePriority ?? "P4").localeCompare(b.effectivePriority ?? "P4") || Number(b.status === "active") - Number(a.status === "active")
          );
          return Promise.resolve({
            content: JSON.stringify({
              tree: readable === null ? null : { id: readable.id, title: readable.title, progress: readable.progress },
              next: work.length > 0 ? "work" : blocked.length > 0 ? "recheck-blocked" : counts.paused > 0 ? "paused" : leaves.length > 0 ? "done" : "plan",
              counts,
              tasks: candidates.slice(0, limit).map(({ id: id3, parent, title, status, done, note, effectivePriority }) => ({
                id: id3,
                parent,
                title,
                status,
                done,
                note,
                priority: effectivePriority
              })),
              total: candidates.length,
              hasMore: candidates.length > limit,
              ...view.error === null ? {} : { error: view.error }
            })
          });
        },
        presentCall: () => ({ card: "generic", title: "Check next work", kind: "read" })
      })
    ),
    "timeline: pull tool"
  );
  ctx.effect(
    () => ctx.tools.register(
      defineTool({
        name: "timeline_read",
        description: "Read the selected plan, its discussions, and up to three recent reports. Filter by task for details or status for a short leaf list. Read a report or discussion by ID with report or annotation alone.",
        parameters: {
          tree: {
            type: "string",
            description: "Optional existing tree ID to inspect without selecting it."
          },
          task: {
            type: "string",
            description: "Task ID in that tree. Returns its details, metrics, and discussions alongside the plan and report overview."
          },
          report: { type: "string", description: "Inspect one saved report and its discussion." },
          annotation: {
            type: "string",
            description: "Saved discussion or pause/continue request ID; use alone."
          },
          status: {
            type: "string",
            enum: ["unfinished", ...statuses],
            description: "Leaf filter; unfinished includes pending, active, paused and blocked. Cannot combine with task."
          },
          limit: {
            type: "integer",
            description: "Maximum leaves in a status query, 1–50. Default 12. Used alone, filters to unfinished leaves."
          }
        },
        output,
        async execute(args, exec) {
          if (exec.agent === void 0) throw new TimelineError("timeline_read requires an agent session");
          const { view } = storage.stateOf(await ownerOf(exec.agent.session));
          if (args.annotation !== void 0 || args.report !== void 0) {
            if ([args.tree, args.task, args.status, args.limit].some((value) => value !== void 0) || args.annotation !== void 0 && args.report !== void 0)
              throw new TimelineError("Read one report or annotation without other filters");
            if (args.annotation !== void 0) {
              const annotation = view.annotations.find((annotation2) => annotation2.id === args.annotation);
              if (annotation === void 0) throw new TimelineError("Unknown user annotation");
              const target = annotation.target;
              const tree2 = target.kind !== "report" ? view.trees.find((tree3) => tree3.id === target.tree) : void 0;
              const context = target.kind === "report" ? view.reports.find((report2) => report2.id === target.report) : tree2 === void 0 ? void 0 : target.kind === "tree" ? readableTree(tree2) : readableTree(tree2).tasks.find((task3) => task3.id === target.task);
              return Promise.resolve({ content: JSON.stringify({ annotation, context }) });
            }
            const report = view.reports.find((report2) => report2.id === args.report);
            if (report === void 0) throw new TimelineError("Unknown Timeline report");
            return Promise.resolve({
              content: JSON.stringify({
                report,
                annotations: view.annotations.filter(
                  (annotation) => annotation.target.kind === "report" && annotation.target.report === report.id
                )
              })
            });
          }
          const tree = view.trees.find(
            (item) => item.id === (args.tree ?? view.activeTreeId)
          );
          if (args.tree !== void 0 && tree === void 0) throw new TimelineError("Unknown task tree");
          const readable = tree === void 0 ? null : readableTree(tree);
          if (args.status !== void 0 || args.limit !== void 0) {
            if (args.task !== void 0) throw new TimelineError("Use either task or a status query");
            const status = args.status ?? "unfinished";
            const limit = parseArgument(z4.number().int().min(1).max(50), args.limit ?? 12, "limit");
            const tasks = readable?.tasks.filter(
              (task3) => task3.kind === "leaf" && (status === "unfinished" ? !["done", "retired"].includes(task3.status) : task3.status === status)
            ).sort((a, b) => (a.effectivePriority ?? "P4").localeCompare(b.effectivePriority ?? "P4")) ?? [];
            return Promise.resolve({
              content: JSON.stringify({
                tree: readable === null ? null : { id: readable.id, title: readable.title, progress: readable.progress },
                tasks: tasks.slice(0, limit).map(({ id: id2, parent, title, status: status2, done, note, priority, effectivePriority }) => ({
                  id: id2,
                  parent,
                  title,
                  status: status2,
                  done,
                  note,
                  priority,
                  effectivePriority,
                  openAnnotations: view.annotations.filter(
                    (annotation) => annotation.reply === null && annotation.target.kind === "task" && annotation.target.tree === tree?.id && annotation.target.task === id2
                  ).length
                })),
                total: tasks.length,
                hasMore: tasks.length > limit
              })
            });
          }
          const task2 = args.task === void 0 ? void 0 : readable?.tasks.find((item) => item.id === args.task);
          if (args.task !== void 0 && task2 === void 0) throw new TimelineError("Unknown task");
          return Promise.resolve({
            content: JSON.stringify({
              tree: task2 === void 0 ? readable : { id: tree?.id, title: tree?.title, progress: readable?.progress },
              ...task2 === void 0 ? {} : { task: task2 },
              trees: view.trees.map(({ id: id2, title }) => ({ id: id2, title })),
              reports: { total: view.reports.length, recent: view.reports.slice(-3) },
              annotations: view.annotations.filter(
                (annotation) => annotation.target.kind !== "report" && annotation.target.tree === tree?.id && (args.task === void 0 || annotation.target.kind === "task" && annotation.target.task === args.task)
              ),
              error: view.error
            })
          });
        },
        presentCall: () => ({ card: "generic", title: "Read Timeline", kind: "read" })
      })
    ),
    "timeline: read tool"
  );
  ctx.effect(
    () => ctx.tools.register(
      defineTool({
        name: "timeline_reply",
        description: "Save one reply after addressing a discussion. For pause or continue, record the requested state on affected leaves before confirming it, or reply with the blocker. A reply alone leaves task state unchanged.",
        parameters: {
          id: {
            type: "string",
            required: true,
            description: "Discussion ID from the reply reference or timeline_read."
          },
          text: {
            type: "string",
            required: true,
            description: "Brief, self-contained result or blocker, usually 1–3 sentences, at most 4000 characters. Saved replies cannot be replaced."
          }
        },
        output,
        async execute(args, exec) {
          if (exec.agent === void 0) throw new TimelineError("timeline_reply requires an agent session");
          const session = await ownerOf(exec.agent.session);
          if (!await ctx.sessions.flush(session))
            throw new TimelineError("Timeline requires durable session persistence", "TIMELINE_PERSISTENCE");
          const id2 = parseArgument(annotationId, args.id, "id");
          const text = parseArgument(annotationText, args.text, "text");
          await storage.append(session, "plugin:timeline/reply", (state) => {
            const annotation2 = state.view.annotations.find((annotation3) => annotation3.id === id2);
            if (annotation2 === void 0) throw new TimelineError("Unknown user annotation");
            if (annotation2.reply !== null) {
              if (annotation2.reply.text !== text)
                throw new TimelineError("A saved annotation reply cannot be replaced");
              return;
            }
            return { version: 1, sessionId: session.id, id: id2, text, createdAt: Date.now() };
          });
          const annotation = storage.stateOf(session).view.annotations.find((item) => item.id === id2);
          return {
            content: JSON.stringify({
              annotation: id2,
              ...annotation?.control === void 0 ? { resolved: true } : { replied: true, planState: annotation.control.outcome?.status ?? "unconfirmed" }
            })
          };
        },
        presentCall: () => ({ card: "generic", title: "Reply to Timeline annotation", kind: "other" })
      })
    ),
    "timeline: annotation reply tool"
  );
}
function readableTree(tree) {
  const measures = measureAll(tree.tasks);
  const priorities2 = prioritiesOf(tree.tasks);
  const overall = measures.get(null);
  return {
    id: tree.id,
    title: tree.title,
    description: tree.description,
    progress: overall === void 0 ? null : { progress: overall.progress, status: overall.status },
    tasks: tree.tasks.map((task2) => {
      const group = tree.tasks.some((child) => child.parent === task2.id && child.status !== "retired");
      const measure = measures.get(task2.id);
      return {
        id: task2.id,
        parent: task2.parent,
        title: task2.title,
        description: task2.description,
        note: task2.note,
        details: task2.details,
        weight: task2.timeShare,
        priority: task2.priority,
        effectivePriority: priorities2.get(task2.id) ?? null,
        kind: group ? "group" : "leaf",
        status: measure?.status ?? task2.status,
        progress: measure?.progress ?? (task2.status === "done" ? 1 : task2.done[0] / task2.done[1]),
        ...group ? {} : { done: task2.done }
      };
    })
  };
}

// timeline/src/reports.ts
import assert from "node:assert/strict";

// timeline/src/summary.ts
import { BlockAssembler } from "@deepseek-ai/dsh-llm";
import { ZodError } from "zod";

// timeline/src/prompt.ts
import { z as z5 } from "zod";
var reportStyle = `Write a report only. Use ASD-STE100 clarity principles in the required language: plain words, active voice, and self-contained sentences. Name the affected capability or problem, the result, and its impact on the goal. Distinguish verified outcomes, findings from inspection, claims, and plans. Use only supported facts.
State what the work found or changed. For example, write "Import can erase saved notes without confirmation." Give counts only when they answer the user's question, and explain what they measure. Use names a reader can understand without the conversation. Omit internal identifiers, jargon, metaphors, and irrelevant implementation details.
Return only JSON: {"progress":["<result and impact>","<evidence>","<remaining gap or decided next step>"],"uncertainties":[],"userActions":[]}. Use 1–4 progress items, normally 3–4 when supported. Make the first item a standalone preview. Use later items for evidence, limits, or a decided next step. Preserve distinct findings in rollups and merge repeated results.
Each item is plain text on one line, at most 320 characters, or 160 for Chinese or Japanese. List up to two evidenced unresolved decisions in uncertainties. Label recommendations as proposals. List up to two useful actions the user can take in parallel now in userActions. Omit routine approvals and the agent's own work. Use empty arrays for groups with no applicable items.`;
var compactScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
function parseSummary(text, language) {
  const compact = language === "zh-CN" || language === "ja";
  const line = z5.string().trim().min(1).max(compact ? 160 : 320).refine(
    (value) => language !== void 0 || value.length <= 160 || (value.match(compactScript)?.length ?? 0) * 2 <= value.length,
    "Use at most 160 characters for Chinese or Japanese"
  ).refine(
    (value) => !value.includes("\n") && !value.includes("`"),
    "Use plain text without newlines or code"
  );
  return z5.object({
    progress: line.array().min(1).max(4),
    uncertainties: line.array().max(2),
    userActions: line.array().max(2)
  }).strict().parse(JSON.parse(text.replace(/^\s*```(?:json)?\s*\n/u, "").replace(/\n```\s*$/u, "")));
}

// timeline/src/summary.ts
async function summarizeReport(llm, input, signal) {
  const { draft, request: snapshot, children, previous, settings, record } = input;
  const route = {
    provider: snapshot.provider,
    model: snapshot.model,
    purpose: "timeline-report",
    ...snapshot.sessionId === void 0 ? {} : { sessionId: snapshot.sessionId }
  };
  const language = outputLanguage(settings.language, settings.uiLanguage);
  const extra = settings.levelPrompts[draft.level]?.trim();
  const style = language === void 0 ? reportStyle : `${reportStyle}

${languageInstruction(language)}`;
  const question = (`Write a Timeline report for ${new Date(draft.start).toISOString()} to ${new Date(draft.end).toISOString()}.
` + (children.length === 0 ? "Report changes supported by the available record for this period. Use earlier work as background.\n\n" : "Use the completed child reports as evidence for this period.\n\n") + `Reporting focus:
${settings.summaryPrompt}${extra ? `

Level guidance:
${extra}` : ""}

` + (children.length === 0 ? `${style}

` : "") + (children.length === 0 ? previous === void 0 ? "" : `Previous summary (for comparison only):
${JSON.stringify(previous)}` : "Combine these completed child reports:\n" + JSON.stringify(
    children.map((item) => ({
      start: new Date(item.start).toISOString(),
      end: new Date(item.end).toISOString(),
      summary: item.summary
    }))
  ))).trimEnd();
  const request = children.length === 0 ? {
    ...route,
    ...typeof snapshot.system === "string" ? { system: snapshot.system } : {},
    messages: [
      ...snapshot.messages,
      { role: "user", content: [{ type: "text", text: question }] }
    ]
  } : {
    ...route,
    system: style,
    messages: [{ role: "user", content: [{ type: "text", text: question }] }]
  };
  const query = async (request2) => {
    signal.throwIfAborted();
    const prepared = await llm.prepareCall(
      { provider: route.provider, model: route.model },
      signal,
      (_controls, model) => {
        const requested = settings.reportReasoningEffort;
        const effort = model.reasoning?.efforts.find((item) => item.id === requested)?.id;
        if (requested !== void 0 && effort === void 0)
          throw new Error(`Timeline report model ${route.model} does not support reasoning effort "${requested}".`);
        return {
          ...effort === void 0 ? {} : { reasoningEffort: effort },
          maxTokens: Math.min(model.defaultMaxTokens ?? settings.reportMaxTokens, settings.reportMaxTokens)
        };
      }
    );
    signal.throwIfAborted();
    const resolved = { ...request2, ...prepared.config };
    await record(resolved);
    signal.throwIfAborted();
    const assembler = new BlockAssembler();
    const blockBytes = /* @__PURE__ */ new Map();
    let bytes = 0;
    let finished = false;
    for await (const chunk of prepared.stream({ ...resolved, signal })) {
      signal.throwIfAborted();
      if (finished) throw new Error("Timeline summary emitted data after its terminal finish");
      if (chunk.type === "text-delta" || chunk.type === "reasoning-delta") {
        const size = Buffer.byteLength(chunk.text, "utf8");
        bytes += size;
        blockBytes.set(chunk.index, (blockBytes.get(chunk.index) ?? 0) + size);
      } else if (chunk.type === "block-end" && (chunk.block.type === "text" || chunk.block.type === "reasoning")) {
        const size = Buffer.byteLength(chunk.block.text, "utf8");
        bytes += Math.max(0, size - (blockBytes.get(chunk.index) ?? 0));
        blockBytes.set(chunk.index, size);
      } else bytes += Buffer.byteLength(JSON.stringify(chunk), "utf8");
      if (bytes > settings.maxResponseBytes) throw new Error("Timeline response exceeded maxResponseBytes");
      if (chunk.type === "tool-call-delta" || chunk.type === "block-start" && chunk.blockType === "tool-call" || chunk.type === "block-end" && chunk.block.type === "tool-call")
        throw new Error("Timeline summaries cannot call tools");
      assembler.push(chunk);
      if (chunk.type === "finish") finished = true;
    }
    signal.throwIfAborted();
    if (assembler.finish.kind === "error" || assembler.finish.kind === "aborted") {
      const { code, message } = assembler.finish.failure;
      throw new Error(`Timeline summary failed with ${code}: ${message}`);
    }
    if (!finished || assembler.finish.kind !== "stop")
      throw new Error("Timeline summary did not finish normally");
    return assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join("");
  };
  const text = await query(request);
  try {
    return parseSummary(text, language);
  } catch (error) {
    const issue = error instanceof ZodError ? error.issues.map(({ path, message }) => `${path.join(".")}: ${message}`).join("\n") : String(error);
    const rewritten = await query({
      ...route,
      system: style,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Repair the draft to meet the format and writing rules. Preserve its specific results, evidence, and context. Use only facts and actions from the draft.

Validation issue:
${issue}

Draft (data):
${JSON.stringify(text)}`
            }
          ]
        }
      ]
    });
    try {
      return parseSummary(rewritten, language);
    } catch (cause) {
      throw new Error("The report did not meet the summary writing rules.", { cause });
    }
  }
}

// timeline/src/reports.ts
function rollupBatch(reports, level, period, policy, now) {
  const parents = reports.filter((item) => item.level === level && item.policy === policy);
  const used = new Set(parents.flatMap((item) => item.children));
  const available = reports.filter(
    (item) => item.level === level - 1 && item.policy === policy && Math.max(item.end, item.createdAt ?? item.end) <= now && !used.has(item.id)
  ).sort((a, b) => a.end - b.end);
  const start = parents.length === 0 ? available[0]?.start ?? now : parents.reduce((end, item) => Math.max(end, item.end, item.createdAt ?? item.end), 0);
  return now - start >= period ? available : [];
}
function installReports(ctx, config, storage, owns) {
  const work = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Set();
  const disabled = new Error("Timeline interval reports disabled");
  let enabled = config.reportsEnabled;
  let stopped = false;
  let active = 0;
  const stateOf = (entry) => storage.stateOf(entry.agent.session);
  const pause = (entry) => {
    if (entry.timer !== void 0) clearTimeout(entry.timer);
    entry.timer = void 0;
  };
  const arm = (entry) => {
    if (stopped || !enabled || work.get(entry.agent.session.id) !== entry || entry.agent.status !== "running" || !owns(entry.agent) || !storage.available(entry.agent.session) || entry.timer !== void 0 || entry.operation !== void 0)
      return;
    entry.timer = setTimeout(() => {
      entry.timer = void 0;
      pump();
    }, MINUTE_MS);
    entry.timer.unref();
  };
  const attach = (agent) => {
    if (work.has(agent.session.id) || !storage.available(agent.session) || agent.session.header.origin === "subagent" || !owns(agent))
      return;
    const state = storage.stateOf(agent.session);
    const entry = {
      agent,
      timer: void 0,
      retryAt: /* @__PURE__ */ new Map(),
      snapshot: void 0,
      snapshotCurrent: false,
      rollupSnapshot: void 0,
      covered: state.covered,
      lastEnd: state.lastReportEnd,
      operation: void 0,
      controller: void 0,
      requestSignal: void 0
    };
    work.set(agent.session.id, entry);
    arm(entry);
  };
  const flush = async (entry) => {
    if (!await ctx.sessions.flush(entry.agent.session))
      throw new Error("Timeline requires durable session persistence");
    const state = stateOf(entry);
    if (state.lastReportEnd > entry.lastEnd) {
      entry.covered = state.covered;
      entry.lastEnd = state.lastReportEnd;
    }
  };
  const baseStart = (entry, state, now) => state.toolCount === 0 && state.lastReportEnd === entry.agent.session.header.createdAt ? state.activity.open ?? now : entry.lastEnd;
  const baseDue = (entry, now, period = config.intervalMs) => {
    const state = stateOf(entry);
    const start = baseStart(entry, state, now);
    const last = state.view.reports.reduce(
      (end, report) => report.level === 0 ? Math.max(end, report.createdAt ?? report.end) : end,
      start
    );
    if (now - last < period) return false;
    const activity = state.activity;
    return state.toolCount > entry.covered || activity.olderWorkMs > 0 || activeRanges(activity, start, now).length > 0 || activity.open === now;
  };
  const baseEnd = (entry, now) => {
    const count = stateOf(entry).toolCount;
    if (count === entry.covered) return now;
    const { snapshot } = entry;
    if (snapshot === void 0 || snapshot.toolCount <= entry.covered) return void 0;
    if (snapshot.toolCount === count) return entry.snapshotCurrent ? now : void 0;
    return snapshot.time > entry.lastEnd && snapshot.time <= now ? snapshot.time : void 0;
  };
  const save = async (entry, report, snapshot, children, signal, settings) => {
    signal.throwIfAborted();
    let result = report;
    if (report.source === "model") {
      assert(snapshot !== void 0, "Waiting for a complete model request");
      result = {
        ...report,
        summary: await summarizeReport(
          ctx.llm,
          {
            draft: report,
            request: snapshot.request,
            previous: stateOf(entry).view.reports.findLast(
              (item) => item.level === 0 && item.end <= report.start
            )?.summary,
            children,
            settings,
            record: async (request) => {
              await flush(entry);
              signal.throwIfAborted();
              const sharesPrefix = children.length === 0 && request.messages[0] === snapshot.request.messages[0];
              const prefixLength = sharesPrefix ? snapshot.prefixLength : 0;
              await storage.append(entry.agent.session, "plugin:timeline/request", {
                version: 1,
                sessionId: entry.agent.session.id,
                id: report.id,
                contextSeq: snapshot.seq,
                prefixLength,
                request: { ...request, messages: request.messages.slice(prefixLength) }
              });
            }
          },
          signal
        )
      };
    }
    signal.throwIfAborted();
    await flush(entry);
    await storage.append(entry.agent.session, "plugin:timeline/report", () => {
      signal.throwIfAborted();
      return {
        version: 1,
        sessionId: entry.agent.session.id,
        report: { ...result, createdAt: Date.now() }
      };
    });
    await flush(entry);
  };
  const check = async (entry, signal) => {
    let id2 = reportId.parse(newId("report"));
    let failure;
    const attempt = async (level, run) => {
      const controller = new AbortController();
      const timer = setTimeout(
        () => {
          controller.abort(new Error("Timeline summary timed out"));
        },
        config.timeoutMs
      ).unref();
      try {
        await run(AbortSignal.any([signal, controller.signal]));
        entry.retryAt.delete(level);
      } catch (error2) {
        signal.throwIfAborted();
        entry.retryAt.set(level, Date.now() + MINUTE_MS);
        failure = { id: id2, error: error2 };
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      if (stateOf(entry).lastReportEnd > entry.lastEnd) await flush(entry);
      const settings = {
        intervalMs: config.intervalMs,
        rollupFactors: config.rollupFactors,
        language: config.language,
        uiLanguage: config.uiLanguage,
        levelPrompts: config.levelPrompts,
        reportMaxTokens: config.reportMaxTokens,
        ...config.reportReasoningEffort === void 0 ? {} : { reportReasoningEffort: config.reportReasoningEffort },
        summaryPrompt: config.summaryPrompt,
        maxResponseBytes: config.maxResponseBytes
      };
      const policy = JSON.stringify([settings.intervalMs, ...settings.rollupFactors]);
      const snapshot = entry.snapshot;
      const count = snapshot?.toolCount ?? stateOf(entry).toolCount;
      const now = Date.now();
      const end = ready(entry, 0, now) && baseDue(entry, now, settings.intervalMs) ? baseEnd(entry, now) : void 0;
      const state = stateOf(entry);
      const { activity } = state;
      const start = baseStart(entry, state, now);
      const ranges = activeRanges(activity, start, end ?? now);
      const workMs = ranges.reduce(
        (sum, [from, to]) => sum + to - from,
        start === entry.lastEnd ? activity.olderWorkMs : 0
      );
      const draft = {
        id: id2,
        level: 0,
        start,
        end: end ?? now,
        policy,
        children: [],
        source: count === entry.covered ? "no-activity" : "model",
        toolCount: Math.max(0, count - entry.covered),
        covered: count,
        contextSeq: snapshot?.seq ?? 0,
        workMs,
        ranges,
        summary: {
          progress: [fixedText(settings.language, settings.uiLanguage).noActivity],
          uncertainties: [],
          userActions: []
        }
      };
      if (end !== void 0)
        await attempt(0, (requestSignal) => save(entry, draft, snapshot, [], requestSignal, settings));
      const periods = reportPeriods(settings);
      for (const [index, period] of periods.entries()) {
        const childPeriod = periods[index - 1];
        const now2 = Date.now();
        if (childPeriod === void 0 || !ready(entry, index, now2)) continue;
        const children = rollupBatch(stateOf(entry).view.reports, index, period, policy, now2);
        const first = children[0];
        const last = children.at(-1);
        if (first === void 0 || last === void 0) continue;
        if (snapshot === void 0 && entry.rollupSnapshot === void 0 && children.some((item) => item.source === "model"))
          continue;
        id2 = reportId.parse(newId("report"));
        const { activity: activity2 } = stateOf(entry);
        const childRanges = children.map((child) => reportRanges(child, activity2));
        const combined = childRanges.every((ranges2) => ranges2 !== void 0) ? mergeRanges(childRanges.flat()) : void 0;
        const admitted = snapshot ?? entry.rollupSnapshot;
        const selection = entry.agent.model.current();
        const route = admitted === void 0 || selection === void 0 ? admitted : {
          ...admitted,
          request: { provider: selection.provider, model: selection.model, sessionId: entry.agent.session.id, messages: [] }
        };
        await attempt(index, (requestSignal) => save(
          entry,
          {
            ...draft,
            id: id2,
            level: index,
            start: first.start,
            end: last.end,
            source: children.every((item) => item.source === "no-activity") ? "no-activity" : "model",
            covered: last.covered,
            contextSeq: last.contextSeq,
            toolCount: children.reduce((sum, item) => sum + item.toolCount, 0),
            children: children.map((item) => item.id),
            workMs: children.reduce((sum, item) => sum + (item.workMs ?? childPeriod), 0),
            ranges: combined
          },
          route,
          children,
          requestSignal,
          settings
        ));
      }
      entry.retryAt.delete(-1);
    } catch (error2) {
      if (signal.reason === disabled) return { ok: true };
      entry.retryAt.set(-1, Date.now() + MINUTE_MS);
      failure = { id: id2, error: error2 };
    }
    if (failure === void 0) return { ok: true };
    const { error } = failure;
    const message = error instanceof Error ? error.message : String(error);
    if (!stopped && work.get(entry.agent.session.id) === entry && ctx.sessions.get(entry.agent.session.id) === entry.agent.session) {
      try {
        await storage.append(entry.agent.session, "plugin:timeline/failure", {
          version: 1,
          sessionId: entry.agent.session.id,
          id: failure.id,
          message
        });
        await flush(entry);
      } catch (persistError) {
        ctx.logger.warn("Timeline persistence failed", persistError);
      }
      ctx.logger.warn("Timeline summary failed; retrying after one minute while active", error);
    }
    return { ok: false, message };
  };
  const ready = (entry, level, now) => now >= (entry.retryAt.get(level) ?? 0);
  function pump() {
    if (stopped || !enabled || active >= config.maxConcurrent) return;
    const cadence = { intervalMs: config.intervalMs, rollupFactors: config.rollupFactors };
    const policy = JSON.stringify([cadence.intervalMs, ...cadence.rollupFactors]);
    const periods = reportPeriods(cadence);
    for (const entry of work.values()) {
      if (entry.operation !== void 0 || entry.agent.status !== "running" || !owns(entry.agent) || !storage.available(entry.agent.session))
        continue;
      const now = Date.now();
      if (!ready(entry, -1, now) || !(ready(entry, 0, now) && baseDue(entry, now, cadence.intervalMs) && baseEnd(entry, now) !== void 0) && !periods.some((period, level) => {
        if (level === 0 || !ready(entry, level, now)) return false;
        const children = rollupBatch(stateOf(entry).view.reports, level, period, policy, now);
        return children.length > 0 && (entry.rollupSnapshot !== void 0 || children.every((item) => item.source === "no-activity"));
      })) {
        arm(entry);
        continue;
      }
      if (active >= config.maxConcurrent) break;
      work.delete(entry.agent.session.id);
      work.set(entry.agent.session.id, entry);
      pause(entry);
      active++;
      const controller = new AbortController();
      entry.controller = controller;
      const operation = Promise.resolve().then(() => check(entry, controller.signal)).finally(() => {
        pause(entry);
        pending.delete(operation);
        entry.operation = void 0;
        entry.controller = void 0;
        active--;
        arm(entry);
        pump();
      });
      entry.operation = operation;
      pending.add(operation);
      arm(entry);
    }
  }
  ctx.on("loader/volatile-update", () => {
    if (enabled === config.reportsEnabled) return;
    enabled = config.reportsEnabled;
    if (enabled) {
      pump();
      return;
    }
    for (const entry of work.values()) {
      pause(entry);
      entry.snapshot = void 0;
      entry.rollupSnapshot = void 0;
      entry.retryAt.clear();
      entry.controller?.abort(disabled);
    }
  });
  ctx.on(
    "agent/created",
    ({ agent }) => {
      attach(agent);
    },
    { global: true }
  );
  ctx.on(
    "agent/status",
    ({ agent, status }) => {
      attach(agent);
      const entry = work.get(agent.session.id);
      if (entry === void 0) return;
      if (status === "idle") {
        pause(entry);
      } else {
        arm(entry);
        pump();
      }
    },
    { global: true }
  );
  ctx.on(
    "agent/disposed",
    ({ agent }) => {
      const entry = work.get(agent.session.id);
      if (entry === void 0) return;
      pause(entry);
      entry.controller?.abort(new Error("Agent disposed"));
      work.delete(agent.session.id);
    },
    { global: true }
  );
  ctx.on(
    "session/event",
    (session, event) => {
      const entry = work.get(session.id);
      if (entry === void 0) return;
      if ("surfaceOp" in event) entry.snapshotCurrent = false;
      if (event.type === "turn/end") entry.snapshot = void 0;
      if (event.type === "turn/start") pump();
    },
    { global: true }
  );
  ctx.on(
    "agent/request",
    ({ agent, signal }, next) => {
      const entry = work.get(agent.session.id);
      if (entry !== void 0) entry.requestSignal = signal;
      return next();
    },
    { global: true }
  );
  ctx.on(
    "llm/stream",
    (options, next) => {
      if (enabled && options.sessionId !== void 0 && options.purpose === void 0) {
        const entry = work.get(options.sessionId);
        if (entry !== void 0 && options.signal !== void 0 && options.signal === entry.requestSignal) {
          const { signal, ...request } = options;
          if (signal.aborted) return next();
          const messages = entry.agent.session.deriveMessages();
          const mismatch = request.messages.findIndex((message, index) => message !== messages[index]);
          const prefixLength = mismatch < 0 ? request.messages.length : mismatch;
          entry.snapshot = {
            request: Object.isFrozen(request.messages) ? request : { ...request, messages: structuredClone(request.messages) },
            prefixLength,
            toolCount: stateOf(entry).toolCount,
            seq: Math.max(0, Number(entry.agent.session.seq) - 1),
            time: Date.now()
          };
          entry.snapshotCurrent = true;
          entry.rollupSnapshot = {
            ...entry.snapshot,
            prefixLength: 0,
            request: {
              provider: request.provider,
              model: request.model,
              sessionId: options.sessionId,
              messages: []
            }
          };
          pump();
        }
      }
      return next();
    },
    // The LLM dispatcher is global. The scoped admission map limits its consumers.
    { global: true, prepend: true }
  );
  ctx.effect(
    () => async () => {
      stopped = true;
      for (const entry of work.values()) {
        pause(entry);
        entry.controller?.abort(new Error("Timeline unloaded"));
      }
      work.clear();
      await Promise.all([...pending]);
    },
    "timeline: timers and requests"
  );
  for (const agent of ctx.agents.list()) attach(agent);
}

// timeline/src/guidance.ts
import { scopeParentOf as scopeParentOf2 } from "@deepseek-ai/dsh-scope";

// timeline/src/delegation.ts
import assert2 from "node:assert/strict";
import { scopeOf, scopeParentOf } from "@deepseek-ai/dsh-scope";
var planningTools = ["timeline_tree", "timeline_tasks", "timeline_pull", "timeline_read", "timeline_reply"];
function isWorker(agent) {
  return agent?.session.header.origin === "subagent";
}
function planningOwner(ctx) {
  const definition = ctx.tools.get("timeline_tree", scopeOf(ctx));
  assert2(definition !== void 0, "Timeline must register its planning tools first");
  return (agent) => {
    if (!isWorker(agent)) return ctx.tools.get("timeline_tree", agent) === definition;
    for (let parent = scopeParentOf(agent); ; parent = scopeParentOf(parent)) {
      const inherited = ctx.tools.get("timeline_tree", parent);
      if (inherited !== void 0 || parent === void 0) return inherited === definition;
    }
  };
}
function delegationContext(ctx, agent, storage) {
  const parent = agent.session.header.parentSession;
  if (parent === void 0) return "Report assigned work to the delegating agent.";
  const seen = /* @__PURE__ */ new Set([agent.session.id]);
  let owner = ctx.sessions.get(parent);
  while (owner?.header.origin === "subagent") {
    if (seen.has(owner.id)) return `Report assigned work to parent ${parent}.`;
    seen.add(owner.id);
    const next = owner.header.parentSession;
    owner = next === void 0 ? void 0 : ctx.sessions.get(next);
  }
  const view = owner === void 0 || !storage.available(owner) ? void 0 : storage.stateOf(owner).view;
  const tree = view?.trees.find((tree2) => tree2.id === view.activeTreeId);
  return `Timeline delegation: parent ${parent}${owner === void 0 ? "" : `; plan owner ${owner.id}`}${tree === void 0 ? "" : `; current tree ${tree.id}: ${JSON.stringify(tree.title)}`}. These are references, not assignments. Use the tree/task IDs in the latest assignment message; report missing IDs to the parent.`;
}
function installDelegation(ctx, owns) {
  const masks = /* @__PURE__ */ new Map();
  const attach = (agent) => {
    if (!isWorker(agent) || !owns(agent) || masks.has(agent)) return;
    masks.set(agent, agent.ctx.tools.restrict({ deny: planningTools }));
  };
  ctx.on("agent/created", ({ agent }) => {
    attach(agent);
    return void 0;
  }, { global: true });
  ctx.on("agent/disposed", ({ agent }) => {
    const dispose = masks.get(agent);
    masks.delete(agent);
    dispose?.();
  }, { global: true });
  ctx.effect(
    () => () => {
      for (const dispose of masks.values()) dispose();
      masks.clear();
    },
    "timeline: delegated planning masks"
  );
  ctx.tools.guard(
    (exec) => exec.agent !== void 0 && isWorker(exec.agent) && owns(exec.agent) && planningTools.includes(exec.name) ? {
      reason: "The delegating agent owns the shared task tree. Report assigned IDs, progress, blockers, and results to your parent instead.",
      info: { name: "TimelineError", code: "TIMELINE_TOOL_UNAVAILABLE" }
    } : void 0
  );
  for (const agent of ctx.agents.list()) attach(agent);
}

// timeline/src/guidance.ts
var CONTEXT_ITEM_LIMIT = 12;
var CONTEXT_NOTE_LIMIT = 160;
var instructions = `## Task planning with Timeline

Before substantive multi-step work, reuse the goal's tree or start one with timeline_tree. Group work by deliverable and split large steps into checkable child tasks. Use timeline_tasks at meaningful checkpoints to update leaves and revise the tree as scope changes. Preserve completed work.

Before a final answer on planned work, save progress and call timeline_pull for that goal. Continue eligible work in scope and repeat the check. Recheck blocked dependencies once and record remaining blockers. Resume paused work only at the user's request.

Own the shared tree. Save tasks before delegating. Include "Timeline: tree=<id>; tasks=<ids>", scope, and completion criteria in assignments and reassignments. Relay relevant discussions and pause/continue requests. Save worker progress and blockers, verify results before marking tasks done, and save shared replies yourself. Save progress and yield when waiting for workers.

Interval reports run independently when enabled. Keep replies focused on the user's work.`;
var workerInstructions = `## Shared task planning
The manager owns the shared Timeline tree. At milestones, blockers, and completion, report the assigned tree/task IDs, verified results, and remaining work to your parent through normal agent messages. Ask for missing IDs at the first checkpoint. Follow the latest assignment and pause/continue requests at safe checkpoints. Send discussion findings to your parent for a saved reply. Pass the same references if you delegate further.`;
function installGuidance(ctx, config, storage, owns) {
  const snapshots = /* @__PURE__ */ new WeakMap();
  ctx.systemPrompt.section({
    name: "timeline:planning",
    order: 120,
    text: ({ agent }) => {
      if (isWorker(agent)) return workerInstructions;
      const language = outputLanguage(config.language, config.uiLanguage);
      return language === void 0 ? instructions : `${instructions}

${taskLanguageInstruction(language)}`;
    },
    interpolate: false
  });
  ctx.systemPrompt.context({
    name: "timeline:state",
    order: 120,
    required: true,
    interpolate: false,
    text: ({ agent, signal }) => {
      if (agent === void 0) return "";
      const saved = signal === void 0 ? void 0 : snapshots.get(signal);
      if (saved !== void 0) return saved;
      if (isWorker(agent)) {
        const text2 = delegationContext(ctx, agent, storage);
        if (signal !== void 0) snapshots.set(signal, text2);
        return text2;
      }
      if (!storage.available(agent.session)) {
        const text2 = "Timeline storage is unavailable. Continue ordinary work and report the error; preserve saved plans instead of creating replacements.";
        if (signal !== void 0) snapshots.set(signal, text2);
        return text2;
      }
      const { view } = storage.stateOf(agent.session);
      const trees = view.trees.map((tree) => {
        const priorities3 = prioritiesOf(tree.tasks);
        const parents = new Set(
          tree.tasks.filter((task2) => task2.status !== "retired").map((task2) => task2.parent)
        );
        const unfinished = tree.tasks.filter((task2) => !parents.has(task2.id) && !["done", "retired"].includes(task2.status)).sort((a, b) => (priorities3.get(a.id) ?? "P4").localeCompare(priorities3.get(b.id) ?? "P4"));
        const tasks = unfinished.slice(0, CONTEXT_ITEM_LIMIT);
        const byId = new Map(tree.tasks.map((task2) => [task2.id, task2]));
        const groups = /* @__PURE__ */ new Set();
        for (const task2 of tasks) {
          let parent = task2.parent;
          while (parent !== null && !groups.has(parent) && groups.size < CONTEXT_ITEM_LIMIT) {
            groups.add(parent);
            parent = byId.get(parent)?.parent ?? null;
          }
        }
        return {
          id: tree.id,
          title: tree.title,
          status: measureAll(tree.tasks).get(null)?.status ?? "pending",
          ...unfinished.length === 0 ? {} : { unfinished: unfinished.length },
          ...tree.id !== view.activeTreeId ? {} : {
            ...groups.size === 0 ? {} : {
              groups: tree.tasks.filter((task2) => groups.has(task2.id)).map(({ id: id2, parent, title }) => ({
                id: id2,
                ...parent === null ? {} : { parent },
                title
              }))
            },
            tasks: tasks.map(({ id: id2, parent, title, status, done, note }) => ({
              id: id2,
              ...parent === null ? {} : { parent },
              title,
              status,
              ...done[0] === 0 && done[1] === 1 ? {} : { done },
              ...note.length === 0 ? {} : { note: note.slice(0, CONTEXT_NOTE_LIMIT) },
              ...priorities3.get(id2) == null ? {} : { priority: priorities3.get(id2) }
            }))
          }
        };
      });
      const openAnnotations = view.annotations.filter(
        (annotation) => annotation.reply === null && (annotation.control === void 0 || annotation.control.outcome === null)
      );
      const priorities2 = prioritizedTasks(view.trees);
      const text = trees.length === 0 && openAnnotations.length === 0 ? "" : `Current Timeline plan (turn-start state, not a new request): ${JSON.stringify({
        selectedTree: view.activeTreeId,
        trees,
        ...priorities2.length === 0 ? {} : { priorities: priorities2 },
        ...openAnnotations.length === 0 ? {} : {
          openAnnotations: openAnnotations.slice(0, CONTEXT_ITEM_LIMIT).map(({ id: id2, target, control }) => ({
            id: id2,
            target,
            ...control === void 0 ? {} : { requestedAction: control.action }
          }))
        }
      })}${openAnnotations.length === 0 ? "" : "\nAddress open discussions at a safe checkpoint. Use timeline_read with annotation set to the ID if you need the full message or context. Save replies with timeline_reply. Apply pause or continue to the requested scope before confirming it."}`;
      if (signal !== void 0) snapshots.set(signal, text);
      return text;
    }
  });
  const masks = /* @__PURE__ */ new Map();
  let refreshing = false;
  let disposed = false;
  const refresh = () => {
    if (refreshing || disposed) return;
    refreshing = true;
    try {
      if (config.allowTodo) {
        for (const dispose of masks.values()) dispose();
        masks.clear();
        return;
      }
      for (const [agent, dispose] of masks) {
        if (owns(agent) && storage.available(agent.session)) continue;
        dispose();
        masks.delete(agent);
      }
      for (const agent of ctx.agents.list()) {
        if (!owns(agent) || !storage.available(agent.session)) continue;
        if (masks.has(agent) || ctx.tools.get("todo_write", agent) === void 0) continue;
        if (ctx.tools.get("todo_write", scopeParentOf2(agent)) === void 0) continue;
        masks.set(agent, agent.ctx.tools.restrict({ deny: ["todo_write"] }));
      }
    } finally {
      refreshing = false;
    }
  };
  ctx.effect(
    () => () => {
      disposed = true;
      for (const dispose of masks.values()) dispose();
      masks.clear();
    },
    "timeline: Todo masks"
  );
  ctx.on("agent/created", () => {
    refresh();
    return void 0;
  }, { global: true });
  ctx.on("tools/change", refresh, { global: true });
  ctx.on("loader/volatile-update", refresh);
  ctx.on("agent/disposed", ({ agent }) => {
    const dispose = masks.get(agent);
    masks.delete(agent);
    dispose?.();
  }, { global: true });
  ctx.tools.guard(
    (exec) => exec.name === "todo_write" && !config.allowTodo && exec.agent !== void 0 && owns(exec.agent) && storage.available(exec.agent.session) ? {
      reason: isWorker(exec.agent) ? "The delegating agent owns the shared task tree. Report progress and blockers to your parent." : "Timeline replaces Todo. Use timeline_tree and timeline_tasks.",
      info: { name: "TimelineError", code: "TIMELINE_TOOL_UNAVAILABLE" }
    } : void 0
  );
  refresh();
}

// timeline/src/reminders.ts
import { createUserMessage } from "@deepseek-ai/dsh-llm";
var PRIORITY_DEBOUNCE_MS = 750;
function installReminders(ctx, config, storage, owns) {
  const activity = /* @__PURE__ */ new Map();
  const urgent = /* @__PURE__ */ new Map();
  let disposed = false;
  ctx.on("timeline/priority", (session) => {
    for (const agent of ctx.agents.list()) {
      if (isWorker(agent) || agent.session.id !== session.id || agent.status !== "running" || !owns(agent)) continue;
      let state = urgent.get(agent);
      if (state === void 0) {
        state = { timer: void 0, pending: void 0 };
        urgent.set(agent, state);
      }
      clearTimeout(state.timer);
      const current = state;
      current.timer = setTimeout(() => {
        current.timer = void 0;
        if (agent.status !== "running") return;
        try {
          if (current.pending !== void 0) agent.inbox.remove(current.pending);
          current.pending = void 0;
          const message = createUserMessage({
            source: {
              kind: "timeline-priority",
              form: "notice",
              summary: fixedText(config.language, config.uiLanguage).priority
            },
            content: [
              {
                type: "text",
                text: `Timeline priority update: P0 changed. At the next safe checkpoint, prefer the highest-priority eligible work within the current goal.
Eligible prioritized tasks: ${JSON.stringify(prioritizedTasks(storage.stateOf(session).view.trees))}`
              }
            ]
          });
          agent.inject(message);
          current.pending = message.id;
        } catch (error) {
          ctx.logger.warn("Timeline priority notice failed", error);
        }
      }, PRIORITY_DEBOUNCE_MS);
    }
  });
  ctx.systemPrompt.context({
    name: "timeline:maintenance",
    order: 121,
    required: true,
    interpolate: false,
    text: ({ agent }) => {
      if (agent === void 0 || isWorker(agent) || !storage.available(agent.session)) return "";
      const state = activity.get(agent);
      if (state === void 0 || state.stale < config.reminderIterations) return "";
      return "Task progress checkpoint: Save changes to the current goal’s tree, or start one if this multi-step goal has none. Use timeline_pull when choosing the next task.";
    }
  });
  ctx.on(
    "agent/request",
    async ({ agent, turn, step, signal }, next) => {
      const callConfig = await next();
      if (signal.aborted || disposed || isWorker(agent) || !owns(agent)) return callConfig;
      let state = activity.get(agent);
      if (state === void 0 || state.turn !== turn) {
        state = { turn, step: -1, stale: 0 };
        activity.set(agent, state);
      }
      if (state.step === step) return callConfig;
      state.step = step;
      state.stale++;
      return callConfig;
    },
    { global: true }
  );
  ctx.on(
    "tools/result",
    (exec, result) => {
      const state = exec.agent === void 0 ? void 0 : activity.get(exec.agent);
      if (exec.name === "timeline_tasks" && !result.isError && exec.agent !== void 0 && state !== void 0) {
        state.stale = 0;
      }
      return void 0;
    },
    { global: true }
  );
  ctx.on(
    "agent/disposed",
    ({ agent }) => {
      activity.delete(agent);
      clearTimeout(urgent.get(agent)?.timer);
      urgent.delete(agent);
    },
    { global: true }
  );
  ctx.effect(
    () => () => {
      disposed = true;
      for (const [agent, state] of urgent) {
        clearTimeout(state.timer);
        if (state.pending !== void 0) agent.inbox.remove(state.pending);
      }
      urgent.clear();
      activity.clear();
    },
    "timeline: task maintenance reminders"
  );
}

// timeline/src/storage.ts
import assert3 from "node:assert/strict";
import { createHash as createHash2 } from "node:crypto";
import { Service } from "@deepseek-ai/cordis";
import { appendPluginRecord } from "@deepseek-ai/dsh-session";
import { createUserMessage as createUserMessage2 } from "@deepseek-ai/dsh-llm";

// timeline/src/checkpoint.ts
import { z as z6 } from "zod";
var CHECKPOINT_BYTES = 2 * 1024 * 1024;
var task = z6.object({
  id: taskId,
  parent: taskId.nullable().optional(),
  title: z6.string().trim().min(1).max(120),
  description: z6.string().max(320).optional(),
  status: z6.enum(statuses).optional(),
  done: z6.tuple([z6.number().nonnegative(), z6.number().positive()]).optional(),
  weight: z6.number().positive().optional(),
  note: z6.string().max(400).optional(),
  details: z6.string().max(4e3).optional(),
  priority: prioritySchema.optional(),
  history: taskRevisionSchema.array().optional()
}).strict();
var discussion = z6.object({
  task: taskId.optional(),
  text: annotationText,
  createdAt: timestampSchema.optional(),
  reply: z6.object({ text: annotationText, createdAt: timestampSchema.optional() }).strict().optional()
}).strict();
var schema = z6.object({
  format: z6.literal("dsh-timeline-tree"),
  version: z6.literal(1),
  title: z6.string().trim().min(1).max(120),
  description: z6.string().max(320).optional(),
  elapsedMs: z6.number().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  tasks: task.array().max(1e3),
  discussions: discussion.array().max(1e4).optional(),
  metadata: z6.record(z6.string(), z6.json()).optional()
}).strict();
var Checkpoint = class _Checkpoint {
  constructor(data, tasks) {
    this.data = data;
    this.tasks = tasks;
  }
  data;
  tasks;
  /**
   * Validate a UTF-8-sized JSON file and its complete task graph before any write.
   * @param text - the text to parse.
   * @returns the validated portable plan.
   */
  static fromString(text) {
    if (new TextEncoder().encode(text).byteLength > CHECKPOINT_BYTES)
      throw new Error("Timeline checkpoint exceeds 2 MiB");
    return _Checkpoint.fromJson(JSON.parse(text));
  }
  /**
   * Normalize file values through the same graph and progress checks as task edits.
   * @param input - input to validate.
   * @returns the validated portable plan.
   */
  static fromJson(input) {
    const result = schema.safeParse(input);
    if (!result.success) {
      const detail = result.error.issues.slice(0, 1).map(
        ({ path, message }) => `${path.length ? ` (${path.join(".")})` : ""}: ${message}`
      ).join("");
      throw new Error(`Invalid Timeline checkpoint${detail}`);
    }
    const { tasks: inputTasks, ...data } = result.data;
    const metadata = /* @__PURE__ */ new Map();
    const patches = inputTasks.map(({ weight, priority, history, ...task2 }) => {
      metadata.set(task2.id, { priority: priority ?? null, history: history ?? [] });
      return { ...task2, ...weight === void 0 ? {} : { timeShare: weight } };
    });
    const tasks = inputTasks.length === 0 ? [] : patchTasks([], patches, 0, 1e3, "checkpoint").map((task2) => ({
      ...task2,
      ...metadata.get(task2.id)
    }));
    const ids = new Set(tasks.map((task2) => task2.id));
    if (data.discussions?.some((note) => note.task !== void 0 && !ids.has(note.task)))
      throw new Error("Timeline checkpoint discussion refers to an unknown task");
    return new _Checkpoint(data, tasks);
  }
  /**
   * Export one acknowledged tree and its ordinary user discussions without live requests.
   * @param tree - the task tree before the change.
   * @param annotations - saved notes and work requests.
   * @param now - current wall clock time in milliseconds.
   * @param sessionId - identifier of the owning session.
   * @param pluginVersion - release version to include in the export metadata, when known.
   * @returns the portable snapshot of the tree.
   */
  static fromTree(tree, annotations, now, sessionId2, pluginVersion) {
    const done = tree.tasks.every((task2) => task2.status === "done" || task2.status === "retired");
    const end = done ? Math.max(tree.createdAt, ...tree.tasks.map((task2) => task2.updatedAt)) : now;
    return new _Checkpoint(
      {
        format: "dsh-timeline-tree",
        version: 1,
        title: tree.title,
        ...tree.description ? { description: tree.description } : {},
        elapsedMs: Math.max(0, end - tree.createdAt),
        metadata: {
          plugin: "@deepseek-ai/dsh-timeline",
          ...pluginVersion === void 0 ? {} : { pluginVersion },
          exportedAt: new Date(now).toISOString(),
          sourceSessionId: sessionId2,
          sourceTreeId: tree.id,
          treeCreatedAt: new Date(tree.createdAt).toISOString(),
          lastTaskUpdatedAt: new Date(
            Math.max(tree.createdAt, ...tree.tasks.map((task2) => task2.updatedAt))
          ).toISOString()
        },
        discussions: annotations.filter(
          (note) => note.control === void 0 && note.target.kind !== "report" && note.target.tree === tree.id
        ).map((note) => ({
          ...note.target.kind === "task" ? { task: note.target.task } : {},
          text: note.text,
          createdAt: note.createdAt,
          ...note.reply === null ? {} : { reply: note.reply }
        }))
      },
      structuredClone(tree.tasks)
    );
  }
  /**
   * Return canonical readable fields; empty text, default values and inert metadata are omitted.
   * @returns portable data without descriptive metadata.
   */
  toJson() {
    const parents = new Set(this.tasks.filter((task2) => task2.status !== "retired").map((task2) => task2.parent));
    return {
      format: "dsh-timeline-tree",
      version: 1,
      title: this.data.title,
      ...this.data.description ? { description: this.data.description } : {},
      ...this.data.elapsedMs ? { elapsedMs: this.data.elapsedMs } : {},
      tasks: this.tasks.map((task2) => ({
        id: task2.id,
        title: task2.title,
        ...task2.parent === null ? {} : { parent: task2.parent },
        ...task2.description ? { description: task2.description } : {},
        ...parents.has(task2.id) || task2.status === "pending" ? {} : { status: task2.status },
        ...parents.has(task2.id) || task2.done[0] === 0 && task2.done[1] === 1 ? {} : { done: task2.done },
        ...task2.timeShare === 1 ? {} : { weight: task2.timeShare },
        ...task2.note ? { note: task2.note } : {},
        ...task2.details ? { details: task2.details } : {},
        ...task2.priority === null ? {} : { priority: task2.priority },
        ...task2.history.length === 0 ? {} : { history: task2.history }
      })),
      ...this.data.discussions?.length ? { discussions: this.data.discussions } : {}
    };
  }
  /**
   * Encode a checkpoint that the same bounded reader can import.
   * @returns the complete JSON export.
   */
  toString() {
    const text = `${JSON.stringify({ ...this.toJson(), ...this.data.metadata ? { metadata: this.data.metadata } : {} }, null, 2)}
`;
    if (new TextEncoder().encode(text).byteLength > CHECKPOINT_BYTES)
      throw new Error("Timeline checkpoint exceeds 2 MiB");
    return text;
  }
  /**
   * Create detached local identities; imported active leaves wait for an explicit continuation.
   * @param id - new identifier for the imported tree.
   * @param now - current wall clock time in milliseconds.
   * @returns the restored tree, notes, and unfinished work.
   */
  restore(id2, now) {
    const saved = structuredClone(this.tasks);
    const parents = new Set(this.tasks.filter((task2) => task2.status !== "retired").map((task2) => task2.parent));
    const active = this.tasks.filter((task2) => !parents.has(task2.id) && task2.status === "active");
    const paused = active.length === 0 ? saved : patchTasks(
      saved,
      active.map(({ id: id3, note }) => ({
        id: id3,
        status: "paused",
        note: note || "Imported checkpoint; awaiting continuation."
      })),
      now,
      1e3
    );
    const tasks = recordTaskHistory(saved, paused, now).map((task2) => ({
      ...task2,
      createdAt: now,
      updatedAt: now
    }));
    const selected = treeId.parse(id2);
    return {
      tree: {
        id: selected,
        title: this.data.title,
        description: this.data.description ?? "",
        tasks,
        createdAt: Math.max(0, now - (this.data.elapsedMs ?? 0))
      },
      annotations: (this.data.discussions ?? []).map((note) => ({
        id: newId("note"),
        target: note.task === void 0 ? { kind: "tree", tree: selected } : { kind: "task", tree: selected, task: note.task },
        text: note.text,
        createdAt: note.createdAt ?? now,
        reply: note.reply === void 0 ? null : { text: note.reply.text, createdAt: note.reply.createdAt ?? now }
      })),
      resume: active.map((task2) => task2.id)
    };
  }
};

// timeline/src/protocol.ts
import { z as z7 } from "zod";
var TIMELINE_CHANNEL = "/timeline";
var TIMELINE_EDIT = "edit";
var TIMELINE_LOCALE = "locale";
var browserLanguageSchema = z7.enum(outputLanguages);
var sessionId = z7.string().min(1).max(256).transform((value) => value);
var editRequestSchema = z7.discriminatedUnion("action", [
  z7.object({
    action: z7.literal("import"),
    sessionId,
    id: z7.string().min(1).max(128),
    content: z7.string().max(CHECKPOINT_BYTES),
    copy: z7.boolean().default(false),
    continue: z7.boolean().default(false)
  }).strict(),
  z7.object({ action: z7.literal("remove"), sessionId, tree: treeId, draft: z7.boolean().optional() }).strict(),
  z7.object({
    action: z7.literal("control"),
    sessionId,
    target: controlTargetSchema,
    id: annotationId,
    intent: controlActionSchema,
    text: annotationText
  }).strict(),
  z7.object({
    action: z7.literal("delivery"),
    sessionId,
    id: annotationId,
    delivery: controlDeliverySchema.exclude(["sending"])
  }).strict(),
  z7.object({
    action: z7.literal("annotate"),
    sessionId,
    target: annotationTargetSchema,
    id: annotationId,
    text: annotationText
  }).strict(),
  z7.object({
    action: z7.literal("priority"),
    sessionId,
    tree: treeId,
    task: taskId,
    priority: prioritySchema
  }).strict()
]);
var editResponseSchema = z7.discriminatedUnion("action", [
  z7.object({ action: z7.literal("import"), tree: treeId, reused: z7.boolean(), notified: z7.boolean() }),
  z7.object({
    action: z7.literal("remove"),
    removed: z7.boolean(),
    notified: z7.boolean(),
    draft: z7.boolean().default(false)
  }),
  z7.object({
    action: z7.literal("control"),
    annotation: annotationSchema,
    dispatch: z7.boolean(),
    context: z7.json()
  }),
  z7.object({ action: z7.literal("delivery") }),
  z7.object({ action: z7.literal("annotate"), annotation: annotationSchema, context: z7.json() }),
  z7.object({ action: z7.literal("priority") })
]);

// timeline/src/storage.ts
function changesUrgentPriority(previous, next, change) {
  const before = previous.view.trees.find((tree) => tree.id === change.treeId);
  const after = next.view.trees.find((tree) => tree.id === change.treeId);
  assert3(before !== void 0 && after !== void 0);
  if (change.priority === "P0" || before.tasks.find((task2) => task2.id === change.taskId)?.priority === "P0") return true;
  return prioritiesOf(before.tasks).get(change.taskId) === "P0" !== (prioritiesOf(after.tasks).get(change.taskId) === "P0");
}
var TimelineStorage = class extends Service {
  constructor(ctx, projection, config, setBrowserLanguage) {
    super(ctx, "timeline");
    this.projection = projection;
    this.config = config;
    ctx.effect(() => async () => {
      this.closed = true;
      await Promise.all(this.pending.values());
    }, "timeline: pending session writes");
    ctx.inject(["connection", "webServer"], (scope) => {
      scope.connection.rpc.handle(TIMELINE_CHANNEL, async (method, payload, signal, peer) => {
        if (peer.principal.kind !== "owner" || method !== TIMELINE_EDIT && method !== TIMELINE_LOCALE) {
          return {
            ok: false,
            error: { code: "timeline/forbidden", message: "Timeline requests require owner access.", details: {} }
          };
        }
        try {
          signal.throwIfAborted();
          if (method === TIMELINE_LOCALE) {
            setBrowserLanguage(browserLanguageSchema.parse(payload));
            return { ok: true, value: null };
          }
          return { ok: true, value: await this.edit(editRequestSchema.parse(payload)) };
        } catch (error) {
          if (signal.aborted) throw error;
          return {
            ok: false,
            error: {
              code: "timeline/request-failed",
              message: error instanceof Error ? error.message : "Timeline request failed",
              details: {}
            }
          };
        }
      });
    });
  }
  projection;
  config;
  pending = /* @__PURE__ */ new Map();
  unflushed = /* @__PURE__ */ new WeakMap();
  closed = false;
  /**
   * Check whether the live Session can own new Timeline records.
   * @param session - the session whose plan or reports are affected.
   * @returns whether the Session is live with a persistence backend.
   */
  available(session) {
    return !this.closed && this.ctx.sessions.get(session.id) === session && this.ctx.get("sessionPersistence") !== void 0;
  }
  enqueue(sessionId2, operation) {
    if (this.closed) return Promise.reject(new TimelineError("Timeline storage is closed", "TIMELINE_PERSISTENCE"));
    const result = (this.pending.get(sessionId2) ?? Promise.resolve()).then(operation);
    const settled = result.then(
      () => void 0,
      () => void 0
    );
    this.pending.set(sessionId2, settled);
    void settled.then(() => {
      if (this.pending.get(sessionId2) === settled) this.pending.delete(sessionId2);
    });
    return result;
  }
  /**
   * Only the owner Client can create feedback or set priority. Model tools have narrower operations.
   * @param input - input to validate.
   * @returns the acknowledged result of the edit.
   */
  async edit(input) {
    const request = editRequestSchema.parse(input);
    const id2 = request.sessionId;
    let agent = this.ctx.agents.get(id2);
    if (agent === void 0) {
      const restored = await this.ctx.get("sessionController")?.resolveAgent(id2);
      if (restored !== void 0 && "error" in restored) throw restored.error;
      agent = restored?.agent;
    }
    if (agent === void 0) throw new Error("Open the conversation before editing Timeline");
    const session = agent.session;
    if (!await this.ctx.sessions.flush(session))
      throw new Error("Timeline requires durable session persistence");
    if (request.action === "import" || request.action === "remove") {
      const { result, notice } = await agent.runMaintenance((signal) => this.transfer(agent, request, signal));
      if (notice !== void 0) {
        try {
          agent.followup(notice);
          if (request.action === "import" && !await this.ctx.sessions.flush(session))
            throw new Error("Timeline continuation requires durable session persistence");
          result.notified = true;
        } catch (error) {
          this.ctx.logger.warn("Timeline tree change saved, but its notification failed", error);
        }
      }
      return result;
    }
    if (request.action === "delivery") {
      await this.append(session, "plugin:timeline/delivery", (state) => {
        const annotation = state.view.annotations.find((item) => item.id === request.id);
        if (annotation?.control === void 0) throw new Error("Unknown Timeline control request");
        if (annotation.control.delivery !== "sending") return;
        return { version: 1, sessionId: session.id, id: request.id, delivery: request.delivery };
      });
      return { action: "delivery" };
    }
    if (request.action === "control") return this.control(session, request);
    if (request.action === "priority") {
      await this.append(session, "plugin:timeline/priority", (state) => {
        const tree = state.view.trees.find((tree2) => tree2.id === request.tree);
        const task2 = tree?.tasks.find((task3) => task3.id === request.task);
        if (tree === void 0 || task2 === void 0 || task2.status === "retired")
          throw new Error("Unknown available Timeline task");
        if (task2.priority === request.priority) return;
        return {
          version: 1,
          sessionId: session.id,
          treeId: request.tree,
          taskId: task2.id,
          priority: request.priority,
          createdAt: Date.now()
        };
      });
      return { action: "priority" };
    }
    let saved;
    let context;
    await this.append(session, "plugin:timeline/annotation", (state) => {
      const existing = state.view.annotations.find((annotation) => annotation.id === request.id);
      if (existing !== void 0 && (existing.control !== void 0 || existing.text !== request.text || JSON.stringify(existing.target) !== JSON.stringify(request.target)))
        throw new Error("An annotation identity cannot be reused for different content");
      const target = request.target;
      if (target.kind === "report") {
        const report = state.view.reports.find((report2) => report2.id === target.report);
        if (report === void 0) throw new Error("Unknown Timeline report");
        context = {
          kind: "report",
          report: report.id,
          start: new Date(report.start).toISOString(),
          end: new Date(report.end).toISOString(),
          level: report.level,
          summary: report.summary
        };
      } else {
        const tree = state.view.trees.find((tree2) => tree2.id === target.tree);
        const task2 = target.kind === "task" ? tree?.tasks.find((task3) => task3.id === target.task) : void 0;
        if (tree === void 0 || target.kind === "task" && (task2 === void 0 || task2.status === "retired" && existing === void 0))
          throw new Error("Unknown available Timeline task");
        const progress = task2 === void 0 ? void 0 : measureAll(tree.tasks).get(task2.id);
        context = {
          kind: target.kind,
          tree: tree.id,
          treeTitle: tree.title,
          task: task2?.id ?? null,
          taskTitle: task2?.title ?? null,
          status: task2?.status ?? null,
          progress: progress === void 0 ? null : { progress: progress.progress, status: progress.status },
          description: task2?.description ?? tree.description,
          note: task2?.note ?? "",
          priority: task2?.priority ?? null,
          details: task2?.details ?? ""
        };
      }
      saved = existing ?? {
        id: request.id,
        target: request.target,
        text: request.text,
        createdAt: Date.now(),
        reply: null
      };
      return existing === void 0 ? { version: 1, sessionId: session.id, annotation: saved } : void 0;
    });
    assert3(saved !== void 0 && context !== void 0, "Timeline annotation was not saved");
    return { action: "annotate", annotation: saved, context };
  }
  async transfer(agent, request, signal) {
    const session = agent.session;
    let notice;
    let result;
    if (request.action === "import") {
      const checkpoint = Checkpoint.fromString(request.content);
      const digest = createHash2("sha256").update(JSON.stringify(checkpoint.toJson())).digest("hex");
      const id2 = treeId.parse(
        newId("tree", request.copy ? createHash2("sha256").update(request.id).digest("hex") : digest)
      );
      let reused = false;
      await this.append(session, "plugin:timeline/import", (state2) => {
        signal.throwIfAborted();
        const previous = state2.calls.find((call2) => call2.id === request.id);
        if (previous !== void 0) {
          if (previous.tree !== id2)
            throw new Error("Import request identity was already used for another checkpoint");
          if (!state2.view.trees.some((tree3) => tree3.id === id2))
            throw new Error("This import was removed. Start a new import to restore it.");
          reused = true;
          return;
        }
        const prepared = state2.preparedImport;
        if (prepared?.callId === request.id) {
          if (prepared.tree.id !== id2)
            throw new Error("Import request identity was already used for another checkpoint");
          reused = true;
          return;
        }
        const existing = state2.view.trees.find((tree3) => tree3.id === id2);
        if (existing === void 0 && state2.view.trees.length >= this.config.maxTrees)
          throw new Error(`At most ${this.config.maxTrees} task trees; remove an unused tree first`);
        if (checkpoint.tasks.length > this.config.maxTasks)
          throw new Error(`At most ${this.config.maxTasks} tasks per tree`);
        const restored = checkpoint.restore(id2, Date.now());
        const tree2 = existing ?? restored.tree;
        reused = existing !== void 0;
        const noticeText = `Continue task tree ${JSON.stringify(tree2.title)} (${tree2.id}) from its saved progress. Tasks active at the checkpoint: ${restored.resume.join(", ") || "none"}. Preserve other user pauses and recheck blockers.`;
        const notice2 = request.continue ? createUserMessage2({ source: { kind: "user" }, content: [{ type: "text", text: noticeText }] }) : void 0;
        return {
          version: 1,
          sessionId: session.id,
          callId: request.id,
          tree: tree2,
          annotations: existing === void 0 ? restored.annotations : [],
          prepared: true,
          ...notice2 === void 0 ? {} : { continuation: { id: notice2.id, text: noticeText } }
        };
      });
      await this.append(session, "plugin:timeline/import-ready", (state2) => {
        if (state2.preparedImport?.callId !== request.id) return;
        signal.throwIfAborted();
        return { version: 1, sessionId: session.id, callId: request.id };
      });
      const state = this.stateOf(session);
      const call = state.calls.find((item) => item.id === request.id);
      const tree = state.view.trees.find((item) => item.id === id2);
      assert3(call !== void 0 && tree !== void 0, "Timeline import was not published");
      const continuation = request.continue ? call.continuation : void 0;
      let notified = false;
      if (continuation !== void 0) {
        if (call.notified) {
          notified = !agent.inbox.nextTurn.some((message) => message.id === continuation.id);
        } else {
          notice = {
            ...createUserMessage2({ source: { kind: "user" }, content: [{ type: "text", text: continuation.text }] }),
            id: continuation.id
          };
        }
      }
      result = { action: "import", tree: id2, reused, notified };
    } else {
      let removed = false;
      let draft = false;
      await this.append(session, "plugin:timeline/remove", (state) => {
        signal.throwIfAborted();
        if (request.draft === true && state.hasTurn)
          throw new Error("This conversation has started. Remove the task tree from its menu instead.");
        const tree = state.view.trees.find((tree2) => tree2.id === request.tree);
        if (tree === void 0) return;
        removed = true;
        draft = !state.hasTurn;
        if (!draft)
          notice = createUserMessage2({
            source: { kind: "user" },
            content: [{
              type: "text",
              text: `User removed task tree ${JSON.stringify(tree.title)} (${tree.id}) from this session. Leave it removed unless the user requests it again.`
            }]
          });
        return { version: 1, sessionId: session.id, treeId: tree.id };
      });
      result = { action: "remove", removed, notified: false, draft };
    }
    signal.throwIfAborted();
    return { result, notice };
  }
  /** Save before admission. The write queue arbitrates duplicate requests from every Client. */
  async control(session, request) {
    let saved;
    const update = { dispatch: false };
    let context = null;
    await this.append(session, "plugin:timeline/annotation", (state) => {
      const existing = state.view.annotations.find((item) => item.id === request.id);
      if (existing !== void 0 && (existing.control?.action !== request.intent || existing.text !== request.text || JSON.stringify(existing.target) !== JSON.stringify(request.target)))
        throw new Error("A request identity cannot be reused for different content");
      saved = existing ?? pendingControl(state.view.annotations, request.target, state.view.trees, Date.now());
      if (saved !== void 0) {
        context = { target: saved.target };
        return;
      }
      const target = request.target;
      const tree = state.view.trees.find((tree2) => tree2.id === target.tree);
      const task2 = target.kind === "task" ? tree?.tasks.find((task3) => task3.id === target.task) : void 0;
      if (tree === void 0 || target.kind === "task" && (task2 === void 0 || task2.status === "retired"))
        throw new Error("Unknown available Timeline task");
      context = { target, treeTitle: tree.title, taskTitle: task2?.title ?? null };
      saved = {
        id: request.id,
        target,
        text: request.text,
        createdAt: Date.now(),
        reply: null,
        control: { action: request.intent, delivery: "sending", outcome: null }
      };
      update.dispatch = true;
      return { version: 1, sessionId: session.id, annotation: saved };
    });
    assert3(saved !== void 0, "Timeline request was not saved");
    const id2 = saved.id;
    const current = this.stateOf(session).view.annotations.find((item) => item.id === id2);
    return {
      action: "control",
      annotation: current ?? saved,
      dispatch: update.dispatch && current?.control?.outcome === null,
      context
    };
  }
  /** Read task, report, and activity state from the Session projection. */
  stateOf(session) {
    return this.projection.stateOf(session);
  }
  /**
   * Serialize changes to one live Session and flush its append-only log.
   * @param session - session whose plan or reports are affected.
   * @param type - discriminator of the record being written.
   * @param change - record or function that derives it from the latest state.
   */
  append(session, type, change) {
    return this.enqueue(session.id, async () => {
      if (!this.available(session))
        throw new TimelineError("Timeline requires a live session with durable persistence", "TIMELINE_PERSISTENCE");
      const previous = this.stateOf(session);
      const data = typeof change === "function" ? change(previous) : change;
      if (data !== void 0) {
        if (data.sessionId !== session.id) throw new TimelineError("Timeline update belongs to another session");
        if (type === "plugin:timeline/annotation" && previous.view.annotations.length >= MAX_ANNOTATIONS || type === "plugin:timeline/import" && "annotations" in data && previous.view.annotations.length + data.annotations.length > MAX_ANNOTATIONS)
          throw new TimelineError(`Timeline can hold up to ${MAX_ANNOTATIONS} discussions per Session`);
        const serialized = JSON.stringify(data);
        if (type === "plugin:timeline/tree" && Buffer.byteLength(serialized) > CHECKPOINT_BYTES)
          throw new TimelineError("Task tree updates can save up to 2 MiB. Shorten task details or split work across trees.");
        const encoded = JSON.parse(serialized);
        if (type === "plugin:timeline/request") requestRecordSchema.parse(encoded);
        const next = type === "plugin:timeline/request" ? previous : foldRecord(previous, { type, data: encoded });
        if (type !== "plugin:timeline/request" && next === previous) throw new TimelineError("Invalid Timeline update");
        const urgent2 = this.unflushed.get(session) === true || "priority" in data && changesUrgentPriority(previous, next, data);
        appendPluginRecord(session, type, encoded);
        this.unflushed.set(session, urgent2);
      }
      const urgent = this.unflushed.get(session);
      if (urgent === void 0) return;
      try {
        if (!await this.ctx.sessions.flush(session)) throw new Error("No Session persistence listener");
      } catch (error) {
        throw new TimelineError("Timeline could not save the Session. Check storage and retry.", "TIMELINE_PERSISTENCE", { cause: error });
      }
      this.unflushed.delete(session);
      if (urgent) this.ctx.emit("timeline/priority", session);
    });
  }
};

// timeline/src/command.ts
var usage = 'Use /timeline @plan.timeline.json [--continue] [--copy]. Quote paths with spaces: @"my plan.timeline.json".';
function installCommand(ctx, storage) {
  ctx.inject(["commands"], (scope) => {
    scope.effect(
      () => scope.commands.register({
        name: "timeline",
        description: "Open Timeline or import a task-tree checkpoint",
        input: { hint: "@checkpoint.timeline.json [--continue] [--copy]" },
        handler: async ({ agent, rawInput, commandId, signal }) => {
          if (!rawInput.trim()) return { kind: "success", text: usage };
          const input = rawInput.trim();
          const match = /^@(?:"[^"\r\n]+"|[^\s"]+)(?=\s|$)/u.exec(input);
          if (match === null) return { kind: "error", text: usage };
          const reference = match[0];
          const path = reference.startsWith('@"') ? reference.slice(2, -1) : reference.slice(1);
          const options = input.slice(reference.length).trim().split(/\s+/u).filter(Boolean);
          if (options.some((flag) => flag !== "--continue" && flag !== "--copy") || new Set(options).size !== options.length)
            return { kind: "error", text: usage };
          if (agent.status !== "idle")
            return {
              kind: "error",
              text: "Wait for the current turn to finish, or stop it before importing a task tree."
            };
          const fs = agent.ctx.get("fs");
          if (fs === void 0)
            return {
              kind: "error",
              text: "The filesystem is unavailable. Import the checkpoint with the Timeline file picker."
            };
          try {
            const target = await fs.resolve(path, {
              ...agent.session.header.cwd === void 0 ? {} : { cwd: agent.session.header.cwd },
              signal
            });
            const bytes = await fs.readBytes(target, signal, CHECKPOINT_BYTES);
            const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
            signal.throwIfAborted();
            const result = await storage.edit({
              action: "import",
              sessionId: agent.session.id,
              id: commandId,
              content,
              copy: options.includes("--copy"),
              continue: options.includes("--continue")
            });
            if (result.action !== "import") throw new Error("Invalid Timeline import response");
            const continued = options.includes("--continue") ? result.notified ? " Continuation requested." : " Check the conversation before requesting continuation again." : "";
            return {
              kind: "success",
              text: `${result.reused ? "Opened the existing copy" : "Imported the task tree"} (${result.tree}).${continued}`
            };
          } catch (error) {
            return {
              kind: "error",
              text: error instanceof Error ? error.message : "Timeline import failed"
            };
          }
        }
      }),
      "timeline: checkpoint command"
    );
  });
}

// timeline/src/activation.ts
var TIMELINE_ACTIVATION_CHANNEL = "/mek-timeline";
var TIMELINE_ACTIVATION_METHOD = "activation";
var TIMELINE_CONFLICTS = {
  official: "@deepseek-ai/dsh-timeline",
  standalone: "@magolor/dsh-timeline"
};

// timeline/src/group-plan.ts
function publishGroupPlan(storage, session, plan) {
  const id2 = treeId.parse(`mek-group-${plan.id}`);
  const itemId = taskId.parse("assignment");
  return storage.append(session, "plugin:timeline/tree", (state) => {
    const tree = state.view.trees.find((item) => item.id === id2);
    const previous = tree?.tasks.find((item) => item.id === itemId);
    const { title, description, status, note, details } = plan;
    if (previous?.title === title && previous.description === description && previous.status === status && previous.note === note && previous.details === details) return;
    const at = Date.now();
    const tasks = patchTasks(tree?.tasks ?? [], [{
      id: itemId,
      title,
      description,
      status,
      note,
      details,
      done: [status === "done" ? 1 : 0, 1],
      remaining: status === "done" ? 0 : null
    }], at, Math.max(1, tree?.tasks.length ?? 0) + (tree && !previous ? 1 : 0));
    return {
      version: 1,
      sessionId: session.id,
      callId: id2,
      tree: { id: id2, title, description, tasks, createdAt: tree?.createdAt ?? at, lastTaskUpdate: at }
    };
  });
}

// timeline/src/index.ts
var name = "timeline";
var inject = [
  "loader",
  "agents",
  "sessions",
  "sessionProjections",
  "tools",
  "llm",
  "systemPrompt"
];
async function apply(ctx, input) {
  const packages = new Set([...ctx.loader.entries()].filter((entry) => !entry.disabled).map((entry) => entry.options.name.replace(/^cordis:/u, "")));
  const activation = packages.has(TIMELINE_CONFLICTS.official) ? "official" : packages.has(TIMELINE_CONFLICTS.standalone) ? "standalone" : "active";
  ctx.inject(["connection", "webServer"], (scope) => {
    scope.connection.rpc.handle(TIMELINE_ACTIVATION_CHANNEL, (method) => {
      if (method === TIMELINE_ACTIVATION_METHOD) return { ok: true, value: activation };
      return { ok: false, error: { code: "timeline/unknown-method", message: "Unknown MEK Timeline method.", details: {} } };
    });
  });
  if (activation !== "active") {
    ctx.logger.info("MEK Timeline is waiting for %s to be disabled. Turn it off, then restart DSH to switch.", TIMELINE_CONFLICTS[activation]);
    return;
  }
  let browserLanguage;
  const config = liveConfig(input, () => {
    const locale = ctx.get("settings")?.describe({ redactSecrets: true }).find((item) => item.ns === "locale");
    const value = locale?.value;
    return typeof value === "object" && value !== null && "preference" in value && typeof value.preference === "string" ? value.preference : browserLanguage ?? Intl.DateTimeFormat().resolvedOptions().locale;
  });
  const projection = await registerProjection(ctx);
  const storage = new TimelineStorage(ctx, projection, config, (language) => {
    browserLanguage = language;
  });
  installTools(ctx, config, storage);
  ctx.provide("mekTimelineGroupPlan", (session, plan) => publishGroupPlan(storage, session, plan));
  ctx.provide("mekTimelineShared", true);
  const owns = planningOwner(ctx);
  installDelegation(ctx, owns);
  installCommand(ctx, storage);
  installGuidance(ctx, config, storage, owns);
  installReminders(ctx, config, storage, owns);
  installReports(ctx, config, storage, owns);
}
export {
  Config,
  apply,
  inject,
  name
};
