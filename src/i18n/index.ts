import { moment } from "obsidian";

const en = {
  pluginName: "SnapTo",

  cmdMatchNow: "Match current results now",
  cmdToggleAutoMatch: "Toggle auto match",
  cmdSelectResult: "Select result {n}",

  headingGeneral: "SnapTo",
  generalDesc:
    "Pick how SnapTo reacts to the result list. Auto match only ever moves the highlight unless you ask it to confirm.",

  autoMatchName: "Auto match after typing stops",
  autoMatchDesc: "Watch the result list and act once it settles. No effect while a result is already selected by hand.",

  autoMatchActionName: "When a match is found",
  autoMatchActionDesc:
    "Highlight only moves the selection cursor. Confirm selection opens the item, which is never done for prefix or partial matches.",
  autoMatchHighlight: "Highlight only",
  autoMatchConfirm: "Confirm selection",

  delayName: "Idle delay",
  delayDesc: "Milliseconds to wait after the result list stops changing. Lower feels faster but reacts to half-typed queries.",

  matchLevelName: "Minimum match strength",
  matchLevelDesc: "Weakest match that still counts as a hit.",
  levelExact: "Exact only",
  levelNormalized: "Normalized (ignore case, width, spaces)",
  levelPrefix: "Prefix",
  levelContains: "Contains",
  levelFuzzy: "Fuzzy (token order ignored)",

  conflictName: "Several equally good matches",
  conflictDesc: "What to do when more than one result matches with the same strength.",
  conflictUnique: "Do nothing (recommended)",
  conflictFirst: "Take the strongest match",
  conflictLast: "Take the weakest match",
  conflictNone: "Never act",

  headingQuickSelect: "Quick select",
  quickSelectName: "Enable number shortcuts",
  quickSelectDesc:
    "Press the modifier plus 1-9 to pick a result. Only active while a search surface is open, so typing in a note is unaffected.",
  modifierName: "Modifier key",
  modifierDesc: "Cmd on macOS and Ctrl elsewhere by default. Alt is unreliable on Windows: some layouts remap it to a character.",
  modifierMod: "Mod (Cmd / Ctrl)",
  modifierCtrl: "Ctrl",
  modifierAlt: "Alt",
  modifierMeta: "Cmd / Meta",

  badgeName: "Show result numbers",
  badgeDesc: "A small digit next to the first nine results.",
  badgeStyleName: "When to show numbers",
  badgeStyleDesc: "Showing them only while the modifier is held keeps the list quiet.",
  badgeOnModifier: "While the modifier is held",
  badgeAlways: "Always",

  headingScenes: "Scenes",
  scenesDesc: "Turn individual search surfaces off. Every scene keeps working natively when disabled.",
  sceneQuickSwitcher: "Quick switcher",
  sceneQuickSwitcherDesc: "Modals whose results are files, including the quick switcher itself.",
  sceneCommandPalette: "Command palette",
  sceneCommandPaletteDesc: "Modals whose results are commands.",
  scenePluginModal: "Other plugin dialogs",
  scenePluginModalDesc: "Any other suggestion modal built on the standard Obsidian modal.",
  sceneEditorSuggest: "Editor suggestions",
  sceneEditorSuggestDesc: "Tag, link and property popups inside the editor.",
  scenePopoverSuggest: "Popup suggestions",
  scenePopoverSuggestDesc: "Suggestion lists attached to an input field.",

  headingMatching: "Matching rules",
  matchingDesc: "Applied before comparing a query with a result.",
  normalizeWidthName: "Treat full-width and half-width as equal",
  normalizeWidthDesc: "A full-width colon, digit or bracket matches its half-width counterpart.",
  ignoreCaseName: "Ignore letter case",
  ignoreCaseDesc: "",
  ignoreSeparatorsName: "Ignore spaces, hyphens and dots",
  ignoreSeparatorsDesc:
    "`my-note` matches `my note`. It also flattens every match to the normalized level, because the separators are gone before the comparison.",

  headingAdvanced: "Troubleshooting",
  debugName: "Debug logging",
  debugDesc: "Write match decisions to the developer console. Nothing leaves your machine.",

  noticeAutoMatchOn: "Auto match enabled",
  noticeAutoMatchOff: "Auto match paused",
  noticeNoContext: "No supported search is open",
} as const;

const zh: Record<keyof typeof en, string> = {
  pluginName: "SnapTo",

  cmdMatchNow: "立即匹配当前结果",
  cmdToggleAutoMatch: "切换自动匹配",
  cmdSelectResult: "选择第 {n} 项结果",

  headingGeneral: "SnapTo",
  generalDesc: "设置 SnapTo 如何响应结果列表。自动匹配默认只移动选中项，确认选择需要你明确开启。",

  autoMatchName: "停止输入后自动匹配",
  autoMatchDesc: "监听结果列表，等它稳定后再动作。你已经手动选中的结果不会被改动。",

  autoMatchActionName: "匹配到结果时",
  autoMatchActionDesc:
    "「只高亮」仅移动选中项。「确认选择」会打开结果，且只在完全匹配时生效，前缀和部分匹配不会触发。",
  autoMatchHighlight: "只高亮",
  autoMatchConfirm: "确认选择",

  delayName: "空闲延迟",
  delayDesc: "结果列表停止变化后等待的毫秒数。调小更快，但会对打到一半的关键词反应。",

  matchLevelName: "最低匹配强度",
  matchLevelDesc: "低于这一等级的结果不算命中。",
  levelExact: "仅完全匹配",
  levelNormalized: "规范化匹配（忽略大小写、全半角、空格）",
  levelPrefix: "前缀匹配",
  levelContains: "包含匹配",
  levelFuzzy: "模糊匹配（允许字符跳跃）",

  conflictName: "多个结果同样匹配",
  conflictDesc: "多个结果的匹配强度相同时如何处理。",
  conflictUnique: "不动作（推荐）",
  conflictFirst: "取匹配最强的一个",
  conflictLast: "取匹配最弱的一个",
  conflictNone: "从不自动动作",

  headingQuickSelect: "快捷键选择",
  quickSelectName: "启用数字快捷键",
  quickSelectDesc:
    "按修饰键加 1-9 选择对应结果。只在搜索界面打开时生效，正常编辑笔记不受影响。",
  modifierName: "修饰键",
  modifierDesc: "默认 macOS 用 Cmd，其他平台用 Ctrl。Windows 上 Alt 不可靠，部分键盘布局会把它变成字符。",
  modifierMod: "Mod（Cmd / Ctrl）",
  modifierCtrl: "Ctrl",
  modifierAlt: "Alt",
  modifierMeta: "Cmd / Meta",

  badgeName: "显示结果序号",
  badgeDesc: "在前九个结果右侧显示一个小数字。",
  badgeStyleName: "序号显示时机",
  badgeStyleDesc: "只在按住修饰键时显示，列表更干净。",
  badgeOnModifier: "按住修饰键时",
  badgeAlways: "始终显示",

  headingScenes: "场景",
  scenesDesc: "单独关闭某个搜索入口。关闭后该入口完全按原生方式工作。",
  sceneQuickSwitcher: "快速切换",
  sceneQuickSwitcherDesc: "结果是文件的弹窗，包括快速切换本身。",
  sceneCommandPalette: "命令面板",
  sceneCommandPaletteDesc: "结果是命令的弹窗。",
  scenePluginModal: "其他插件弹窗",
  scenePluginModalDesc: "基于标准 Obsidian 弹窗的其他建议列表。",
  sceneEditorSuggest: "编辑器建议",
  sceneEditorSuggestDesc: "编辑器内的标签、链接、属性补全。",
  scenePopoverSuggest: "输入框建议",
  scenePopoverSuggestDesc: "挂在输入框下方的建议列表。",

  headingMatching: "匹配规则",
  matchingDesc: "在比较关键词和结果之前生效。",
  normalizeWidthName: "全角与半角视为相同",
  normalizeWidthDesc: "全角冒号、数字、括号可以匹配对应的半角字符。",
  ignoreCaseName: "忽略字母大小写",
  ignoreCaseDesc: "",
  ignoreSeparatorsName: "忽略空格、连字符和点",
  ignoreSeparatorsDesc:
    "`my-note` 可以匹配 `my note`。它同时把所有匹配都压平到规范化一档，因为分隔符在比较之前就被去掉了。",

  headingAdvanced: "排查",
  debugName: "调试日志",
  debugDesc: "把匹配决策写进开发者控制台。数据不会离开本机。",

  noticeAutoMatchOn: "自动匹配已开启",
  noticeAutoMatchOff: "自动匹配已暂停",
  noticeNoContext: "当前没有受支持的搜索界面",
};

const localeMap: Record<string, Partial<Record<keyof typeof en, string>>> = {
  en,
  zh,
  "zh-cn": zh,
  "zh-tw": zh,
};

type Key = keyof typeof en;

function dictionary(): Partial<Record<Key, string>> {
  const locale = moment.locale();
  return localeMap[locale] ?? localeMap[locale.split("-")[0] ?? ""] ?? en;
}

/** Translate a key, substituting `{name}` placeholders. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const dict = dictionary();
  let text: string = dict[key] ?? en[key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
