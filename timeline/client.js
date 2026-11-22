// Generated from timeline/src by npm run build.
window.__ModuleLoader__.load({
  id: 'dsh-mek-bot-timeline',
  factory: require => {
    const module = { exports: {} }
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// timeline/src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react14 = require("react");
var import_dsh_client_store2 = require("@deepseek-ai/dsh-client-store");

// timeline/src/client/Panel.tsx
var import_react9 = require("react");

// timeline/src/policy.ts
var TIMELINE_CONFIG_ID = "mek-timeline";
var MINUTE_MS = 6e4;
var PROMPT_LIMIT = 32768;
var defaultReportCadence = { intervalMs: 15 * MINUTE_MS, rollupFactors: [4, 4] };
var HISTORY_MS = 7 * 24 * 60 * MINUTE_MS;
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
function minuteAt(time) {
  return Math.floor(time / MINUTE_MS) * MINUTE_MS;
}

// timeline/src/client/store.ts
var import_dsh_client_store = require("@deepseek-ai/dsh-client-store");
var emptyDraft = { open: false, text: "", id: null, busy: false, messageKey: null };
function createViewStore() {
  return (0, import_dsh_client_store.defineStore)(viewStoreOptions);
}
var viewStoreOptions = {
  init: () => ({
    tree: null,
    collapsed: {},
    zoom: null,
    level: null,
    scrollMs: 0,
    scrollLeft: 0,
    anchor: null,
    historyReport: void 0,
    tab: "tasks",
    historyOpen: false,
    details: { tasks: [], timeline: [] },
    drafts: {}
  }),
  actions: {
    open: (state, tree, task2) => {
      state.tree = tree;
      state.tab = "tasks";
      state.details.tasks = task2 === void 0 ? [] : [{ target: { kind: "task", tree, task: task2 }, scrollTop: 0 }];
    },
    forgetTree: (state, tree) => {
      if (state.tree === tree) state.tree = null;
      for (const tab of ["tasks", "timeline"]) {
        state.details[tab] = state.details[tab].filter(
          ({ target }) => target.kind !== "task" || target.tree !== tree
        );
      }
    },
    update: (state, patch) => {
      Object.assign(state, patch);
    },
    draft: (state, key, patch) => {
      state.drafts = { ...state.drafts, [key]: { ...emptyDraft, ...state.drafts[key], ...patch } };
    },
    toggle: (state, tree, id2) => {
      const collapsed = Object.hasOwn(state.collapsed, tree) ? state.collapsed[tree] : void 0;
      state.collapsed = {
        ...state.collapsed,
        [tree]: collapsed?.includes(id2) ? collapsed.filter((item) => item !== id2) : [...collapsed ?? [], id2]
      };
    }
  }
};
function createSettingsStore() {
  return (0, import_dsh_client_store.defineStore)({
    init: () => ({
      draft: null,
      revision: void 0,
      level: -1,
      units: [],
      saving: false,
      messageKey: null
    }),
    actions: {
      update: (state, patch) => {
        Object.assign(state, patch);
      }
    }
  });
}

// timeline/src/client/Schedule.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// timeline/src/periods.ts
var import_zod = require("zod");
var periodPolicy = import_zod.z.array(import_zod.z.number().positive().max(864e5)).min(1).max(5);
function savedPeriod(report) {
  try {
    const values = periodPolicy.parse(JSON.parse(report.policy));
    if (report.level >= values.length) return void 0;
    return values.slice(0, report.level + 1).reduce((period, factor) => Math.round(period * factor));
  } catch {
    return void 0;
  }
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
function formatPeriod(ms) {
  const [unit, size] = ms >= 864e5 ? ["d", 864e5] : ms >= 36e5 ? ["h", 36e5] : ms >= 6e4 ? ["m", 6e4] : ["s", 1e3];
  return `${Number((ms / size).toFixed(2))}${unit}`;
}
function formatDuration(ms) {
  const seconds2 = Math.max(0, Math.floor(ms / 1e3));
  if (seconds2 < 60) return `${seconds2}s`;
  if (seconds2 < 3600) return `${Math.floor(seconds2 / 60)}m ${seconds2 % 60}s`;
  return `${Math.floor(seconds2 / 3600)}h ${Math.floor(seconds2 % 3600 / 60)}m`;
}

// node_modules/d3-time/src/interval.js
var t0 = /* @__PURE__ */ new Date();
var t1 = /* @__PURE__ */ new Date();
function timeInterval(floori, offseti, count, field) {
  function interval(date) {
    return floori(date = arguments.length === 0 ? /* @__PURE__ */ new Date() : /* @__PURE__ */ new Date(+date)), date;
  }
  interval.floor = (date) => {
    return floori(date = /* @__PURE__ */ new Date(+date)), date;
  };
  interval.ceil = (date) => {
    return floori(date = new Date(date - 1)), offseti(date, 1), floori(date), date;
  };
  interval.round = (date) => {
    const d0 = interval(date), d1 = interval.ceil(date);
    return date - d0 < d1 - date ? d0 : d1;
  };
  interval.offset = (date, step) => {
    return offseti(date = /* @__PURE__ */ new Date(+date), step == null ? 1 : Math.floor(step)), date;
  };
  interval.range = (start, stop, step) => {
    const range = [];
    start = interval.ceil(start);
    step = step == null ? 1 : Math.floor(step);
    if (!(start < stop) || !(step > 0)) return range;
    let previous;
    do
      range.push(previous = /* @__PURE__ */ new Date(+start)), offseti(start, step), floori(start);
    while (previous < start && start < stop);
    return range;
  };
  interval.filter = (test) => {
    return timeInterval((date) => {
      if (date >= date) while (floori(date), !test(date)) date.setTime(date - 1);
    }, (date, step) => {
      if (date >= date) {
        if (step < 0) while (++step <= 0) {
          while (offseti(date, -1), !test(date)) {
          }
        }
        else while (--step >= 0) {
          while (offseti(date, 1), !test(date)) {
          }
        }
      }
    });
  };
  if (count) {
    interval.count = (start, end) => {
      t0.setTime(+start), t1.setTime(+end);
      floori(t0), floori(t1);
      return Math.floor(count(t0, t1));
    };
    interval.every = (step) => {
      step = Math.floor(step);
      return !isFinite(step) || !(step > 0) ? null : !(step > 1) ? interval : interval.filter(field ? (d) => field(d) % step === 0 : (d) => interval.count(0, d) % step === 0);
    };
  }
  return interval;
}

// node_modules/d3-time/src/millisecond.js
var millisecond = timeInterval(() => {
}, (date, step) => {
  date.setTime(+date + step);
}, (start, end) => {
  return end - start;
});
millisecond.every = (k) => {
  k = Math.floor(k);
  if (!isFinite(k) || !(k > 0)) return null;
  if (!(k > 1)) return millisecond;
  return timeInterval((date) => {
    date.setTime(Math.floor(date / k) * k);
  }, (date, step) => {
    date.setTime(+date + step * k);
  }, (start, end) => {
    return (end - start) / k;
  });
};
var milliseconds = millisecond.range;

// node_modules/d3-time/src/duration.js
var durationSecond = 1e3;
var durationMinute = durationSecond * 60;
var durationHour = durationMinute * 60;
var durationDay = durationHour * 24;
var durationWeek = durationDay * 7;
var durationMonth = durationDay * 30;
var durationYear = durationDay * 365;

// node_modules/d3-time/src/second.js
var second = timeInterval((date) => {
  date.setTime(date - date.getMilliseconds());
}, (date, step) => {
  date.setTime(+date + step * durationSecond);
}, (start, end) => {
  return (end - start) / durationSecond;
}, (date) => {
  return date.getUTCSeconds();
});
var seconds = second.range;

// node_modules/d3-time/src/minute.js
var timeMinute = timeInterval((date) => {
  date.setTime(date - date.getMilliseconds() - date.getSeconds() * durationSecond);
}, (date, step) => {
  date.setTime(+date + step * durationMinute);
}, (start, end) => {
  return (end - start) / durationMinute;
}, (date) => {
  return date.getMinutes();
});
var timeMinutes = timeMinute.range;
var utcMinute = timeInterval((date) => {
  date.setUTCSeconds(0, 0);
}, (date, step) => {
  date.setTime(+date + step * durationMinute);
}, (start, end) => {
  return (end - start) / durationMinute;
}, (date) => {
  return date.getUTCMinutes();
});
var utcMinutes = utcMinute.range;

// node_modules/d3-time/src/hour.js
var timeHour = timeInterval((date) => {
  date.setTime(date - date.getMilliseconds() - date.getSeconds() * durationSecond - date.getMinutes() * durationMinute);
}, (date, step) => {
  date.setTime(+date + step * durationHour);
}, (start, end) => {
  return (end - start) / durationHour;
}, (date) => {
  return date.getHours();
});
var timeHours = timeHour.range;
var utcHour = timeInterval((date) => {
  date.setUTCMinutes(0, 0, 0);
}, (date, step) => {
  date.setTime(+date + step * durationHour);
}, (start, end) => {
  return (end - start) / durationHour;
}, (date) => {
  return date.getUTCHours();
});
var utcHours = utcHour.range;

// node_modules/d3-time/src/day.js
var timeDay = timeInterval(
  (date) => date.setHours(0, 0, 0, 0),
  (date, step) => date.setDate(date.getDate() + step),
  (start, end) => (end - start - (end.getTimezoneOffset() - start.getTimezoneOffset()) * durationMinute) / durationDay,
  (date) => date.getDate() - 1
);
var timeDays = timeDay.range;
var utcDay = timeInterval((date) => {
  date.setUTCHours(0, 0, 0, 0);
}, (date, step) => {
  date.setUTCDate(date.getUTCDate() + step);
}, (start, end) => {
  return (end - start) / durationDay;
}, (date) => {
  return date.getUTCDate() - 1;
});
var utcDays = utcDay.range;
var unixDay = timeInterval((date) => {
  date.setUTCHours(0, 0, 0, 0);
}, (date, step) => {
  date.setUTCDate(date.getUTCDate() + step);
}, (start, end) => {
  return (end - start) / durationDay;
}, (date) => {
  return Math.floor(date / durationDay);
});
var unixDays = unixDay.range;

// node_modules/d3-time/src/week.js
function timeWeekday(i) {
  return timeInterval((date) => {
    date.setDate(date.getDate() - (date.getDay() + 7 - i) % 7);
    date.setHours(0, 0, 0, 0);
  }, (date, step) => {
    date.setDate(date.getDate() + step * 7);
  }, (start, end) => {
    return (end - start - (end.getTimezoneOffset() - start.getTimezoneOffset()) * durationMinute) / durationWeek;
  });
}
var timeSunday = timeWeekday(0);
var timeMonday = timeWeekday(1);
var timeTuesday = timeWeekday(2);
var timeWednesday = timeWeekday(3);
var timeThursday = timeWeekday(4);
var timeFriday = timeWeekday(5);
var timeSaturday = timeWeekday(6);
var timeSundays = timeSunday.range;
var timeMondays = timeMonday.range;
var timeTuesdays = timeTuesday.range;
var timeWednesdays = timeWednesday.range;
var timeThursdays = timeThursday.range;
var timeFridays = timeFriday.range;
var timeSaturdays = timeSaturday.range;
function utcWeekday(i) {
  return timeInterval((date) => {
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 7 - i) % 7);
    date.setUTCHours(0, 0, 0, 0);
  }, (date, step) => {
    date.setUTCDate(date.getUTCDate() + step * 7);
  }, (start, end) => {
    return (end - start) / durationWeek;
  });
}
var utcSunday = utcWeekday(0);
var utcMonday = utcWeekday(1);
var utcTuesday = utcWeekday(2);
var utcWednesday = utcWeekday(3);
var utcThursday = utcWeekday(4);
var utcFriday = utcWeekday(5);
var utcSaturday = utcWeekday(6);
var utcSundays = utcSunday.range;
var utcMondays = utcMonday.range;
var utcTuesdays = utcTuesday.range;
var utcWednesdays = utcWednesday.range;
var utcThursdays = utcThursday.range;
var utcFridays = utcFriday.range;
var utcSaturdays = utcSaturday.range;

// node_modules/d3-time/src/month.js
var timeMonth = timeInterval((date) => {
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
}, (date, step) => {
  date.setMonth(date.getMonth() + step);
}, (start, end) => {
  return end.getMonth() - start.getMonth() + (end.getFullYear() - start.getFullYear()) * 12;
}, (date) => {
  return date.getMonth();
});
var timeMonths = timeMonth.range;
var utcMonth = timeInterval((date) => {
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
}, (date, step) => {
  date.setUTCMonth(date.getUTCMonth() + step);
}, (start, end) => {
  return end.getUTCMonth() - start.getUTCMonth() + (end.getUTCFullYear() - start.getUTCFullYear()) * 12;
}, (date) => {
  return date.getUTCMonth();
});
var utcMonths = utcMonth.range;

// node_modules/d3-time/src/year.js
var timeYear = timeInterval((date) => {
  date.setMonth(0, 1);
  date.setHours(0, 0, 0, 0);
}, (date, step) => {
  date.setFullYear(date.getFullYear() + step);
}, (start, end) => {
  return end.getFullYear() - start.getFullYear();
}, (date) => {
  return date.getFullYear();
});
timeYear.every = (k) => {
  return !isFinite(k = Math.floor(k)) || !(k > 0) ? null : timeInterval((date) => {
    date.setFullYear(Math.floor(date.getFullYear() / k) * k);
    date.setMonth(0, 1);
    date.setHours(0, 0, 0, 0);
  }, (date, step) => {
    date.setFullYear(date.getFullYear() + step * k);
  });
};
var timeYears = timeYear.range;
var utcYear = timeInterval((date) => {
  date.setUTCMonth(0, 1);
  date.setUTCHours(0, 0, 0, 0);
}, (date, step) => {
  date.setUTCFullYear(date.getUTCFullYear() + step);
}, (start, end) => {
  return end.getUTCFullYear() - start.getUTCFullYear();
}, (date) => {
  return date.getUTCFullYear();
});
utcYear.every = (k) => {
  return !isFinite(k = Math.floor(k)) || !(k > 0) ? null : timeInterval((date) => {
    date.setUTCFullYear(Math.floor(date.getUTCFullYear() / k) * k);
    date.setUTCMonth(0, 1);
    date.setUTCHours(0, 0, 0, 0);
  }, (date, step) => {
    date.setUTCFullYear(date.getUTCFullYear() + step * k);
  });
};
var utcYears = utcYear.range;

// node_modules/d3-array/src/ascending.js
function ascending(a, b) {
  return a == null || b == null ? NaN : a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
}

// node_modules/d3-array/src/descending.js
function descending(a, b) {
  return a == null || b == null ? NaN : b < a ? -1 : b > a ? 1 : b >= a ? 0 : NaN;
}

// node_modules/d3-array/src/bisector.js
function bisector(f) {
  let compare1, compare2, delta;
  if (f.length !== 2) {
    compare1 = ascending;
    compare2 = (d, x) => ascending(f(d), x);
    delta = (d, x) => f(d) - x;
  } else {
    compare1 = f === ascending || f === descending ? f : zero;
    compare2 = f;
    delta = f;
  }
  function left(a, x, lo = 0, hi = a.length) {
    if (lo < hi) {
      if (compare1(x, x) !== 0) return hi;
      do {
        const mid = lo + hi >>> 1;
        if (compare2(a[mid], x) < 0) lo = mid + 1;
        else hi = mid;
      } while (lo < hi);
    }
    return lo;
  }
  function right(a, x, lo = 0, hi = a.length) {
    if (lo < hi) {
      if (compare1(x, x) !== 0) return hi;
      do {
        const mid = lo + hi >>> 1;
        if (compare2(a[mid], x) <= 0) lo = mid + 1;
        else hi = mid;
      } while (lo < hi);
    }
    return lo;
  }
  function center(a, x, lo = 0, hi = a.length) {
    const i = left(a, x, lo, hi - 1);
    return i > lo && delta(a[i - 1], x) > -delta(a[i], x) ? i - 1 : i;
  }
  return { left, center, right };
}
function zero() {
  return 0;
}

// node_modules/d3-array/src/ticks.js
var e10 = Math.sqrt(50);
var e5 = Math.sqrt(10);
var e2 = Math.sqrt(2);
function tickSpec(start, stop, count) {
  const step = (stop - start) / Math.max(0, count), power = Math.floor(Math.log10(step)), error = step / Math.pow(10, power), factor = error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1;
  let i1, i2, inc;
  if (power < 0) {
    inc = Math.pow(10, -power) / factor;
    i1 = Math.round(start * inc);
    i2 = Math.round(stop * inc);
    if (i1 / inc < start) ++i1;
    if (i2 / inc > stop) --i2;
    inc = -inc;
  } else {
    inc = Math.pow(10, power) * factor;
    i1 = Math.round(start / inc);
    i2 = Math.round(stop / inc);
    if (i1 * inc < start) ++i1;
    if (i2 * inc > stop) --i2;
  }
  if (i2 < i1 && 0.5 <= count && count < 2) return tickSpec(start, stop, count * 2);
  return [i1, i2, inc];
}
function tickIncrement(start, stop, count) {
  stop = +stop, start = +start, count = +count;
  return tickSpec(start, stop, count)[2];
}
function tickStep(start, stop, count) {
  stop = +stop, start = +start, count = +count;
  const reverse = stop < start, inc = reverse ? tickIncrement(stop, start, count) : tickIncrement(start, stop, count);
  return (reverse ? -1 : 1) * (inc < 0 ? 1 / -inc : inc);
}

// node_modules/d3-time/src/ticks.js
function ticker(year, month, week, day, hour2, minute) {
  const tickIntervals = [
    [second, 1, durationSecond],
    [second, 5, 5 * durationSecond],
    [second, 15, 15 * durationSecond],
    [second, 30, 30 * durationSecond],
    [minute, 1, durationMinute],
    [minute, 5, 5 * durationMinute],
    [minute, 15, 15 * durationMinute],
    [minute, 30, 30 * durationMinute],
    [hour2, 1, durationHour],
    [hour2, 3, 3 * durationHour],
    [hour2, 6, 6 * durationHour],
    [hour2, 12, 12 * durationHour],
    [day, 1, durationDay],
    [day, 2, 2 * durationDay],
    [week, 1, durationWeek],
    [month, 1, durationMonth],
    [month, 3, 3 * durationMonth],
    [year, 1, durationYear]
  ];
  function ticks2(start, stop, count) {
    const reverse = stop < start;
    if (reverse) [start, stop] = [stop, start];
    const interval = count && typeof count.range === "function" ? count : tickInterval(start, stop, count);
    const ticks3 = interval ? interval.range(start, +stop + 1) : [];
    return reverse ? ticks3.reverse() : ticks3;
  }
  function tickInterval(start, stop, count) {
    const target = Math.abs(stop - start) / count;
    const i = bisector(([, , step2]) => step2).right(tickIntervals, target);
    if (i === tickIntervals.length) return year.every(tickStep(start / durationYear, stop / durationYear, count));
    if (i === 0) return millisecond.every(Math.max(tickStep(start, stop, count), 1));
    const [t, step] = tickIntervals[target / tickIntervals[i - 1][2] < tickIntervals[i][2] / target ? i - 1 : i];
    return t.every(step);
  }
  return [ticks2, tickInterval];
}
var [utcTicks, utcTickInterval] = ticker(utcYear, utcMonth, utcSunday, unixDay, utcHour, utcMinute);
var [timeTicks, timeTickInterval] = ticker(timeYear, timeMonth, timeSunday, timeDay, timeHour, timeMinute);

// timeline/src/client/TimeScale.ts
var TimeScale = class {
  constructor(anchor, pixelsPerHour) {
    this.anchor = anchor;
    this.start = anchor - HISTORY_MS;
    this.height = HISTORY_MS / 36e5 * pixelsPerHour;
  }
  anchor;
  start;
  /** Full pixel height of the visible history window. */
  height;
  clampTime(time) {
    return Math.max(this.start, Math.min(this.anchor, time));
  }
  /**
   * Map a wall clock timestamp to the shared vertical axis.
   * @param time - wall clock timestamp in milliseconds.
   * @returns vertical position in pixels.
   */
  position(time) {
    return this.height * (1 - (this.clampTime(time) - this.start) / HISTORY_MS);
  }
  /**
   * Map a vertical offset back to wall clock time.
   * @param position - vertical offset in pixels.
   * @returns wall clock timestamp in milliseconds.
   */
  time(position) {
    const fraction = position / this.height;
    return this.clampTime(this.anchor * (1 - fraction) + this.start * fraction);
  }
  /**
   * Keep the grid at minute resolution, including empty spans between reports.
   * @param top - first visible pixel on the axis.
   * @param height - visible height of the axis in pixels.
   * @param spacing - desired distance between tick labels in pixels.
   * @returns visible calendar ticks in time order.
   */
  ticks(top, height, spacing) {
    let previous = -Infinity;
    return timeTicks(new Date(this.time(top)), new Date(this.time(top + height)), Math.max(1, height / spacing)).filter((value) => Number(value) % MINUTE_MS === 0).sort((a, b) => Number(b) - Number(a)).filter((value) => {
      const position = this.position(Number(value));
      if (position - previous < spacing * 0.65) return false;
      previous = position;
      return true;
    });
  }
};

// timeline/src/client/Schedule.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var hour = 36e5;
function scaleAt(zoom, scales) {
  const position = Math.max(0, Math.min(scales.length - 1, zoom));
  const lower = Math.floor(position);
  const start = scales[lower];
  const end = scales[Math.ceil(position)];
  return start * (end / start) ** (position - lower);
}
function zoomFor(pixels, scales) {
  const upper = scales.findIndex((value) => value >= pixels);
  if (upper <= 0) return upper === 0 ? 0 : scales.length - 1;
  const low = scales[upper - 1];
  const high = scales[upper];
  return upper - 1 + Math.log(pixels / low) / Math.log(high / low);
}
function Schedule({ view, cadence, state, now, update, openReport, t, locale = "en" }) {
  const scroll = (0, import_react.useRef)(null);
  const horizontal = (0, import_react.useRef)(null);
  const fontMetric = (0, import_react.useRef)(null);
  const [viewport, setViewport] = (0, import_react.useState)(420);
  const [fontSize, setFontSize] = (0, import_react.useState)(13);
  const [frameInset, setFrameInset] = (0, import_react.useState)(null);
  const clock = minuteAt(now);
  const liveAnchor = view.reports.reduce(
    (latest2, report) => report.end < clock + MINUTE_MS ? Math.max(latest2, report.end) : latest2,
    clock
  );
  const anchor = state.anchor ?? liveAnchor;
  const pastLiveWindow = anchor <= liveAnchor - HISTORY_MS;
  const scales = (0, import_react.useMemo)(() => [2, 24, 120, 360, 1200, 3600, viewport * 60], [viewport]);
  const configured = reportPeriods(cadence);
  const spans = Array.from(
    { length: view.reports.reduce((count, report) => Math.max(count, report.level + 1), configured.length) },
    (_, index) => {
      const saved = view.reports.findLast((report) => report.level === index);
      return configured[index] ?? (saved && savedPeriod(saved)) ?? MINUTE_MS;
    }
  );
  const blocks = (0, import_react.useMemo)(() => [...view.reports].sort((a, b) => b.end - a.end), [view.reports]);
  const available = blocks.filter((report) => report.end > anchor - HISTORY_MS && report.start < anchor);
  const latest = blocks.find((report) => report.end <= liveAnchor);
  const lastReceived = view.reports.at(-1)?.id ?? null;
  const newReports = state.historyReport !== void 0 && state.historyReport !== lastReceived && lastReceived !== null;
  const historyReport = state.anchor === null ? lastReceived : state.historyReport;
  const firstLevel = Math.max(
    0,
    spans.findIndex((_, index) => available.some((report) => report.level === index))
  );
  const canCollapse = spans.length > 1;
  const level = state.level === "all" && canCollapse ? null : typeof state.level === "number" && state.level >= 0 && state.level < spans.length ? state.level : firstLevel;
  const windowFor = (index, target, at = anchor, near = at - state.scrollMs) => {
    const candidates = blocks.filter(
      (report) => report.level === index && report.end > at - HISTORY_MS && report.start < at
    );
    const distance = (report) => Math.max(report.start - near, near - report.end, 0);
    const nearest = target ?? candidates.reduce(
      (best, report) => best === void 0 || distance(report) < distance(best) ? report : best,
      void 0
    );
    const position2 = candidates.findIndex((report) => report === nearest);
    const first = Math.max(0, Math.min(position2 - 1, candidates.length - 3));
    const durations = candidates.slice(first, first + 3).map((report) => report.end - report.start).sort((a, b) => a - b);
    const span = spans[index];
    const typical = Math.max(MINUTE_MS, target === void 0 ? durations[Math.floor(durations.length / 2)] ?? span : target.end - target.start);
    const fitted = viewport * hour / (typical * (target === void 0 ? (durations.length || 3) + 0.5 : 1.25));
    const readable = target === void 0 ? 0 : fontSize * 8 * hour / Math.max(1, target.end - target.start);
    const density = Math.max(
      viewport / (HISTORY_MS / hour),
      Math.min(viewport * 60, Math.max(fitted, readable))
    );
    const next = new TimeScale(at, density);
    const offset2 = Math.max(
      0,
      Math.min(next.height - viewport, next.position(nearest?.end ?? at) - viewport * 0.08)
    );
    return { zoom: zoomFor(density, scales), scrollMs: at - next.time(offset2) };
  };
  const initial = state.zoom === null ? windowFor(level ?? firstLevel) : { zoom: state.zoom, scrollMs: state.scrollMs };
  const { zoom, scrollMs } = initial;
  const pixelsPerHour = Math.max(scaleAt(zoom, scales), viewport / (HISTORY_MS / hour));
  const scale = (0, import_react.useMemo)(() => new TimeScale(anchor, pixelsPerHour), [anchor, pixelsPerHour]);
  const height = Math.max(viewport, scale.height);
  const followLatest = state.anchor === null && state.zoom !== null && state.scrollMs > 0;
  const position = followLatest ? scale.position(available[0]?.end ?? anchor) - viewport * 0.08 : scale.position(anchor - scrollMs);
  const offset = Math.max(0, Math.min(height - viewport, position));
  const columns = `52px ${spans.map((_, index) => `minmax(48px, ${index === level ? 12 : 1}fr)`).join(" ")}`;
  const upper = scale.time(Math.max(0, offset - viewport));
  const lower = scale.time(offset + viewport * 2);
  const reports = available.filter(
    (report) => report.level < spans.length && report.end >= lower && report.start <= upper
  );
  const major = scale.ticks(Math.max(0, offset - viewport), viewport * 3, fontSize * 8);
  const majorTimes = new Set(major.map(Number));
  const minor = scale.ticks(Math.max(0, offset - viewport), viewport * 3, fontSize * 3).filter(
    (tick) => !majorTimes.has(Number(tick)) && major.every(
      (value) => Math.abs(scale.position(Number(value)) - scale.position(Number(tick))) > fontSize * 1.6
    )
  );
  const time = (value, precise = false) => new Date(value).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...precise ? { second: "2-digit" } : {}
  });
  const tickLabel = (value) => new Date(value).toLocaleString(locale, {
    ...new Date(value).toDateString() !== new Date(anchor).toDateString() || viewport / pixelsPerHour * hour >= 864e5 ? { month: "short", day: "numeric" } : {},
    ...viewport / pixelsPerHour * hour >= 864e5 ? {} : { hour: "2-digit", minute: "2-digit" }
  });
  (0, import_react.useLayoutEffect)(() => {
    const element = scroll.current;
    const metric = fontMetric.current;
    const measure = () => {
      if (element.clientHeight > 0) setViewport(element.clientHeight);
      setFrameInset(element.offsetWidth - element.clientWidth);
      const size = metric.getBoundingClientRect().height;
      if (size > 0) setFontSize(size);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(measure);
    observer?.observe(element);
    observer?.observe(metric);
    return () => observer?.disconnect();
  }, []);
  (0, import_react.useLayoutEffect)(() => {
    if (horizontal.current !== null && frameInset !== null) horizontal.current.scrollLeft = state.scrollLeft;
  }, [frameInset, state.scrollLeft, spans.length]);
  (0, import_react.useLayoutEffect)(() => {
    if (scroll.current !== null && Math.abs(scroll.current.scrollTop - offset) > 0.5)
      scroll.current.scrollTop = offset;
  }, [offset]);
  (0, import_react.useEffect)(() => {
    if (state.zoom === null && available.length > 0) update({ zoom, scrollMs });
  }, [state.zoom, available.length, zoom, scrollMs, update]);
  const zoomAt = (value, pointer, scrollTop) => {
    const zoom2 = Math.max(0, Math.min(scales.length - 1, value));
    const nextScale = Math.max(scaleAt(zoom2, scales), viewport / (HISTORY_MS / hour));
    const atPointer = scale.time(scrollTop + pointer);
    const next = new TimeScale(anchor, nextScale);
    const nextOffset = Math.max(
      0,
      Math.min(Math.max(0, next.height - viewport), next.position(atPointer) - pointer)
    );
    const pinned = state.anchor !== null || nextOffset > 0;
    update({
      zoom: zoom2,
      anchor: pinned ? anchor : null,
      historyReport: pinned ? historyReport : void 0,
      scrollMs: anchor - next.time(nextOffset)
    });
  };
  const focus = (index, target) => {
    const nextAnchor = target === void 0 && !pastLiveWindow ? liveAnchor : anchor;
    const fitted = windowFor(index, target, nextAnchor, scale.time(offset + viewport * 0.35));
    const pinned = state.anchor !== null || fitted.scrollMs > 0;
    update({
      level: index,
      ...fitted,
      anchor: pinned ? nextAnchor : null,
      historyReport: pinned ? historyReport : void 0
    });
  };
  (0, import_react.useEffect)(() => {
    const element = scroll.current;
    const wheel = (event) => {
      if (!event.ctrlKey && !event.metaKey || event.deltaY === 0) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport : 1);
      zoomAt(
        zoom - Math.max(-240, Math.min(240, delta)) / 300,
        Math.max(0, Math.min(viewport, event.clientY - element.getBoundingClientRect().top)),
        element.scrollTop
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", wheel);
    };
  });
  const ticks2 = (values, kind) => values.map((tick) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      className: `timeline-tick timeline-tick-${kind}`,
      "data-tick": Number(tick),
      style: { top: scale.position(Number(tick)) },
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("time", { children: tickLabel(Number(tick)) })
    },
    `${kind}-${Number(tick)}`
  ));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "timeline-schedule", "aria-label": t("reports"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "timeline-muted timeline-scroll-hint", children: t("scrollHint") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "timeline-viewport", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { ref: fontMetric, className: "timeline-font-metric", "aria-hidden": "true" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          ref: horizontal,
          className: "timeline-table-scroll",
          onScroll: (event) => {
            const scrollLeft = event.currentTarget.scrollLeft;
            if (scrollLeft !== state.scrollLeft) update({ scrollLeft });
          },
          children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { minWidth: 52 + spans.length * 48 + (frameInset ?? 0) }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "div",
              {
                className: "timeline-column-headers",
                style: { gridTemplateColumns: columns },
                role: "group",
                "aria-label": t("hierarchy"),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "timeline-ruler-heading", children: t("time") }),
                  spans.map((span, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "button",
                    {
                      "data-level": index,
                      "data-history": index >= configured.length,
                      "aria-description": index >= configured.length ? t("savedPeriod") : void 0,
                      "aria-pressed": level === index,
                      "aria-label": `${formatPeriod(span)} ${t("column")}`,
                      title: canCollapse && level === index ? t("equalColumns") : void 0,
                      onClick: () => {
                        if (canCollapse && level === index) update({ level: "all" });
                        else focus(index);
                      },
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "timeline-level-dot", "aria-hidden": "true" }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: formatPeriod(span) })
                      ]
                    },
                    index
                  ))
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "div",
              {
                ref: scroll,
                className: "timeline-scroll",
                "aria-label": t("history"),
                tabIndex: 0,
                onKeyDown: (event) => {
                  if (event.key === "+" || event.key === "=" || event.key === "-") {
                    event.preventDefault();
                    zoomAt(zoom + (event.key === "-" ? -1 : 1), viewport / 2, event.currentTarget.scrollTop);
                  }
                },
                onScroll: (event) => {
                  if (Math.abs(event.currentTarget.scrollTop - offset) < 1) return;
                  const scrollMs2 = anchor - scale.time(event.currentTarget.scrollTop);
                  const pinned = scrollMs2 > 0 || pastLiveWindow;
                  update({ zoom, scrollMs: scrollMs2, anchor: pinned ? anchor : null, historyReport: pinned ? historyReport : void 0 });
                },
                children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "timeline-canvas", style: { height }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "timeline-now", children: [
                    state.anchor === null ? t("now") : t("history"),
                    " · ",
                    time(anchor)
                  ] }),
                  ticks2(minor, "minor"),
                  ticks2(major, "major"),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "timeline-columns", style: { gridTemplateColumns: columns }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {}),
                    spans.map((_, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "div",
                      {
                        className: "timeline-column",
                        "data-level": index,
                        "data-focused": level === index,
                        children: reports.filter((report) => report.level === index).map((report) => {
                          const { start, end } = report;
                          const [excerpt] = report.summary.progress;
                          const top = scale.position(Math.min(anchor, end));
                          const size = Math.max(1, Math.min(height, scale.position(start)) - top);
                          const contentTop = Math.max(0, offset - top);
                          const visibleSize = Math.max(
                            0,
                            Math.min(top + size, offset + viewport) - Math.max(top, offset)
                          );
                          const timeHeight = fontSize * 0.8 * 1.4;
                          const lines = Math.min(
                            4,
                            Math.floor((visibleSize - 14 - timeHeight - 4) / (fontSize * 1.5))
                          );
                          const density = lines > 0 ? "full" : visibleSize >= fontSize * 1.5 + 4 ? "compact" : "bar";
                          const needsFocus = report.level !== level || density === "bar" && zoom < zoomFor(fontSize * 8 * hour / Math.max(1, end - start), scales) - 1e-3;
                          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                            "button",
                            {
                              className: "timeline-block",
                              "data-report-id": report.id,
                              "data-report-start": start,
                              "data-source": report.source,
                              "data-level": report.level,
                              "data-density": density,
                              "data-needs-focus": needsFocus || void 0,
                              "aria-label": `${t(needsFocus ? "showReport" : "openReport")}: ${time(start, end - start < MINUTE_MS)} – ${time(end, end - start < MINUTE_MS)}: ${excerpt}`,
                              style: { top, height: size },
                              onClick: () => {
                                if (needsFocus) focus(report.level, report);
                                else openReport(report.id);
                              },
                              children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                                "span",
                                {
                                  className: "timeline-block-content",
                                  style: {
                                    top: contentTop,
                                    height: density === "bar" ? Math.max(1, visibleSize) : void 0
                                  },
                                  children: [
                                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "timeline-block-open", "aria-hidden": "true", children: [
                                      t(needsFocus ? "showShort" : "openShort"),
                                      " ↗"
                                    ] }),
                                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "timeline-block-mark", "aria-hidden": "true", children: "⋯" }),
                                    density !== "full" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "timeline-block-time", children: [
                                      new Date(end).toLocaleTimeString(locale, {
                                        hour: "2-digit",
                                        minute: "2-digit"
                                      }),
                                      " ",
                                      "· ",
                                      end - start < 1e3 ? t("underSecond") : formatDuration(end - start)
                                    ] }),
                                    density === "bar" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                      "span",
                                      {
                                        className: "timeline-block-copy",
                                        style: { WebkitLineClamp: Math.max(1, lines) },
                                        children: excerpt
                                      }
                                    )
                                  ]
                                }
                              )
                            },
                            report.id
                          );
                        })
                      },
                      index
                    ))
                  ] })
                ] })
              }
            )
          ] })
        }
      ),
      state.anchor === null && offset <= 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        import_dsh_client_ui_primitives.Button,
        {
          className: "timeline-return-now",
          onClick: () => {
            scroll.current?.focus({ preventScroll: true });
            update({ anchor: null, historyReport: void 0, scrollMs: 0, zoom });
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", children: "↑" }),
            t(newReports ? "returnNowNewReports" : "returnNow")
          ]
        }
      )
    ] }),
    available.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "timeline-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "timeline-muted", role: "status", children: t("emptyReports") }),
      latest === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { onClick: () => {
        update({
          level: latest.level,
          anchor: Math.max(latest.end, latest.start + 1),
          historyReport,
          scrollMs: 0,
          zoom: null
        });
        scroll.current?.focus({ preventScroll: true });
      }, children: t("jumpToLastReport") })
    ] }) : null
  ] });
}

// timeline/src/client/TaskTree.tsx
var import_react5 = require("react");
var import_dsh_client_ui_primitives5 = require("@deepseek-ai/dsh-client-ui-primitives");

// timeline/src/client/uuid.ts
function randomUUID() {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// timeline/src/records.ts
var import_zod2 = require("zod");
var id = import_zod2.z.string().trim().min(1).max(80);
var taskId = id.brand();
var treeId = id.brand();
var reportId = id.brand();
var statuses = ["pending", "active", "paused", "blocked", "done", "retired"];
var priorities = ["P0", "P1", "P2", "P3"];
var prioritySchema = import_zod2.z.enum(priorities).nullable();
var controlTargetSchema = import_zod2.z.discriminatedUnion("kind", [
  import_zod2.z.object({ kind: import_zod2.z.literal("tree"), tree: treeId }).strict(),
  import_zod2.z.object({ kind: import_zod2.z.literal("task"), tree: treeId, task: taskId }).strict()
]);
var annotationTargetSchema = import_zod2.z.discriminatedUnion("kind", [
  ...controlTargetSchema.options,
  import_zod2.z.object({ kind: import_zod2.z.literal("report"), report: reportId }).strict()
]);
var annotationId = import_zod2.z.union([import_zod2.z.uuid(), import_zod2.z.string().regex(/^note-[0-9a-f]{16}$/)]);
var annotationText = import_zod2.z.string().trim().min(1).max(4e3);
var timestampSchema = import_zod2.z.number().nonnegative().max(864e13);
var controlActionSchema = import_zod2.z.enum(["pause", "resume"]);
var controlDeliverySchema = import_zod2.z.enum(["sending", "accepted", "unknown"]);
var controlSchema = import_zod2.z.object({
  action: controlActionSchema,
  delivery: controlDeliverySchema,
  outcome: import_zod2.z.object({
    status: import_zod2.z.enum(["applied", "completed", "unavailable", "answered", "superseded"]),
    at: import_zod2.z.number().nonnegative()
  }).strict().nullable()
}).strict();
var annotationSchema = import_zod2.z.object({
  id: annotationId,
  target: annotationTargetSchema,
  text: annotationText,
  createdAt: timestampSchema,
  reply: import_zod2.z.object({ text: annotationText, createdAt: timestampSchema }).strict().nullable(),
  control: controlSchema.optional()
}).strict().refine((annotation) => annotation.control === void 0 || annotation.target.kind !== "report", {
  message: "Control requests address a task or tree"
});
var taskStateSchema = import_zod2.z.object({
  id: taskId,
  parent: taskId.nullable(),
  title: import_zod2.z.string().trim().min(1).max(120),
  description: import_zod2.z.string().max(320),
  status: import_zod2.z.enum(statuses),
  done: import_zod2.z.tuple([import_zod2.z.number().nonnegative(), import_zod2.z.number().positive()]),
  timeShare: import_zod2.z.number().positive(),
  remaining: import_zod2.z.number().nonnegative().nullable(),
  mode: import_zod2.z.enum(["serial", "parallel"]),
  note: import_zod2.z.string().max(400),
  details: import_zod2.z.string().max(4e3),
  priority: prioritySchema.default(null),
  createdAt: import_zod2.z.number(),
  updatedAt: import_zod2.z.number()
}).strict();
var taskRevisionSchema = taskStateSchema.omit({ id: true, createdAt: true, updatedAt: true, timeShare: true, remaining: true, mode: true }).extend({
  at: timestampSchema,
  progress: import_zod2.z.number().min(0).max(1),
  previousProgress: import_zod2.z.number().min(0).max(1).nullable(),
  weight: import_zod2.z.number().positive()
});
var taskSchema = taskStateSchema.extend({ history: taskRevisionSchema.array().default([]) });
var patchSchema = taskSchema.omit({ createdAt: true, updatedAt: true, priority: true, history: true }).partial().extend({
  id: taskId,
  subtree: import_zod2.z.boolean().optional()
}).strict();
var treeSchema = import_zod2.z.object({
  id: treeId,
  title: import_zod2.z.string().trim().min(1).max(120),
  description: import_zod2.z.string().max(320),
  tasks: import_zod2.z.array(taskSchema),
  createdAt: import_zod2.z.number(),
  lastTaskUpdate: timestampSchema.optional()
}).strict();
var taskReceiptSchema = import_zod2.z.object({
  version: import_zod2.z.literal(1),
  tree: treeId,
  title: import_zod2.z.string().min(1).max(120),
  branch: import_zod2.z.string().max(120).nullable(),
  at: timestampSchema,
  previousAt: timestampSchema.nullable(),
  before: import_zod2.z.number().min(0).max(1),
  after: import_zod2.z.number().min(0).max(1),
  total: import_zod2.z.number().int().positive().max(1e3),
  tasks: import_zod2.z.array(
    import_zod2.z.object({
      id: taskId,
      title: import_zod2.z.string().min(1).max(120),
      note: import_zod2.z.string().max(400),
      status: import_zod2.z.enum(statuses),
      before: import_zod2.z.number().min(0).max(1),
      after: import_zod2.z.number().min(0).max(1)
    }).strict()
  ).min(1).max(6)
}).strict().refine((receipt) => receipt.total >= receipt.tasks.length);
var summarySchema = import_zod2.z.object({
  progress: import_zod2.z.array(import_zod2.z.string().trim().min(1).max(600)).min(1).max(4),
  uncertainties: import_zod2.z.array(import_zod2.z.string().trim().min(1).max(600)).max(5),
  userActions: import_zod2.z.array(import_zod2.z.string().trim().min(1).max(600)).max(5)
}).strict();
var timeRangeSchema = import_zod2.z.tuple([import_zod2.z.number(), import_zod2.z.number()]).refine(([start, end]) => end > start);
var activitySchema = import_zod2.z.object({
  start: import_zod2.z.number(),
  olderWorkMs: import_zod2.z.number().nonnegative(),
  ranges: import_zod2.z.array(timeRangeSchema),
  open: import_zod2.z.number().nullable()
});
var reportSchema = import_zod2.z.object({
  id: reportId,
  level: import_zod2.z.number().int().min(0).max(4),
  start: timestampSchema,
  end: timestampSchema,
  // Coverage can precede generation; older reports use end for their elapsed threshold.
  createdAt: timestampSchema.optional(),
  policy: import_zod2.z.string(),
  children: import_zod2.z.array(reportId),
  source: import_zod2.z.enum(["model", "no-activity"]),
  toolCount: import_zod2.z.number().int().nonnegative(),
  covered: import_zod2.z.number().int().nonnegative(),
  contextSeq: import_zod2.z.number().int().nonnegative(),
  workMs: import_zod2.z.number().nonnegative().optional(),
  ranges: import_zod2.z.array(timeRangeSchema).optional(),
  summary: summarySchema
}).strict().refine(
  (report) => report.ranges?.every(([start, end]) => start >= report.start && end <= report.end) ?? true,
  {
    message: "Work ranges must stay inside report coverage"
  }
);
var viewSchema = import_zod2.z.object({
  trees: import_zod2.z.array(treeSchema),
  annotations: import_zod2.z.array(annotationSchema).default([]),
  activeTreeId: treeId.nullable(),
  reports: import_zod2.z.array(reportSchema),
  error: import_zod2.z.string().nullable()
});
var importContinuationSchema = import_zod2.z.object({ id: import_zod2.z.uuid(), text: import_zod2.z.string().min(1) });
var treeRecordSchema = import_zod2.z.object({
  version: import_zod2.z.literal(1),
  sessionId: import_zod2.z.string(),
  callId: import_zod2.z.string(),
  tree: treeSchema,
  receipt: taskReceiptSchema.nullable().optional()
});
var importRecordSchema = treeRecordSchema.extend({
  annotations: annotationSchema.array(),
  prepared: import_zod2.z.literal(true).optional(),
  continuation: importContinuationSchema.optional()
});
var importReadySchema = import_zod2.z.object({
  version: import_zod2.z.literal(1),
  sessionId: import_zod2.z.string(),
  callId: import_zod2.z.string()
});
var removalRecordSchema = import_zod2.z.object({ version: import_zod2.z.literal(1), sessionId: import_zod2.z.string(), treeId });
var selectionRecordSchema = import_zod2.z.object({
  version: import_zod2.z.literal(1),
  sessionId: import_zod2.z.string(),
  callId: import_zod2.z.string(),
  treeId
});
var annotationRecordSchema = import_zod2.z.object({
  version: import_zod2.z.literal(1),
  sessionId: import_zod2.z.string(),
  annotation: annotationSchema
});
var replyRecordSchema = import_zod2.z.object({
  version: import_zod2.z.literal(1),
  sessionId: import_zod2.z.string(),
  id: annotationId,
  text: annotationText,
  createdAt: import_zod2.z.number().nonnegative()
});
var deliveryRecordSchema = import_zod2.z.object({
  version: import_zod2.z.literal(1),
  sessionId: import_zod2.z.string(),
  id: annotationId,
  delivery: controlDeliverySchema.exclude(["sending"])
});
var priorityRecordSchema = import_zod2.z.object({
  version: import_zod2.z.literal(1),
  sessionId: import_zod2.z.string(),
  treeId,
  taskId,
  priority: prioritySchema,
  createdAt: import_zod2.z.number().nonnegative()
});
var reportRecordSchema = import_zod2.z.object({
  version: import_zod2.z.literal(1),
  sessionId: import_zod2.z.string(),
  report: reportSchema
});
var failureRecordSchema = import_zod2.z.object({
  version: import_zod2.z.literal(1),
  sessionId: import_zod2.z.string(),
  id: reportId,
  message: import_zod2.z.string()
});
var requestRecordSchema = import_zod2.z.object({
  version: import_zod2.z.literal(1),
  sessionId: import_zod2.z.string(),
  id: reportId,
  contextSeq: import_zod2.z.number().int().nonnegative(),
  prefixLength: import_zod2.z.number().int().nonnegative(),
  request: import_zod2.z.json()
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

// timeline/src/client/Progress.tsx
var import_react2 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime2 = require("react/jsx-runtime");
var partLabels = {
  done: "completedWork",
  active: "activeWork",
  pending: "pendingWork",
  blocked: "blockedWork"
};
function formatProgress(value, decimals = 2) {
  const percent = Math.max(0, Math.min(1, value)) * 100;
  return Math.min(percent, value < 1 ? 100 - 10 ** -decimals : 100).toFixed(decimals);
}
function formatWeight(weight) {
  return String(Number(weight.toFixed(2)));
}
function Progress({
  value,
  status,
  label,
  decimals = 2,
  parts,
  t
}) {
  const [hovered, setHovered] = (0, import_react2.useState)(null);
  const [dismissed, setDismissed] = (0, import_react2.useState)(false);
  const select = (part2) => {
    setHovered(part2 === void 0 ? null : { part: part2, expanded: false });
  };
  const clear = () => {
    setHovered(null);
    setDismissed(false);
  };
  const segmented = parts !== void 0;
  (0, import_react2.useEffect)(() => {
    if (!segmented && (hovered !== null || dismissed)) {
      setHovered(null);
      setDismissed(false);
      return;
    }
    if (hovered === null || hovered.expanded || !segmented || dismissed) return;
    const timer = setTimeout(() => {
      setHovered((current) => current === hovered ? { ...current, expanded: true } : current);
    }, 500);
    return () => {
      clearTimeout(timer);
    };
  }, [hovered, segmented, dismissed]);
  const describe = (state) => {
    const part2 = parts?.[state];
    if (part2 === void 0) return "";
    const percent = state === "done" ? formatProgress(part2.fraction, decimals) : (part2.fraction * 100).toFixed(decimals);
    return t(partLabels[state], { count: part2.leaves, percent });
  };
  const breakdown = progressStates.map(describe).join("\n");
  const part = hovered === null ? void 0 : parts?.[hovered.part];
  const titles = part?.titles.slice(0, part.leaves > 6 ? 5 : 6).map((title) => `- ${title.replace(/\s+/gu, " ").trim()}`) ?? [];
  if (part !== void 0 && part.leaves > 6) titles.push("- ...");
  const tooltip = hovered === null ? breakdown : [describe(hovered.part), ...hovered.expanded ? titles : []].join("\n");
  const work = (parts?.done.fraction ?? 0) + (parts?.active.fraction ?? 0);
  const tip = (parts?.active.fraction ?? 0) > 0 ? "active" : "done";
  const bar = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "div",
    {
      className: "timeline-progress",
      "data-status": status,
      "data-segmented": parts === void 0 ? void 0 : true,
      role: "progressbar",
      "aria-label": label,
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": Number(formatProgress(value, decimals)),
      "aria-valuetext": parts === void 0 ? `${formatProgress(value, decimals)}%` : breakdown,
      tabIndex: parts === void 0 ? void 0 : 0,
      "aria-keyshortcuts": parts === void 0 ? void 0 : "ArrowLeft ArrowRight",
      onMouseLeave: clear,
      onBlur: clear,
      onFocus: () => {
        const part2 = progressStates.find((state) => (parts?.[state].fraction ?? 0) > 0);
        select(part2);
      },
      onKeyDown: (event) => {
        if (segmented && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setHovered(null);
          setDismissed(true);
        }
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        const visible = progressStates.filter((state) => (parts?.[state].fraction ?? 0) > 0);
        if (visible.length === 0) return;
        event.preventDefault();
        const current = hovered === null ? -1 : visible.indexOf(hovered.part);
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const index = current < 0 ? direction === 1 ? 0 : visible.length - 1 : (current + direction + visible.length) % visible.length;
        select(visible[index]);
      },
      children: parts === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { width: `${Math.max(0, Math.min(1, value)) * 100}%` } }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        progressStates.map((state) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "span",
          {
            "data-part": state,
            "data-tip": state === tip ? true : void 0,
            "aria-hidden": "true",
            style: { width: `${parts[state].fraction * 100}%` },
            onMouseEnter: () => {
              select(state);
            }
          },
          state
        )),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "span",
          {
            className: "timeline-progress-highlight",
            "data-flow": status === "active" && work > 0 ? true : void 0,
            "aria-hidden": "true",
            style: { width: `${work * 100}%` }
          }
        )
      ] })
    }
  );
  return parts === void 0 ? bar : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: tooltip, disabled: dismissed, side: "top", portal: true, maxWidth: 360, children: bar });
}

// timeline/src/client/status.ts
var statusTones = {
  pending: "neutral",
  active: "info",
  paused: "neutral",
  blocked: "warning",
  done: "success",
  retired: "quiet"
};

// timeline/src/client/TaskActions.tsx
var import_react3 = require("react");
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");

// timeline/src/controls.ts
var CONTROL_WAIT_MS = 2 * 6e4;
function sameControlTarget(left, right) {
  return left.kind === right.kind && left.kind !== "report" && right.kind !== "report" && left.tree === right.tree && (left.kind !== "task" || right.kind === "task" && left.task === right.task);
}
function latestControl(annotations, target) {
  return annotations.findLast((item) => item.control !== void 0 && sameControlTarget(item.target, target));
}
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

// timeline/src/client/TaskActions.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function TaskActions({
  tree,
  task: task2,
  status,
  playback,
  request,
  setPriority,
  annotate,
  annotationOpen = false,
  t,
  children
}) {
  const sending = (0, import_react3.useRef)(false);
  const [message, setMessage] = (0, import_react3.useState)(null);
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [menu, setMenu] = (0, import_react3.useState)(false);
  const updatedAt = task2?.updatedAt ?? Math.max(tree.createdAt, ...tree.tasks.map((task3) => task3.updatedAt));
  (0, import_react3.useEffect)(() => {
    setMessage(null);
  }, [status, updatedAt]);
  const wholePlan = task2 === void 0;
  const parentPriority = task2?.parent == null ? null : prioritiesOf(tree.tasks).get(task2.parent) ?? null;
  const priority = task2?.priority ?? parentPriority;
  const target = task2 === void 0 ? { kind: "tree", tree: tree.id } : { kind: "task", tree: tree.id, task: task2.id };
  const receipt = pendingControl(playback.annotations, target, playback.trees, playback.now) ?? latestControl(playback.annotations, target);
  const control = receipt?.control;
  const unconfirmed = control?.outcome === null;
  const waiting = receipt !== void 0 && unconfirmed && playback.now - receipt.createdAt < CONTROL_WAIT_MS;
  const retry = unconfirmed || control?.outcome?.status === "answered";
  const available = status !== "done" && status !== "retired" && tree.tasks.some((task3) => task3.status !== "retired");
  const perform = async (operation, priority2 = false) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await operation();
    } catch {
      setMessage(priority2 ? "prioritySaveFailed" : "taskRequestFailed");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const action = retry ? control.action : status === "active" ? "pause" : "resume";
  const requesting = status !== "done" && !waiting && !retry;
  const text = status === "done" ? t("taskCompleted") : waiting ? t(action === "pause" ? "pausePending" : "resumePending") : retry ? t(action === "pause" ? "retryPause" : "retryResume") : t(action === "pause" ? "pauseTask" : "resumeTask");
  const label = wholePlan && requesting ? t(action === "pause" ? "pausePlan" : "resumePlan") : text;
  const playbackButton = /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    import_dsh_client_ui_primitives3.Button,
    {
      className: wholePlan ? "timeline-playback" : "timeline-task-action",
      "data-action": status === "done" ? "done" : action,
      "data-pending": waiting,
      "aria-label": label,
      disabled: busy || !available || waiting,
      onClick: () => {
        void perform(() => request({ action, tree, ...task2 === void 0 ? {} : { task: task2 } }));
      },
      children: [
        status === "done" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconCheckOutlineRegular, { size: 18 }) : action === "pause" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconPauseOutlineRegular, { size: 18 }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconPlayOutlineRegular, { size: 18 }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: text })
      ]
    }
  );
  const playbackControl = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    import_dsh_client_ui_primitives3.Tooltip,
    {
      label: busy ? t("sendingTaskRequest") : waiting ? `${label} · ${t(control.delivery === "unknown" ? "controlDeliveryUnknown" : "controlWaitingHint")}` : retry ? `${label} · ${t("controlUnconfirmedHint")}` : `${label} · ${t("taskControlsHint")}`,
      side: "top",
      portal: true,
      children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "span",
        {
          className: "timeline-playback-anchor",
          tabIndex: waiting ? 0 : void 0,
          role: waiting ? "group" : void 0,
          "aria-label": waiting ? label : void 0,
          children: playbackButton
        }
      )
    }
  );
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: wholePlan ? "timeline-plan-controls" : "timeline-task-controls", children: [
    wholePlan ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "div",
      {
        className: "timeline-overall",
        role: available ? "group" : void 0,
        "aria-label": available ? t("taskControls") : void 0,
        "aria-busy": busy || waiting,
        children: [
          available ? playbackControl : null,
          children
        ]
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "div",
      {
        className: "timeline-task-grid",
        role: "group",
        "aria-label": t("taskControls"),
        "aria-busy": busy || waiting,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            import_dsh_client_ui_primitives3.Menu,
            {
              open: menu,
              onClose: () => {
                setMenu(false);
              },
              side: "top",
              portal: true,
              compact: true,
              autoFocus: true,
              className: "timeline-priority-menu",
              selectedId: task2.priority ?? "none",
              anchor: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
                import_dsh_client_ui_primitives3.Button,
                {
                  className: "timeline-task-action timeline-priority-trigger",
                  "aria-label": `${t("priority")}: ${priority ?? t("noPriority")}`,
                  title: t("priorityHint"),
                  "aria-haspopup": "menu",
                  "aria-expanded": menu,
                  disabled: busy || status === "retired",
                  onClick: () => {
                    setMenu(!menu);
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconQueueOutlineRegular, { size: 16 }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "timeline-priority-title", children: [
                      t("priority"),
                      ":"
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "timeline-priority-badge", "data-priority": priority ?? "none", children: priority ?? t("noPriority") }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconChevronsUpDownOutlineRegular, { size: 12 })
                  ]
                }
              ),
              items: [
                ...priorities.map((value) => ({
                  id: value,
                  label: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "timeline-priority-option", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "timeline-priority-badge", "data-priority": value, children: value }),
                    t(`priority${value}`)
                  ] })
                })),
                {
                  id: "none",
                  label: parentPriority === null ? t("noPriority") : `${t("inheritedPriority")}: ${parentPriority}`
                }
              ],
              onSelect: (value) => {
                setMenu(false);
                const priority2 = priorities.find((item) => item === value) ?? null;
                if (priority2 !== task2.priority && setPriority !== void 0)
                  void perform(() => setPriority(priority2), true);
              }
            }
          ),
          playbackControl,
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            import_dsh_client_ui_primitives3.Button,
            {
              className: "timeline-task-action",
              "aria-label": t("addAnnotation"),
              "aria-pressed": annotationOpen,
              "aria-expanded": annotationOpen,
              disabled: busy || status === "retired",
              onClick: annotate,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.IconListPenOutlineRegular, { size: 18 }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: t("addAnnotation") })
              ]
            }
          )
        ]
      }
    ),
    message !== null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { className: "timeline-error", role: "alert", children: t(message) }) : null
  ] });
}

// timeline/src/client/TreeTransfer.tsx
var import_react4 = require("react");
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");

// timeline/src/checkpoint.ts
var import_zod3 = require("zod");
var CHECKPOINT_BYTES = 2 * 1024 * 1024;
var task = import_zod3.z.object({
  id: taskId,
  parent: taskId.nullable().optional(),
  title: import_zod3.z.string().trim().min(1).max(120),
  description: import_zod3.z.string().max(320).optional(),
  status: import_zod3.z.enum(statuses).optional(),
  done: import_zod3.z.tuple([import_zod3.z.number().nonnegative(), import_zod3.z.number().positive()]).optional(),
  weight: import_zod3.z.number().positive().optional(),
  note: import_zod3.z.string().max(400).optional(),
  details: import_zod3.z.string().max(4e3).optional(),
  priority: prioritySchema.optional(),
  history: taskRevisionSchema.array().optional()
}).strict();
var discussion = import_zod3.z.object({
  task: taskId.optional(),
  text: annotationText,
  createdAt: timestampSchema.optional(),
  reply: import_zod3.z.object({ text: annotationText, createdAt: timestampSchema.optional() }).strict().optional()
}).strict();
var schema = import_zod3.z.object({
  format: import_zod3.z.literal("dsh-timeline-tree"),
  version: import_zod3.z.literal(1),
  title: import_zod3.z.string().trim().min(1).max(120),
  description: import_zod3.z.string().max(320).optional(),
  elapsedMs: import_zod3.z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  tasks: task.array().max(1e3),
  discussions: discussion.array().max(1e4).optional(),
  metadata: import_zod3.z.record(import_zod3.z.string(), import_zod3.z.json()).optional()
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

// timeline/src/client/TreeTransfer.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function exportTree(tree, annotations, sessionId2) {
  const text = Checkpoint.fromTree(tree, annotations, Date.now(), sessionId2, process.env.DSH_CLIENT_VERSION).toString();
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${tree.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").slice(0, 80)}.timeline.json`;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
function TreeTransfer({
  mode,
  sessionId: sessionId2,
  tree,
  view,
  running,
  decimals,
  close,
  imported,
  removed,
  importTree,
  removeTree,
  t
}) {
  const input = (0, import_react4.useRef)(null);
  const version = (0, import_react4.useRef)(0);
  const requestId = (0, import_react4.useRef)(randomUUID());
  const saving = (0, import_react4.useRef)(false);
  const [file, setFile] = (0, import_react4.useState)(null);
  const [proceed, setProceed] = (0, import_react4.useState)(false);
  const [copy, setCopy] = (0, import_react4.useState)(false);
  const [busy, setBusy] = (0, import_react4.useState)(false);
  const [error, setError] = (0, import_react4.useState)(null);
  (0, import_react4.useEffect)(() => () => {
    version.current++;
  }, []);
  const read = async (selected) => {
    const current = ++version.current;
    setBusy(true);
    setFile(null);
    setError(null);
    try {
      if (selected.size > CHECKPOINT_BYTES) throw new Error("Timeline checkpoint exceeds 2 MiB");
      const content = await selected.text();
      if (version.current !== current) return;
      const checkpoint = Checkpoint.fromString(content);
      setFile({ name: selected.name, content, checkpoint });
      requestId.current = randomUUID();
    } catch (error2) {
      if (version.current === current)
        setError(error2 instanceof Error ? error2.message.slice(0, 1e3) : t("treeTransferFailed"));
    } finally {
      if (version.current === current) setBusy(false);
    }
  };
  const remove = mode === "remove" && tree !== void 0;
  const submit = remove ? async () => {
    const result = await removeTree(tree.id);
    removed(result.removed && !result.notified && !result.draft);
  } : mode === "import" && file !== null ? async () => {
    const result = await importTree({ id: requestId.current, content: file.content, copy, continue: proceed });
    imported(result.tree, proceed && !result.notified);
  } : void 0;
  const perform = async (submit2) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      await submit2();
      close();
    } catch (error2) {
      setError(error2 instanceof Error ? error2.message.slice(0, 1e3) : t("treeTransferFailed"));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const progress = file === null ? 0 : measureAll(file.checkpoint.tasks).get(null)?.progress ?? 0;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    import_dsh_client_ui_primitives4.Modal,
    {
      open: mode !== null,
      onClose: () => {
        if (!busy) close();
      },
      title: t(mode === "remove" ? "deleteTree" : "importTree"),
      closeLabel: t("cancel"),
      className: "timeline-transfer",
      description: remove ? t("deleteTreeHint", { title: tree.title }) : t("checkpointHint"),
      footer: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
        remove ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          import_dsh_client_ui_primitives4.Button,
          {
            disabled: busy,
            onClick: () => {
              try {
                exportTree(tree, view.annotations, sessionId2);
              } catch (error2) {
                setError(error2 instanceof Error ? error2.message : t("treeTransferFailed"));
              }
            },
            children: t("exportTree")
          }
        ) : null,
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives4.Button, { disabled: busy, onClick: close, children: t("cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          import_dsh_client_ui_primitives4.Button,
          {
            variant: mode === "remove" ? "outline" : "primary",
            className: mode === "remove" ? "timeline-delete" : void 0,
            disabled: busy || running || submit === void 0,
            onClick: submit === void 0 ? void 0 : () => {
              void perform(submit);
            },
            children: t(busy ? "saving" : mode === "remove" ? "deleteTree" : "importTree")
          }
        )
      ] }),
      children: [
        mode === "import" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "timeline-transfer-options", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "input",
            {
              ref: input,
              type: "file",
              accept: ".json,application/json",
              hidden: true,
              "aria-label": t("chooseCheckpoint"),
              onChange: (event) => {
                const selected = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (selected !== void 0) void read(selected);
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            import_dsh_client_ui_primitives4.Button,
            {
              variant: "outline",
              disabled: busy,
              "data-modal-autofocus": true,
              onClick: () => input.current?.click(),
              children: t("chooseCheckpoint")
            }
          ),
          file === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: file.checkpoint.toJson().title }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "timeline-muted", children: file.name }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { children: [
              t("taskCount", { count: file.checkpoint.tasks.length }),
              " ·",
              " ",
              formatProgress(progress, decimals),
              "%"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                type: "checkbox",
                disabled: busy,
                checked: proceed,
                onChange: (event) => {
                  setProceed(event.currentTarget.checked);
                  requestId.current = randomUUID();
                }
              }
            ),
            t("continueCheckpoint")
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                type: "checkbox",
                disabled: busy,
                checked: copy,
                onChange: (event) => {
                  setCopy(event.currentTarget.checked);
                  requestId.current = randomUUID();
                }
              }
            ),
            t("copyCheckpoint")
          ] })
        ] }) : null,
        running ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { role: "status", children: t("treeIdleRequired") }) : null,
        error === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "timeline-error", role: "alert", children: error })
      ]
    }
  );
}

// timeline/src/client/TaskTree.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function formatMinutes(minutes) {
  return minutes < 1 ? "<1m" : minutes < 60 ? `${minutes}m` : formatDuration(minutes * MINUTE_MS);
}
function TaskTree({
  sessionId: sessionId2,
  view,
  state,
  now,
  decimals,
  segmented = true,
  update,
  toggle,
  openTask,
  requestTask,
  playback,
  running,
  importTree,
  removeTree,
  t
}) {
  const menuButton = (0, import_react5.useRef)(null);
  const [menuOpen, setMenuOpen] = (0, import_react5.useState)(false);
  const [transfer, setTransfer] = (0, import_react5.useState)(null);
  const [deleteTarget, setDeleteTarget] = (0, import_react5.useState)();
  const [message, setMessage] = (0, import_react5.useState)(null);
  const tree = view.trees.find((item) => item.id === (state.tree ?? view.activeTreeId));
  const missing = state.tree !== null && tree === void 0;
  const treeIndex = view.trees.findIndex((item) => item.id === tree?.id);
  const single = view.trees.length === 1 && tree !== void 0;
  const previous = view.trees[treeIndex - 1];
  const next = view.trees[treeIndex + 1];
  const select = (tree2) => {
    update({ tree: tree2.id });
    setMenuOpen(false);
  };
  const measures = (0, import_react5.useMemo)(() => measureAll(tree?.tasks ?? [], segmented), [tree, segmented]);
  const priorities2 = (0, import_react5.useMemo)(() => prioritiesOf(tree?.tasks ?? []), [tree]);
  const parents = (0, import_react5.useMemo)(
    () => new Set(tree?.tasks.filter((task2) => task2.status !== "retired").map((task2) => task2.parent)),
    [tree]
  );
  const overall = measures.get(null);
  const leaves = tree?.tasks.filter((item) => item.status !== "retired" && !parents.has(item.id)) ?? [];
  const done = leaves.filter((item) => item.status === "done").length;
  const working = overall?.status === "active" && running;
  const observedAt = !working && tree !== void 0 ? Math.max(tree.createdAt, ...tree.tasks.map((item) => item.updatedAt)) : now;
  const elapsed = tree === void 0 ? 0 : Math.max(0, observedAt - tree.createdAt);
  const remaining = overall === void 0 || overall.progress <= 0 ? null : elapsed * (1 - overall.progress) / overall.progress;
  const remainingText = remaining === null ? t("unknown") : `≈${formatMinutes(Math.max(1, Math.round(remaining / MINUTE_MS)))}`;
  const estimateHint = `${t("estimateCalculated")}: ${remainingText}

${t("estimateHint")}`;
  const collapsed = tree !== void 0 && Object.hasOwn(state.collapsed, tree.id) ? state.collapsed[tree.id] : void 0;
  const rows = (parent) => tree?.tasks.filter((item) => item.parent === parent && item.status !== "retired").map((item) => {
    const measure = measures.get(item.id);
    const nested = parents.has(item.id);
    const expanded = !collapsed?.includes(item.id);
    const status = measure.status;
    const priority = priorities2.get(item.id) ?? null;
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "timeline-task", "data-status": status, children: [
        nested ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            className: "timeline-disclosure",
            "aria-label": item.title,
            "aria-expanded": expanded,
            onClick: () => {
              toggle(tree.id, item.id);
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "timeline-caret", "data-expanded": expanded, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconChevronRightOutlineRegular, { size: 14 }) })
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "timeline-leaf", "data-status": status, "aria-hidden": "true", children: status === "done" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconCheckOutlineRegular, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "timeline-status-dot" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          "button",
          {
            className: "timeline-task-title",
            "data-tree-id": tree.id,
            "data-task-id": item.id,
            onClick: () => {
              openTask(tree.id, item.id);
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: item.title }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("small", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Tag, { tone: statusTones[status], children: t(status) }),
                priority === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "timeline-priority-badge", "data-priority": priority, children: priority }),
                item.note ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "timeline-task-note", children: item.note }) : null
              ] })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          Progress,
          {
            label: `${item.title} ${t("progress")}`,
            value: measure.progress,
            status,
            decimals,
            parts: measure.parts,
            t
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "timeline-percent", children: [
          formatProgress(measure.progress, decimals),
          "%"
        ] })
      ] }),
      nested && expanded ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { children: rows(item.id) }) : null
    ] }, item.id);
  });
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "timeline-task-tree", "aria-label": t("tasks"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      "nav",
      {
        className: "timeline-tree-navigation",
        "aria-label": t("taskTreeChoice"),
        "data-single": single || void 0,
        children: [
          view.trees.length === 0 || missing ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
            single ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              import_dsh_client_ui_primitives5.Button,
              {
                className: "timeline-icon-button",
                "aria-label": t("previousTree"),
                title: t("previousTree"),
                disabled: previous === void 0,
                onClick: previous === void 0 ? void 0 : () => {
                  select(previous);
                },
                children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconChevronLeftOutlineRegular, { size: 18 })
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "timeline-tree-label", children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "timeline-tree-picker", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "select",
                {
                  "aria-label": t("taskTreeChoice"),
                  value: tree?.id ?? "",
                  onChange: (event) => {
                    const selected = view.trees.find((item) => item.id === event.currentTarget.value);
                    if (selected !== void 0) select(selected);
                  },
                  children: view.trees.map((item) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: item.id, children: item.title }, item.id))
                }
              ) }),
              single ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("small", { children: [
                treeIndex + 1,
                " / ",
                view.trees.length
              ] })
            ] }),
            single ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              import_dsh_client_ui_primitives5.Button,
              {
                className: "timeline-icon-button",
                "aria-label": t("nextTree"),
                title: t("nextTree"),
                disabled: next === void 0,
                onClick: next === void 0 ? void 0 : () => {
                  select(next);
                },
                children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconChevronRightOutlineRegular, { size: 18 })
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "timeline-tree-actions", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            import_dsh_client_ui_primitives5.Menu,
            {
              open: menuOpen,
              onClose: () => {
                setMenuOpen(false);
              },
              align: "end",
              portal: true,
              compact: true,
              autoFocus: true,
              anchor: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                import_dsh_client_ui_primitives5.Button,
                {
                  ref: menuButton,
                  className: "timeline-icon-button",
                  "aria-label": t("treeActions"),
                  title: t("treeActions"),
                  "aria-haspopup": "menu",
                  "aria-expanded": menuOpen,
                  onClick: () => {
                    setMenuOpen(!menuOpen);
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconEllipsisOutlineRegular, { size: 18 })
                }
              ),
              items: [
                ...tree?.tasks.some((task2) => parents.has(task2.id)) ? [
                  {
                    id: "expand",
                    label: t("expandAll"),
                    icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconChevronDownOutlineRegular, { size: 16 })
                  },
                  {
                    id: "collapse",
                    label: t("collapseAll"),
                    icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconChevronRightOutlineRegular, { size: 16 })
                  }
                ] : [],
                {
                  id: "import",
                  label: t("importTree"),
                  icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconPlusOutlineRegular, { size: 16 }),
                  disabled: running
                },
                ...tree === void 0 ? [] : [
                  {
                    id: "export",
                    label: t("exportTree"),
                    icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconDownloadOutlineRegular, { size: 16 })
                  },
                  {
                    id: "remove",
                    label: t("deleteTree"),
                    icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconTrashOutlineRegular, { size: 16 }),
                    danger: true,
                    disabled: running
                  }
                ]
              ],
              onSelect: (id2) => {
                setMenuOpen(false);
                setMessage(null);
                if (id2 === "import" || id2 === "remove") {
                  menuButton.current?.focus({ preventScroll: true });
                  if (id2 === "remove") setDeleteTarget(tree);
                  setTransfer(id2);
                  return;
                }
                const selected = tree;
                if (id2 === "export") {
                  try {
                    exportTree(selected, view.annotations, sessionId2);
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : t("treeTransferFailed"));
                  }
                  return;
                }
                update({
                  collapsed: {
                    ...state.collapsed,
                    [selected.id]: id2 === "expand" ? [] : selected.tasks.filter((task2) => parents.has(task2.id)).map((task2) => task2.id)
                  }
                });
                setMenuOpen(false);
              }
            }
          ) })
        ]
      }
    ),
    message === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "timeline-error", role: "alert", children: message }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      TreeTransfer,
      {
        sessionId: sessionId2,
        mode: transfer,
        tree: transfer === "remove" ? view.trees.find((item) => item.id === deleteTarget?.id) ?? deleteTarget : tree,
        view,
        running,
        decimals,
        t,
        close: () => {
          setTransfer(null);
        },
        importTree,
        removeTree,
        imported: (id2, warning) => {
          update({ tree: id2, tab: "tasks", details: { ...state.details, tasks: [] } });
          setMessage(warning ? t("treeNotifyUnknown") : null);
        },
        removed: (warning) => {
          setMessage(warning ? t("treeNotifyUnknown") : null);
        }
      },
      transfer
    ),
    tree === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "timeline-empty", children: missing ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { role: "status", children: t("treeUnavailable") }),
      view.activeTreeId === null ? null : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Button, { variant: "outline", onClick: () => {
        update({ tree: null });
      }, children: t("openActiveTree") })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: t("emptyTasks") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "timeline-muted", children: t("planHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        import_dsh_client_ui_primitives5.Button,
        {
          variant: "outline",
          disabled: running,
          title: running ? t("treeIdleRequired") : void 0,
          onClick: () => {
            setTransfer("import");
          },
          children: t("importTree")
        }
      )
    ] }) }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "timeline-overview", "data-status": overall?.status ?? "pending", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "timeline-overview-title", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: t("progress") }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Tag, { tone: statusTones[overall?.status ?? "pending"], children: t(overall?.status ?? "pending") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          TaskActions,
          {
            playback,
            tree,
            status: overall?.status ?? "pending",
            request: requestTask,
            t,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                Progress,
                {
                  label: t("progress"),
                  value: overall?.progress ?? 0,
                  status: overall?.status ?? "pending",
                  decimals,
                  parts: overall?.parts,
                  t
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("strong", { children: [
                formatProgress(overall?.progress ?? 0, decimals),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "%" })
              ] })
            ]
          },
          tree.id
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "timeline-task-stats", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
            done,
            "/",
            leaves.length,
            " ",
            t("leafTasks")
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
            t("elapsed"),
            ": ",
            formatMinutes(Math.floor(elapsed / MINUTE_MS)),
            working ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
              " · ",
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "timeline-eta", children: [
                t("remaining"),
                ": ",
                remainingText,
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.Tooltip, { label: estimateHint, side: "top", maxWidth: 320, portal: true, openOnClick: true, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  import_dsh_client_ui_primitives5.Button,
                  {
                    className: "timeline-icon-button timeline-estimate-help",
                    "aria-label": t("estimateHelp"),
                    children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives5.IconQuestionOutlineRegular, { size: 14 })
                  }
                ) })
              ] })
            ] }) : null
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "timeline-tasks", children: rows(null) })
    ] })
  ] });
}

// timeline/src/client/Details.tsx
var import_dsh_client_ui_primitives11 = require("@deepseek-ai/dsh-client-ui-primitives");

// timeline/src/client/ReportDetails.tsx
var import_dsh_client_ui_primitives9 = require("@deepseek-ai/dsh-client-ui-primitives");

// timeline/src/client/DetailHeader.tsx
var import_dsh_client_ui_primitives6 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime6 = require("react/jsx-runtime");
function DetailHeader({
  title,
  back,
  children,
  t
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("header", { className: "timeline-detail-header", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      import_dsh_client_ui_primitives6.Button,
      {
        className: "timeline-icon-button",
        "aria-label": t("back"),
        title: t("back"),
        "data-detail-back": true,
        onClick: back,
        children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_dsh_client_ui_primitives6.IconChevronLeftOutlineRegular, { size: 18 })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h2", { children: title }),
    children
  ] });
}

// timeline/src/client/Annotations.tsx
var import_react7 = require("react");
var import_dsh_client_ui_primitives8 = require("@deepseek-ai/dsh-client-ui-primitives");

// timeline/src/client/Markdown.tsx
var import_react6 = require("react");
var import_dsh_client_ui_primitives7 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime7 = require("react/jsx-runtime");
function Markdown({ text, t }) {
  const labels = (0, import_react6.useMemo)(
    () => ({
      code: {
        copyLabel: t("markdownCopy"),
        copiedLabel: t("markdownCopied"),
        toolbarLabels: {
          codeLabel: t("markdownCode"),
          wrapLabel: t("markdownWrap"),
          unwrapLabel: t("markdownUnwrap")
        }
      },
      footnotes: t("markdownFootnotes")
    }),
    [t]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "timeline-markdown", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_dsh_client_ui_primitives7.MarkdownText, { text, labels, variant: "compact" }) });
}

// timeline/src/client/Annotations.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
function useAnnotationDraft(control) {
  const [draft, setDraft] = (0, import_react7.useState)(emptyDraft);
  return control ?? { draft, update: (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
  } };
}
var controlStatuses = {
  applied: { labelKey: "controlApplied", tone: "success" },
  completed: { labelKey: "taskCompleted", tone: "success" },
  unavailable: { labelKey: "controlUnavailable", tone: "warning" },
  answered: { labelKey: "controlAnswered", tone: "warning" },
  superseded: { labelKey: "controlSuperseded", tone: "neutral" },
  waiting: { labelKey: "controlWaiting", tone: "info" },
  unknown: { labelKey: "controlDeliveryUnknown", tone: "warning" }
};
function annotationStatus(annotation) {
  if (annotation.control !== void 0)
    return controlStatuses[annotation.control.outcome?.status ?? (annotation.control.delivery === "unknown" ? "unknown" : "waiting")];
  return annotation.reply === null ? { labelKey: "annotationOpen", tone: "info" } : { labelKey: "annotationResolved", tone: "success" };
}
function Annotations({
  annotations,
  locale = "en",
  targetTitle,
  t
}) {
  const label = (0, import_react7.useId)();
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: "timeline-annotations", "aria-labelledby": label, children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("h3", { id: label, children: [
      t("annotations"),
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "timeline-muted", children: annotations.length })
    ] }),
    annotations.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "timeline-muted", children: t("emptyAnnotations") }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("ol", { className: "timeline-annotation-list", "aria-live": "polite", children: annotations.map((annotation) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("li", { className: "timeline-annotation", "data-resolved": annotation.reply !== null, children: [
      targetTitle === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "timeline-annotation-target", children: targetTitle(annotation.target) }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "timeline-annotation-heading", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("strong", { children: t(annotation.control === void 0 ? "annotationUser" : "controlRequest") }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("time", { dateTime: new Date(annotation.createdAt).toISOString(), children: new Date(annotation.createdAt).toLocaleString(locale) }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives8.Tag, { tone: annotationStatus(annotation).tone, children: t(annotationStatus(annotation).labelKey) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Markdown, { text: annotation.text, t }),
      annotation.reply === null ? null : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "timeline-annotation-reply", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "timeline-annotation-heading", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("strong", { children: t("annotationAgent") }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("time", { dateTime: new Date(annotation.reply.createdAt).toISOString(), children: new Date(annotation.reply.createdAt).toLocaleString(locale) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Markdown, { text: annotation.reply.text, t })
      ] })
    ] }, annotation.id)) })
  ] });
}
function DiscussionHistory({
  view,
  locale = "en",
  open,
  onToggle,
  t
}) {
  if (view.annotations.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
    "details",
    {
      className: "timeline-discussion-history",
      open,
      onToggle: (event) => {
        if (event.currentTarget.open !== open) onToggle(event.currentTarget.open);
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("summary", { children: [
          t("discussionHistory"),
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "timeline-tab-count", children: view.annotations.length })
        ] }),
        open ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          Annotations,
          {
            locale,
            annotations: view.annotations.toReversed().sort((a, b) => b.createdAt - a.createdAt),
            targetTitle: (target) => {
              if (target.kind === "report") {
                const report = view.reports.find((item) => item.id === target.report);
                return report === void 0 ? t("detailUnavailable") : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
                  t("levelSummary", { level: report.level + 1, period: formatPeriod(savedPeriod(report) ?? report.end - report.start) }),
                  ": ",
                  new Date(report.start).toLocaleString(locale),
                  " – ",
                  new Date(report.end).toLocaleString(locale)
                ] });
              }
              const tree = view.trees.find((item) => item.id === target.tree);
              return target.kind === "tree" ? `${t("tasks")}: ${tree?.title ?? t("detailUnavailable")}` : `${tree?.title ?? ""} · ${tree?.tasks.find((item) => item.id === target.task)?.title ?? t("detailUnavailable")}`;
            },
            t
          }
        ) : null
      ]
    }
  );
}
function AnnotationEditor({
  target,
  draft: { open, text, id: id2, busy, messageKey },
  update,
  save,
  t
}) {
  const label = (0, import_react7.useId)();
  const input = (0, import_react7.useRef)(null);
  const sending = (0, import_react7.useRef)(false);
  (0, import_react7.useEffect)(() => {
    if (open) input.current?.focus();
  }, [open]);
  const submit = async (event) => {
    event.preventDefault();
    if (sending.current || busy || !text.trim()) return;
    sending.current = true;
    const identity = id2 ?? newId("note");
    update({ id: identity, busy: true, messageKey: null });
    try {
      const result = await save({ id: identity, target, text: text.trim() });
      update({ ...emptyDraft, messageKey: result.notified ? "annotationSaved" : "annotationNotifyFailed" });
    } catch {
      update({ busy: false, messageKey: "annotationSaveFailed" });
    } finally {
      sending.current = false;
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
    open ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
      "form",
      {
        className: "timeline-annotation-editor",
        onSubmit: (event) => {
          void submit(event);
        },
        "aria-busy": busy,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("label", { htmlFor: `${label}-input`, children: t("addAnnotation") }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
            "textarea",
            {
              id: `${label}-input`,
              ref: input,
              value: text,
              maxLength: 4e3,
              rows: 4,
              placeholder: t("annotationPlaceholder"),
              disabled: busy,
              onChange: (event) => {
                update({ text: event.currentTarget.value, id: null, messageKey: null });
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "timeline-annotation-count", children: [
              text.length,
              " / 4,000"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives8.Button, { type: "button", disabled: busy, onClick: () => {
              update(emptyDraft);
            }, children: t("cancelAnnotation") }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_dsh_client_ui_primitives8.Button, { type: "submit", disabled: busy || !text.trim(), children: t("saveAnnotation") })
          ] })
        ]
      }
    ) : null,
    messageKey === null ? null : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      "p",
      {
        className: messageKey === "annotationSaveFailed" ? "timeline-error" : "timeline-muted",
        role: messageKey === "annotationSaveFailed" ? "alert" : "status",
        children: t(messageKey)
      }
    )
  ] });
}

// timeline/src/client/ReportDetails.tsx
var import_jsx_runtime9 = require("react/jsx-runtime");
function ReportDetails({
  view,
  locale = "en",
  reportId: reportId2,
  openReport,
  back,
  annotate,
  annotationDraft,
  t
}) {
  const draft = useAnnotationDraft(annotationDraft);
  const noteOpen = draft.draft.open;
  const report = view.reports.find((item) => item.id === reportId2);
  const period = report === void 0 ? void 0 : savedPeriod(report);
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
    "section",
    {
      className: "timeline-details timeline-summary timeline-detail-layout",
      "data-level": report?.level,
      "aria-label": t("details"),
      children: report === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(DetailHeader, { title: t("details"), back, t }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "timeline-muted", children: t("selectReport") })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(DetailHeader, { title: `${t("rollup")} · ${t("level")} ${report.level + 1}`, back, t, children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "timeline-muted", children: formatDuration(report.end - report.start) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "timeline-detail-scroll", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "timeline-muted", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("time", { dateTime: new Date(report.start).toISOString(), children: new Date(report.start).toLocaleString(locale) }),
            " ",
            "–",
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("time", { dateTime: new Date(report.end).toISOString(), children: new Date(report.end).toLocaleString(locale) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "timeline-report-meta", children: [
            report.toolCount,
            " ",
            t("toolCalls"),
            period === void 0 ? null : ` · ${t("savedPeriod")}: ${formatPeriod(period)}`,
            report.workMs === void 0 || report.workMs === period ? null : ` · ${t("coveredWork")}: ${formatDuration(report.workMs)}`
          ] }),
          ["progress", "uncertainties", "userActions"].map(
            (key) => report.summary[key].length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { "data-section": key, children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h4", { children: t(key === "progress" ? "reportProgress" : key) }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("ul", { children: report.summary[key].map((line) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("li", { children: line }, line)) })
            ] }, key)
          ),
          report.children.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("details", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("summary", { children: [
              t("children"),
              " · ",
              report.children.length
            ] }),
            report.children.map((id2) => {
              const child = view.reports.find((item) => item.id === id2);
              return child === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
                "button",
                {
                  className: "timeline-report-link",
                  "data-report-id": id2,
                  "data-level": child.level,
                  onClick: () => {
                    openReport(id2);
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "timeline-level-dot" }),
                    child.summary.progress[0]
                  ]
                },
                id2
              );
            })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            Annotations,
            {
              locale,
              annotations: view.annotations.filter(
                (annotation) => annotation.target.kind === "report" && annotation.target.report === report.id
              ),
              t
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("footer", { className: "timeline-detail-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            AnnotationEditor,
            {
              target: { kind: "report", report: report.id },
              ...draft,
              save: annotate,
              t
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
            import_dsh_client_ui_primitives9.Button,
            {
              className: "timeline-task-action timeline-report-note",
              "aria-pressed": noteOpen,
              "aria-expanded": noteOpen,
              onClick: () => {
                draft.update({ open: !noteOpen });
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_dsh_client_ui_primitives9.IconListPenOutlineRegular, { size: 18 }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: t("addAnnotation") })
              ]
            }
          )
        ] })
      ] })
    }
  );
}

// timeline/src/client/TaskHistory.tsx
var import_react8 = require("react");
var import_dsh_client_ui_primitives10 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime10 = require("react/jsx-runtime");
function TaskHistory({
  task: task2,
  decimals,
  locale = "en",
  t
}) {
  const [open, setOpen] = (0, import_react8.useState)(false);
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
    "details",
    {
      className: "timeline-task-history",
      open,
      onToggle: (event) => {
        setOpen(event.currentTarget.open);
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("summary", { children: [
          t("taskHistory"),
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "timeline-tab-count", children: task2.history.length })
        ] }),
        !open ? null : task2.history.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "timeline-muted", children: t("emptyTaskHistory") }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("ol", { className: "timeline-annotation-list", children: task2.history.toReversed().map((revision, index) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("li", { className: "timeline-annotation", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "timeline-annotation-heading", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("time", { dateTime: new Date(revision.at).toISOString(), children: new Date(revision.at).toLocaleString(locale) }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(import_dsh_client_ui_primitives10.Tag, { tone: statusTones[revision.status], children: t(revision.status) })
          ] }),
          revision.title === task2.title ? null : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { children: revision.title }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dl", { className: "timeline-task-metrics", children: [
            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("progress") }),
              /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("dd", { children: [
                revision.previousProgress === null || formatProgress(revision.previousProgress, decimals) === formatProgress(revision.progress, decimals) ? "" : `${formatProgress(revision.previousProgress, decimals)}% → `,
                formatProgress(revision.progress, decimals),
                "%"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dt", { children: t("durationWeight") }),
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("dd", { children: formatWeight(revision.weight) })
            ] })
          ] }),
          revision.description ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Markdown, { text: revision.description, t }) : null,
          revision.note ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Markdown, { text: revision.note, t }) : null,
          revision.details ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Markdown, { text: revision.details, t }) : null
        ] }, task2.history.length - index)) })
      ]
    }
  );
}

// timeline/src/client/Details.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
function Details({
  view,
  locale = "en",
  target,
  decimals,
  back,
  open,
  requestTask,
  playback,
  setPriority,
  annotate,
  annotationDraft,
  t
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "timeline-detail-page", children: target.kind === "report" ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
    ReportDetails,
    {
      locale,
      view,
      reportId: target.report,
      openReport: (report) => {
        open({ kind: "report", report });
      },
      t,
      back,
      annotate,
      annotationDraft
    },
    target.report
  ) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
    TaskDetails,
    {
      locale,
      view,
      target,
      decimals,
      back,
      requestTask,
      playback,
      setPriority,
      annotate,
      annotationDraft,
      t
    },
    `${target.tree}:${target.task}`
  ) });
}
function TaskDetails({
  view,
  locale = "en",
  target,
  decimals,
  back,
  requestTask,
  playback,
  setPriority,
  annotate,
  annotationDraft,
  t
}) {
  const draft = useAnnotationDraft(annotationDraft);
  const noteOpen = draft.draft.open;
  const tree = view.trees.find((tree2) => tree2.id === target.tree);
  const task2 = tree?.tasks.find((task3) => task3.id === target.task);
  if (tree === void 0 || task2 === void 0)
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(DetailHeader, { title: t("details"), back, t }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { role: "status", children: t("detailUnavailable") })
    ] });
  const measure = measureAll(tree.tasks).get(task2.id);
  const group = tree.tasks.some((child) => child.parent === task2.id && child.status !== "retired");
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("article", { className: "timeline-detail-layout", "aria-label": t("details"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(DetailHeader, { title: task2.title, back, t, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives11.Tag, { tone: statusTones[measure?.status ?? task2.status], children: t(measure?.status ?? task2.status) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "timeline-detail-scroll", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "timeline-eyebrow", children: tree.title }),
      task2.description ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Markdown, { text: task2.description, t }) : null,
      task2.note ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Markdown, { text: task2.note, t }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("dl", { className: "timeline-task-metrics", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("dt", { children: t("progress") }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("dd", { children: [
            formatProgress(measure?.progress ?? 0, decimals),
            "%"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("dt", { children: [
            t("durationWeight"),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives11.Tooltip, { label: t("weightHint"), side: "top", maxWidth: 320, portal: true, openOnClick: true, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives11.Button, { className: "timeline-icon-button timeline-estimate-help", "aria-label": t("weightHint"), children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(import_dsh_client_ui_primitives11.IconQuestionOutlineRegular, { size: 14 }) }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("dd", { children: formatWeight(task2.timeShare) })
        ] }),
        group ? null : /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("dt", { children: t("completedUnits") }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("dd", { children: [
            task2.done[0],
            " / ",
            task2.done[1]
          ] })
        ] })
      ] }),
      task2.details ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Markdown, { text: task2.details, t }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        Annotations,
        {
          locale,
          annotations: view.annotations.filter(
            (annotation) => annotation.target.kind === "task" && annotation.target.tree === tree.id && annotation.target.task === task2.id
          ),
          t
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TaskHistory, { locale, task: task2, decimals, t })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("footer", { className: "timeline-detail-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        AnnotationEditor,
        {
          target: { kind: "task", tree: tree.id, task: task2.id },
          ...draft,
          save: annotate,
          t
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        TaskActions,
        {
          playback,
          tree,
          task: task2,
          status: measure?.status ?? task2.status,
          request: requestTask,
          setPriority: (priority) => setPriority({ tree: tree.id, task: task2.id, priority }),
          annotationOpen: noteOpen,
          annotate: () => {
            draft.update({ open: !noteOpen });
          },
          t
        },
        `${tree.id}:${task2.id}`
      )
    ] })
  ] });
}

// timeline/src/client/Panel.tsx
var import_jsx_runtime12 = require("react/jsx-runtime");
function Panel({ useTabInfo, ...props }) {
  const { sidebar, tab } = useTabInfo();
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(TimelinePanel, { ...props, dockOpen: sidebar.expanded && tab.visible });
}
function TimelinePanel({
  sessionId: sessionId2,
  useProjection,
  useStore,
  actions,
  useClock,
  useLocale,
  useSettings,
  t,
  useSession,
  requestTask,
  setPriority,
  annotate,
  dockOpen,
  useSelection,
  consumeSelection,
  importTree,
  removeTree
}) {
  const id2 = (0, import_react9.useId)();
  const locale = useLocale((value) => value.active);
  const container = (0, import_react9.useRef)(null);
  const restore = (0, import_react9.useRef)(null);
  const view = useProjection("timeline");
  const settings = useSettings((value) => value.value);
  const state = useStore((value) => value);
  const now = useClock((value) => value);
  const playback = { annotations: view?.annotations ?? [], trees: view?.trees ?? [], now };
  const running = useSession((value) => value.running);
  const selection = useSelection((value) => value === sessionId2 ? value : null);
  (0, import_react9.useLayoutEffect)(() => {
    if (selection === null) return;
    actions.update({ tree: null, tab: "tasks", details: { tasks: [], timeline: [] } });
    consumeSelection();
  }, [selection]);
  const pages = state.details[state.tab];
  const page = pages.at(-1);
  const draftKey = JSON.stringify(page?.target);
  (0, import_react9.useLayoutEffect)(() => {
    const root = container.current;
    const page2 = restore.current;
    if (root === null || page2 === null) return;
    restore.current = null;
    const target = page2.target;
    const control = target === null ? root.querySelector("[data-detail-back]") : [...root.querySelectorAll("[data-task-id],[data-report-id]")].find(
      (button) => target.kind === "task" ? button.dataset.taskId === target.task && button.dataset.treeId === target.tree : button.dataset.reportId === target.report
    );
    control?.closest("details")?.setAttribute("open", "");
    (root.querySelector(".timeline-detail-scroll") ?? root).scrollTop = page2.scrollTop;
    (control ?? root.querySelector("[role=tabpanel]"))?.focus({ preventScroll: true });
  }, [pages]);
  const open = (target) => {
    const root = container.current;
    restore.current = { scrollTop: 0, target: null };
    actions.update({
      details: {
        ...state.details,
        [state.tab]: [
          ...pages,
          {
            target,
            scrollTop: (root.querySelector(".timeline-detail-scroll") ?? root).scrollTop
          }
        ]
      }
    });
  };
  const back = (previous) => {
    restore.current = previous;
    actions.update({ details: { ...state.details, [state.tab]: pages.slice(0, -1) } });
  };
  const tabIds = ["tasks", "timeline"];
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
    "div",
    {
      className: "dsh-timeline",
      "data-detail": page?.target.kind,
      ref: container,
      "data-timeline-dock-open": dockOpen === true,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("header", { className: "timeline-panel-header", children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("strong", { children: t("title") }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("small", { children: t("guide") })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "timeline-tabs", role: "tablist", "aria-label": t("title"), children: tabIds.map((tab) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
          "button",
          {
            id: `${id2}-${tab}`,
            "data-tab": tab,
            role: "tab",
            type: "button",
            "aria-selected": state.tab === tab,
            "aria-controls": `${id2}-content`,
            tabIndex: state.tab === tab ? 0 : -1,
            onClick: () => {
              actions.update({ tab });
            },
            onKeyDown: (event) => {
              const index = tabIds.indexOf(tab);
              const next = event.key === "Home" ? tabIds[0] : event.key === "End" ? tabIds[1] : event.key === "ArrowRight" || event.key === "ArrowLeft" ? tabIds[(index + 1) % tabIds.length] : void 0;
              if (next === void 0) return;
              event.preventDefault();
              actions.update({ tab: next });
              event.currentTarget.parentElement?.querySelector(`[data-tab="${next}"]`)?.focus();
            },
            children: [
              t(tab === "tasks" ? "tasks" : "reports"),
              tab === "timeline" && view !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "timeline-tab-count", "aria-hidden": "true", children: view.reports.filter((report) => report.source !== "no-activity").length }) : null
            ]
          },
          tab
        )) }),
        view === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { role: "status", children: t("loading") }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { role: "tabpanel", id: `${id2}-content`, "aria-labelledby": `${id2}-${state.tab}`, tabIndex: 0, children: [
          page !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            Details,
            {
              locale,
              view,
              target: page.target,
              decimals: settings?.progressDecimals ?? 2,
              back: () => {
                back(page);
              },
              open,
              requestTask,
              playback,
              setPriority,
              annotate,
              annotationDraft: {
                draft: state.drafts[draftKey] ?? emptyDraft,
                update: (patch) => {
                  actions.draft(draftKey, patch);
                }
              },
              t
            }
          ) : state.tab === "tasks" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            TaskTree,
            {
              sessionId: sessionId2,
              view,
              state,
              now,
              decimals: settings?.progressDecimals ?? 2,
              segmented: settings?.segmentedProgress ?? true,
              update: actions.update,
              toggle: actions.toggle,
              openTask: (tree, task2) => {
                open({ kind: "task", tree, task: task2 });
              },
              requestTask,
              playback,
              running,
              importTree,
              removeTree: async (tree) => {
                const result = await removeTree(tree);
                actions.forgetTree(tree);
                return result;
              },
              t
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
            settings?.reportsEnabled === false ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "timeline-notice", role: "status", children: t("reportsDisabled") }) : null,
            view.error ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("p", { className: "timeline-error", role: "alert", children: [
              t("failed"),
              " ",
              view.error
            ] }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              Schedule,
              {
                locale,
                cadence: settings ?? defaultReportCadence,
                view,
                state,
                now,
                update: actions.update,
                openReport: (report) => {
                  open({ kind: "report", report });
                },
                t
              }
            )
          ] }),
          page === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            DiscussionHistory,
            {
              locale,
              view,
              open: state.historyOpen,
              onToggle: (historyOpen) => {
                actions.update({ historyOpen });
              },
              t
            }
          ) : null
        ] })
      ]
    }
  );
}

// timeline/src/client/Embedded.tsx
var import_react10 = require("react");
var import_jsx_runtime13 = require("react/jsx-runtime");
function useSnapshot(source, select) {
  const subscribe = (0, import_react10.useCallback)((listener) => source.subscribe(listener), [source]);
  const snapshot = (0, import_react10.useCallback)(() => source.getSnapshot(), [source]);
  return select((0, import_react10.useSyncExternalStore)(subscribe, snapshot));
}
function Embedded({ ctx, sessionId: sessionId2, ...props }) {
  const [state, setState] = (0, import_react10.useState)();
  const [attempt, retry] = (0, import_react10.useState)(0);
  (0, import_react10.useEffect)(() => {
    let active = true;
    let reference;
    try {
      reference = ctx.sessions.retain(sessionId2, { source: "mekBotTimeline" });
    } catch (failure) {
      setState({ error: failure instanceof Error ? failure.message : String(failure) });
      return;
    }
    void reference.ready.then(({ session }) => {
      if (active) setState({ session });
    }, (failure) => {
      if (active) setState({ error: failure.message });
    });
    return () => {
      active = false;
      reference.release();
    };
  }, [ctx, sessionId2, attempt]);
  if (!state) return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { role: "status", children: props.t("loading") });
  if ("error" in state) return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { role: "alert", children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { children: state.error }),
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", onClick: () => {
      setState(void 0);
      retry((value) => value + 1);
    }, children: ctx.locale.getSnapshot().active.startsWith("zh") ? "重试" : "Retry" })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(BoundTimeline, { ctx, session: state.session, sessionId: sessionId2, ...props });
}
function BoundTimeline({ ctx, session, sessionId: sessionId2, clock, settings, requests, t }) {
  const [state, setState] = (0, import_react10.useState)(viewStoreOptions.init);
  const actions = (0, import_react10.useMemo)(() => {
    const change = (reducer) => (...args) => setState((previous) => {
      const draft = { ...previous, details: { ...previous.details } };
      reducer(draft, ...args);
      return draft;
    });
    return {
      open: change(viewStoreOptions.actions.open),
      forgetTree: change(viewStoreOptions.actions.forgetTree),
      update: change(viewStoreOptions.actions.update),
      draft: change(viewStoreOptions.actions.draft),
      toggle: change(viewStoreOptions.actions.toggle)
    };
  }, []);
  const projection = session.projections.faceOf("timeline");
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
    TimelinePanel,
    {
      sessionId: sessionId2,
      useProjection: () => useSnapshot(projection, (value) => value),
      useSession: (select) => useSnapshot(session, select),
      useStore: (select) => select(state),
      useClock: (select) => useSnapshot(clock, select),
      useLocale: (select) => useSnapshot(ctx.locale, select),
      useSettings: (select) => useSnapshot(settings, select),
      useSelection: (select) => select(null),
      consumeSelection: () => {
      },
      t,
      actions,
      requestTask: (request) => requests.send(sessionId2, request),
      setPriority: (request) => requests.setPriority(sessionId2, request),
      annotate: (request) => requests.annotate(sessionId2, request),
      importTree: (request) => requests.importTree(sessionId2, request),
      removeTree: (tree) => requests.removeTree(sessionId2, tree)
    }
  );
}

// timeline/src/client/TaskDock.tsx
var import_react11 = require("react");
var import_dsh_client_ui_primitives12 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime14 = require("react/jsx-runtime");
function TaskDock({
  sessionId: sessionId2,
  useProjection,
  useStore,
  actions,
  useSettings,
  useSession,
  toggleSidebar,
  removeTree,
  t
}) {
  const view = useProjection("timeline");
  const tree = view?.trees.find((item) => item.id === view.activeTreeId);
  const state = useStore((value) => value);
  const settings = useSettings((value) => value.value);
  const decimals = settings?.progressDecimals ?? 2;
  const segmented = settings?.segmentedProgress ?? true;
  const overall = (0, import_react11.useMemo)(() => measureAll(tree?.tasks ?? [], segmented).get(null), [tree, segmented]);
  const draft = useSession(
    (value) => value.blank && !value.running && !value.awaitingFirstTurn && value.pendingSubmissions.length === 0
  );
  const [removing, setRemoving] = (0, import_react11.useState)(false);
  const [failed, setFailed] = (0, import_react11.useState)();
  const removeFailed = failed?.sessionId === sessionId2 && failed.tree === tree?.id;
  const showingTree = tree !== void 0 && (state.tree ?? view?.activeTreeId) === tree.id && state.tab === "tasks" && state.details.tasks.length === 0;
  const toggle = (tree2) => {
    actions.update({
      tree: tree2.id,
      tab: "tasks",
      details: { ...state.details, tasks: [] }
    });
    toggleSidebar(showingTree);
  };
  if (view === void 0 || tree === void 0) return null;
  const progress = overall?.progress ?? 0;
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("section", { className: "timeline-dock", "aria-label": t("tasks"), "data-current-tree": showingTree, children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
    "div",
    {
      className: "timeline-dock-bar",
      "data-status": overall?.status ?? "pending",
      onClick: () => {
        toggle(tree);
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives12.Tooltip, { label: tree.title, side: "top", portal: true, delayMs: 500, children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "timeline-dock-title", children: tree.title }) }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          Progress,
          {
            value: progress,
            status: overall?.status ?? "pending",
            label: t("progress"),
            decimals,
            parts: overall?.parts,
            t
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "timeline-dock-percent", children: [
          formatProgress(progress, decimals),
          "%"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          import_dsh_client_ui_primitives12.Tooltip,
          {
            label: t("tasks"),
            side: "top",
            align: "end",
            portal: true,
            delayMs: 500,
            children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_dsh_client_ui_primitives12.Button, { size: "sm", className: "timeline-dock-action timeline-dock-toggle", children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "timeline-dock-label timeline-dock-open", children: t("openTaskTree") }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "timeline-dock-label timeline-dock-close", children: t("closeTaskTree") }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives12.IconRightUpOutlineRegular, { size: 16 })
            ] })
          }
        ),
        draft ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives12.Tooltip, { label: t(removeFailed ? "draftRemoveFailed" : "removeDraftTree"), side: "top", portal: true, children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          import_dsh_client_ui_primitives12.Button,
          {
            size: "sm",
            className: "timeline-dock-action timeline-dock-remove",
            "aria-label": t(removeFailed ? "draftRemoveFailed" : "removeDraftTree"),
            disabled: removing,
            onClick: (event) => {
              event.stopPropagation();
              setRemoving(true);
              setFailed(void 0);
              void removeTree(tree.id).then(() => {
                actions.forgetTree(tree.id);
              }).catch(() => {
                setFailed({ sessionId: sessionId2, tree: tree.id });
              }).finally(() => {
                setRemoving(false);
              });
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(import_dsh_client_ui_primitives12.IconCloseOutlineRegular, { size: 16 })
          }
        ) }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "timeline-dock-highlight", "aria-hidden": "true" })
      ]
    }
  ) });
}

// timeline/src/client/Settings.tsx
var import_react12 = require("react");
var import_dsh_client_ui_primitives13 = require("@deepseek-ai/dsh-client-ui-primitives");

// timeline/src/defaults.ts
var defaults_default = {
  "taskPrompt": "Use short, outcome-based titles. Break deliverables into checkable child actions. State the result or blocker in note. Use details for evidence, limits, and the effect on the goal. Explain unfamiliar names and what meaningful measurements show. Include counts only when they answer the user's question.",
  "summaryPrompt": "Focus on what changed and why it matters to the user's goal. Lead with a concrete result or finding. Add useful evidence, consequences, and remaining gaps when the record supports them."
};

// timeline/src/client/Settings.tsx
var import_jsx_runtime15 = require("react/jsx-runtime");
function editableSettings(value) {
  const periods = reportPeriods(value);
  return {
    language: value.language,
    progressDecimals: value.progressDecimals,
    segmentedProgress: value.segmentedProgress,
    allowTodo: value.allowTodo,
    autoOpenSidebar: value.autoOpenSidebar,
    reminderIterations: value.reminderIterations,
    reportsEnabled: value.reportsEnabled,
    taskPrompt: value.taskPrompt,
    summaryPrompt: value.summaryPrompt,
    periods,
    levelPrompts: periods.map((_, index) => value.levelPrompts[index] ?? "")
  };
}
function OptionHelp({ text }) {
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(import_dsh_client_ui_primitives13.Tooltip, { label: text, side: "top", maxWidth: 280, portal: true, openOnClick: true, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("button", { type: "button", className: "timeline-option-help", "aria-label": text, children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(import_dsh_client_ui_primitives13.IconQuestionOutlineRegular, { size: 14 }) }) });
}
function PromptCount({ length, locale }) {
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-prompt-foot timeline-muted", children: [
    length.toLocaleString(locale),
    " / ",
    PROMPT_LIMIT.toLocaleString(locale)
  ] });
}
function Settings({ useSettings, useLocale, useStore, actions, save, t }) {
  const field = (0, import_react12.useId)();
  const locale = useLocale((value2) => value2.active);
  const source = useSettings((value2) => value2);
  const state = useStore((value2) => value2);
  const pending = (0, import_react12.useRef)(false);
  const { draft } = state;
  const value = state.draft ?? (source.value === void 0 ? void 0 : editableSettings(source.value));
  const periods = value?.periods ?? [];
  const lastPeriod = periods.at(-1) ?? 0;
  const level = Math.min(state.level, periods.length - 1);
  const selectedPeriod = periods[level];
  const summaryPrompt = (level < 0 ? value?.summaryPrompt : value?.levelPrompts[level]) ?? "";
  const unitAt = (index, period) => state.units[index] ?? (period >= 36e5 && period % 36e5 === 0 ? "hour" : "minute");
  const edit = (value2, patch) => {
    actions.update({
      draft: { ...value2, ...patch },
      revision: state.draft === null ? source.revision : state.revision,
      messageKey: null
    });
  };
  const submit = async (draft2) => {
    if (pending.current) return;
    pending.current = true;
    actions.update({ saving: true, messageKey: null });
    try {
      const accepted = await save(draft2, state.revision);
      actions.update(accepted ? { draft: null, messageKey: "saved" } : { messageKey: "saveFailed" });
    } catch {
      actions.update({ messageKey: "saveFailed" });
    } finally {
      pending.current = false;
      actions.update({ saving: false });
    }
  };
  const invalidReminder = value !== void 0 && (!Number.isSafeInteger(value.reminderIterations) || value.reminderIterations < 1);
  const invalid = value !== void 0 && (invalidReminder || !languages.includes(value.language) || !progressPrecisions.includes(value.progressDecimals) || !validReportPeriods(periods) || value.taskPrompt.length > PROMPT_LIMIT || !value.summaryPrompt.trim() || value.summaryPrompt.length > PROMPT_LIMIT || value.levelPrompts.some((prompt) => prompt.length > PROMPT_LIMIT));
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "dsh-timeline timeline-settings", children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("header", { className: "timeline-page-header", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-page-title", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { children: t("settings") }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-save-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          "span",
          {
            role: "status",
            className: state.messageKey === "saveFailed" ? "timeline-error" : "timeline-muted",
            children: value === void 0 ? "" : state.messageKey === null ? state.draft === null ? t("upToDate") : t("unsaved") : t(state.messageKey)
          }
        ),
        state.draft === null ? null : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(import_dsh_client_ui_primitives13.Button, { disabled: state.saving, onClick: () => {
          actions.update({ draft: null, messageKey: null });
        }, children: t("discard") }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          import_dsh_client_ui_primitives13.Button,
          {
            className: "timeline-primary",
            disabled: state.draft === null || state.saving || invalid || !source.writable,
            onClick: draft === null ? void 0 : () => {
              void submit(draft);
            },
            children: t(state.saving ? "saving" : "save")
          }
        )
      ] })
    ] }) }),
    value === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { role: "status", children: t(source.status === "loading" ? "loading" : "settingsUnavailable") }) : /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_jsx_runtime15.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "timeline-settings-section", "aria-label": t("general"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { children: t("general") }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-config-controls", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-setting", children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-setting-label", children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("label", { htmlFor: `${field}-language`, children: t("language") }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(OptionHelp, { text: t("languageHint") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
              "select",
              {
                id: `${field}-language`,
                value: value.language,
                disabled: state.saving || !source.writable,
                onChange: (event) => {
                  const language = languages.find((item) => item === event.currentTarget.value);
                  if (language !== void 0) edit(value, { language });
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("option", { value: "ui", children: t("followAppLanguage") }),
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("option", { value: "chat", children: t("followChatLanguage") }),
                  outputLanguages.map((language) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("option", { value: language, children: languageText[language].label }, language))
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-setting", children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-setting-label", children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("label", { htmlFor: `${field}-decimals`, children: t("progressDecimals") }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(OptionHelp, { text: t("progressDecimalsHint") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
              "select",
              {
                id: `${field}-decimals`,
                value: value.progressDecimals,
                disabled: state.saving || !source.writable,
                onChange: (event) => {
                  const progressDecimals = progressPrecisions.find(
                    (precision) => String(precision) === event.currentTarget.value
                  );
                  if (progressDecimals !== void 0) edit(value, { progressDecimals });
                },
                children: progressPrecisions.map((precision) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("option", { value: precision, children: precision }, precision))
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-switch-control", children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-setting-label", children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: t("segmentedProgress") }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(OptionHelp, { text: t("segmentedProgressHint") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "timeline-switch-row", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
              import_dsh_client_ui_primitives13.Switch,
              {
                checked: value.segmentedProgress,
                label: t("segmentedProgress"),
                disabled: state.saving || !source.writable,
                onChange: (segmentedProgress) => {
                  edit(value, { segmentedProgress });
                }
              }
            ) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "timeline-settings-section", "aria-label": t("taskTracking"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { children: t("taskTracking") }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-config-controls", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-switch-control", children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-setting-label", children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: t("replaceTodo") }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(OptionHelp, { text: t("replaceTodoHint") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "timeline-switch-row", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
              import_dsh_client_ui_primitives13.Switch,
              {
                checked: !value.allowTodo,
                label: t("replaceTodo"),
                disabled: state.saving || !source.writable,
                onChange: (replaceTodo) => {
                  edit(value, { allowTodo: !replaceTodo });
                }
              }
            ) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-switch-control", children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-setting-label", children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: t("autoOpenSidebar") }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(OptionHelp, { text: t("autoOpenSidebarHint") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "timeline-switch-row", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
              import_dsh_client_ui_primitives13.Switch,
              {
                checked: value.autoOpenSidebar,
                label: t("autoOpenSidebar"),
                disabled: state.saving || !source.writable,
                onChange: (autoOpenSidebar) => {
                  edit(value, { autoOpenSidebar });
                }
              }
            ) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-setting", children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-setting-label", children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("label", { htmlFor: `${field}-reminder`, children: t("reminderIterations") }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(OptionHelp, { text: t("reminderHint") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "timeline-reminder-input", children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                "input",
                {
                  id: `${field}-reminder`,
                  type: "number",
                  min: 1,
                  max: Number.MAX_SAFE_INTEGER,
                  step: 1,
                  value: value.reminderIterations,
                  "aria-invalid": invalidReminder,
                  disabled: state.saving || !source.writable,
                  onChange: (event) => {
                    edit(value, { reminderIterations: Number(event.currentTarget.value) });
                  }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: t("iterations") })
            ] })
          ] })
        ] })
      ] }),
      invalid ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { role: "alert", className: "timeline-error", children: t(invalidReminder ? "invalidReminder" : "invalidSettings") }) : null,
      !source.writable ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { role: "status", className: "timeline-muted", children: t("settingsReadOnly") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "timeline-settings-section", "aria-label": t("progressReports"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { children: t("progressReports") }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-switch-control", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-setting-label", children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: t("reportsEnabled") }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(OptionHelp, { text: t("reportsEnabledHint") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "timeline-switch-row", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
            import_dsh_client_ui_primitives13.Switch,
            {
              checked: value.reportsEnabled,
              label: t("reportsEnabled"),
              disabled: state.saving || !source.writable,
              onChange: (reportsEnabled) => {
                edit(value, { reportsEnabled });
              }
            }
          ) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-config-layout", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "timeline-levels", "aria-label": t("hierarchy"), children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("h3", { className: "timeline-setting-label", children: [
              t("hierarchy"),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(OptionHelp, { text: t("hierarchyHint") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
              "button",
              {
                className: "timeline-global-choice",
                "aria-pressed": level === -1,
                onClick: () => {
                  actions.update({ level: -1 });
                },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("strong", { children: t("globalPrompt") }),
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("small", { children: t("globalPromptHint") })
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-level-list", children: [
              periods.map((period, index) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-level-row", "data-level": index, children: [
                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
                  "button",
                  {
                    className: "timeline-level-choice",
                    "aria-pressed": level === index,
                    onClick: () => {
                      actions.update({ level: index });
                    },
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "timeline-level-marker", "aria-hidden": "true", children: index + 1 }),
                      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { children: [
                        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("strong", { children: formatPeriod(period) }),
                        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("small", { children: [
                          t("level"),
                          " ",
                          index + 1
                        ] })
                      ] })
                    ]
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-period-input", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                    "input",
                    {
                      "aria-label": `${t("period")} ${index + 1}`,
                      type: "number",
                      min: unitAt(index, period) === "hour" ? 1 / 60 : 1,
                      step: "any",
                      value: period / (unitAt(index, period) === "hour" ? 36e5 : MINUTE_MS),
                      disabled: state.saving || !source.writable,
                      onChange: (event) => {
                        edit(value, {
                          periods: periods.map(
                            (item, position) => position === index ? Math.round(
                              Number(event.currentTarget.value) * (unitAt(index, period) === "hour" ? 36e5 : MINUTE_MS)
                            ) : item
                          )
                        });
                      }
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
                    "select",
                    {
                      "aria-label": `${t("unit")} ${index + 1}`,
                      value: unitAt(index, period),
                      disabled: state.saving || !source.writable,
                      onChange: (event) => {
                        const unit = event.currentTarget.value === "hour" ? "hour" : "minute";
                        actions.update({
                          units: periods.map(
                            (period2, position) => position === index ? unit : unitAt(position, period2)
                          )
                        });
                      },
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("option", { value: "minute", children: t("minutes") }),
                        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("option", { value: "hour", children: t("hours") })
                      ]
                    }
                  )
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                  import_dsh_client_ui_primitives13.Button,
                  {
                    className: "timeline-icon-button timeline-delete",
                    "aria-label": `${t("removeLevel")} ${index + 1}`,
                    title: `${t("removeLevel")} ${index + 1}`,
                    disabled: periods.length <= 1 || state.saving || !source.writable,
                    onClick: () => {
                      edit(value, {
                        periods: periods.filter((_, position) => position !== index),
                        levelPrompts: value.levelPrompts.filter((_, position) => position !== index)
                      });
                      actions.update({
                        level: level === index ? -1 : level > index ? level - 1 : level,
                        units: periods.map((period2, position) => unitAt(position, period2)).filter((_, position) => position !== index)
                      });
                    },
                    children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(import_dsh_client_ui_primitives13.IconTrashOutlineRegular, { size: 17 })
                  }
                )
              ] }, index)),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                "button",
                {
                  className: "timeline-add-level",
                  "aria-label": t("addLevel"),
                  title: t("addLevel"),
                  disabled: periods.length >= 5 || lastPeriod >= HISTORY_MS || invalid || state.saving || !source.writable,
                  onClick: () => {
                    edit(value, {
                      periods: [...periods, Math.min(lastPeriod * 2, HISTORY_MS)],
                      levelPrompts: [...value.levelPrompts, ""]
                    });
                    actions.update({ level: periods.length });
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(import_dsh_client_ui_primitives13.IconPlusOutlineRegular, { size: 20 })
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "timeline-prompt-editor", "aria-label": t("prompt"), children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-heading", children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h3", { children: selectedPeriod === void 0 ? t("globalPrompt") : `${t("levelSummary", { level: level + 1, period: formatPeriod(selectedPeriod) })} ${t("levelPrompt")}` }) }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                import_dsh_client_ui_primitives13.Button,
                {
                  disabled: state.saving || !source.writable,
                  title: level < 0 ? t("resetPrompt") : t("resetLevelHint"),
                  onClick: () => {
                    edit(
                      value,
                      level < 0 ? { summaryPrompt: defaults_default.summaryPrompt } : {
                        levelPrompts: value.levelPrompts.map(
                          (prompt, index) => index === level ? "" : prompt
                        )
                      }
                    );
                  },
                  children: t("resetPrompt")
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "timeline-muted", children: t(level < 0 ? "basePromptHint" : "rollupPromptHint") }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
              "textarea",
              {
                "aria-label": t("prompt"),
                spellCheck: false,
                maxLength: PROMPT_LIMIT,
                value: summaryPrompt,
                placeholder: level < 0 ? void 0 : t("levelPromptPlaceholder"),
                disabled: state.saving || !source.writable,
                onChange: (event) => {
                  edit(
                    value,
                    level < 0 ? { summaryPrompt: event.currentTarget.value } : {
                      levelPrompts: value.levelPrompts.map(
                        (prompt, index) => index === level ? event.currentTarget.value : prompt
                      )
                    }
                  );
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(PromptCount, { locale, length: summaryPrompt.length })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "timeline-settings-section timeline-task-prompt", "aria-label": t("taskPrompt"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "timeline-heading", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { children: t("taskPrompt") }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
            import_dsh_client_ui_primitives13.Button,
            {
              "aria-label": `${t("resetPrompt")}: ${t("taskPrompt")}`,
              disabled: state.saving || !source.writable,
              onClick: () => {
                edit(value, { taskPrompt: defaults_default.taskPrompt });
              },
              children: t("resetPrompt")
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "timeline-muted", children: t("taskPromptHint") }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
            "textarea",
            {
              "aria-label": t("taskPrompt"),
              rows: 4,
              spellCheck: false,
              maxLength: PROMPT_LIMIT,
              value: value.taskPrompt,
              disabled: state.saving || !source.writable,
              onChange: (event) => {
                edit(value, { taskPrompt: event.currentTarget.value });
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(PromptCount, { locale, length: value.taskPrompt.length })
        ] })
      ] })
    ] })
  ] });
}

// timeline/src/client/TimelineIcon.tsx
var import_jsx_runtime16 = require("react/jsx-runtime");
function TimelineIcon({
  size = 16,
  className
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(
    "svg",
    {
      width: size,
      height: size,
      className,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("path", { d: "M3.5 4.75v2M3.5 9.25v2" }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("circle", { cx: "3.5", cy: "3.5", r: "1.25" }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("circle", { cx: "3.5", cy: "8", r: "1.25" }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("circle", { cx: "3.5", cy: "12.5", r: "1.25" }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("path", { d: "M7 3.5h6M7 8h4M7 12.5h6" })
      ]
    }
  );
}

// timeline/src/client/TaskCard.tsx
var import_react13 = require("react");
var import_dsh_client_ui_primitives14 = require("@deepseek-ai/dsh-client-ui-primitives");
var import_zod4 = require("zod");
var import_jsx_runtime17 = require("react/jsx-runtime");
var metadataSchema = import_zod4.z.object({ timeline: taskReceiptSchema.nullable() });
function TaskCard({
  phase,
  block,
  useDisclosure,
  useSettings,
  useLocale,
  openTask,
  inspect,
  t
}) {
  const { expanded, toggle } = useDisclosure();
  const descriptionId = (0, import_react13.useId)();
  const locale = useLocale((value) => value.active);
  const decimals = useSettings((value) => value.value?.progressDecimals ?? 2);
  const receipt = (0, import_react13.useMemo)(() => {
    if (phase !== "result" || block.isError) return null;
    return metadataSchema.safeParse(block.meta).data?.timeline ?? null;
  }, [phase, block]);
  const failed = phase === "result" && block.isError;
  const pending = phase !== "result";
  const text = phase === "result" ? block.content.filter((item) => item.type === "text").map((item) => item.text).join("\n") : "";
  const gap = receipt?.previousAt == null ? null : receipt.at - receipt.previousAt;
  const minutes = gap === null ? 0 : Math.floor(gap / MINUTE_MS);
  const hours = Math.floor(minutes / 60);
  const duration = minutes < 1 ? `< 1 ${t("minutes")}` : [hours > 0 ? `${hours} ${t("hours")}` : "", minutes % 60 > 0 ? `${minutes % 60} ${t("minutes")}` : ""].filter(Boolean).join(" ");
  const gapLabel = t("taskUpdateGap", { duration });
  const percent = (value) => `${formatProgress(value, decimals)}%`;
  const change = (before, after) => percent(before) === percent(after) ? percent(after) : `${percent(before)} → ${percent(after)}`;
  return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(
    import_dsh_client_ui_primitives14.DisclosureRow,
    {
      className: "timeline-tool-update",
      icon: /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(TimelineIcon, { size: 14 }),
      title: t(failed ? "taskUpdateFailed" : phase === "start" ? "taskUpdatePending" : "taskUpdate"),
      open: expanded,
      expandable: !pending,
      onToggle: toggle,
      running: pending,
      expandOnRowClick: true,
      collapsedContent: receipt === null ? null : /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("span", { className: "timeline-tool-summary", children: [
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: receipt.title }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: change(receipt.before, receipt.after) })
      ] }),
      headerAccessory: receipt === null ? null : /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
        import_dsh_client_ui_primitives14.Button,
        {
          size: "sm",
          className: "timeline-card-open",
          "aria-label": t("openTaskTree"),
          title: t("openTaskTree"),
          onClick: () => {
            openTask(receipt.tree);
          },
          children: /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_dsh_client_ui_primitives14.IconRightUpOutlineRegular, { size: 14 })
        }
      ),
      children: [
        receipt === null ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("pre", { className: failed ? "timeline-card-failure" : "timeline-card-raw", children: text }) : /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(
          "section",
          {
            className: "timeline-task-card",
            "aria-label": receipt.title,
            "data-increased": receipt.after > receipt.before,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("header", { className: "timeline-card-heading", children: [
                /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("strong", { title: receipt.title, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(TimelineIcon, { size: 14 }),
                  /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: receipt.title })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(
                  "div",
                  {
                    className: "timeline-card-progress",
                    "aria-label": `${t("progress")}: ${change(receipt.before, receipt.after)}`,
                    children: [
                      percent(receipt.before) === percent(receipt.after) ? null : /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(import_jsx_runtime17.Fragment, { children: [
                        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("strong", { children: [
                          formatProgress(receipt.before, decimals),
                          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: "%" })
                        ] }),
                        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_dsh_client_ui_primitives14.IconChevronRightOutlineRegular, { size: 12 })
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("strong", { children: [
                        formatProgress(receipt.after, decimals),
                        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: "%" })
                      ] })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "timeline-card-meta", children: [
                /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: receipt.branch }),
                /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("span", { title: new Date(receipt.at).toLocaleString(locale), children: [
                  /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("time", { dateTime: new Date(receipt.at).toISOString(), children: new Date(receipt.at).toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false
                  }) }),
                  gap !== null && gap >= 0 ? /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(import_jsx_runtime17.Fragment, { children: [
                    " · ",
                    gapLabel
                  ] }) : null
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("ul", { className: "timeline-card-tasks", children: receipt.tasks.map((task2, index) => /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
                import_dsh_client_ui_primitives14.Tooltip,
                {
                  label: `${task2.title}
${t(task2.status)}${task2.note ? ` · ${task2.note}` : ""}`,
                  side: "top",
                  portal: true,
                  delayMs: 500,
                  children: /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(
                    "button",
                    {
                      type: "button",
                      className: "timeline-card-task",
                      "data-status": task2.status,
                      "aria-label": `${task2.title} · ${t(task2.status)} · ${change(task2.before, task2.after)}`,
                      "aria-describedby": task2.note ? `${descriptionId}-${index}` : void 0,
                      onClick: () => {
                        openTask(receipt.tree, task2.id);
                      },
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "timeline-card-status", "aria-hidden": "true", children: task2.status === "done" ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_dsh_client_ui_primitives14.IconCheckOutlineRegular, { size: 14 }) : task2.status === "active" ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_dsh_client_ui_primitives14.IconClockOutlineRegular, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "timeline-status-dot" }) }),
                        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("span", { className: "timeline-card-task-copy", children: [
                          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: task2.title }),
                          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { id: `${descriptionId}-${index}`, children: task2.note })
                        ] }),
                        ["blocked", "paused", "retired"].includes(task2.status) ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "timeline-card-state", children: t(task2.status) }) : null,
                        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("span", { className: "timeline-card-task-progress", children: [
                          percent(task2.before) === percent(task2.after) ? null : /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(import_jsx_runtime17.Fragment, { children: [
                            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: percent(task2.before) }),
                            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_dsh_client_ui_primitives14.IconChevronRightOutlineRegular, { size: 10 })
                          ] }),
                          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { children: percent(task2.after) })
                        ] })
                      ]
                    }
                  )
                }
              ) }, task2.id)) }),
              receipt.total > receipt.tasks.length ? /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("button", { type: "button", className: "timeline-card-more", onClick: () => {
                openTask(receipt.tree);
              }, children: [
                t("taskUpdateMore", { count: receipt.total - receipt.tasks.length }),
                /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_dsh_client_ui_primitives14.IconRightUpOutlineRegular, { size: 14 })
              ] }) : null
            ]
          }
        ),
        receipt !== null || inspect === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_dsh_client_ui_primitives14.Button, { size: "sm", className: "timeline-card-inspect", onClick: inspect, children: t("details") })
      ]
    }
  );
}

// timeline/src/client/locales.ts
var en = {
  markdownCopy: "Copy",
  markdownCopied: "Copied",
  markdownCode: "Code",
  markdownWrap: "Wrap lines",
  markdownUnwrap: "Unwrap lines",
  markdownFootnotes: "Footnotes",
  taskUpdate: "Update task progress",
  taskUpdatePending: "Saving task progress…",
  taskUpdateFailed: "Task update not confirmed",
  taskUpdateGap: "{duration} since the last task tree update",
  taskUpdateMore: "Open task tree · {count} more changes",
  importTree: "Import task tree",
  exportTree: "Export task tree",
  deleteTree: "Delete task tree",
  removeDraftTree: "Remove imported task tree",
  draftRemoveFailed: "Could not remove the task tree. Try again.",
  chooseCheckpoint: "Choose file…",
  checkpointHint: "Choose a .timeline.json file saved with “Export task tree”. It is imported as a separate task tree.",
  continueCheckpoint: "Ask the agent to continue after import (posts a message to the conversation)",
  copyCheckpoint: "Create another copy if already imported",
  deleteTreeHint: "Delete “{title}” and its discussions from this session? To restore the tree, import an exported copy. The conversation and reports stay. The agent receives a message about the removal.",
  treeIdleRequired: "Wait for the current turn to finish, or stop it first.",
  treeTransferFailed: "Could not confirm this change. Check the task tree before retrying.",
  treeNotifyUnknown: "The tree change was saved. Check the conversation before sending another request.",
  cancel: "Cancel",
  taskCount: "Tasks: {count}",
  segmentedProgress: "Segmented progress bar",
  completedWork: "Completed work: {count} ({percent}%)",
  activeWork: "Active work: {count} ({percent}%)",
  pendingWork: "Work to start: {count} ({percent}%)",
  blockedWork: "Blocked work: {count} ({percent}%)",
  title: "Timeline",
  guide: "Task trees and timed reports",
  tasks: "Task Tree",
  taskTreeChoice: "Select a task tree",
  openTaskTree: "Open task tree",
  closeTaskTree: "Hide task tree",
  planHint: "Multi-step work gets a plan here automatically. Simple replies do not need one.",
  reports: "Reports",
  emptyTasks: "The agent has not created a task tree.",
  emptyReports: "No reports in this range.",
  loading: "Loading Timeline…",
  progress: "Progress",
  reportProgress: "Progress",
  uncertainties: "Open questions",
  userActions: "Things you can do",
  now: "Now",
  returnNow: "Back to now",
  returnNowNewReports: "New reports · Back to now",
  jumpToLastReport: "Jump to last report",
  treeUnavailable: "This task tree is unavailable.",
  openActiveTree: "Open active task tree",
  level: "Level",
  period: "Period",
  unit: "Unit",
  hours: "hour",
  globalPrompt: "Instructions for all levels",
  globalPromptHint: "Instructions for task progress summaries at every level.",
  levelPrompt: "Additional instructions",
  levelSummary: "Level {level} · {period}",
  levelPromptPlaceholder: "Optional. Add instructions for this level; the global prompt still applies.",
  previousTree: "Previous task tree",
  nextTree: "Next task tree",
  history: "History",
  scrollHint: "Time runs down, newest first · Scroll for earlier reports · Ctrl/⌘ + scroll to zoom",
  elapsed: "Elapsed",
  remaining: "Remaining",
  unknown: "Unknown",
  estimateHint: "A rough estimate at the current pace: elapsed × (1 − progress) ÷ progress. Shown only while the agent is working on this tree.",
  estimateHelp: "How is remaining time estimated?",
  estimateCalculated: "Calculated estimate",
  durationWeight: "Weight",
  completedUnits: "Completed steps",
  weightHint: "Relative effort among sibling tasks. The agent sets it; progress is computed from it.",
  pending: "Pending",
  active: "Active",
  paused: "Paused",
  blocked: "Blocked",
  done: "Done",
  retired: "Removed from plan",
  children: "Included reports",
  details: "Details",
  back: "Back",
  replaceTodo: "Replace Todo tools (recommended)",
  resetLevelHint: "Clear this level’s extra instructions and keep the global prompt.",
  detailUnavailable: "Select a task or report from Timeline to open its details.",
  time: "Time",
  column: "column",
  equalColumns: "Show all columns equally",
  savedPeriod: "Interval at the time",
  coveredWork: "Agent work time",
  openReport: "Open report",
  showReport: "Show report",
  openShort: "Open",
  showShort: "Show",
  failed: "Report failed. It retries automatically while the session is active.",
  selectReport: "Select a report to read its summary and explore included intervals.",
  settings: "Timeline settings",
  general: "Progress display",
  taskTracking: "Task tracking",
  taskPrompt: "Task writing guidance",
  taskPromptHint: "Controls task titles, descriptions and detailed progress through the task-writing tool description.",
  progressReports: "Timed reports",
  reportsEnabled: "Generate timed reports",
  reportsEnabledHint: "Reports are written in the background by the session’s model and use extra tokens. Saved reports stay available when this is off.",
  reportsDisabled: "Timed reports are off. Turn them on in Timeline settings on the plugin page.",
  reminderIterations: "Task update reminder",
  iterations: "iterations",
  reminderHint: "Reminds the agent after this many consecutive steps in a turn without a successful task update.",
  invalidReminder: "Use a positive whole number of iterations.",
  upToDate: "All changes saved",
  unsaved: "Unsaved changes",
  save: "Save changes",
  saving: "Saving…",
  saved: "Saved",
  saveFailed: "Could not save. Your draft is kept. Reload accepted values with Discard, then retry.",
  discard: "Discard",
  settingsUnavailable: "Timeline settings are unavailable. Enable the plugin, then reconnect.",
  settingsReadOnly: "This profile’s configuration is read only.",
  language: "Task and report language",
  languageHint: "Applies to new task text and reports. Follow app uses the Harness display language. Follow chat lets the agent choose the language from the conversation.",
  progressDecimalsHint: "Sets the number of decimal places shown for progress.",
  segmentedProgressHint: "Shows completed, active, pending and blocked work as separate parts of the progress bar.",
  replaceTodoHint: "Uses Timeline task trees in place of Todo tools in this profile.",
  autoOpenSidebar: "Auto-open sidebar",
  autoOpenSidebarHint: "Opens the sidebar when the first task tree appears in a session and the window is wider than 768 px. You can still open it from the progress bar.",
  followAppLanguage: "Follow app",
  followChatLanguage: "Follow chat",
  progressDecimals: "Progress decimal places",
  minutes: "min",
  underSecond: "<1s",
  treeActions: "Task tree actions",
  hierarchy: "Report hierarchy",
  hierarchyHint: "Minimum elapsed intervals must increase. Due work is reported when the session is active; higher levels combine complete reports.",
  rollup: "Report",
  addLevel: "Add level",
  removeLevel: "Delete level",
  prompt: "Report instructions",
  basePromptHint: "Keep progress short and useful. Summaries run in the background with the session’s provider and model.",
  rollupPromptHint: "Optional additions to the global prompt. The first level uses task context; higher levels use child summaries.",
  resetPrompt: "Restore default",
  invalidSettings: "Use increasing periods of at least one minute and at most seven days (first level: at most one day). The global prompt must have 1–32,768 characters.",
  expandAll: "Expand all",
  collapseAll: "Collapse all",
  leafTasks: "tasks done",
  toolCalls: "tool calls",
  pauseTask: "Request pause",
  resumeTask: "Request continue",
  taskCompleted: "Completed",
  pausePlan: "Request pause for this plan",
  resumePlan: "Request continue for this plan",
  priority: "Priority",
  noPriority: "None",
  inheritedPriority: "Inherited",
  priorityP0: "Urgent",
  priorityP1: "High",
  priorityP2: "Medium",
  priorityP3: "Low",
  priorityHint: "P0 changes notify the running agent promptly. Group priorities apply to children unless they have their own. Priority does not resume paused work.",
  prioritySaveFailed: "Could not confirm the priority change. Check the current value before retrying.",
  addAnnotation: "Discussion",
  annotations: "Discussion",
  taskTarget: "Task",
  planTarget: "Plan",
  latestUpdate: "Latest update",
  discussionRef: "Reply reference",
  discussionMessage: "User message",
  emptyAnnotations: "No discussions yet.",
  annotationUser: "You",
  annotationAgent: "Agent",
  annotationOpen: "Awaiting reply",
  annotationResolved: "Replied",
  annotationPlaceholder: "Describe an issue, ask a question, or request added work…",
  cancelAnnotation: "Cancel",
  saveAnnotation: "Send to agent",
  annotationSaved: "Discussion saved and posted to the conversation.",
  annotationNotifyFailed: "Discussion saved. Notification was not confirmed; check the conversation.",
  annotationSaveFailed: "Could not confirm the save. Your draft is retained; check for a saved discussion before retrying.",
  annotationRequest: "At a safe checkpoint, address the user’s message. Save the outcome with timeline_reply using the reply reference, then continue ongoing work.",
  taskControls: "Work controls",
  taskControlsHint: "Posts a request to the conversation; the agent handles it after its current step. To stop right away, use the Stop button on the composer.",
  pausePending: "Pause requested",
  resumePending: "Continue requested",
  retryPause: "Request pause again",
  retryResume: "Request continue again",
  controlWaitingHint: "Request saved. Awaiting a recorded plan update.",
  controlUnconfirmedHint: "State is not confirmed. Check the conversation and saved reply before sending another request.",
  controlDeliveryUnknown: "Delivery unconfirmed",
  controlRequest: "Your request",
  controlWaiting: "Awaiting confirmation",
  controlApplied: "Plan updated",
  controlAnswered: "Replied, state unchanged",
  controlSuperseded: "Replaced by a newer request",
  controlUnavailable: "Task no longer in the plan",
  discussionHistory: "All discussions in this session",
  taskHistory: "Change history",
  emptyTaskHistory: "No changes recorded.",
  controlReplyRequest: "Record any task state changes. Use the reply reference with timeline_reply to report the outcome or blocker.",
  sendingTaskRequest: "Sending request…",
  taskRequestFailed: "Could not confirm the request. Check the conversation before retrying.",
  taskRequestUnavailable: "This conversation is unavailable. Reopen it before sending a task request.",
  resumeRequest: "Continue the selected work, preserving progress. Check blocked dependencies and activate an eligible leaf before working.",
  pauseRequest: "At a safe checkpoint, pause active and pending tasks in this scope and record why. Keep saved progress and existing blockers. Continue other requested work if any, or finish the turn."
};
var zh = {
  markdownCopy: "复制",
  markdownCopied: "已复制",
  markdownCode: "代码",
  markdownWrap: "自动换行",
  markdownUnwrap: "取消换行",
  markdownFootnotes: "脚注",
  taskUpdate: "更新任务进展",
  taskUpdatePending: "正在保存任务进展…",
  taskUpdateFailed: "任务更新未确认",
  taskUpdateGap: "距离上次更新任务树 {duration}",
  taskUpdateMore: "打开任务树 · 另有 {count} 项更新",
  importTree: "导入任务树",
  exportTree: "导出任务树",
  deleteTree: "删除任务树",
  removeDraftTree: "移除导入的任务树",
  draftRemoveFailed: "未能移除任务树，请重试",
  chooseCheckpoint: "选择文件…",
  checkpointHint: "选择用「导出任务树」保存的 .timeline.json 文件，导入后是一棵独立的任务树",
  continueCheckpoint: "导入后让智能体接着做（会在对话里发一条消息）",
  copyCheckpoint: "重复导入时创建另一个副本",
  deleteTreeHint: "删除本会话中的「{title}」及其讨论？可导入此前导出的副本恢复任务树。对话和报告会保留，智能体会收到删除通知。",
  treeIdleRequired: "请等这一轮结束，或先停止生成",
  treeTransferFailed: "未能确认更改。请检查任务树后再重试",
  treeNotifyUnknown: "任务树的更改已保存，但没能确认智能体是否收到通知",
  cancel: "取消",
  taskCount: "任务数：{count}",
  segmentedProgress: "分段进度条",
  completedWork: "{count} 项已完成的工作 ({percent}%)",
  activeWork: "{count} 项进行中的工作 ({percent}%)",
  pendingWork: "{count} 项待开始的工作 ({percent}%)",
  blockedWork: "{count} 项阻塞的工作 ({percent}%)",
  title: "时间线",
  guide: "任务树与定时报告",
  tasks: "任务树",
  taskTreeChoice: "选择任务树",
  openTaskTree: "打开任务树",
  closeTaskTree: "收起任务树",
  planHint: "把需要多步完成的任务交给智能体，它会在这里列出任务和进度；简单回复不会建任务树",
  reports: "报告",
  emptyTasks: "还没有任务树",
  emptyReports: "此时间范围内没有报告",
  loading: "正在加载时间线…",
  progress: "进度",
  reportProgress: "进展",
  uncertainties: "待定事项",
  userActions: "你可以做的事",
  now: "现在",
  returnNow: "回到现在",
  returnNowNewReports: "有新报告 · 回到现在",
  jumpToLastReport: "跳转到最后一份报告",
  treeUnavailable: "此任务树已不可用",
  openActiveTree: "打开当前任务树",
  level: "层级",
  period: "时长",
  unit: "单位",
  hours: "小时",
  globalPrompt: "所有层级的报告要求",
  globalPromptHint: "每一层报告都会用到这段要求",
  levelPrompt: "附加要求",
  levelSummary: "层级 {level} · {period}",
  levelPromptPlaceholder: "可选。为这一层添加额外要求，所有层级的要求仍然生效",
  previousTree: "上一棵任务树",
  nextTree: "下一棵任务树",
  history: "历史",
  scrollHint: "竖轴是时间，越往下越早 · 滚动查看更早的报告 · 按住 Ctrl/⌘ 滚动可缩放",
  elapsed: "已用时间",
  remaining: "剩余时间",
  unknown: "未知",
  estimateHint: "按目前的速度粗略推算：已用时间 ×（1 − 进度）÷ 进度。只在智能体正在处理这棵任务树时显示，仅供参考",
  estimateHelp: "剩余时间如何估算？",
  estimateCalculated: "公式估算",
  durationWeight: "权重",
  completedUnits: "完成步数",
  weightHint: "同一父任务下各任务的相对工作量，由智能体设定，用来计算进度",
  pending: "待开始",
  active: "进行中",
  paused: "已暂停",
  blocked: "已阻塞",
  done: "已完成",
  retired: "已移出计划",
  children: "包含的报告",
  details: "详情",
  back: "返回",
  replaceTodo: "替代待办清单（推荐）",
  resetLevelHint: "清除这一层的附加要求，保留所有层级的要求",
  detailUnavailable: "请在时间线中选择任务或报告，打开其详情",
  time: "时间",
  column: "列",
  equalColumns: "等宽显示所有列",
  savedPeriod: "当时的报告间隔",
  coveredWork: "其中智能体工作",
  openReport: "打开报告",
  showReport: "展开报告",
  openShort: "查看",
  showShort: "展开",
  failed: "报告生成失败，会话运行时会自动重试",
  selectReport: "选择报告查看摘要，并逐层查看所含的时间段",
  settings: "时间线设置",
  general: "进度显示",
  taskTracking: "任务跟踪",
  taskPrompt: "任务编写提示词",
  taskPromptHint: "智能体写任务标题、说明和进展时会参考这段要求",
  progressReports: "定时报告",
  reportsEnabled: "生成定时报告",
  reportsEnabledHint: "开启后会用当前会话的模型在后台额外生成报告，会消耗额度。关闭后仍可查看已生成的报告",
  reportsDisabled: "定时报告已关闭，可在插件详情页的时间线设置里重新开启",
  reminderIterations: "提醒智能体更新进度",
  iterations: "步",
  reminderHint: "智能体在同一轮中连续这么多步未成功更新任务时，会收到更新提醒",
  invalidReminder: "步数须为正整数",
  upToDate: "设置已是最新",
  unsaved: "有未保存的更改",
  save: "保存更改",
  saving: "正在保存…",
  saved: "已保存",
  saveFailed: "保存失败，改动还在。可点「放弃更改」载入当前生效的设置后重试",
  discard: "放弃更改",
  settingsUnavailable: "时间线设置不可用，请启用插件后重新连接",
  settingsReadOnly: "当前配置为只读",
  language: "任务与报告语言",
  languageHint: "用于新任务文本和报告。跟随应用时使用 Harness 的界面语言，跟随对话时由智能体根据对话选择语言",
  progressDecimalsHint: "设置进度显示的小数位数",
  segmentedProgressHint: "在进度条中分别显示已完成、进行中、待开始和已阻塞的工作",
  replaceTodoHint: "在当前配置的会话中，用时间线任务树替代待办工具",
  autoOpenSidebar: "自动打开侧栏",
  autoOpenSidebarHint: "窗口宽度超过 768 像素时，会话中出现第一棵任务树会自动打开侧栏。也可从进度条手动打开。",
  followAppLanguage: "跟随应用",
  followChatLanguage: "跟随对话",
  progressDecimals: "进度小数位数",
  minutes: "分钟",
  underSecond: "不到 1 秒",
  treeActions: "任务树操作",
  hierarchy: "报告层级",
  hierarchyHint: "每一层的间隔要比上一层长。到了间隔且智能体正在工作时生成一份报告，上一层报告由下一层已生成的报告合并而成",
  rollup: "报告",
  addLevel: "添加层级",
  removeLevel: "删除层级",
  prompt: "报告要求",
  basePromptHint: "这段要求决定报告侧重什么。报告在后台使用当前会话的提供商和模型生成",
  rollupPromptHint: "可选。第 1 层根据对话内容写报告，更高层根据下一层的报告写",
  resetPrompt: "恢复默认",
  invalidSettings: "间隔须至少一分钟、逐层递增，且不超过七天（第 1 层最多一天）。所有层级的报告要求须为 1–32,768 字符",
  expandAll: "全部展开",
  collapseAll: "全部折叠",
  leafTasks: "项任务已完成",
  toolCalls: "次工具调用",
  pauseTask: "请求暂停",
  resumeTask: "请求继续",
  taskCompleted: "已完成",
  pausePlan: "请求暂停此任务树",
  resumePlan: "请求继续此任务树",
  priority: "优先级",
  noPriority: "无",
  inheritedPriority: "继承",
  priorityP0: "紧急",
  priorityP1: "高",
  priorityP2: "中",
  priorityP3: "低",
  priorityHint: "P0 会马上通知运行中的智能体，P1–P3 在智能体挑下一项任务时生效。没单独设置的子任务沿用父任务的优先级；优先级不会让暂停的任务恢复",
  prioritySaveFailed: "未能确认优先级是否保存，请先检查当前值再重试",
  addAnnotation: "讨论",
  annotations: "讨论",
  taskTarget: "任务",
  planTarget: "计划",
  latestUpdate: "最近进展",
  discussionRef: "回复引用",
  discussionMessage: "用户留言",
  emptyAnnotations: "暂无讨论",
  annotationUser: "你",
  annotationAgent: "智能体",
  annotationOpen: "待回复",
  annotationResolved: "已回复",
  annotationPlaceholder: "描述问题、提出疑问，或请求添加工作…",
  cancelAnnotation: "取消",
  saveAnnotation: "发送给智能体",
  annotationSaved: "讨论已保存，并已作为一条消息发到对话里",
  annotationNotifyFailed: "讨论已保存，但没能确认消息是否发到对话里。如果对话里没有这条消息，请直接在输入框里提醒智能体看讨论",
  annotationSaveFailed: "未能确认是否保存，草稿已保留；重试前请先检查讨论列表",
  annotationRequest: "请在安全节点处理用户留言，使用回复引用通过 timeline_reply 保存结果，然后继续当前工作。",
  taskControls: "工作控制",
  taskControlsHint: "会在对话里发一条请求，智能体做完手头这一步后处理。要马上停下，请用输入框上的停止按钮",
  pausePending: "等待暂停确认",
  resumePending: "等待继续确认",
  retryPause: "再次请求暂停",
  retryResume: "再次请求继续",
  controlWaitingHint: "请求已发出，等智能体处理",
  controlUnconfirmedHint: "尚未确认状态。再次请求前，请检查对话与已保存的回复",
  controlDeliveryUnknown: "未确认送达",
  controlRequest: "你的请求",
  controlWaiting: "等待确认",
  controlApplied: "计划已更新",
  controlAnswered: "已回复，状态未变",
  controlSuperseded: "已被新请求替代",
  controlUnavailable: "任务已不在计划中",
  discussionHistory: "本会话的全部讨论",
  taskHistory: "更改记录",
  emptyTaskHistory: "暂无更改记录",
  controlReplyRequest: "记录任务状态的变化，再使用回复引用通过 timeline_reply 说明结果或阻碍。",
  sendingTaskRequest: "正在发送请求…",
  taskRequestFailed: "未能确认请求是否发送，请先检查对话再重试",
  taskRequestUnavailable: "此对话不可用，请重新打开后再发送任务请求",
  resumeRequest: "继续所选范围内的任务，保留进度。先检查阻塞依赖，再将可执行叶任务设为进行中。",
  pauseRequest: "请在安全节点暂停此范围内进行中或待开始的任务，并记录原因。保留已保存的进度和现有阻塞状态。如果还有用户要求的其他工作，请继续处理，否则结束本轮。"
};
var ja = {
  markdownCopy: "コピー",
  markdownCopied: "コピーしました",
  markdownCode: "コード",
  markdownWrap: "行を折り返す",
  markdownUnwrap: "折り返しを解除",
  markdownFootnotes: "脚注",
  taskUpdate: "タスクの進捗を更新",
  taskUpdatePending: "タスクの進捗を保存中…",
  taskUpdateFailed: "タスクの更新は未確認です",
  taskUpdateGap: "前回のタスクツリー更新から {duration}",
  taskUpdateMore: "タスクツリーを開く · ほか {count} 件の更新",
  importTree: "タスクツリーをインポート",
  exportTree: "タスクツリーをエクスポート",
  deleteTree: "タスクツリーを削除",
  removeDraftTree: "インポートしたタスクツリーを外す",
  draftRemoveFailed: "タスクツリーを外せませんでした。もう一度お試しください。",
  chooseCheckpoint: "ファイルを選択…",
  checkpointHint: "保存した進捗を別のタスクツリーとして取り込みます。",
  continueCheckpoint: "インポート後に続行を依頼",
  copyCheckpoint: "取り込み済みの場合も別のコピーを作成",
  deleteTreeHint: "このセッションから「{title}」とその議論を削除しますか？エクスポートしたファイルから復元できます。会話とレポートは残り、エージェントに削除が通知されます。",
  treeIdleRequired: "現在のターンが終わるまで待つか、先に停止してください。",
  treeTransferFailed: "変更を確認できませんでした。再試行する前にタスクツリーを確認してください。",
  treeNotifyUnknown: "ツリーの変更は保存されました。再度依頼する前に会話を確認してください。",
  cancel: "キャンセル",
  taskCount: "タスク数: {count}",
  segmentedProgress: "分割進捗バー",
  completedWork: "完了した作業: {count} 件 ({percent}%)",
  activeWork: "進行中の作業: {count} 件 ({percent}%)",
  pendingWork: "未着手の作業: {count} 件 ({percent}%)",
  blockedWork: "ブロック中の作業: {count} 件 ({percent}%)",
  title: "タイムライン",
  guide: "タスクツリーとバックグラウンドの進捗レポート",
  tasks: "タスクツリー",
  taskTreeChoice: "タスクツリーを選択",
  openTaskTree: "タスクツリーを開く",
  closeTaskTree: "タスクツリーを閉じる",
  planHint: "複数の手順がある作業では、自動で計画を作成します。簡単な返答には不要です。",
  reports: "レポート",
  emptyTasks: "エージェントはまだタスクツリーを作成していません。",
  emptyReports: "この期間のレポートはありません。",
  loading: "タイムラインを読み込み中…",
  progress: "進捗",
  reportProgress: "進捗",
  uncertainties: "未確定事項",
  userActions: "協力できること",
  now: "現在",
  returnNow: "現在に戻る",
  returnNowNewReports: "新しいレポート · 現在に戻る",
  jumpToLastReport: "最新レポートに移動",
  treeUnavailable: "このタスクツリーは利用できません。",
  openActiveTree: "現在のタスクツリーを開く",
  level: "階層",
  period: "期間",
  unit: "単位",
  hours: "時間",
  globalPrompt: "共通の要約",
  globalPromptHint: "すべての階層の進捗要約に適用する指示です。",
  levelPrompt: "追加の指示",
  levelSummary: "階層 {level} · {period} の要約",
  levelPromptPlaceholder: "任意。この階層の指示を追加します。共通のプロンプトも適用されます。",
  previousTree: "前のタスクツリー",
  nextTree: "次のタスクツリー",
  history: "履歴",
  scrollHint: "経過時間に比例 · スクロールで履歴 · Ctrl/⌘ + スクロールで拡大縮小",
  elapsed: "経過時間",
  remaining: "残り時間",
  unknown: "不明",
  estimateHint: "現在のペースからの概算です：経過時間 ×（1 − 進捗）÷ 進捗。エージェントがこのツリーを処理している間だけ表示されます。",
  estimateHelp: "残り時間の推定方法",
  estimateCalculated: "計算による見積もり",
  durationWeight: "所要時間の重み",
  completedUnits: "完了した単位",
  weightHint: "同じ親タスク内での相対的な作業量です。エージェントが設定し、進捗の計算に使われます。",
  pending: "未着手",
  active: "進行中",
  paused: "一時停止",
  blocked: "ブロック中",
  done: "完了",
  retired: "対象外",
  children: "含まれるレポート",
  details: "詳細",
  back: "戻る",
  replaceTodo: "Todo ツールを置き換える（推奨）",
  resetLevelHint: "この階層の追加指示を消去し、共通のプロンプトを維持します。",
  detailUnavailable: "タスクまたはレポートを選択して詳細を開いてください。",
  time: "時刻",
  column: "列",
  equalColumns: "すべての列を同じ幅で表示",
  savedPeriod: "保存時の期間",
  coveredWork: "対象の作業時間",
  openReport: "レポートを開く",
  showReport: "レポートを広げる",
  openShort: "開く",
  showShort: "広げる",
  failed: "レポートを作成できませんでした。1分以上待ち、セッションの実行中に再試行します。",
  selectReport: "レポートを選択して要約とその内訳を確認してください。",
  settings: "タイムライン設定",
  general: "進捗表示",
  taskTracking: "タスク管理",
  taskPrompt: "タスク記述の指示",
  taskPromptHint: "タスク名、説明、詳しい進捗の書き方を、タスク記述ツールの説明に追加します。",
  progressReports: "定期レポート",
  reportsEnabled: "定期レポートを生成",
  reportsEnabledHint: "オフにしても保存済みのレポートを確認できます。",
  reportsDisabled: "定期レポートはオフです。再開するにはタイムライン設定でオンにしてください。",
  reminderIterations: "タスク更新のリマインダー",
  iterations: "反復",
  reminderHint: "タスク更新なしでこの反復回数に達すると、更新を促します。",
  invalidReminder: "反復回数は正の整数にしてください。",
  upToDate: "すべて保存済み",
  unsaved: "未保存の変更",
  save: "変更を保存",
  saving: "保存中…",
  saved: "保存済み",
  saveFailed: "保存できませんでした。下書きは保持されています。「破棄」で保存済みの値を読み込み、再試行してください。",
  discard: "破棄",
  settingsUnavailable: "設定を利用できません。プラグインを有効にして再接続してください。",
  settingsReadOnly: "このプロファイルの設定は読み取り専用です。",
  language: "タスクとレポートの言語",
  languageHint: "新しいタスクのテキストとレポートに適用します。アプリに従う場合は Harness の表示言語を使います。会話に従う場合は、エージェントが会話に合わせて言語を選びます。",
  progressDecimalsHint: "進捗の表示に使う小数点以下の桁数を設定します。",
  segmentedProgressHint: "完了、進行中、未着手、ブロック中の作業を進捗バーの別々の区画で表示します。",
  replaceTodoHint: "このプロファイルで Todo ツールの代わりにタイムラインのタスクツリーを使います。",
  autoOpenSidebar: "サイドバーを自動で開く",
  autoOpenSidebarHint: "ウィンドウの幅が 768 px を超える場合、セッションに最初のタスクツリーが表示されるとサイドバーが開きます。進捗バーから手動で開くこともできます。",
  followAppLanguage: "アプリに従う",
  followChatLanguage: "会話に従う",
  progressDecimals: "進捗の小数点以下桁数",
  minutes: "分",
  underSecond: "1秒未満",
  treeActions: "タスクツリーの操作",
  hierarchy: "レポートの階層",
  hierarchyHint: "最短経過時間は階層ごとに長くしてください。期限を過ぎた作業はセッションの実行中に報告し、上位階層は完全なレポートをまとめます。",
  rollup: "進捗レポート",
  addLevel: "階層を追加",
  removeLevel: "階層を削除",
  prompt: "要約プロンプト",
  basePromptHint: "進捗を短く、役立つ内容にします。現在のセッションのプロバイダーとモデルでバックグラウンド実行します。",
  rollupPromptHint: "共通のプロンプトへの追加指示です。最初の階層はタスクの文脈、上位階層は子レポートを使います。",
  resetPrompt: "初期値に戻す",
  invalidSettings: "期間は1分以上、階層ごとに長く、最大7日（最初の階層は最大1日）にしてください。共通のプロンプトは1～32,768文字です。",
  expandAll: "すべて展開",
  collapseAll: "すべて折りたたむ",
  leafTasks: "件の末端タスクが完了",
  toolCalls: "回のツール呼び出し",
  pauseTask: "一時停止を依頼",
  resumeTask: "続行を依頼",
  taskCompleted: "完了",
  pausePlan: "この計画の一時停止を依頼",
  resumePlan: "この計画の続行を依頼",
  priority: "優先度",
  noPriority: "なし",
  inheritedPriority: "継承",
  priorityP0: "緊急",
  priorityP1: "高",
  priorityP2: "中",
  priorityP3: "低",
  priorityHint: "P0の変更は実行中のエージェントに速やかに通知します。子に独自の優先度がなければグループの優先度を使います。一時停止中の作業は再開しません。",
  prioritySaveFailed: "優先度の保存を確認できません。再試行前に現在の値を確認してください。",
  addAnnotation: "コメント",
  annotations: "コメント",
  taskTarget: "タスク",
  planTarget: "計画",
  latestUpdate: "最新の進捗",
  discussionRef: "返信参照",
  discussionMessage: "ユーザーのメッセージ",
  emptyAnnotations: "コメントはありません。",
  annotationUser: "あなた",
  annotationAgent: "エージェント",
  annotationOpen: "返信待ち",
  annotationResolved: "返信済み",
  annotationPlaceholder: "問題、質問、追加してほしい作業を記入…",
  cancelAnnotation: "キャンセル",
  saveAnnotation: "保存して送信",
  annotationSaved: "コメントを保存し、エージェントに送りました。",
  annotationNotifyFailed: "コメントは保存済みです。通知を確認できないため対話を確認してください。",
  annotationSaveFailed: "保存を確認できません。下書きは残っています。再試行前にコメントを確認してください。",
  annotationRequest: "安全な区切りでユーザーのメッセージに対応してください。返信参照を使って timeline_reply で結果を保存し、作業を続けてください。",
  taskControls: "作業の操作",
  taskControlsHint: "安全な区切りで計画の変更を依頼します。実行の停止には Harness の停止を使います。",
  pausePending: "一時停止の確認待ち",
  resumePending: "続行の確認待ち",
  retryPause: "一時停止を再依頼",
  retryResume: "続行を再依頼",
  controlWaitingHint: "依頼を保存しました。計画の更新を待っています。",
  controlUnconfirmedHint: "状態は未確認です。再依頼する前に会話と保存済みの返信を確認してください。",
  controlDeliveryUnknown: "送信未確認",
  controlRequest: "あなたの依頼",
  controlWaiting: "確認待ち",
  controlApplied: "計画更新済み",
  controlAnswered: "確認が必要",
  controlSuperseded: "新しい依頼に置換済み",
  controlUnavailable: "作業は利用不可",
  discussionHistory: "このセッションのすべてのコメント",
  taskHistory: "変更履歴",
  emptyTaskHistory: "変更の記録はありません。",
  controlReplyRequest: "タスクの状態が変わった場合は記録してください。返信参照を使い、timeline_reply で結果または阻害要因を報告してください。",
  sendingTaskRequest: "要求を送信中…",
  taskRequestFailed: "要求の送信を確認できませんでした。再試行前に対話を確認してください。",
  taskRequestUnavailable: "この対話は利用できません。開き直してから要求を送信してください。",
  resumeRequest: "選択した作業を再開し、完了済みの進捗を保持してください。阻害要因を確認し、実行可能な末端タスクを進行中にしてから作業してください。",
  pauseRequest: "安全な区切りで、対象範囲の進行中と未着手のタスクを一時停止し、理由を記録してください。保存済みの進捗と既存の阻害要因は維持してください。他に依頼された作業があれば続け、なければターンを終了してください。"
};
var es = {
  markdownCopy: "Copiar",
  markdownCopied: "Copiado",
  markdownCode: "Código",
  markdownWrap: "Ajustar líneas",
  markdownUnwrap: "Desactivar ajuste de líneas",
  markdownFootnotes: "Notas al pie",
  taskUpdate: "Actualizar progreso de tareas",
  taskUpdatePending: "Guardando progreso de tareas…",
  taskUpdateFailed: "Actualización de tareas sin confirmar",
  taskUpdateGap: "{duration} desde la última actualización del árbol",
  taskUpdateMore: "Abrir árbol de tareas · {count} cambios más",
  importTree: "Importar árbol de tareas",
  exportTree: "Exportar árbol de tareas",
  deleteTree: "Eliminar árbol de tareas",
  removeDraftTree: "Quitar el árbol importado",
  draftRemoveFailed: "No se pudo quitar el árbol. Inténtalo de nuevo.",
  chooseCheckpoint: "Elegir archivo…",
  checkpointHint: "Importar el progreso guardado como un árbol de tareas independiente.",
  continueCheckpoint: "Solicitar continuación tras importar",
  copyCheckpoint: "Crear otra copia si ya se importó",
  deleteTreeHint: "¿Eliminar «{title}» y sus conversaciones de esta sesión? Puedes restaurar el árbol desde una copia exportada. La conversación y los informes se conservan, y se avisa al agente.",
  treeIdleRequired: "Espera a que termine el turno actual o detenlo primero.",
  treeTransferFailed: "No se pudo confirmar el cambio. Revisa el árbol antes de reintentar.",
  treeNotifyUnknown: "El cambio se guardó. Revisa el chat antes de enviar otra solicitud.",
  cancel: "Cancelar",
  taskCount: "Tareas: {count}",
  segmentedProgress: "Barra de progreso por segmentos",
  completedWork: "Trabajo completado: {count} ({percent}%)",
  activeWork: "Trabajo activo: {count} ({percent}%)",
  pendingWork: "Trabajo por iniciar: {count} ({percent}%)",
  blockedWork: "Trabajo bloqueado: {count} ({percent}%)",
  title: "Cronología",
  guide: "Árboles de tareas e informes de progreso en segundo plano",
  tasks: "Árbol de tareas",
  taskTreeChoice: "Seleccionar un árbol de tareas",
  openTaskTree: "Abrir árbol de tareas",
  closeTaskTree: "Ocultar árbol de tareas",
  planHint: "El trabajo de varios pasos recibe un plan automáticamente. Las respuestas simples no lo necesitan.",
  reports: "Informes",
  emptyTasks: "El agente aún no ha creado un árbol de tareas.",
  emptyReports: "No hay informes en este período.",
  loading: "Cargando cronología…",
  progress: "Progreso",
  reportProgress: "Progreso",
  uncertainties: "Por confirmar",
  userActions: "Cómo puedes ayudar",
  now: "Ahora",
  returnNow: "Volver al presente",
  returnNowNewReports: "Nuevos informes · Volver al presente",
  jumpToLastReport: "Ir al último informe",
  treeUnavailable: "Este árbol de tareas no está disponible.",
  openActiveTree: "Abrir el árbol de tareas activo",
  level: "Nivel",
  period: "Período",
  unit: "Unidad",
  hours: "hora",
  globalPrompt: "Resumen global",
  globalPromptHint: "Instrucciones para resumir el progreso en todos los niveles.",
  levelPrompt: "Instrucciones adicionales",
  levelSummary: "Nivel {level} · resumen de {period}",
  levelPromptPlaceholder: "Opcional. Añade instrucciones para este nivel; el mensaje global también se aplica.",
  previousTree: "Árbol de tareas anterior",
  nextTree: "Árbol de tareas siguiente",
  history: "Historial",
  scrollHint: "Tiempo transcurrido · Desplázate para ver el historial · Ctrl/⌘ + rueda para ampliar",
  elapsed: "Tiempo transcurrido",
  remaining: "Tiempo restante",
  unknown: "Desconocido",
  estimateHint: "Estimación aproximada al ritmo actual: tiempo transcurrido × (1 − progreso) ÷ progreso. Solo se muestra mientras el agente trabaja en este árbol.",
  estimateHelp: "¿Cómo se estima el tiempo restante?",
  estimateCalculated: "Estimación calculada",
  durationWeight: "Peso por duración",
  completedUnits: "Unidades completadas",
  weightHint: "Esfuerzo relativo entre tareas hermanas. Lo define el agente y se usa para calcular el progreso.",
  pending: "Pendiente",
  active: "En curso",
  paused: "En pausa",
  blocked: "Bloqueada",
  done: "Completada",
  retired: "Retirada",
  children: "Informes incluidos",
  details: "Detalles",
  back: "Volver",
  replaceTodo: "Sustituir herramientas Todo (recomendado)",
  resetLevelHint: "Borra las instrucciones adicionales de este nivel y conserva el mensaje global.",
  detailUnavailable: "Selecciona una tarea o un informe para abrir sus detalles.",
  time: "Hora",
  column: "columna",
  equalColumns: "Mostrar todas las columnas con el mismo ancho",
  savedPeriod: "Período guardado",
  coveredWork: "Tiempo de trabajo incluido",
  openReport: "Abrir informe",
  showReport: "Ampliar informe",
  openShort: "Abrir",
  showShort: "Ampliar",
  failed: "No se pudo generar el informe. Se reintentará tras un minuto cuando la sesión esté activa.",
  selectReport: "Selecciona un informe para leer su resumen y consultar los períodos incluidos.",
  settings: "Ajustes de cronología",
  general: "Visualización del progreso",
  taskTracking: "Seguimiento de tareas",
  taskPrompt: "Instrucciones para redactar tareas",
  taskPromptHint: "Controla títulos, descripciones y progreso detallado mediante la descripción de la herramienta de tareas.",
  progressReports: "Informes periódicos",
  reportsEnabled: "Generar informes periódicos",
  reportsEnabledHint: "Los informes guardados siguen disponibles al desactivar esta opción.",
  reportsDisabled: "Los informes periódicos están desactivados. Actívalos en los ajustes de Cronología para reanudarlos.",
  reminderIterations: "Recordatorio de actualización",
  iterations: "iteraciones",
  reminderHint: "Recuerda actualizar tras este número de iteraciones sin cambios en las tareas.",
  invalidReminder: "Usa un número entero positivo de iteraciones.",
  upToDate: "Todos los cambios guardados",
  unsaved: "Cambios sin guardar",
  save: "Guardar cambios",
  saving: "Guardando…",
  saved: "Guardado",
  saveFailed: "No se pudo guardar. El borrador se conserva. Pulsa Descartar para cargar los valores guardados y reinténtalo.",
  discard: "Descartar",
  settingsUnavailable: "Los ajustes no están disponibles. Activa el complemento y vuelve a conectar.",
  settingsReadOnly: "La configuración de este perfil es de solo lectura.",
  language: "Idioma de tareas e informes",
  languageHint: "Se aplica al texto nuevo de las tareas y a los informes. Seguir la app usa el idioma de Harness. Seguir la conversación deja que el agente elija el idioma según la conversación.",
  progressDecimalsHint: "Define el número de decimales que se muestran en el progreso.",
  segmentedProgressHint: "Separa el trabajo completado, activo, pendiente y bloqueado en la barra de progreso.",
  replaceTodoHint: "Usa los árboles de tareas de Timeline en lugar de las herramientas Todo en este perfil.",
  autoOpenSidebar: "Abrir la barra lateral automáticamente",
  autoOpenSidebarHint: "Abre la barra lateral cuando aparece el primer árbol de tareas de la sesión y la ventana mide más de 768 px de ancho. También puedes abrirla desde la barra de progreso.",
  followAppLanguage: "Seguir la app",
  followChatLanguage: "Seguir la conversación",
  progressDecimals: "Decimales del progreso",
  minutes: "min",
  underSecond: "<1 s",
  treeActions: "Acciones del árbol de tareas",
  hierarchy: "Jerarquía de informes",
  hierarchyHint: "Los intervalos mínimos deben aumentar. El trabajo pendiente se informa con la sesión activa; los niveles superiores combinan informes completos.",
  rollup: "Informe de progreso",
  addLevel: "Añadir nivel",
  removeLevel: "Eliminar nivel",
  prompt: "Mensaje de resumen",
  basePromptHint: "Mantén el progreso breve y útil. Los resúmenes usan el proveedor y el modelo de la sesión en segundo plano.",
  rollupPromptHint: "Instrucciones opcionales que se suman al mensaje global. El primer nivel usa el contexto de la tarea; los superiores usan resúmenes anteriores.",
  resetPrompt: "Restaurar valores predeterminados",
  invalidSettings: "Usa períodos crecientes de al menos un minuto y hasta siete días (primer nivel: un día como máximo). El mensaje global debe tener entre 1 y 32,768 caracteres.",
  expandAll: "Expandir todo",
  collapseAll: "Contraer todo",
  leafTasks: "tareas finales completadas",
  toolCalls: "llamadas a herramientas",
  pauseTask: "Solicitar pausa",
  resumeTask: "Solicitar continuar",
  taskCompleted: "Completada",
  pausePlan: "Solicitar pausa del plan",
  resumePlan: "Solicitar continuar el plan",
  priority: "Prioridad",
  noPriority: "Ninguna",
  inheritedPriority: "Heredada",
  priorityP0: "Urgente",
  priorityP1: "Alta",
  priorityP2: "Media",
  priorityP3: "Baja",
  priorityHint: "Los cambios de P0 avisan pronto al agente activo. Los hijos heredan la prioridad del grupo si no tienen una propia. No reanuda trabajo pausado.",
  prioritySaveFailed: "No se pudo confirmar la prioridad. Comprueba el valor antes de reintentar.",
  addAnnotation: "Discusión",
  annotations: "Discusión",
  taskTarget: "Tarea",
  planTarget: "Plan",
  latestUpdate: "Último avance",
  discussionRef: "Referencia de respuesta",
  discussionMessage: "Mensaje del usuario",
  emptyAnnotations: "Aún no hay discusiones.",
  annotationUser: "Tú",
  annotationAgent: "Agente",
  annotationOpen: "Sin respuesta",
  annotationResolved: "Respondida",
  annotationPlaceholder: "Describe un problema, pregunta o solicita trabajo adicional…",
  cancelAnnotation: "Cancelar",
  saveAnnotation: "Guardar y enviar",
  annotationSaved: "Discusión guardada y enviada al agente.",
  annotationNotifyFailed: "Discusión guardada. No se confirmó el aviso; comprueba la conversación.",
  annotationSaveFailed: "No se pudo confirmar el guardado. Se conserva el borrador; revisa las discusiones antes de reintentar.",
  annotationRequest: "En un punto seguro, atiende el mensaje del usuario. Guarda el resultado con timeline_reply y la referencia de respuesta. Después, continúa el trabajo.",
  taskControls: "Controles de trabajo",
  taskControlsHint: "Solicita cambiar el plan en un punto seguro. Usa Detener en Harness para detener la sesión.",
  pausePending: "Pausa solicitada",
  resumePending: "Continuación solicitada",
  retryPause: "Solicitar pausa otra vez",
  retryResume: "Solicitar continuar otra vez",
  controlWaitingHint: "Solicitud guardada. Esperando un cambio registrado en el plan.",
  controlUnconfirmedHint: "Estado sin confirmar. Revisa la conversación y la respuesta guardada antes de volver a solicitar.",
  controlDeliveryUnknown: "Entrega sin confirmar",
  controlRequest: "Tu solicitud",
  controlWaiting: "Esperando confirmación",
  controlApplied: "Plan actualizado",
  controlAnswered: "Requiere atención",
  controlSuperseded: "Sustituida por otra solicitud",
  controlUnavailable: "Trabajo no disponible",
  discussionHistory: "Todas las discusiones de esta sesión",
  taskHistory: "Historial de cambios",
  emptyTaskHistory: "No hay cambios registrados.",
  controlReplyRequest: "Registra los cambios de estado de las tareas. Usa timeline_reply con la referencia de respuesta para informar del resultado o bloqueo.",
  sendingTaskRequest: "Enviando solicitud…",
  taskRequestFailed: "No se pudo confirmar la solicitud. Revisa la conversación antes de reintentar.",
  taskRequestUnavailable: "Esta conversación no está disponible. Vuelve a abrirla antes de enviar la solicitud.",
  resumeRequest: "Continúa el trabajo seleccionado y conserva el progreso. Comprueba los bloqueos y activa una tarea ejecutable antes de trabajar.",
  pauseRequest: "En un punto seguro, pausa las tareas en curso y sin empezar de este alcance y registra el motivo. Conserva el progreso y los bloqueos existentes. Continúa con el resto del trabajo solicitado o termina el turno."
};
var fr = {
  markdownCopy: "Copier",
  markdownCopied: "Copié",
  markdownCode: "Code",
  markdownWrap: "Activer le retour à la ligne",
  markdownUnwrap: "Désactiver le retour à la ligne",
  markdownFootnotes: "Notes de bas de page",
  taskUpdate: "Mettre à jour la progression",
  taskUpdatePending: "Enregistrement de la progression…",
  taskUpdateFailed: "Mise à jour non confirmée",
  taskUpdateGap: "{duration} depuis la dernière mise à jour de l’arbre",
  taskUpdateMore: "Ouvrir l’arbre · {count} autres modifications",
  importTree: "Importer un arbre de tâches",
  exportTree: "Exporter l’arbre de tâches",
  deleteTree: "Supprimer l’arbre de tâches",
  removeDraftTree: "Retirer l’arbre importé",
  draftRemoveFailed: "Impossible de retirer l’arbre. Réessayez.",
  chooseCheckpoint: "Choisir un fichier…",
  checkpointHint: "Importer la progression enregistrée dans un arbre de tâches distinct.",
  continueCheckpoint: "Demander la poursuite après l’importation",
  copyCheckpoint: "Créer une autre copie si déjà importé",
  deleteTreeHint: "Supprimer « {title} » et ses discussions de cette session ? Vous pouvez restaurer l’arborescence à partir d’une copie exportée. La conversation et les rapports sont conservés. L’agent reçoit un message.",
  treeIdleRequired: "Attendez la fin du tour en cours ou arrêtez-le d’abord.",
  treeTransferFailed: "La modification n’a pas pu être confirmée. Vérifiez l’arbre avant de réessayer.",
  treeNotifyUnknown: "La modification est enregistrée. Vérifiez la conversation avant d’envoyer une autre demande.",
  cancel: "Annuler",
  taskCount: "Tâches : {count}",
  segmentedProgress: "Barre de progression segmentée",
  completedWork: "Travail terminé : {count} ({percent} %)",
  activeWork: "Travail en cours : {count} ({percent} %)",
  pendingWork: "Travail à commencer : {count} ({percent} %)",
  blockedWork: "Travail bloqué : {count} ({percent} %)",
  title: "Chronologie",
  guide: "Arbres de tâches et rapports de progression en arrière-plan",
  tasks: "Arbre de tâches",
  taskTreeChoice: "Choisir un arbre de tâches",
  openTaskTree: "Ouvrir l’arbre de tâches",
  closeTaskTree: "Masquer l’arbre de tâches",
  planHint: "Un plan est créé automatiquement pour les travaux à plusieurs étapes. Les réponses simples n’en ont pas besoin.",
  reports: "Rapports",
  emptyTasks: "L’agent n’a pas encore créé d’arbre de tâches.",
  emptyReports: "Aucun rapport pour cette période.",
  loading: "Chargement de la chronologie…",
  progress: "Progression",
  reportProgress: "Progression",
  uncertainties: "Points à confirmer",
  userActions: "Votre aide possible",
  now: "Maintenant",
  returnNow: "Revenir au présent",
  returnNowNewReports: "Nouveaux rapports · Revenir au présent",
  jumpToLastReport: "Aller au dernier rapport",
  treeUnavailable: "Cet arbre de tâches est indisponible.",
  openActiveTree: "Ouvrir l’arbre de tâches actif",
  level: "Niveau",
  period: "Période",
  unit: "Unité",
  hours: "heure",
  globalPrompt: "Résumé global",
  globalPromptHint: "Instructions pour les résumés de progression à tous les niveaux.",
  levelPrompt: "Instructions supplémentaires",
  levelSummary: "Niveau {level} · résumé de {period}",
  levelPromptPlaceholder: "Facultatif. Ajoutez des instructions pour ce niveau ; le message global reste applicable.",
  previousTree: "Arbre de tâches précédent",
  nextTree: "Arbre de tâches suivant",
  history: "Historique",
  scrollHint: "Temps écoulé · Défilement pour l’historique · Ctrl/⌘ + défilement pour zoomer",
  elapsed: "Temps écoulé",
  remaining: "Temps restant",
  unknown: "Inconnu",
  estimateHint: "Estimation approximative au rythme actuel : temps écoulé × (1 − progression) ÷ progression. Affichée uniquement pendant que l’agent travaille sur cette arborescence.",
  estimateHelp: "Comment le temps restant est-il estimé ?",
  estimateCalculated: "Estimation calculée",
  durationWeight: "Poids de durée",
  completedUnits: "Unités terminées",
  weightHint: "Effort relatif entre tâches sœurs. Défini par l’agent et utilisé pour calculer la progression.",
  pending: "En attente",
  active: "En cours",
  paused: "En pause",
  blocked: "Bloquée",
  done: "Terminée",
  retired: "Retirée",
  children: "Rapports inclus",
  details: "Détails",
  back: "Retour",
  replaceTodo: "Remplacer les outils Todo (recommandé)",
  resetLevelHint: "Efface les instructions supplémentaires de ce niveau et conserve le message global.",
  detailUnavailable: "Sélectionnez une tâche ou un rapport pour ouvrir ses détails.",
  time: "Heure",
  column: "colonne",
  equalColumns: "Afficher toutes les colonnes à la même largeur",
  savedPeriod: "Période enregistrée",
  coveredWork: "Temps de travail couvert",
  openReport: "Ouvrir le rapport",
  showReport: "Élargir le rapport",
  openShort: "Ouvrir",
  showShort: "Élargir",
  failed: "La création du rapport a échoué. Nouvelle tentative après une minute lorsque la session est active.",
  selectReport: "Sélectionnez un rapport pour lire son résumé et consulter les périodes incluses.",
  settings: "Paramètres de chronologie",
  general: "Affichage de la progression",
  taskTracking: "Suivi des tâches",
  taskPrompt: "Consignes de rédaction des tâches",
  taskPromptHint: "Définit les titres, descriptions et détails de progression dans la description de l’outil de rédaction des tâches.",
  progressReports: "Rapports périodiques",
  reportsEnabled: "Générer des rapports périodiques",
  reportsEnabledHint: "Les rapports enregistrés restent accessibles si cette option est désactivée.",
  reportsDisabled: "Les rapports périodiques sont désactivés. Pour les reprendre, activez-les dans les paramètres de Chronologie.",
  reminderIterations: "Rappel de mise à jour",
  iterations: "itérations",
  reminderHint: "Rappelle de mettre à jour après ce nombre d’itérations sans modification des tâches.",
  invalidReminder: "Utilisez un nombre entier positif d’itérations.",
  upToDate: "Toutes les modifications sont enregistrées",
  unsaved: "Modifications non enregistrées",
  save: "Enregistrer",
  saving: "Enregistrement…",
  saved: "Enregistré",
  saveFailed: "L’enregistrement a échoué. Le brouillon est conservé. Cliquez sur Abandonner pour recharger les valeurs enregistrées, puis réessayez.",
  discard: "Abandonner",
  settingsUnavailable: "Les paramètres sont indisponibles. Activez le module, puis reconnectez-vous.",
  settingsReadOnly: "La configuration de ce profil est en lecture seule.",
  language: "Langue des tâches et des rapports",
  languageHint: "S’applique aux nouveaux textes de tâches et rapports. Suivre l’app utilise la langue de Harness. Suivre la conversation laisse l’agent choisir la langue selon la conversation.",
  progressDecimalsHint: "Définit le nombre de décimales affichées pour la progression.",
  segmentedProgressHint: "Sépare le travail terminé, en cours, en attente et bloqué dans la barre de progression.",
  replaceTodoHint: "Utilise les arbres de tâches de Timeline à la place des outils Todo dans ce profil.",
  autoOpenSidebar: "Ouvrir la barre latérale automatiquement",
  autoOpenSidebarHint: "Ouvre le panneau latéral lorsque le premier arbre de tâches apparaît dans la session et que la fenêtre fait plus de 768 px de large. La barre de progression permet aussi de l’ouvrir.",
  followAppLanguage: "Suivre l’app",
  followChatLanguage: "Suivre la conversation",
  progressDecimals: "Décimales de progression",
  minutes: "min",
  underSecond: "<1 s",
  treeActions: "Actions de l’arbre de tâches",
  hierarchy: "Hiérarchie des rapports",
  hierarchyHint: "Les intervalles minimaux doivent augmenter. Le travail en attente est résumé lorsque la session est active ; les niveaux supérieurs regroupent des rapports complets.",
  rollup: "Rapport de progression",
  addLevel: "Ajouter un niveau",
  removeLevel: "Supprimer le niveau",
  prompt: "Message de résumé",
  basePromptHint: "Gardez les résumés courts et utiles. Ils utilisent le fournisseur et le modèle de la session en arrière-plan.",
  rollupPromptHint: "Ajouts facultatifs au message global. Le premier niveau utilise le contexte de la tâche ; les autres utilisent les résumés enfants.",
  resetPrompt: "Rétablir les valeurs par défaut",
  invalidSettings: "Utilisez des périodes croissantes d’une minute à sept jours (premier niveau : un jour maximum). Le message global doit contenir de 1 à 32,768 caractères.",
  expandAll: "Tout développer",
  collapseAll: "Tout réduire",
  leafTasks: "tâches finales terminées",
  toolCalls: "appels d’outils",
  pauseTask: "Demander une pause",
  resumeTask: "Demander la reprise",
  taskCompleted: "Terminée",
  pausePlan: "Demander une pause du plan",
  resumePlan: "Demander la reprise du plan",
  priority: "Priorité",
  noPriority: "Aucune",
  inheritedPriority: "Héritée",
  priorityP0: "Urgente",
  priorityP1: "Haute",
  priorityP2: "Moyenne",
  priorityP3: "Basse",
  priorityHint: "Les changements P0 préviennent rapidement l’agent actif. Les enfants héritent du groupe sans priorité propre. Cela ne reprend pas un travail en pause.",
  prioritySaveFailed: "La priorité n’a pas été confirmée. Vérifiez sa valeur avant de réessayer.",
  addAnnotation: "Discussion",
  annotations: "Discussion",
  taskTarget: "Tâche",
  planTarget: "Plan",
  latestUpdate: "Dernière avancée",
  discussionRef: "Référence de réponse",
  discussionMessage: "Message de l’utilisateur",
  emptyAnnotations: "Aucune discussion.",
  annotationUser: "Vous",
  annotationAgent: "Agent",
  annotationOpen: "En attente de réponse",
  annotationResolved: "Réponse reçue",
  annotationPlaceholder: "Décrivez un problème, posez une question ou demandez un ajout…",
  cancelAnnotation: "Annuler",
  saveAnnotation: "Enregistrer et envoyer",
  annotationSaved: "Discussion enregistrée et envoyée à l’agent.",
  annotationNotifyFailed: "Discussion enregistrée. L’envoi n’est pas confirmé ; vérifiez la conversation.",
  annotationSaveFailed: "L’enregistrement n’est pas confirmé. Le brouillon est conservé ; vérifiez les discussions avant de réessayer.",
  annotationRequest: "À un point sûr, traitez le message de l’utilisateur. Enregistrez le résultat avec timeline_reply et la référence de réponse, puis poursuivez le travail.",
  taskControls: "Commandes de travail",
  taskControlsHint: "Demande un changement du plan à un point sûr. Utilisez Arrêter dans Harness pour arrêter la session.",
  pausePending: "Pause demandée",
  resumePending: "Reprise demandée",
  retryPause: "Redemander une pause",
  retryResume: "Redemander la reprise",
  controlWaitingHint: "Demande enregistrée. En attente de mise à jour du plan.",
  controlUnconfirmedHint: "État non confirmé. Vérifiez la conversation et la réponse enregistrée avant une nouvelle demande.",
  controlDeliveryUnknown: "Envoi non confirmé",
  controlRequest: "Votre demande",
  controlWaiting: "En attente de confirmation",
  controlApplied: "Plan mis à jour",
  controlAnswered: "À vérifier",
  controlSuperseded: "Remplacée par une nouvelle demande",
  controlUnavailable: "Travail indisponible",
  discussionHistory: "Toutes les discussions de cette session",
  taskHistory: "Historique des modifications",
  emptyTaskHistory: "Aucune modification enregistrée.",
  controlReplyRequest: "Enregistrez les changements d’état des tâches. Utilisez timeline_reply avec la référence de réponse pour indiquer le résultat ou le blocage.",
  sendingTaskRequest: "Envoi de la demande…",
  taskRequestFailed: "Impossible de confirmer la demande. Vérifiez la conversation avant de réessayer.",
  taskRequestUnavailable: "Cette conversation est indisponible. Rouvrez-la avant d’envoyer la demande.",
  resumeRequest: "Reprenez le travail sélectionné en conservant la progression. Vérifiez les dépendances bloquées et activez une tâche exécutable avant de travailler.",
  pauseRequest: "À un point sûr, suspendez les tâches en cours et à démarrer dans ce périmètre et notez la raison. Conservez la progression et les blocages existants. Poursuivez les autres travaux demandés ou terminez le tour."
};
var de = {
  markdownCopy: "Kopieren",
  markdownCopied: "Kopiert",
  markdownCode: "Code",
  markdownWrap: "Zeilen umbrechen",
  markdownUnwrap: "Zeilenumbruch aufheben",
  markdownFootnotes: "Fußnoten",
  taskUpdate: "Aufgabenfortschritt aktualisieren",
  taskUpdatePending: "Aufgabenfortschritt wird gespeichert…",
  taskUpdateFailed: "Aufgabenänderung nicht bestätigt",
  taskUpdateGap: "{duration} seit der letzten Aktualisierung des Aufgabenbaums",
  taskUpdateMore: "Aufgabenbaum öffnen · {count} weitere Änderungen",
  importTree: "Aufgabenbaum importieren",
  exportTree: "Aufgabenbaum exportieren",
  deleteTree: "Aufgabenbaum löschen",
  removeDraftTree: "Importierten Aufgabenbaum entfernen",
  draftRemoveFailed: "Der Aufgabenbaum konnte nicht entfernt werden. Versuchen Sie es erneut.",
  chooseCheckpoint: "Datei auswählen…",
  checkpointHint: "Gespeicherten Fortschritt als eigenen Aufgabenbaum importieren.",
  continueCheckpoint: "Nach dem Import Fortsetzung anfordern",
  copyCheckpoint: "Bei erneutem Import eine weitere Kopie erstellen",
  deleteTreeHint: "„{title}“ und die zugehörigen Diskussionen aus dieser Sitzung löschen? Eine exportierte Kopie kann den Aufgabenbaum wiederherstellen. Die Unterhaltung und die Berichte bleiben erhalten. Der Agent wird benachrichtigt.",
  treeIdleRequired: "Warten Sie, bis der aktuelle Durchlauf endet, oder stoppen Sie ihn zuerst.",
  treeTransferFailed: "Die Änderung konnte nicht bestätigt werden. Prüfen Sie den Aufgabenbaum vor einem erneuten Versuch.",
  treeNotifyUnknown: "Die Änderung wurde gespeichert. Prüfen Sie das Gespräch, bevor Sie erneut anfragen.",
  cancel: "Abbrechen",
  taskCount: "Aufgaben: {count}",
  segmentedProgress: "Unterteilter Fortschrittsbalken",
  completedWork: "Erledigte Arbeit: {count} ({percent} %)",
  activeWork: "Aktive Arbeit: {count} ({percent} %)",
  pendingWork: "Ausstehende Arbeit: {count} ({percent} %)",
  blockedWork: "Blockierte Arbeit: {count} ({percent} %)",
  title: "Zeitverlauf",
  guide: "Aufgabenbäume und Fortschrittsberichte im Hintergrund",
  tasks: "Aufgabenbaum",
  taskTreeChoice: "Aufgabenbaum auswählen",
  openTaskTree: "Aufgabenbaum öffnen",
  closeTaskTree: "Aufgabenbaum ausblenden",
  planHint: "Für mehrstufige Arbeit wird automatisch ein Plan erstellt. Einfache Antworten benötigen keinen Plan.",
  reports: "Berichte",
  emptyTasks: "Der Agent hat noch keinen Aufgabenbaum erstellt.",
  emptyReports: "Keine Berichte in diesem Zeitraum.",
  loading: "Zeitverlauf wird geladen…",
  progress: "Fortschritt",
  reportProgress: "Fortschritt",
  uncertainties: "Offene Fragen",
  userActions: "So können Sie helfen",
  now: "Jetzt",
  returnNow: "Zurück zu jetzt",
  returnNowNewReports: "Neue Berichte · Zurück zu jetzt",
  jumpToLastReport: "Zum letzten Bericht",
  treeUnavailable: "Dieser Aufgabenbaum ist nicht verfügbar.",
  openActiveTree: "Aktiven Aufgabenbaum öffnen",
  level: "Ebene",
  period: "Zeitraum",
  unit: "Einheit",
  hours: "Stunde",
  globalPrompt: "Globale Zusammenfassung",
  globalPromptHint: "Anweisungen für Fortschrittsberichte auf allen Ebenen.",
  levelPrompt: "Zusätzliche Anweisungen",
  levelSummary: "Ebene {level} · Zusammenfassung für {period}",
  levelPromptPlaceholder: "Optional. Ergänzen Sie Anweisungen für diese Ebene. Der globale Prompt gilt weiterhin.",
  previousTree: "Vorheriger Aufgabenbaum",
  nextTree: "Nächster Aufgabenbaum",
  history: "Verlauf",
  scrollHint: "Verstrichene Zeit · Scrollen für Verlauf · Strg/⌘ + Scrollen zum Zoomen",
  elapsed: "Vergangene Zeit",
  remaining: "Restzeit",
  unknown: "Unbekannt",
  estimateHint: "Grobe Schätzung beim aktuellen Tempo: verstrichene Zeit × (1 − Fortschritt) ÷ Fortschritt. Wird nur angezeigt, solange der Agent an diesem Baum arbeitet.",
  estimateHelp: "Wie wird die Restzeit geschätzt?",
  estimateCalculated: "Berechnete Schätzung",
  durationWeight: "Zeitgewicht",
  completedUnits: "Abgeschlossene Einheiten",
  weightHint: "Relativer Aufwand unter Geschwisteraufgaben. Vom Agenten festgelegt und zur Fortschrittsberechnung verwendet.",
  pending: "Ausstehend",
  active: "In Arbeit",
  paused: "Pausiert",
  blocked: "Blockiert",
  done: "Erledigt",
  retired: "Entfallen",
  children: "Enthaltene Berichte",
  details: "Details",
  back: "Zurück",
  replaceTodo: "Todo-Werkzeuge ersetzen (empfohlen)",
  resetLevelHint: "Entfernt die zusätzlichen Anweisungen dieser Ebene und behält den globalen Prompt.",
  detailUnavailable: "Wählen Sie eine Aufgabe oder einen Bericht, um die Details zu öffnen.",
  time: "Zeit",
  column: "Spalte",
  equalColumns: "Alle Spalten gleich breit anzeigen",
  savedPeriod: "Gespeicherter Zeitraum",
  coveredWork: "Erfasste Arbeitszeit",
  openReport: "Bericht öffnen",
  showReport: "Bericht erweitern",
  openShort: "Öffnen",
  showShort: "Erweitern",
  failed: "Der Bericht konnte nicht erstellt werden. Neuer Versuch nach einer Minute bei aktiver Sitzung.",
  selectReport: "Wählen Sie einen Bericht, um die Zusammenfassung und die enthaltenen Zeiträume zu lesen.",
  settings: "Zeitverlauf-Einstellungen",
  general: "Fortschrittsanzeige",
  taskTracking: "Aufgabenverfolgung",
  taskPrompt: "Anweisungen für Aufgabentexte",
  taskPromptHint: "Bestimmt Titel, Beschreibungen und Fortschrittsdetails über die Beschreibung des Aufgabenwerkzeugs.",
  progressReports: "Intervallberichte",
  reportsEnabled: "Regelmäßige Berichte erstellen",
  reportsEnabledHint: "Gespeicherte Berichte bleiben auch bei deaktivierter Option verfügbar.",
  reportsDisabled: "Regelmäßige Berichte sind deaktiviert. Aktiviere sie in den Einstellungen für den Zeitverlauf.",
  reminderIterations: "Erinnerung zur Aktualisierung",
  iterations: "Iterationen",
  reminderHint: "Erinnert nach dieser Anzahl von Agenteniterationen ohne Aufgabenaktualisierung.",
  invalidReminder: "Verwenden Sie eine positive ganze Zahl für die Iterationen.",
  upToDate: "Alle Änderungen gespeichert",
  unsaved: "Ungespeicherte Änderungen",
  save: "Änderungen speichern",
  saving: "Wird gespeichert…",
  saved: "Gespeichert",
  saveFailed: "Speichern fehlgeschlagen. Der Entwurf bleibt erhalten. Laden Sie mit Verwerfen die gespeicherten Werte und versuchen Sie es erneut.",
  discard: "Verwerfen",
  settingsUnavailable: "Die Einstellungen sind nicht verfügbar. Aktivieren Sie das Plugin und verbinden Sie sich erneut.",
  settingsReadOnly: "Die Konfiguration dieses Profils ist schreibgeschützt.",
  language: "Sprache für Aufgaben und Berichte",
  languageHint: "Gilt für neue Aufgabentexte und Berichte. Wie App übernimmt die Anzeigesprache von Harness. Wie Chat überlässt dem Agenten die Sprachwahl passend zum Chat.",
  progressDecimalsHint: "Legt die Anzahl der Dezimalstellen für die Fortschrittsanzeige fest.",
  segmentedProgressHint: "Zeigt abgeschlossene, laufende, ausstehende und blockierte Arbeit getrennt im Fortschrittsbalken.",
  replaceTodoHint: "Verwendet die Aufgabenbäume der Zeitleiste anstelle der Todo-Werkzeuge in diesem Profil.",
  autoOpenSidebar: "Seitenleiste automatisch öffnen",
  autoOpenSidebarHint: "Öffnet die Seitenleiste beim ersten Aufgabenbaum der Sitzung, wenn das Fenster breiter als 768 px ist. Sie lässt sich auch über den Fortschrittsbalken öffnen.",
  followAppLanguage: "Wie App",
  followChatLanguage: "Wie Chat",
  progressDecimals: "Nachkommastellen des Fortschritts",
  minutes: "Min.",
  underSecond: "<1 Sek.",
  treeActions: "Aufgabenbaum-Aktionen",
  hierarchy: "Berichtshierarchie",
  hierarchyHint: "Mindestintervalle müssen größer werden. Fällige Arbeit wird bei aktiver Sitzung gemeldet; höhere Ebenen fassen vollständige Berichte zusammen.",
  rollup: "Fortschrittsbericht",
  addLevel: "Ebene hinzufügen",
  removeLevel: "Ebene löschen",
  prompt: "Zusammenfassungs-Prompt",
  basePromptHint: "Halten Sie Berichte kurz und nützlich. Sie nutzen Anbieter und Modell der Sitzung im Hintergrund.",
  rollupPromptHint: "Optionale Ergänzungen zum globalen Prompt. Die erste Ebene nutzt den Aufgabenkontext, höhere Ebenen die untergeordneten Berichte.",
  resetPrompt: "Standard wiederherstellen",
  invalidSettings: "Nutzen Sie steigende Zeiträume von einer Minute bis sieben Tagen (erste Ebene: höchstens ein Tag). Der globale Prompt muss 1–32,768 Zeichen enthalten.",
  expandAll: "Alle aufklappen",
  collapseAll: "Alle zuklappen",
  leafTasks: "Endaufgaben erledigt",
  toolCalls: "Werkzeugaufrufe",
  pauseTask: "Pause anfragen",
  resumeTask: "Fortsetzen anfragen",
  taskCompleted: "Abgeschlossen",
  pausePlan: "Pause für diesen Plan anfragen",
  resumePlan: "Fortsetzen dieses Plans anfragen",
  priority: "Priorität",
  noPriority: "Keine",
  inheritedPriority: "Geerbt",
  priorityP0: "Dringend",
  priorityP1: "Hoch",
  priorityP2: "Mittel",
  priorityP3: "Niedrig",
  priorityHint: "P0-Änderungen informieren den laufenden Agenten zeitnah. Kinder ohne eigene Priorität übernehmen die Gruppe. Pausierte Arbeit wird nicht fortgesetzt.",
  prioritySaveFailed: "Die Priorität konnte nicht bestätigt werden. Prüfen Sie den Wert vor einem neuen Versuch.",
  addAnnotation: "Diskussion",
  annotations: "Diskussion",
  taskTarget: "Aufgabe",
  planTarget: "Plan",
  latestUpdate: "Letzter Fortschritt",
  discussionRef: "Antwortreferenz",
  discussionMessage: "Nachricht des Benutzers",
  emptyAnnotations: "Noch keine Diskussionen.",
  annotationUser: "Sie",
  annotationAgent: "Agent",
  annotationOpen: "Antwort ausstehend",
  annotationResolved: "Beantwortet",
  annotationPlaceholder: "Problem beschreiben, eine Frage stellen oder Arbeit ergänzen…",
  cancelAnnotation: "Abbrechen",
  saveAnnotation: "Speichern und senden",
  annotationSaved: "Diskussion gespeichert und an den Agenten gesendet.",
  annotationNotifyFailed: "Diskussion gespeichert. Benachrichtigung nicht bestätigt; prüfen Sie den Chat.",
  annotationSaveFailed: "Speichern nicht bestätigt. Der Entwurf bleibt erhalten; prüfen Sie die Diskussionen vor einem neuen Versuch.",
  annotationRequest: "Bearbeite die Nachricht des Benutzers an einem sicheren Punkt. Speichere das Ergebnis mit timeline_reply und der Antwortreferenz und setze dann die Arbeit fort.",
  taskControls: "Arbeitssteuerung",
  taskControlsHint: "Fordert eine Planänderung an einem sicheren Punkt an. Mit Stopp in Harness beenden Sie die Sitzungsausführung.",
  pausePending: "Pause angefragt",
  resumePending: "Fortsetzen angefragt",
  retryPause: "Pause erneut anfragen",
  retryResume: "Fortsetzen erneut anfragen",
  controlWaitingHint: "Anfrage gespeichert. Planänderung wird noch erwartet.",
  controlUnconfirmedHint: "Status nicht bestätigt. Prüfen Sie vor einer neuen Anfrage das Gespräch und die gespeicherte Antwort.",
  controlDeliveryUnknown: "Zustellung unbestätigt",
  controlRequest: "Ihre Anfrage",
  controlWaiting: "Bestätigung ausstehend",
  controlApplied: "Plan aktualisiert",
  controlAnswered: "Prüfung erforderlich",
  controlSuperseded: "Durch neue Anfrage ersetzt",
  controlUnavailable: "Arbeit nicht verfügbar",
  discussionHistory: "Alle Diskussionen dieser Sitzung",
  taskHistory: "Änderungsverlauf",
  emptyTaskHistory: "Keine Änderungen aufgezeichnet.",
  controlReplyRequest: "Erfasse Änderungen am Aufgabenstatus. Melde das Ergebnis oder Hindernis mit timeline_reply und der Antwortreferenz.",
  sendingTaskRequest: "Anfrage wird gesendet…",
  taskRequestFailed: "Die Anfrage konnte nicht bestätigt werden. Prüfen Sie den Chat vor einem erneuten Versuch.",
  taskRequestUnavailable: "Dieser Chat ist nicht verfügbar. Öffnen Sie ihn erneut, bevor Sie eine Anfrage senden.",
  resumeRequest: "Setze die ausgewählte Arbeit fort und erhalte den Fortschritt. Prüfe blockierende Abhängigkeiten und aktiviere vor der Arbeit eine ausführbare Teilaufgabe.",
  pauseRequest: "Pausiere an einem sicheren Punkt die laufenden und noch nicht begonnenen Aufgaben in diesem Bereich und halte den Grund fest. Erhalte den Fortschritt und bestehende Blockaden. Setze andere angeforderte Arbeiten fort oder beende den Durchlauf."
};
var ru = {
  markdownCopy: "Копировать",
  markdownCopied: "Скопировано",
  markdownCode: "Код",
  markdownWrap: "Переносить строки",
  markdownUnwrap: "Отключить перенос строк",
  markdownFootnotes: "Сноски",
  taskUpdate: "Обновить ход задач",
  taskUpdatePending: "Сохранение хода задач…",
  taskUpdateFailed: "Обновление задач не подтверждено",
  taskUpdateGap: "{duration} с последнего обновления дерева задач",
  taskUpdateMore: "Открыть дерево задач · ещё {count} изменений",
  importTree: "Импорт дерева задач",
  exportTree: "Экспорт дерева задач",
  deleteTree: "Удалить дерево задач",
  removeDraftTree: "Убрать импортированное дерево",
  draftRemoveFailed: "Не удалось убрать дерево. Повторите попытку.",
  chooseCheckpoint: "Выбрать файл…",
  checkpointHint: "Импортировать сохранённый прогресс в отдельное дерево задач.",
  continueCheckpoint: "Запросить продолжение после импорта",
  copyCheckpoint: "Создать ещё одну копию при повторном импорте",
  deleteTreeHint: "Удалить «{title}» и его обсуждения из этого сеанса? Дерево можно восстановить из экспортированной копии. Переписка и отчёты сохранятся. Агент получит уведомление.",
  treeIdleRequired: "Дождитесь завершения текущего хода или сначала остановите его.",
  treeTransferFailed: "Не удалось подтвердить изменение. Проверьте дерево перед повторной попыткой.",
  treeNotifyUnknown: "Изменение сохранено. Проверьте переписку перед новым запросом.",
  cancel: "Отмена",
  taskCount: "Задач: {count}",
  segmentedProgress: "Сегментированная шкала прогресса",
  completedWork: "Выполнено: {count} ({percent}%)",
  activeWork: "В работе: {count} ({percent}%)",
  pendingWork: "Ожидает начала: {count} ({percent}%)",
  blockedWork: "Заблокировано: {count} ({percent}%)",
  title: "Хронология",
  guide: "Деревья задач и фоновые отчёты о ходе работы",
  tasks: "Дерево задач",
  taskTreeChoice: "Выбрать дерево задач",
  openTaskTree: "Открыть дерево задач",
  closeTaskTree: "Скрыть дерево задач",
  planHint: "Для работы из нескольких шагов план создаётся автоматически. Для простых ответов он не нужен.",
  reports: "Отчёты",
  emptyTasks: "Агент ещё не создал дерево задач.",
  emptyReports: "За этот период отчётов нет.",
  loading: "Загрузка хронологии…",
  progress: "Ход работы",
  reportProgress: "Ход работы",
  uncertainties: "Требует уточнения",
  userActions: "Как вы можете помочь",
  now: "Сейчас",
  returnNow: "К текущему времени",
  returnNowNewReports: "Новые отчёты · К текущему времени",
  jumpToLastReport: "Перейти к последнему отчёту",
  treeUnavailable: "Это дерево задач недоступно.",
  openActiveTree: "Открыть активное дерево задач",
  level: "Уровень",
  period: "Период",
  unit: "Единица",
  hours: "ч",
  globalPrompt: "Общая сводка",
  globalPromptHint: "Инструкции для сводок о ходе работы на всех уровнях.",
  levelPrompt: "Дополнительные инструкции",
  levelSummary: "Уровень {level} · сводка за {period}",
  levelPromptPlaceholder: "Необязательно. Добавьте инструкции для этого уровня; общий запрос также применяется.",
  previousTree: "Предыдущее дерево задач",
  nextTree: "Следующее дерево задач",
  history: "История",
  scrollHint: "Прошедшее время · Прокрутка для истории · Ctrl/⌘ + прокрутка для масштаба",
  elapsed: "Прошло времени",
  remaining: "Осталось времени",
  unknown: "Неизвестно",
  estimateHint: "Грубая оценка при текущем темпе: прошедшее время × (1 − прогресс) ÷ прогресс. Показывается только пока агент работает над этим деревом.",
  estimateHelp: "Как рассчитывается оставшееся время?",
  estimateCalculated: "Расчётная оценка",
  durationWeight: "Вес по длительности",
  completedUnits: "Завершённые единицы",
  weightHint: "Относительный объём работы среди соседних задач. Задаётся агентом и используется для расчёта прогресса.",
  pending: "Не начата",
  active: "В работе",
  paused: "Приостановлена",
  blocked: "Заблокирована",
  done: "Завершена",
  retired: "Исключена",
  children: "Включённые отчёты",
  details: "Подробности",
  back: "Назад",
  replaceTodo: "Заменить инструменты Todo (рекомендуется)",
  resetLevelHint: "Удаляет дополнительные инструкции уровня, сохраняя общий запрос.",
  detailUnavailable: "Выберите задачу или отчёт, чтобы открыть подробности.",
  time: "Время",
  column: "столбец",
  equalColumns: "Показать все столбцы одинаковой ширины",
  savedPeriod: "Сохранённый период",
  coveredWork: "Учтённое рабочее время",
  openReport: "Открыть отчёт",
  showReport: "Расширить отчёт",
  openShort: "Открыть",
  showShort: "Расширить",
  failed: "Не удалось создать отчёт. Повторная попытка через минуту, когда сеанс активен.",
  selectReport: "Выберите отчёт, чтобы прочитать сводку и просмотреть включённые периоды.",
  settings: "Настройки хронологии",
  general: "Отображение прогресса",
  taskTracking: "Отслеживание задач",
  taskPrompt: "Инструкции для описания задач",
  taskPromptHint: "Задаёт заголовки, описания и подробности прогресса. Добавляется в описание инструмента для задач.",
  progressReports: "Периодические отчёты",
  reportsEnabled: "Создавать периодические отчёты",
  reportsEnabledHint: "При отключении сохранённые отчёты остаются доступными.",
  reportsDisabled: "Периодические отчёты отключены. Чтобы возобновить их, включите отчёты в настройках хронологии.",
  reminderIterations: "Напоминание об обновлении",
  iterations: "итераций",
  reminderHint: "Напомнить после указанного числа итераций агента без обновления задач.",
  invalidReminder: "Укажите положительное целое число итераций.",
  upToDate: "Все изменения сохранены",
  unsaved: "Несохранённые изменения",
  save: "Сохранить изменения",
  saving: "Сохранение…",
  saved: "Сохранено",
  saveFailed: "Не удалось сохранить. Черновик оставлен. Нажмите «Отменить изменения», чтобы загрузить сохранённые значения, и повторите попытку.",
  discard: "Отменить изменения",
  settingsUnavailable: "Настройки недоступны. Включите плагин и подключитесь снова.",
  settingsReadOnly: "Настройки этого профиля доступны только для чтения.",
  language: "Язык задач и отчётов",
  languageHint: "Применяется к новому тексту задач и отчётам. При выборе языка приложения используется язык интерфейса Harness. При выборе языка чата агент сам выбирает язык по содержанию чата.",
  progressDecimalsHint: "Задаёт число знаков после запятой для отображения прогресса.",
  segmentedProgressHint: "Разделяет завершённую, активную, ожидающую и заблокированную работу на шкале прогресса.",
  replaceTodoHint: "Использует деревья задач Timeline вместо инструментов Todo в этом профиле.",
  autoOpenSidebar: "Открывать боковую панель автоматически",
  autoOpenSidebarHint: "Открывает боковую панель при появлении первого дерева задач в сеансе, если ширина окна больше 768 пикселей. Панель также можно открыть с индикатора прогресса.",
  followAppLanguage: "Как в приложении",
  followChatLanguage: "Как в чате",
  progressDecimals: "Знаков после запятой",
  minutes: "мин",
  underSecond: "<1 с",
  treeActions: "Действия с деревом задач",
  hierarchy: "Иерархия отчётов",
  hierarchyHint: "Минимальные интервалы должны возрастать. Накопленная работа отражается в активном сеансе; верхние уровни объединяют полные отчёты.",
  rollup: "Отчёт о ходе работы",
  addLevel: "Добавить уровень",
  removeLevel: "Удалить уровень",
  prompt: "Запрос для сводки",
  basePromptHint: "Сводки должны быть краткими и полезными. Они создаются в фоне с поставщиком и моделью текущего сеанса.",
  rollupPromptHint: "Дополнения к общему запросу. Первый уровень использует контекст задачи, верхние — дочерние сводки.",
  resetPrompt: "Восстановить по умолчанию",
  invalidSettings: "Периоды должны возрастать от одной минуты до семи дней (первый уровень — не более дня). Общий запрос должен содержать 1–32,768 символов.",
  expandAll: "Развернуть всё",
  collapseAll: "Свернуть всё",
  leafTasks: "конечных задач завершено",
  toolCalls: "вызовов инструментов",
  pauseTask: "Запросить паузу",
  resumeTask: "Запросить продолжение",
  taskCompleted: "Завершено",
  pausePlan: "Запросить паузу плана",
  resumePlan: "Запросить продолжение плана",
  priority: "Приоритет",
  noPriority: "Нет",
  inheritedPriority: "Унаследованный",
  priorityP0: "Срочный",
  priorityP1: "Высокий",
  priorityP2: "Средний",
  priorityP3: "Низкий",
  priorityHint: "Изменения P0 быстро сообщаются работающему агенту. Дочерние задачи без своего приоритета наследуют групповой. Приостановленная работа не возобновляется.",
  prioritySaveFailed: "Не удалось подтвердить приоритет. Проверьте значение перед повтором.",
  addAnnotation: "Обсуждение",
  annotations: "Обсуждение",
  taskTarget: "Задача",
  planTarget: "План",
  latestUpdate: "Последнее обновление",
  discussionRef: "Идентификатор для ответа",
  discussionMessage: "Сообщение пользователя",
  emptyAnnotations: "Обсуждений пока нет.",
  annotationUser: "Вы",
  annotationAgent: "Агент",
  annotationOpen: "Ожидает ответа",
  annotationResolved: "Ответ получен",
  annotationPlaceholder: "Опишите проблему, задайте вопрос или попросите добавить работу…",
  cancelAnnotation: "Отмена",
  saveAnnotation: "Сохранить и отправить",
  annotationSaved: "Обсуждение сохранено и отправлено агенту.",
  annotationNotifyFailed: "Обсуждение сохранено. Отправка уведомления не подтверждена; проверьте чат.",
  annotationSaveFailed: "Сохранение не подтверждено. Черновик сохранён; проверьте обсуждения перед повтором.",
  annotationRequest: "В безопасной точке обработайте сообщение пользователя. Сохраните результат через timeline_reply с указанным идентификатором, затем продолжите работу.",
  taskControls: "Управление работой",
  taskControlsHint: "Запрашивает изменение плана в безопасной точке. Для остановки сеанса используйте кнопку остановки Harness.",
  pausePending: "Ожидание паузы",
  resumePending: "Ожидание продолжения",
  retryPause: "Повторить запрос паузы",
  retryResume: "Повторить запрос продолжения",
  controlWaitingHint: "Запрос сохранён. Ожидается обновление плана.",
  controlUnconfirmedHint: "Состояние не подтверждено. Перед повтором проверьте беседу и сохранённый ответ.",
  controlDeliveryUnknown: "Доставка не подтверждена",
  controlRequest: "Ваш запрос",
  controlWaiting: "Ожидание подтверждения",
  controlApplied: "План обновлён",
  controlAnswered: "Требует внимания",
  controlSuperseded: "Заменён новым запросом",
  controlUnavailable: "Работа недоступна",
  discussionHistory: "Все обсуждения этого сеанса",
  taskHistory: "История изменений",
  emptyTaskHistory: "Изменения не записаны.",
  controlReplyRequest: "Запишите изменения состояния задач. Сообщите результат или препятствие через timeline_reply с указанным идентификатором.",
  sendingTaskRequest: "Отправка запроса…",
  taskRequestFailed: "Не удалось подтвердить запрос. Проверьте диалог перед повторной попыткой.",
  taskRequestUnavailable: "Этот диалог недоступен. Откройте его снова перед отправкой запроса.",
  resumeRequest: "Продолжите выбранную работу, сохранив прогресс. Проверьте блокирующие зависимости и перед работой активируйте доступную конечную задачу.",
  pauseRequest: "В безопасной точке приостановите выполняемые и ещё не начатые задачи в указанной области и запишите причину. Сохраните прогресс и текущие блокировки. Продолжите другую запрошенную работу или завершите ход."
};
var pt = {
  markdownCopy: "Copiar",
  markdownCopied: "Copiado",
  markdownCode: "Código",
  markdownWrap: "Quebrar linhas",
  markdownUnwrap: "Desativar quebra de linhas",
  markdownFootnotes: "Notas de rodapé",
  taskUpdate: "Atualizar progresso das tarefas",
  taskUpdatePending: "Salvando progresso das tarefas…",
  taskUpdateFailed: "Atualização das tarefas não confirmada",
  taskUpdateGap: "{duration} desde a última atualização da árvore",
  taskUpdateMore: "Abrir árvore de tarefas · mais {count} alterações",
  importTree: "Importar árvore de tarefas",
  exportTree: "Exportar árvore de tarefas",
  deleteTree: "Excluir árvore de tarefas",
  removeDraftTree: "Remover árvore importada",
  draftRemoveFailed: "Não foi possível remover a árvore. Tente novamente.",
  chooseCheckpoint: "Escolher arquivo…",
  checkpointHint: "Importar o progresso salvo como uma árvore de tarefas separada.",
  continueCheckpoint: "Solicitar continuação após importar",
  copyCheckpoint: "Criar outra cópia se já foi importada",
  deleteTreeHint: "Excluir “{title}” e as discussões associadas desta sessão? Você pode restaurar a árvore com uma cópia exportada. A conversa e os relatórios são mantidos. O agente recebe uma mensagem.",
  treeIdleRequired: "Aguarde o fim do turno atual ou pare-o primeiro.",
  treeTransferFailed: "Não foi possível confirmar a alteração. Confira a árvore antes de tentar novamente.",
  treeNotifyUnknown: "A alteração foi salva. Confira a conversa antes de enviar outra solicitação.",
  cancel: "Cancelar",
  taskCount: "Tarefas: {count}",
  segmentedProgress: "Barra de progresso segmentada",
  completedWork: "Trabalho concluído: {count} ({percent}%)",
  activeWork: "Trabalho em andamento: {count} ({percent}%)",
  pendingWork: "Trabalho a iniciar: {count} ({percent}%)",
  blockedWork: "Trabalho bloqueado: {count} ({percent}%)",
  title: "Linha do tempo",
  guide: "Árvores de tarefas e relatórios de progresso em segundo plano",
  tasks: "Árvore de tarefas",
  taskTreeChoice: "Selecionar uma árvore de tarefas",
  openTaskTree: "Abrir árvore de tarefas",
  closeTaskTree: "Ocultar árvore de tarefas",
  planHint: "Trabalhos com várias etapas recebem um plano automaticamente. Respostas simples não precisam de um.",
  reports: "Relatórios",
  emptyTasks: "O agente ainda não criou uma árvore de tarefas.",
  emptyReports: "Não há relatórios neste período.",
  loading: "Carregando linha do tempo…",
  progress: "Progresso",
  reportProgress: "Progresso",
  uncertainties: "Pontos a confirmar",
  userActions: "Como você pode ajudar",
  now: "Agora",
  returnNow: "Voltar ao presente",
  returnNowNewReports: "Novos relatórios · Voltar ao presente",
  jumpToLastReport: "Ir para o último relatório",
  treeUnavailable: "Esta árvore de tarefas está indisponível.",
  openActiveTree: "Abrir a árvore de tarefas ativa",
  level: "Nível",
  period: "Período",
  unit: "Unidade",
  hours: "hora",
  globalPrompt: "Resumo global",
  globalPromptHint: "Instruções para resumos de progresso em todos os níveis.",
  levelPrompt: "Instruções adicionais",
  levelSummary: "Nível {level} · resumo de {period}",
  levelPromptPlaceholder: "Opcional. Adicione instruções para este nível; o prompt global continua valendo.",
  previousTree: "Árvore de tarefas anterior",
  nextTree: "Próxima árvore de tarefas",
  history: "Histórico",
  scrollHint: "Tempo decorrido · Role para ver o histórico · Ctrl/⌘ + rolagem para zoom",
  elapsed: "Tempo decorrido",
  remaining: "Tempo restante",
  unknown: "Desconhecido",
  estimateHint: "Estimativa aproximada no ritmo atual: tempo decorrido × (1 − progresso) ÷ progresso. Exibida apenas enquanto o agente trabalha nesta árvore.",
  estimateHelp: "Como o tempo restante é estimado?",
  estimateCalculated: "Estimativa calculada",
  durationWeight: "Peso por duração",
  completedUnits: "Unidades concluídas",
  weightHint: "Esforço relativo entre tarefas irmãs. Definido pelo agente e usado para calcular o progresso.",
  pending: "Pendente",
  active: "Em andamento",
  paused: "Pausada",
  blocked: "Bloqueada",
  done: "Concluída",
  retired: "Retirada",
  children: "Relatórios incluídos",
  details: "Detalhes",
  back: "Voltar",
  replaceTodo: "Substituir ferramentas Todo (recomendado)",
  resetLevelHint: "Limpa as instruções extras deste nível e mantém o prompt global.",
  detailUnavailable: "Selecione uma tarefa ou um relatório para abrir os detalhes.",
  time: "Hora",
  column: "coluna",
  equalColumns: "Mostrar todas as colunas com a mesma largura",
  savedPeriod: "Período salvo",
  coveredWork: "Tempo de trabalho coberto",
  openReport: "Abrir relatório",
  showReport: "Ampliar relatório",
  openShort: "Abrir",
  showShort: "Ampliar",
  failed: "Não foi possível gerar o relatório. Nova tentativa após um minuto, quando a sessão estiver ativa.",
  selectReport: "Selecione um relatório para ler o resumo e explorar os períodos incluídos.",
  settings: "Configurações da linha do tempo",
  general: "Exibição do progresso",
  taskTracking: "Acompanhamento de tarefas",
  taskPrompt: "Instruções para escrever tarefas",
  taskPromptHint: "Define títulos, descrições e detalhes do progresso na descrição da ferramenta de tarefas.",
  progressReports: "Relatórios periódicos",
  reportsEnabled: "Gerar relatórios periódicos",
  reportsEnabledHint: "Os relatórios salvos continuam disponíveis quando esta opção está desativada.",
  reportsDisabled: "Os relatórios periódicos estão desativados. Ative-os nas configurações da Linha do tempo para retomá-los.",
  reminderIterations: "Lembrete de atualização",
  iterations: "iterações",
  reminderHint: "Lembrar após este número de iterações do agente sem atualizar as tarefas.",
  invalidReminder: "Use um número inteiro positivo de iterações.",
  upToDate: "Todas as alterações salvas",
  unsaved: "Alterações não salvas",
  save: "Salvar alterações",
  saving: "Salvando…",
  saved: "Salvo",
  saveFailed: "Não foi possível salvar. O rascunho foi mantido. Clique em Descartar para carregar os valores salvos e tente novamente.",
  discard: "Descartar",
  settingsUnavailable: "As configurações estão indisponíveis. Ative o plugin e reconecte.",
  settingsReadOnly: "A configuração deste perfil é somente leitura.",
  language: "Idioma das tarefas e dos relatórios",
  languageHint: "Vale para novos textos de tarefas e relatórios. Seguir o app usa o idioma de exibição do Harness. Seguir a conversa deixa o agente escolher o idioma de acordo com a conversa.",
  progressDecimalsHint: "Define o número de casas decimais exibidas no progresso.",
  segmentedProgressHint: "Mostra separadamente o trabalho concluído, ativo, pendente e bloqueado na barra de progresso.",
  replaceTodoHint: "Usa as árvores de tarefas da linha do tempo no lugar das ferramentas Todo neste perfil.",
  autoOpenSidebar: "Abrir a barra lateral automaticamente",
  autoOpenSidebarHint: "Abre a barra lateral quando a primeira árvore de tarefas aparece na sessão e a janela tem mais de 768 px de largura. Você também pode abri-la pela barra de progresso.",
  followAppLanguage: "Seguir o app",
  followChatLanguage: "Seguir a conversa",
  progressDecimals: "Casas decimais do progresso",
  minutes: "min",
  underSecond: "<1 s",
  treeActions: "Ações da árvore de tarefas",
  hierarchy: "Hierarquia de relatórios",
  hierarchyHint: "Os intervalos mínimos devem aumentar. O trabalho pendente é relatado com a sessão ativa; níveis superiores combinam relatórios completos.",
  rollup: "Relatório de progresso",
  addLevel: "Adicionar nível",
  removeLevel: "Excluir nível",
  prompt: "Prompt de resumo",
  basePromptHint: "Mantenha os resumos curtos e úteis. Eles usam o provedor e o modelo da sessão em segundo plano.",
  rollupPromptHint: "Adições opcionais ao prompt global. O primeiro nível usa o contexto da tarefa; os superiores usam os resumos filhos.",
  resetPrompt: "Restaurar padrão",
  invalidSettings: "Use períodos crescentes de um minuto a sete dias (primeiro nível: no máximo um dia). O prompt global deve ter entre 1 e 32,768 caracteres.",
  expandAll: "Expandir tudo",
  collapseAll: "Recolher tudo",
  leafTasks: "tarefas finais concluídas",
  toolCalls: "chamadas de ferramentas",
  pauseTask: "Solicitar pausa",
  resumeTask: "Solicitar continuação",
  taskCompleted: "Concluída",
  pausePlan: "Solicitar pausa deste plano",
  resumePlan: "Solicitar continuação deste plano",
  priority: "Prioridade",
  noPriority: "Nenhuma",
  inheritedPriority: "Herdada",
  priorityP0: "Urgente",
  priorityP1: "Alta",
  priorityP2: "Média",
  priorityP3: "Baixa",
  priorityHint: "Mudanças de P0 avisam rapidamente o agente ativo. Filhos sem prioridade própria herdam a do grupo. Isso não retoma trabalho pausado.",
  prioritySaveFailed: "Não foi possível confirmar a prioridade. Confira o valor antes de tentar de novo.",
  addAnnotation: "Discussão",
  annotations: "Discussão",
  taskTarget: "Tarefa",
  planTarget: "Plano",
  latestUpdate: "Último avanço",
  discussionRef: "Referência da resposta",
  discussionMessage: "Mensagem do usuário",
  emptyAnnotations: "Nenhuma discussão ainda.",
  annotationUser: "Você",
  annotationAgent: "Agente",
  annotationOpen: "Aguardando resposta",
  annotationResolved: "Respondida",
  annotationPlaceholder: "Descreva um problema, faça uma pergunta ou peça trabalho adicional…",
  cancelAnnotation: "Cancelar",
  saveAnnotation: "Salvar e enviar",
  annotationSaved: "Discussão salva e enviada ao agente.",
  annotationNotifyFailed: "Discussão salva. O aviso não foi confirmado; confira a conversa.",
  annotationSaveFailed: "Não foi possível confirmar o salvamento. O rascunho foi mantido; confira as discussões antes de tentar de novo.",
  annotationRequest: "Em um ponto seguro, trate a mensagem do usuário. Salve o resultado com timeline_reply e a referência da resposta. Depois, continue o trabalho.",
  taskControls: "Controles de trabalho",
  taskControlsHint: "Solicita uma mudança de plano num ponto seguro. Use Parar no Harness para parar a execução da sessão.",
  pausePending: "Pausa solicitada",
  resumePending: "Continuação solicitada",
  retryPause: "Solicitar pausa novamente",
  retryResume: "Solicitar continuação novamente",
  controlWaitingHint: "Pedido guardado. A aguardar uma atualização do plano.",
  controlUnconfirmedHint: "Estado não confirmado. Verifique a conversa e a resposta guardada antes de repetir o pedido.",
  controlDeliveryUnknown: "Entrega não confirmada",
  controlRequest: "O seu pedido",
  controlWaiting: "A aguardar confirmação",
  controlApplied: "Plano atualizado",
  controlAnswered: "Requer atenção",
  controlSuperseded: "Substituído por novo pedido",
  controlUnavailable: "Trabalho indisponível",
  discussionHistory: "Todas as discussões desta sessão",
  taskHistory: "Histórico de alterações",
  emptyTaskHistory: "Nenhuma alteração registrada.",
  controlReplyRequest: "Registre as mudanças de estado das tarefas. Use timeline_reply com a referência da resposta para informar o resultado ou impedimento.",
  sendingTaskRequest: "Enviando solicitação…",
  taskRequestFailed: "Não foi possível confirmar a solicitação. Confira a conversa antes de tentar de novo.",
  taskRequestUnavailable: "Esta conversa está indisponível. Reabra antes de enviar a solicitação.",
  resumeRequest: "Continue o trabalho selecionado e preserve o progresso. Verifique as dependências bloqueadas e ative uma tarefa executável antes de trabalhar.",
  pauseRequest: "Em um ponto seguro, pause as tarefas em andamento e não iniciadas deste escopo e registre o motivo. Preserve o progresso e os bloqueios existentes. Continue os outros trabalhos solicitados ou encerre o turno."
};
var dictionaries = { en, zh, ja, es, fr, de, ru, pt };

// timeline/src/client/clock.ts
function startMinuteClock(update) {
  const tick = () => {
    update(minuteAt(Date.now()));
    timer = setTimeout(tick, MINUTE_MS - Date.now() % MINUTE_MS);
  };
  let timer = setTimeout(tick, MINUTE_MS - Date.now() % MINUTE_MS);
  return () => {
    clearTimeout(timer);
  };
}

// timeline/src/client/actions.ts
var import_zod6 = require("zod");

// timeline/src/protocol.ts
var import_zod5 = require("zod");
var TIMELINE_CHANNEL = "/timeline";
var TIMELINE_EDIT = "edit";
var TIMELINE_LOCALE = "locale";
var browserLanguageSchema = import_zod5.z.enum(outputLanguages);
var sessionId = import_zod5.z.string().min(1).max(256).transform((value) => value);
var editRequestSchema = import_zod5.z.discriminatedUnion("action", [
  import_zod5.z.object({
    action: import_zod5.z.literal("import"),
    sessionId,
    id: import_zod5.z.string().min(1).max(128),
    content: import_zod5.z.string().max(CHECKPOINT_BYTES),
    copy: import_zod5.z.boolean().default(false),
    continue: import_zod5.z.boolean().default(false)
  }).strict(),
  import_zod5.z.object({ action: import_zod5.z.literal("remove"), sessionId, tree: treeId, draft: import_zod5.z.boolean().optional() }).strict(),
  import_zod5.z.object({
    action: import_zod5.z.literal("control"),
    sessionId,
    target: controlTargetSchema,
    id: annotationId,
    intent: controlActionSchema,
    text: annotationText
  }).strict(),
  import_zod5.z.object({
    action: import_zod5.z.literal("delivery"),
    sessionId,
    id: annotationId,
    delivery: controlDeliverySchema.exclude(["sending"])
  }).strict(),
  import_zod5.z.object({
    action: import_zod5.z.literal("annotate"),
    sessionId,
    target: annotationTargetSchema,
    id: annotationId,
    text: annotationText
  }).strict(),
  import_zod5.z.object({
    action: import_zod5.z.literal("priority"),
    sessionId,
    tree: treeId,
    task: taskId,
    priority: prioritySchema
  }).strict()
]);
var editResponseSchema = import_zod5.z.discriminatedUnion("action", [
  import_zod5.z.object({ action: import_zod5.z.literal("import"), tree: treeId, reused: import_zod5.z.boolean(), notified: import_zod5.z.boolean() }),
  import_zod5.z.object({
    action: import_zod5.z.literal("remove"),
    removed: import_zod5.z.boolean(),
    notified: import_zod5.z.boolean(),
    draft: import_zod5.z.boolean().default(false)
  }),
  import_zod5.z.object({
    action: import_zod5.z.literal("control"),
    annotation: annotationSchema,
    dispatch: import_zod5.z.boolean(),
    context: import_zod5.z.json()
  }),
  import_zod5.z.object({ action: import_zod5.z.literal("delivery") }),
  import_zod5.z.object({ action: import_zod5.z.literal("annotate"), annotation: annotationSchema, context: import_zod5.z.json() }),
  import_zod5.z.object({ action: import_zod5.z.literal("priority") })
]);

// timeline/src/client/actions.ts
var contextPreview = import_zod6.z.object({
  treeTitle: import_zod6.z.string().optional(),
  taskTitle: import_zod6.z.string().nullable().optional(),
  status: import_zod6.z.enum(statuses).nullable().optional(),
  note: import_zod6.z.string().optional(),
  description: import_zod6.z.string().optional(),
  start: import_zod6.z.string().optional(),
  end: import_zod6.z.string().optional(),
  summary: summarySchema.optional()
});
function messageContext(annotation, context, t) {
  const data = contextPreview.parse(context ?? {});
  const target = annotation.target;
  const lines = [];
  if (target.kind === "report") {
    const period = data.start && data.end ? `${data.start} – ${data.end} (${target.report})` : target.report;
    lines.push(`${t("rollup")}: ${period}`);
    if (data.summary !== void 0) {
      lines.push(`${t("progress")}: ${data.summary.progress.join(" ")}`);
      if (data.summary.uncertainties.length > 0)
        lines.push(`${t("uncertainties")}: ${data.summary.uncertainties.join(" ")}`);
      if (data.summary.userActions.length > 0)
        lines.push(`${t("userActions")}: ${data.summary.userActions.join(" ")}`);
    }
  } else {
    if (target.kind === "task") {
      const task2 = data.taskTitle ? `${data.taskTitle} (${target.task})` : target.task;
      lines.push(`${t("taskTarget")}: ${task2}${data.status ? ` · ${t(data.status)}` : ""}`);
    }
    lines.push(`${t("planTarget")}: ${data.treeTitle ? `${data.treeTitle} (${target.tree})` : target.tree}`);
    const note = data.note || data.description;
    if (note)
      lines.push(
        `${t(data.note ? "latestUpdate" : "details")}: ${note.length > 200 ? `${note.slice(0, 200)}…` : note}`
      );
  }
  lines.push(`${t("discussionRef")}: ${annotation.id}`);
  return lines.join("\n");
}
function createTaskRequester(sessions, connection, t) {
  const controller = new AbortController();
  const pending = /* @__PURE__ */ new Set();
  const using = (sessionId2, run) => {
    const operation = sessions.using(
      sessionId2,
      { source: "timelineTaskAction", signal: controller.signal },
      async (reference) => {
        const { session } = await reference.ready;
        controller.signal.throwIfAborted();
        const current = session.getSnapshot();
        if (current.removed || current.openState !== "open") throw new Error(t("taskRequestUnavailable"));
        return run(session);
      }
    );
    pending.add(operation);
    void operation.then(
      () => pending.delete(operation),
      () => pending.delete(operation)
    );
    return operation;
  };
  const prompt = async (session, text) => {
    const current = session.getSnapshot();
    const result = await session.prompt(
      [{ type: "text", text }],
      current.running ? "steer" : "queue",
      controller.signal
    );
    if (!result.ok) throw new Error(result.error.message);
  };
  const edit = async (value) => {
    controller.signal.throwIfAborted();
    const result = await connection.rpc.call(TIMELINE_CHANNEL, TIMELINE_EDIT, value, controller.signal);
    if (!result.ok) throw new Error(result.error.message);
    return editResponseSchema.parse(result.value);
  };
  return {
    importTree(sessionId2, request) {
      return using(sessionId2, async () => {
        const result = await edit({ ...request, sessionId: sessionId2, action: "import" });
        if (result.action !== "import") throw new Error("Invalid Timeline import response");
        return result;
      });
    },
    removeTree(sessionId2, tree, draft = false) {
      return using(sessionId2, async () => {
        const result = await edit({ action: "remove", sessionId: sessionId2, tree, ...draft ? { draft } : {} });
        if (result.action !== "remove") throw new Error("Invalid Timeline removal response");
        return result;
      });
    },
    send(sessionId2, request) {
      return using(sessionId2, async (session) => {
        const key = request.action === "resume" ? "resumeRequest" : "pauseRequest";
        const result = await edit({
          action: "control",
          sessionId: sessionId2,
          id: newId("note"),
          intent: request.action,
          text: t(key),
          target: request.task === void 0 ? { kind: "tree", tree: request.tree.id } : { kind: "task", tree: request.tree.id, task: request.task.id }
        });
        if (result.action !== "control") throw new Error("Invalid Timeline request response");
        if (!result.dispatch) return;
        let delivery = "accepted";
        try {
          await prompt(
            session,
            [
              `${t("title")} · ${t("taskControls")}`,
              messageContext(result.annotation, result.context, t),
              `${result.annotation.text}
${t("controlReplyRequest")}`
            ].join("\n\n")
          );
        } catch {
          delivery = "unknown";
        }
        await edit({ action: "delivery", sessionId: sessionId2, id: result.annotation.id, delivery });
      });
    },
    setPriority(sessionId2, request) {
      return using(sessionId2, async () => {
        const result = await edit({ ...request, sessionId: sessionId2, action: "priority" });
        if (result.action !== "priority") throw new Error("Invalid Timeline edit response");
      });
    },
    annotate(sessionId2, request) {
      return using(sessionId2, async (session) => {
        const result = await edit({ ...request, sessionId: sessionId2, action: "annotate" });
        if (result.action !== "annotate") throw new Error("Invalid Timeline annotation response");
        if (result.annotation.reply !== null) return { notified: true };
        try {
          await prompt(
            session,
            [
              `${t("title")} · ${t("annotations")}`,
              messageContext(result.annotation, result.context, t),
              t("annotationRequest"),
              `${t("discussionMessage")}:
${result.annotation.text}`
            ].join("\n\n")
          );
          return { notified: true };
        } catch {
          return { notified: false };
        }
      });
    },
    async close() {
      controller.abort();
      await Promise.allSettled(pending);
    }
  };
}

// timeline/src/client/index.ts
var SIDEBAR_AUTO_OPEN_QUERY = "(width > 768px)";
var inject = [
  "slots",
  "locale",
  "sidebarRightTabs",
  "sidebarRight",
  "configForms",
  "connection",
  "sessions"
];
function apply(ctx) {
  const id2 = "dsh-mek-bot-timeline";
  const clock = (0, import_dsh_client_store2.createSnapshotStore)(minuteAt(Date.now()));
  const selection = (0, import_dsh_client_store2.createSnapshotStore)(null);
  ctx.effect(() => ctx.locale.register("timeline", dictionaries), "timeline: labels");
  const t = ctx.locale.bind("timeline");
  const connection = ctx.get("connection");
  ctx.effect(() => {
    const controller = new AbortController();
    let sent;
    const sync = () => {
      if (connection.state.getSnapshot() !== "connected") {
        sent = void 0;
        return;
      }
      const language = appLanguage(ctx.locale.getSnapshot().active);
      if (language === sent) return;
      sent = language;
      void connection.rpc.call(TIMELINE_CHANNEL, TIMELINE_LOCALE, language, controller.signal).catch(() => void 0);
    };
    const stopConnection = connection.state.subscribe(sync);
    const stopLocale = ctx.locale.subscribe(sync);
    sync();
    return () => {
      stopLocale();
      stopConnection();
      controller.abort();
    };
  }, "timeline: browser language");
  const sessions = ctx.get("sessions");
  const sidebar = ctx.sidebarRight;
  const isSidebarOpen = (sessionId2) => sidebar.mounted.getSnapshot() === sessionId2 && sidebar.isExpanded() && sidebar.active()?.kind === "timeline";
  const openTaskTree = (sessionId2) => {
    selection.set(sessionId2);
    sidebar.openTabIn(sessionId2, "timeline");
  };
  const requests = createTaskRequester(sessions, connection, t);
  ctx.effect(() => () => requests.close(), "timeline: task requests");
  ctx.inject(["commandUi"], (scope) => {
    scope.on("command/executed", (sessionId2, name, result) => {
      if (name !== "timeline" || result.kind !== "success") return;
      openTaskTree(sessionId2);
    });
  });
  const settings = ctx.configForms.get(TIMELINE_CONFIG_ID);
  ctx.provide(
    "mekTimelinePanel",
    ({ sessionId: sessionId2 }) => (0, import_react14.createElement)(Embedded, { key: sessionId2, ctx, sessionId: sessionId2, clock, settings, requests, t })
  );
  const viewStore = createViewStore();
  ctx.slots.inject(
    "tool.call.toolview",
    () => ctx.slots.register(
      {
        name: "tool.call.toolview",
        key: "timeline_tasks",
        locale: "timeline",
        store: viewStore,
        inject: (sessionId2, actions) => ({
          hooks: { settings, locale: ctx.locale },
          openTask: (tree, task2) => {
            actions.open(tree, task2);
            ctx.sidebarRight.openTabIn(sessionId2, "timeline");
          }
        })
      },
      TaskCard
    )
  );
  ctx.slots.inject(
    "plugins.bundle.config",
    () => ctx.slots.register(
      {
        name: "plugins.bundle.config",
        key: id2,
        locale: "timeline",
        store: createSettingsStore(),
        inject: () => ({
          hooks: { settings, locale: ctx.locale },
          save: (value, revision) => {
            const [intervalMs, ...higher] = value.periods;
            if (intervalMs === void 0) return Promise.resolve(false);
            let previous = intervalMs;
            const rollupFactors = higher.map((period) => {
              const factor = period / previous;
              previous = period;
              return factor;
            });
            const next = {
              reportsEnabled: value.reportsEnabled,
              intervalMs,
              rollupFactors,
              language: value.language,
              progressDecimals: value.progressDecimals,
              segmentedProgress: value.segmentedProgress,
              allowTodo: value.allowTodo,
              autoOpenSidebar: value.autoOpenSidebar,
              reminderIterations: value.reminderIterations,
              taskPrompt: value.taskPrompt,
              summaryPrompt: value.summaryPrompt,
              levelPrompts: value.levelPrompts
            };
            return settings.mutate(
              Object.keys(next).map((field) => ({
                op: "set",
                path: [field],
                value: next[field]
              })),
              revision
            );
          }
        })
      },
      Settings
    )
  );
  ctx.effect(
    () => ctx.sidebarRightTabs.register({
      id: id2,
      kind: "timeline",
      priority: "extension",
      title: () => t("title"),
      guide: [
        {
          id: "timeline",
          order: 50,
          title: () => t("title"),
          description: () => t("guide"),
          icon: TimelineIcon
        }
      ]
    }),
    "timeline: sidebar page"
  );
  ctx.effect(() => startMinuteClock((time) => {
    clock.set(time);
  }), "timeline: minute clock");
  ctx.effect(() => {
    let stopProjection;
    const observeSession = () => {
      stopProjection?.();
      stopProjection = void 0;
      const sessionId2 = sidebar.mounted.getSnapshot();
      const source = sessionId2 === void 0 ? void 0 : sessions.binding(sessionId2)?.session.projections.faceOf("timeline");
      if (sessionId2 === void 0 || source === void 0) return;
      let hasTree;
      let firstTreePending = false;
      const observeTree = () => {
        const view = source.getSnapshot();
        if (typeof view !== "object" || view === null || !("trees" in view) || !Array.isArray(view.trees)) return;
        if (hasTree !== true) {
          firstTreePending = hasTree === false && view.trees.length > 0;
          hasTree = view.trees.length > 0;
        }
        if (!firstTreePending) return;
        const { status, value } = settings.getSnapshot();
        if (status === "loading") return;
        firstTreePending = false;
        if (value?.autoOpenSidebar === true && view.trees.length > 0 && !isSidebarOpen(sessionId2) && matchMedia(SIDEBAR_AUTO_OPEN_QUERY).matches) {
          openTaskTree(sessionId2);
        }
      };
      const stopTree = source.subscribe(observeTree);
      const stopSettings = settings.subscribe(observeTree);
      stopProjection = () => {
        stopTree();
        stopSettings();
      };
      observeTree();
    };
    const stopSession = sidebar.mounted.subscribe(observeSession);
    observeSession();
    return () => {
      stopSession();
      stopProjection?.();
    };
  }, "timeline: first task tree");
  ctx.slots.inject(
    "sidebar.right.pane.tab",
    () => ctx.slots.register(
      {
        name: "sidebar.right.pane.tab",
        key: id2,
        locale: "timeline",
        store: viewStore,
        inject: (sessionId2) => ({
          hooks: { clock, settings, selection, locale: ctx.locale },
          consumeSelection: () => {
            if (selection.getSnapshot() === sessionId2) selection.set(null);
          },
          requestTask: (request) => requests.send(sessionId2, request),
          setPriority: (request) => requests.setPriority(sessionId2, request),
          annotate: (request) => requests.annotate(sessionId2, request),
          importTree: (request) => requests.importTree(sessionId2, request),
          removeTree: (tree) => requests.removeTree(sessionId2, tree)
        })
      },
      Panel
    )
  );
  ctx.slots.inject(
    "conversation.input.dock",
    () => ctx.slots.register(
      {
        name: "conversation.input.dock",
        id: "timeline",
        order: 20,
        locale: "timeline",
        store: viewStore,
        inject: (sessionId2) => ({
          hooks: { settings },
          removeTree: (tree) => requests.removeTree(sessionId2, tree, true),
          toggleSidebar: (showingTree) => {
            if (showingTree && isSidebarOpen(sessionId2)) sidebar.toggleExpanded();
            else sidebar.openTabIn(sessionId2, "timeline");
          }
        })
      },
      TaskDock
    )
  );
}
    return Object.defineProperty({ ...module.exports }, Symbol.toStringTag, { value: 'Module' })
  },
  meta: () => ({ stylesheets: { 'src/client/timeline.css': { text: () => "/* Use Harness semantic tokens across themes. */\n.timeline-tool-update{container-type:inline-size;container-name:timeline-card;color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size,13px);line-height:1.5}\n.timeline-tool-update *{box-sizing:border-box}\n.timeline-tool-summary{display:flex;align-items:center;gap:8px;min-width:0;margin-inline-start:8px;color:var(--dsw-alias-label-secondary)}\n.timeline-tool-summary>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.timeline-tool-summary>span:last-child{flex:none;font-variant-numeric:tabular-nums;white-space:nowrap}\n.timeline-card-open{display:inline-flex!important;align-items:center;justify-content:center;width:24px!important;height:24px!important;padding:4px!important;border:0!important;background:none!important;color:var(--dsw-alias-label-tertiary)!important}\n.timeline-task-card{margin:6px 0 12px 22px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-specific-sidebar-fill);overflow:hidden;padding-top:12px}\n.timeline-card-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-inline:14px}\n.timeline-card-heading>strong{display:flex;align-items:center;gap:6px;min-width:0;font-size:13px;font-weight:500}\n.timeline-card-heading>strong>svg{flex:none;color:var(--dsw-alias-label-secondary)}\n.timeline-card-heading>strong>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.timeline-card-progress{display:flex;align-items:baseline;gap:8px;flex:none;font-variant-numeric:tabular-nums;white-space:nowrap}\n.timeline-card-progress>svg{align-self:center;color:var(--dsw-alias-label-tertiary)}\n.timeline-card-progress>strong{font-size:26px;line-height:30px;font-weight:500;color:var(--dsw-alias-label-secondary)}\n.timeline-card-progress>strong:last-child{color:var(--dsw-alias-label-primary)}\n.timeline-task-card[data-increased=true] .timeline-card-progress>strong:last-child{color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 70%,var(--dsw-alias-label-primary))}\n.timeline-card-progress>strong>span{font-size:13px;color:var(--dsw-alias-label-secondary)}\n.timeline-card-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:2px 14px 10px;font-size:11px;line-height:18px;color:var(--dsw-alias-label-secondary)}\n.timeline-card-meta>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.timeline-card-meta>span:last-child{flex:none;white-space:nowrap;font-variant-numeric:tabular-nums}\n.timeline-card-tasks{list-style:none;margin:0;padding:4px 8px 6px;border-top:0.5px solid var(--dsw-alias-border-l1)}\n.timeline-card-tasks>li+li{border-top:0.5px solid var(--dsw-alias-border-l1)}\n.timeline-card-task{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:5px 6px;border:0;border-radius:6px;background:none;color:var(--dsw-alias-label-primary);font:inherit;text-align:start;cursor:pointer;transition:background-color 120ms ease}\n.timeline-tool-update :is(button,[role=button]):focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:2px}\n.timeline-card-status{display:flex;align-items:center;justify-content:center;flex:none;width:14px;color:var(--dsw-alias-label-secondary)}\n.timeline-card-task[data-status=done] .timeline-card-status{color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 70%,var(--dsw-alias-label-primary))}\n.timeline-card-task[data-status=active] .timeline-card-status{color:var(--dsw-alias-state-business-primary)}\n.timeline-card-task[data-status=blocked] .timeline-card-status{color:var(--dsw-alias-state-warn-primary)}\n.timeline-card-task-copy{display:flex;align-items:baseline;gap:8px;flex:1;min-width:0;overflow:hidden}\n.timeline-card-task-copy>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.timeline-card-task-copy>span:first-child{flex:none;max-width:55%;font-size:12px}\n.timeline-card-task-copy>span:last-child{min-width:0;flex:1;font-size:11px;color:var(--dsw-alias-label-secondary)}\n.timeline-card-task-progress{display:flex;align-items:center;gap:5px;flex:none;white-space:nowrap;font-size:11px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}\n.timeline-card-task-progress>span:last-child{color:var(--dsw-alias-label-primary)}\n.timeline-card-state{flex:none;font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap}\n.timeline-card-task[data-status=blocked] .timeline-card-state{padding:0 4px;border-radius:4px;background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-label-primary)}\n.timeline-card-more{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:32px;border:0;border-top:0.5px solid var(--dsw-alias-border-l1);background:none;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer}\n.timeline-card-raw,.timeline-card-failure{margin:6px 0 12px 22px;max-height:240px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:12px}\n.timeline-card-failure{color:var(--dsw-alias-state-error-primary)}\n.timeline-card-inspect{margin-inline-start:22px}\n@container timeline-card (max-width:600px){.timeline-task-card{margin-inline-start:0}.timeline-card-heading{gap:8px;padding-inline:12px}.timeline-card-heading>strong{font-size:12px}.timeline-card-progress{gap:5px}.timeline-card-progress>strong{font-size:23px}.timeline-card-meta{margin-inline:12px;font-size:10px}.timeline-card-task{gap:6px}.timeline-card-task-copy{gap:6px}.timeline-card-task-copy>span:first-child{font-size:11px}.timeline-card-task-copy>span:last-child,.timeline-card-task-progress{font-size:10px}}\n@container timeline-card (max-width:360px){.timeline-card-heading{flex-wrap:wrap}.timeline-card-heading>strong{width:100%}.timeline-card-progress{margin-inline-start:auto}.timeline-card-meta{flex-wrap:wrap}.timeline-card-meta>span:last-child{margin-inline-start:auto}.timeline-card-task-progress>span:first-child:not(:last-child),.timeline-card-task-progress>svg{display:none}}\n.dsh-timeline{--timeline-level:var(--dsw-alias-chart-messages);--timeline-border:color-mix(in srgb,var(--dsw-alias-label-secondary) 35%,var(--dsw-alias-border-l1));--timeline-line:color-mix(in srgb,var(--dsw-alias-label-secondary) 50%,var(--dsw-alias-border-l1));--timeline-status:var(--dsw-alias-label-secondary);box-sizing:border-box;height:100%;overflow:auto;padding:16px;color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size,13px);line-height:1.5;overflow-wrap:anywhere}\n.dsh-timeline *{box-sizing:border-box}\n.dsh-timeline [data-level=\"0\"]{--timeline-level:var(--dsw-alias-chart-messages)}\n.dsh-timeline [data-level=\"1\"]{--timeline-level:var(--dsw-alias-state-success-primary)}\n.dsh-timeline [data-level=\"2\"]{--timeline-level:var(--dsw-alias-state-done-primary)}\n.dsh-timeline [data-level=\"3\"]{--timeline-level:var(--dsw-alias-state-warn-primary)}\n.dsh-timeline [data-level=\"4\"]{--timeline-level:var(--dsw-alias-state-error-primary)}\n:is(.dsh-timeline,.timeline-dock) [data-status=done]{--timeline-status:var(--dsw-alias-state-success-primary)}\n:is(.dsh-timeline,.timeline-dock) [data-status=active]{--timeline-status:var(--dsw-alias-state-business-primary,var(--dsw-alias-link))}\n:is(.dsh-timeline,.timeline-dock) [data-status=blocked]{--timeline-status:var(--dsw-alias-state-warn-primary)}\n:is(.dsh-timeline,.timeline-dock) [data-status=paused],:is(.dsh-timeline,.timeline-dock) [data-status=pending]{--timeline-status:var(--dsw-alias-label-secondary)}\n.dsh-timeline h1,.dsh-timeline h2,.dsh-timeline h3,.dsh-timeline h4{font:inherit;font-weight:500;margin:0}\n.dsh-timeline h4{margin-block:12px 4px}\n.dsh-timeline p{margin:8px 0}\n.dsh-timeline button,.dsh-timeline select,.dsh-timeline input,.dsh-timeline textarea{font:inherit;color:inherit}\n.dsh-timeline button{cursor:pointer}\n.dsh-timeline :is(button,select,input,textarea),.timeline-dock-action{transition:background-color 120ms ease,border-color 120ms ease,color 120ms ease}\n.timeline-dock-action svg{transition:transform 180ms ease}\n.timeline-task-tree,.timeline-detail-page,.timeline-viewport,.timeline-return-now{animation:timeline-enter 150ms ease-out}\n@keyframes timeline-enter{from{opacity:.65}to{opacity:1}}\n.dsh-timeline button:disabled{cursor:default;opacity:.5}\n.dsh-timeline :is(button,select,input,textarea,a,summary):focus-visible,.timeline-scroll:focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:3px}\n.dsh-timeline select{background:var(--dsw-alias-bg-base);border:0.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);padding:5px 8px}\n.timeline-muted{font-size:.85em;color:var(--dsw-alias-label-secondary)}\n.timeline-error,.timeline-notice{font-size:.9em;padding:10px 12px;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:var(--dsw-radius-md);background:color-mix(in srgb,currentColor 5%,transparent)}\n.timeline-error{color:var(--dsw-alias-state-error-primary)}\n.timeline-notice{color:var(--dsw-alias-label-secondary)}\n.timeline-transfer{font-size:var(--dsh-content-font-size,13px);overflow-wrap:anywhere}\n.timeline-transfer-options{display:grid;gap:12px}\n.timeline-transfer-options label{display:flex;align-items:center;gap:8px}\n.timeline-delete{color:var(--dsw-alias-state-error-primary)!important}\n.timeline-panel-header,.timeline-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}\n.timeline-panel-header{padding-bottom:16px}\n.timeline-panel-header strong,.timeline-panel-header small{display:block}\n.timeline-panel-header small{margin-top:2px;font-size:.85em;color:var(--dsw-alias-label-secondary)}\n.timeline-tabs{display:flex;border-bottom:0.5px solid var(--dsw-alias-border-l1);gap:20px;margin-bottom:20px}\n.timeline-tabs>button{display:flex;align-items:center;gap:6px;position:relative;border:0;background:none;color:var(--dsw-alias-label-secondary);padding:10px 0 12px;font-weight:500}\n.timeline-tabs>button[aria-selected=true]{color:var(--dsw-alias-link)}\n.timeline-tabs>button[aria-selected=true]:after{content:'';position:absolute;height:2px;inset-inline:0;bottom:-1px;background:currentColor;border-radius:2px}\n.timeline-tab-count{font-size:.75em;line-height:1;padding:3px 5px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border-radius:5px;font-variant-numeric:tabular-nums}\n.timeline-heading{margin:20px 0 12px}\n.timeline-task-tree>.timeline-heading{margin-top:0}\n.timeline-overview{border:0.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);padding:14px 16px;background:color-mix(in srgb,var(--timeline-status) 3%,var(--dsw-alias-bg-base))}\n.timeline-overview-title{display:flex;justify-content:space-between;align-items:start;gap:12px;margin-bottom:16px}\n.timeline-overview-title>strong{font-size:.95em;font-weight:500;line-height:1.4}\n.timeline-overall{display:flex;align-items:center;gap:14px}\n.timeline-overall strong{font-size:28px;font-weight:500;font-variant-numeric:tabular-nums;line-height:1.2;letter-spacing:-.03em}\n.timeline-overall strong>span{font-size:16px;margin-inline-start:1px;color:var(--dsw-alias-label-secondary)}\n.timeline-progress{height:6px;min-width:0;flex:1;background:var(--dsw-alias-bg-layer-1);border:0.5px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden}\n.timeline-progress>span{position:relative;display:block;height:100%;background:var(--timeline-status);border-radius:inherit;transition:width 320ms cubic-bezier(.2,.8,.2,1),background-color 180ms ease}\n.timeline-progress[data-segmented]{position:relative;display:flex;isolation:isolate}\n.timeline-progress[data-segmented]>[data-part]{flex:none;min-width:0;border-radius:0;overflow:hidden;transition:width 320ms cubic-bezier(.2,.8,.2,1),filter 120ms ease,box-shadow 120ms ease}\n.timeline-progress[data-segmented]>[data-part=done]{background:var(--dsw-alias-state-success-primary)}\n.timeline-progress[data-segmented]>[data-part=active]{background:var(--dsw-alias-state-business-primary,var(--dsw-alias-link))}\n.timeline-progress[data-segmented]>[data-part=pending]{background:var(--dsw-alias-bg-base)}\n.timeline-progress[data-segmented]>[data-part=blocked]{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-label-secondary) 22%,var(--dsw-alias-bg-base)) 0 3px,var(--dsw-alias-bg-base) 3px 6px)}\n.timeline-progress[data-segmented]>[data-part=done]{border-start-start-radius:inherit;border-end-start-radius:inherit}\n.timeline-progress[data-segmented]>:is([data-part=blocked],[data-part=active],[data-tip=true]){border-start-end-radius:inherit;border-end-end-radius:inherit}\n.timeline-progress[data-segmented]>.timeline-progress-highlight{position:absolute;inset-block:0;inset-inline-start:0;background:transparent;border-radius:inherit;overflow:hidden;pointer-events:none}\n.timeline-progress[data-segmented]:focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:3px}\n.timeline-overall .timeline-progress{height:8px}\n:is(.timeline-overview,.timeline-dock) :is(.timeline-progress:not([data-segmented])[data-status=active]>span,.timeline-progress>[data-flow=true]):after{content:'';position:absolute;inset:0;background:linear-gradient(100deg,transparent 15%,color-mix(in srgb,var(--dsw-alias-bg-base) 35%,transparent) 50%,transparent 85%);transform:translateX(-100%);animation:timeline-flow 3s linear infinite}\n@keyframes timeline-flow{to{transform:translateX(100%)}}\n.timeline-task-stats{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px 12px;margin-top:12px;font-size:.78em;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}\n.timeline-eta{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}\n.timeline-task-controls{display:grid;gap:8px;font-size:.9em}\n.timeline-task-controls>.timeline-task-grid{display:grid;grid-template-columns:minmax(0,1.4fr) repeat(2,minmax(0,1fr));gap:8px}\n.timeline-playback-anchor{display:flex;align-items:stretch;min-width:0}\n.timeline-playback-anchor:focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:3px;border-radius:var(--dsw-radius-md)}\n.timeline-priority-menu{display:block!important;min-width:0}\n.dsh-timeline .timeline-priority-menu .timeline-task-action{height:100%}\n.dsh-timeline .timeline-task-action{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;height:auto;min-height:40px;padding:8px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-base);font-size:inherit;line-height:1.35;text-align:center}\n.timeline-task-action>svg{flex:none}\n.timeline-task-action>span{min-width:0;max-width:100%}\n.dsh-timeline .timeline-task-action[aria-pressed=true]{color:var(--dsw-alias-link);border-color:currentColor;background:color-mix(in srgb,currentColor 8%,var(--dsw-alias-bg-base))}\n.dsh-timeline .timeline-priority-trigger{gap:4px;padding-inline:6px}\n.timeline-priority-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.timeline-priority-trigger>svg{color:var(--dsw-alias-label-secondary)}\n.timeline-priority-trigger>.timeline-priority-badge{font-size:inherit}\n.timeline-task-action[data-action=pause] svg{color:var(--dsw-alias-state-warn-primary)}\n.timeline-task-action:is([data-action=resume],[data-action=done]) svg{color:var(--dsw-alias-state-success-primary)}\n.timeline-priority-badge[data-priority=P0]{--timeline-priority:var(--dsw-alias-state-error-primary)}\n.timeline-priority-badge[data-priority=P1]{--timeline-priority:var(--dsw-alias-state-warn-primary)}\n.timeline-priority-badge[data-priority=P2]{--timeline-priority:var(--dsw-alias-state-business-primary)}\n.timeline-priority-badge[data-priority=P3]{--timeline-priority:var(--dsw-alias-label-secondary)}\n.timeline-priority-badge{display:inline-block;flex:none;padding:1px 5px;line-height:1.3;border-radius:4px;font-size:11px;font-weight:500;color:var(--timeline-priority,var(--dsw-alias-label-secondary));background:color-mix(in srgb,currentColor 8%,transparent)}\n.timeline-priority-option{display:flex;align-items:center;gap:8px}\n.timeline-task-controls>small{font-size:inherit;line-height:1.5;overflow-wrap:anywhere}\n.timeline-plan-controls>small{display:block;margin-top:8px;font-size:.82em;line-height:1.5;overflow-wrap:anywhere}\n.dsh-timeline .timeline-playback{display:inline-flex;align-items:center;justify-content:center;gap:4px;flex:none;width:auto;min-width:30px;height:30px;padding:5px 10px 5px 7px;white-space:nowrap;font-size:13px;line-height:1;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:var(--dsw-radius-md);color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,currentColor 8%,transparent)}\n.dsh-timeline .timeline-playback[data-action=pause]{color:var(--dsw-alias-state-warn-primary)}\n.timeline-tree-navigation{display:grid;grid-template-columns:30px minmax(0,1fr) 30px;align-items:center;gap:8px;position:relative;padding-inline:34px;margin:0 0 16px;min-height:44px}\n.timeline-tree-navigation[data-single]{grid-template-columns:minmax(0,1fr)}\n.timeline-tree-label{min-width:0;text-align:center}\n.timeline-tree-label>small{display:block;font-size:.75em;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}\n.timeline-tree-picker{display:flex;align-items:center;justify-content:center;min-width:0}\n.timeline-tree-picker select{appearance:none;max-width:100%;min-width:0;text-overflow:ellipsis;text-align:center;text-align-last:center;font-weight:500;border:0;background:none;padding:4px 8px;cursor:pointer}\n.timeline-tree-picker select:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}\n.timeline-tree-actions{position:absolute;inset-inline-end:0;top:7px}\n.dsh-timeline .timeline-icon-button{display:inline-flex;align-items:center;justify-content:center;flex:none;width:30px;height:30px;padding:5px;border:0;background:transparent;border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-secondary)}\n.dsh-timeline .timeline-estimate-help{width:24px;height:24px;padding:4px}\n.timeline-tasks,.timeline-tasks ul{list-style:none;padding:0;margin:0}\n.timeline-tasks{padding-bottom:4px}\n.timeline-tasks ul{margin-inline-start:11px;padding-inline-start:12px;border-inline-start:1.5px solid var(--timeline-line)}\n.timeline-tasks ul>li{position:relative}\n.timeline-tasks ul>li:before{content:'';position:absolute;inset-inline-start:-12px;top:26px;width:12px;border-block-start:1.5px solid var(--timeline-line);pointer-events:none}\n.timeline-task{display:flex;align-items:center;gap:6px;min-height:52px;border-radius:var(--dsw-radius-md);padding:4px}\n.timeline-task[data-selected=true]{background:var(--dsw-alias-bg-layer-1)}\n.timeline-disclosure,.timeline-leaf{width:20px;height:28px;flex:none;display:flex;align-items:center;justify-content:center;border:0;background:none;padding:0;color:var(--dsw-alias-label-secondary)}\n.timeline-caret{display:flex;transition:transform .16s ease}\n.timeline-caret[data-expanded=true]{transform:rotate(90deg)}\n.timeline-status-dot{width:6px;height:6px;border:1px solid currentColor;border-radius:50%;corner-shape:round}\n.timeline-leaf{color:var(--timeline-status)}\n.timeline-leaf[data-status=active] .timeline-status-dot{background:currentColor}\n.timeline-task-title{min-width:0;flex:1;text-align:start;border:0;background:none;padding:4px 0}\n.timeline-task-title>span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.timeline-task-title>small{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:.78em;margin-top:4px}\n.timeline-task-title small>[data-tone]{flex:none;font-size:11px;padding:0 6px;line-height:16px}\n.timeline-task-note{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.timeline-task .timeline-progress{flex:none;width:40px;height:4px}\n.timeline-percent{font-size:.78em;font-variant-numeric:tabular-nums;min-width:8ch;flex:none;text-align:end;color:var(--dsw-alias-label-secondary)}\n.timeline-dock{box-sizing:border-box;width:calc(100% - 2 * var(--dsh-composer-side-clearance) - 4 * var(--dsh-composer-dock-inset));margin:0 auto;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}\n.timeline-dock *{box-sizing:border-box}\n.timeline-dock-bar{display:flex;align-items:center;gap:10px;max-width:calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));height:36px;margin:0 auto;padding:4px 5px 4px 12px}\n.timeline-annotation-editor{--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}\n.timeline-dock-bar,.timeline-annotation-editor{position:relative;isolation:isolate;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);box-shadow:var(--dsw-elevation-panel)}\n.timeline-dock-bar:before,.timeline-annotation-editor:before{content:'';position:absolute;z-index:-1;inset:0;border-radius:inherit;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);pointer-events:none}\n.timeline-dock-bar{cursor:pointer;user-select:none}\n.timeline-dock-highlight{position:absolute;z-index:-1;inset:0;border-radius:inherit;background:var(--dsw-alias-interactive-bg-hover);opacity:0;transition:opacity 120ms ease;pointer-events:none}\n.timeline-dock-bar:active>.timeline-dock-highlight{opacity:1;background:var(--dsw-alias-interactive-bg-active)}\n.timeline-dock .timeline-dock-toggle:active:not(:disabled){background:transparent}\n.timeline-dock-bar>.timeline-dock-remove:active~.timeline-dock-highlight{opacity:0}\n.timeline-dock-title{flex:0 1 auto;min-width:0;max-width:min(30%,18ch);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}\n.timeline-dock .timeline-progress{flex:1;min-width:24px;height:8px}\n.timeline-dock-percent{flex:none;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}\n.timeline-dock-action{flex:none;width:28px;height:28px;padding:0;border-radius:999px;corner-shape:round;color:var(--dsw-alias-label-secondary)}\n.timeline-dock-label{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}\n.timeline-dock-close{display:none}\nbody:has(.dsh-timeline[data-timeline-dock-open=true]) .timeline-dock[data-current-tree=true] .timeline-dock-open{display:none}\nbody:has(.dsh-timeline[data-timeline-dock-open=true]) .timeline-dock[data-current-tree=true] .timeline-dock-close{display:block}\nbody:has(.dsh-timeline[data-timeline-dock-open=true]) .timeline-dock[data-current-tree=true] .timeline-dock-action svg{transform:rotate(180deg)}\n.timeline-dock button:focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:2px}\n .timeline-scroll-hint{margin:0 0 14px!important;line-height:1.5}\n.timeline-column-headers,.timeline-columns{display:grid;transition:grid-template-columns 210ms cubic-bezier(.2,.8,.2,1)}\n.timeline-column-headers{overflow:hidden;scrollbar-gutter:stable;border:1.25px solid var(--timeline-border);border-bottom:0;border-radius:var(--dsw-radius-md) var(--dsw-radius-md) 0 0;background:var(--dsw-alias-bg-base)}\n.timeline-column-headers button{display:flex;align-items:center;justify-content:center;gap:5px;min-width:0;min-height:38px;padding:6px 2px;border:0;border-inline-start:0.5px solid var(--dsw-alias-border-l1);background:none;color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap}\n.timeline-column-headers button strong{font-weight:500;overflow:hidden;text-overflow:clip}\n.timeline-column-headers button[aria-pressed=true]{color:var(--dsw-alias-label-primary);box-shadow:inset 0 -2px var(--timeline-level);background:color-mix(in srgb,var(--timeline-level) 5%,var(--dsw-alias-bg-base))}\n.timeline-column-headers button[data-history=true] .timeline-level-dot{background:transparent;box-shadow:inset 0 0 0 1px var(--timeline-level)}\n.timeline-ruler-heading{align-self:center;font-size:10px;text-align:center;color:var(--dsw-alias-label-secondary)}\n.timeline-level-dot{display:inline-block;width:6px;height:6px;flex:none;border-radius:50%;corner-shape:round;background:var(--timeline-level)}\n.timeline-viewport{position:relative}\n.timeline-table-scroll{overflow-x:auto}\n.timeline-font-metric{position:absolute;width:1em;height:1em;visibility:hidden;pointer-events:none}\n.timeline-scroll{height:clamp(280px,55vh,560px);overflow-y:auto;overflow-x:hidden;scrollbar-gutter:stable;overscroll-behavior:contain;overflow-anchor:none;border:1.25px solid var(--timeline-border);border-radius:0 0 var(--dsw-radius-md) var(--dsw-radius-md)}\n.timeline-canvas{position:relative;min-width:0}\n.timeline-now{position:absolute;inset-inline-start:0;top:0;z-index:3;width:51px;border-top:1px solid var(--dsw-alias-link);padding:3px 2px;background:var(--dsw-alias-bg-base);font-size:9px;line-height:12px;color:var(--dsw-alias-link);pointer-events:none}\n.timeline-tick{position:absolute;inset-inline:0;border-top:0.5px solid var(--dsw-alias-border-l1);pointer-events:none}\n.timeline-tick time{position:absolute;inset-inline-start:3px;top:-7px;width:45px;line-height:12px;font-size:9px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base)}\n.timeline-tick-major{border-top-color:color-mix(in srgb,var(--dsw-alias-label-secondary) 35%,var(--dsw-alias-border-l1))}\n.timeline-tick-major time{font-weight:500;color:var(--dsw-alias-label-primary)}\n.timeline-tick-minor{border-top-color:color-mix(in srgb,var(--dsw-alias-border-l1) 55%,transparent)}\n.timeline-tick-minor time{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}\n.timeline-columns{position:absolute;inset:0;z-index:2;pointer-events:none}\n.timeline-column{position:relative;min-width:0;border-inline-start:0.5px solid var(--dsw-alias-border-l1);container-type:inline-size}\n.timeline-column[data-focused=true]{background:color-mix(in srgb,var(--timeline-level) 2%,transparent)}\n.timeline-block{position:absolute;display:block;inset-inline:3px;min-width:0;overflow:hidden;border:0.5px solid color-mix(in srgb,var(--timeline-level) 35%,var(--dsw-alias-border-l1));border-inline-start:3px solid var(--timeline-level);border-radius:5px;text-align:start;color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--timeline-level) 8%,var(--dsw-alias-bg-base));padding:0;pointer-events:auto}\n.timeline-block[data-needs-focus=true]{cursor:zoom-in}\n.timeline-block[data-density=bar]{border-block:0;border-radius:1px}\n.timeline-block:focus-visible{z-index:4}\n.timeline-block:not([data-density=bar]):focus-visible{outline-offset:-2px!important}\n.timeline-block-content{position:absolute;inset-inline:0;display:flex;flex-direction:column;align-items:stretch;gap:4px;padding:6px 8px;line-height:1.5;overflow:hidden;max-height:100%}\n.timeline-block-open,.timeline-block-mark{display:none}\n.timeline-block[data-density=compact] .timeline-block-content{padding:2px 6px}\n.timeline-block[data-density=compact] .timeline-block-copy{display:block;white-space:nowrap;text-overflow:ellipsis}\n.timeline-block[data-density=bar] .timeline-block-content{height:100%;padding:0;justify-content:center}\n.timeline-block[data-density=bar] .timeline-block-mark{display:block;text-align:center;line-height:0;font-size:14px}\n@container(max-width:120px){.timeline-block:not([data-density=bar]) .timeline-block-copy,.timeline-block .timeline-block-time{display:none}.timeline-block:not([data-density=bar]) .timeline-block-content{padding:2px}.timeline-block:not([data-density=bar]) .timeline-block-open{display:block;text-align:center;white-space:nowrap;font-size:.8em;line-height:1.5}}\n@container(max-width:64px){.timeline-block:not([data-density=bar]) .timeline-block-open{font-size:0}.timeline-block-open:after{content:'↗';font-size:14px}}\n.timeline-block-time{display:block;flex:none;font-size:.8em;line-height:1.4;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}\n.timeline-block-copy{display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;line-height:1.5}\n.timeline-block[data-source=no-activity]{border-inline-start-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1)}\n.dsh-timeline .timeline-return-now{position:absolute;z-index:6;inset-inline-end:18px;bottom:12px;display:flex;align-items:center;gap:6px;border:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);border-radius:24px;box-shadow:0 3px 16px color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);padding:7px 12px;font-size:11px}\n.timeline-detail-header{display:flex;align-items:center;gap:8px;margin:0 0 12px}\n.timeline-detail-header>h2{flex:1;min-width:0;font-size:1.05em}\n.timeline-detail-header>.timeline-icon-button{margin-inline-start:-6px}\n.timeline-detail-page>.timeline-details{margin:0;padding:0;border:0}\n.dsh-timeline[data-detail]{display:flex;flex-direction:column;overflow:hidden}\n.dsh-timeline[data-detail]>.timeline-panel-header,.dsh-timeline[data-detail]>.timeline-tabs{flex:none}\n.dsh-timeline[data-detail]>[role=tabpanel]{display:flex;flex-direction:column;flex:1;min-height:0}\n.timeline-detail-page,.timeline-detail-layout{display:flex;flex-direction:column;flex:1;min-height:0}\n.timeline-detail-layout>.timeline-detail-header{flex:none}\n.timeline-detail-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:0 2px 12px;scroll-padding-block:12px}\n.timeline-detail-actions{flex:none;padding-top:12px;border-top:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}\n.timeline-annotations{margin-top:20px;padding-top:16px;border-top:0.5px solid var(--dsw-alias-border-l1)}\n:is(.timeline-discussion-history,.timeline-task-history){margin-top:20px;border-top:1px solid var(--timeline-border);padding-top:10px}\n.timeline-discussion-history{margin-top:28px;border-top-width:2px}\n:is(.timeline-discussion-history,.timeline-task-history)>summary{width:fit-content;min-height:30px;padding:4px 6px;cursor:pointer;color:var(--dsw-alias-label-secondary);border-radius:var(--dsw-radius-md);transition:background-color 140ms ease,color 140ms ease}\n.timeline-task-history>.timeline-annotation-list{margin-top:12px!important}\n.timeline-discussion-history .timeline-annotations{margin-top:12px;padding-top:0;border:0}\n.timeline-discussion-history .timeline-annotations>h3{display:none}\n.timeline-annotation-target{font-size:.85em;font-weight:500;line-height:1.5;margin:0 0 8px!important}\n.timeline-annotations>h3{margin-bottom:12px;font-weight:500}\n.timeline-annotation-list{list-style:none!important;padding:0!important;margin:0!important;display:grid;gap:12px}\n.timeline-annotation{padding:12px;border:1px solid var(--timeline-border);border-radius:var(--dsw-radius-md)}\n.timeline-annotation-heading{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;font-size:.85em}\n.timeline-annotation-heading strong{font-weight:500}\n.timeline-annotation-heading time{flex:1;color:var(--dsw-alias-label-secondary);font-size:.9em}\n.timeline-annotation-heading [data-tone]{font-size:11px;white-space:nowrap}\n.timeline-annotation-reply{margin-top:12px;padding:10px 12px;border-inline-start:2px solid var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 4%,transparent);border-radius:var(--dsw-radius-md)}\n.timeline-annotation-editor{display:grid;gap:8px;margin-bottom:10px;padding:12px;animation:timeline-enter 160ms ease-out}\n.timeline-annotation-editor>label{font-size:.85em;color:var(--dsw-alias-label-secondary)}\n.timeline-annotation-editor textarea{width:100%;min-height:64px;max-height:min(24vh,180px);resize:vertical;border:0;border-radius:var(--dsw-radius-md);background:transparent;padding:6px 0;line-height:1.5}\n.dsh-timeline .timeline-annotation-editor textarea:focus-visible{outline:none}\n.timeline-annotation-editor:focus-within{outline:2px solid var(--dsw-alias-link);outline-offset:1px}\n.timeline-annotation-editor>div{display:flex;justify-content:flex-end;gap:8px}\n.timeline-annotation-count{margin-inline-end:auto;align-self:center;font-size:.8em;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}\n.timeline-report-note{font-size:.9em!important}\n.timeline-report-link{display:flex;align-items:center;gap:10px;width:100%;text-align:start;background:none;border:0;border-radius:var(--dsw-radius-md);padding:8px;min-height:36px}\n.timeline-report-link time{flex:none;font-size:.8em;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}\n.timeline-report-link>span:not(.timeline-level-dot){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.timeline-details{margin-top:12px;padding-top:8px;border-top:0.5px solid var(--dsw-alias-border-l1)}\n.timeline-details .timeline-heading{margin:4px 0 8px}\n.timeline-empty{padding:24px 16px;text-align:center;border:1.5px dashed var(--timeline-border);border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-secondary)}\n.timeline-summary{padding:16px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md)}\n.timeline-summary:has(.timeline-detail-header){border-top:3px solid var(--timeline-level)}\n.timeline-summary [data-section=uncertainties] h4{border-inline-start:3px solid var(--dsw-alias-state-warn-primary);padding-inline-start:8px}\n.timeline-summary [data-section=userActions] h4{border-inline-start:3px solid var(--dsw-alias-state-business-primary);padding-inline-start:8px}\n.timeline-details ul{padding-inline-start:20px;margin:4px 0}\n.timeline-details li{margin:6px 0}\n.timeline-report-meta{display:flex;flex-wrap:wrap;gap:6px 16px;color:var(--dsw-alias-label-secondary);font-size:.8em}\n.timeline-markdown{min-width:0;margin-block:8px}\n.timeline-settings{container-type:inline-size;height:auto;overflow:visible;padding:0 0 24px}\n.timeline-page-header{margin-block:0 16px}\n.timeline-page-title{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:0}\n.timeline-settings h2{font-size:16px;font-weight:500;margin:0}\n.timeline-settings h3{font-size:14px;font-weight:500;margin:0 0 12px}\n.timeline-settings-section{padding-block:20px;border-top:0.5px solid var(--dsw-alias-border-l1)}\n.timeline-settings-section>h2{margin-block-end:16px}\n.timeline-save-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-inline-start:auto}\n.timeline-save-actions>span{max-width:260px}\n.dsh-timeline .timeline-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);padding:8px 14px;border-radius:var(--dsw-radius-md);white-space:nowrap}\n.timeline-config-controls{display:flex;align-items:start;gap:24px 40px;flex-wrap:wrap}\n.timeline-setting,.timeline-switch-control{display:grid;gap:6px;font-size:.9em;min-width:0}\n.timeline-setting-label{display:flex;align-items:center;gap:6px}\n.timeline-option-help{display:inline-grid;place-items:center;flex:none;width:24px;height:24px;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:none;color:var(--dsw-alias-label-secondary)}\n.timeline-option-help:focus-visible{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}\n.timeline-switch-row{display:flex;align-items:center;min-height:max(34px,calc(1.5em + 14px))}\n.timeline-switch-control+.timeline-config-layout{margin-block-start:20px}\n.timeline-reminder-input{display:flex;align-items:center;gap:8px;white-space:nowrap}\n.timeline-task-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,9em),1fr));gap:8px;width:100%;margin:16px 0}\n.timeline-task-metrics div{display:grid;align-content:start;gap:6px;padding:12px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}\n.timeline-task-metrics dt{display:flex;align-items:center;gap:2px;color:var(--dsw-alias-label-secondary);font-size:.8em}\n.timeline-task-metrics dt>.timeline-estimate-help{margin-block:-4px}\n.timeline-task-metrics dd{margin:0;font-size:1.1em;font-weight:500;line-height:1.35;font-variant-numeric:tabular-nums}\n.dsh-timeline input[type=number]{width:88px;border:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);border-radius:var(--dsw-radius-md);padding:7px 8px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}\n.timeline-settings :is(input[type=number],select){height:max(34px,calc(1.5em + 14px));line-height:1.5;padding-block:6px}\n.timeline-config-layout{display:grid;grid-template-columns:minmax(300px,360px) minmax(0,1fr);gap:28px}\n.timeline-levels>p{margin-bottom:20px}\n.timeline-level-list{display:grid;gap:4px;container-type:inline-size}\n.timeline-level-row{display:grid;grid-template-columns:minmax(72px,1fr) auto 30px;align-items:center;gap:8px;position:relative;min-height:72px;border:1.25px solid var(--timeline-border);border-radius:var(--dsw-radius-md);padding:12px}\n.timeline-level-row:has(.timeline-level-choice[aria-pressed=true]){background:var(--dsw-alias-bg-layer-1);border-color:var(--timeline-level)}\n.timeline-level-choice{display:flex;align-items:center;gap:8px;width:100%;min-width:0;border:1px solid transparent;background:none;text-align:start;border-radius:var(--dsw-radius-md);padding:0}\n.timeline-global-choice{display:block;width:100%;min-height:72px;padding:12px 16px;margin:0 0 14px;border:1.25px solid var(--timeline-border);border-radius:var(--dsw-radius-md);background:none;text-align:start}\n.timeline-global-choice[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-link)}\n.timeline-global-choice strong,.timeline-global-choice small{display:block}\n.timeline-global-choice small{font-size:.78em;color:var(--dsw-alias-label-secondary);margin-top:3px}\n.timeline-period-input{display:flex;align-items:center;gap:4px;white-space:nowrap}\n.timeline-period-input input[type=number]{width:4.3em;min-width:0;padding:6px 4px}\n.timeline-period-input select{width:5.1em;padding:6px 4px;white-space:nowrap;flex:none}\n.dsh-timeline .timeline-delete{color:var(--dsw-alias-state-error-primary)}\n.timeline-add-level{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;border:1.5px dashed var(--timeline-border);border-radius:var(--dsw-radius-md);background:none;color:var(--dsw-alias-label-secondary)}\n.timeline-level-marker{display:flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;border:0.5px solid color-mix(in srgb,var(--timeline-level) 55%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--timeline-level) 10%,transparent);border-radius:50%;corner-shape:round;font-size:.8em;color:var(--dsw-alias-label-primary)}\n.timeline-level-choice strong,.timeline-level-choice small{display:block}\n.timeline-level-choice small{font-size:.78em;color:var(--dsw-alias-label-secondary);margin-top:2px}\n.timeline-prompt-editor{min-width:0}\n.timeline-prompt-editor .timeline-heading{margin-top:0;align-items:start}\n.timeline-prompt-editor textarea,.timeline-task-prompt textarea{display:block;width:100%;resize:vertical;line-height:1.65;border:0.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-base);padding:16px}\n.timeline-prompt-editor textarea{min-height:340px;margin-top:16px}\n.timeline-task-prompt{display:grid;gap:8px}\n.timeline-task-prompt .timeline-heading{margin:0;align-items:center}\n.timeline-task-prompt h2,.timeline-task-prompt>p{margin:0}\n.timeline-prompt-editor textarea::placeholder{color:var(--dsw-alias-label-secondary);opacity:.7}\n.timeline-prompt-foot{margin-top:10px;text-align:end;font-variant-numeric:tabular-nums}\n@container(max-width:720px){.timeline-config-layout{grid-template-columns:1fr;gap:24px}.timeline-level-list{grid-template-columns:repeat(auto-fit,minmax(min(100%,22em),1fr))}.timeline-prompt-editor textarea{min-height:260px}}\n@container(max-width:22em){.timeline-level-choice{grid-column:1/3}.timeline-period-input{grid-column:1/-1;grid-row:2}.timeline-level-row>.timeline-delete{grid-column:3;grid-row:1}}\n@media (hover: hover) {\n  .timeline-card-open:hover{background:var(--dsw-alias-interactive-bg-hover)!important;color:var(--dsw-alias-label-primary)!important}\n  .timeline-card-task:hover,.timeline-card-more:hover{background:var(--dsw-alias-interactive-bg-hover)}\n  .timeline-dock-bar:hover>.timeline-dock-highlight{opacity:1}\n  .timeline-dock .timeline-dock-toggle:hover:not(:disabled){background:transparent}\n  .timeline-dock-bar>.timeline-dock-remove:hover~.timeline-dock-highlight{opacity:0}\n  .timeline-progress[data-segmented]>[data-part]:hover{position:relative;z-index:1;filter:brightness(1.1);box-shadow:inset 0 0 0 1px var(--dsw-alias-label-primary)}\n  .dsh-timeline .timeline-task-action:hover{background:var(--dsw-alias-interactive-bg-hover)}\n  .dsh-timeline .timeline-playback:hover{background:color-mix(in srgb,currentColor 15%,transparent)}\n  .timeline-tree-picker select:hover{background:var(--dsw-alias-interactive-bg-hover)}\n  .dsh-timeline .timeline-icon-button:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}\n  .timeline-task:hover{background:var(--dsw-alias-bg-layer-1)}\n  .timeline-block:hover{background:color-mix(in srgb,var(--timeline-level) 13%,var(--dsw-alias-bg-base))}\n  :is(.timeline-discussion-history,.timeline-task-history)>summary:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}\n  .timeline-report-link:hover{background:var(--dsw-alias-bg-layer-1)}\n  .timeline-option-help:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}\n  .dsh-timeline .timeline-delete:hover{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,currentColor 8%,transparent)}\n  .timeline-add-level:hover{border-color:var(--dsw-alias-link);color:var(--dsw-alias-link);background:var(--dsw-alias-bg-layer-1)}\n}\n@media(prefers-reduced-motion:reduce){:is(.dsh-timeline,.timeline-dock,.timeline-tool-update),:is(.dsh-timeline,.timeline-dock,.timeline-tool-update) *,:is(.dsh-timeline,.timeline-dock,.timeline-tool-update) *::before,:is(.dsh-timeline,.timeline-dock,.timeline-tool-update) *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}\n" } } }),
})
