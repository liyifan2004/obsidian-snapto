# 开发任务 · 2026-11-13 第二轮 · 状态一致性与证据纠偏

基线：`e10a4db`（0.1.1，7 个 commit）。来源：独立技术复核。

---

## 复核结论

独立复跑：`npx vitest run` 115/115 全绿、`tsc --noEmit` 0、`eslint .` 0 error / 1 warning、`npm run build` 成功。开发 Agent 的验收数字属实。

**做得好的两件事，保留不动**：

1. 自己抓到 `readInputValue` 里的第四处 `instanceof`，并且单独成一个 `fix` commit 而没有 amend。这比把发现塞进 T3 里更利于回溯。
2. `SurfaceBinder` 的抽取是真的为了可测，不是为了分层好看。

**但这轮引入了一个新功能缺陷，并且有两处证据不成立。交叉复核又补出四处编排层问题（F8–F11），见下方专节。**

### F1（高）场景开关关掉后，下一次按键就复活

`main.ts:41-45` 的 `onReuse` 无条件调用 `syncContext` + `refreshBadges`。`ShortcutManager.sync` 只看 `settings.quickSelectEnabled`，不看 scene；`register()` 的签名和 `dispose()` 之后的空状态不同，于是重新注册 9 个 handler。`refreshBadges` 同理把序号画回来。

而 `onSettingsChanged`（`main.ts:105-116`）在关掉 scene 时 `shortcuts.dispose` + `autoMatch.unwatch` + `badges.clear`，这个效果只维持到用户敲下一个键（下一次 `open()` → `onReuse`）。

临时探针实测（`ShortcutManager` + 真实调用序列）：`sync → dispose → sync` 后 `count()` 从 0 回到 1。探针文件已删除，工作区干净。

**关掉再打开同一个 scene 更糟**：`onReuse` 不调用 `autoMatch.watch`，`onSettingsChanged` 的启用分支也不调用；watcher 被 `unwatch` 之后永远不会重建，自动匹配一直失效到该界面关闭重开。`SurfaceBinder.test.ts:140` 的 "ignores a scene that settings disabled" 用的是 `makeBinder(false)`（从一开始就禁用），完全没有覆盖「运行中切换设置」。

`ROADMAP.md` 把 "Scene toggles apply to already-open surfaces" 标成 Done，只对了一半。

### F2（中）命令绕过场景开关

`select-result-N` 的 `checkCallback`（`main.ts:223-231`）只检查有没有 active context、序号有没有越界，不检查 `settings.scenes[active.scene]`。关掉 scene 后，这 9 个命令仍然能提交。`match-now` 因为走 `buildConfig`，是挡住的。

### F3（高，证据质量）runtime-check 的去重断言测错了界面

`scripts/runtime-check.mjs:145-162` 对 `.prompt-input`（快速切换）连打三次再断言 `contexts === 1`。快速切换是 `SuggestModal`，输入走 `onInput → updateSuggestions`，**不会**再调用 `open()`。也就是说这条断言在 0.1.0 上照样通过，抓不到它声称要防的 bug。

真正的重复发生在 `PopoverSuggest` 子类（每键 `showSuggestions() → updatePosition() → open()`）。`docs/DEVELOPMENT.md` 却写「duplicate contexts per keystroke … now have a regression test plus a runtime assertion」——单测有，运行时断言名不副实。

我在 1.15.1 bundle 里找到了第一方、无需装插件的 `AbstractInputSuggest` 入口，见 U2。

### F4（中）文档与实现不符（4 处）

| 位置 | 问题 |
| --- | --- |
| `docs/API_COMPATIBILITY.md:28` | 仍列 `HTMLElement.instanceOf()`「Cross-window type checks in popouts」。T3 之后 `src/` 里 `instanceOf` 出现 **0 次**。我上一轮已要求「按实际使用保留或删除」，没执行 |
| `README.md:12` / `README.zh.md:14` | 把「其他插件打开的建议弹窗」列在「已实测可用」。`FEATURE_MATRIX.md:24` 写的是 "no third-party modal exercised"，`:74` 也把它列进未验证 |
| `docs/ARCHITECTURE.md` | 完全没更新：`:36` 还在写 `onSurfaceOpen(...)`，没有 `SurfaceBinder`、`findByHost`、多文档 tracker、场景状态收敛 |
| `docs/ROADMAP.md` | 见 F1；另外 "Later: global search, see 0008" 应改成 0012 |

### F5（中）ModifierTracker 的 document 只增不减

`ModifierTracker.ts:43` 的 `docs: Set<Document>` 没有 `detachDocument`。popout 关掉后，`Document` 仍被强引用；每次按下修饰键还会对已关闭窗口的 `doc.body` 调 `toggleClass`（`:112`）。`test/ModifierTracker.test.ts` 的 8 个用例里没有窗口关闭。

### F6（低）T2 的取舍代价没有记录

`HostPatcher` 在别人后来包了一层时保留链条，代价是：插件每次重载会多留一个 inactive 透明层。这个取舍是对的，**不修**，但要写进 ADR，别让下一个人误以为是泄漏。

### F7（低）死代码仍在

`SearchContextManager.subscribe/emit/ContextListener`、`types/index.ts` 的 `SearchAdapter` 全项目没有调用者。上一轮已经点过，本轮继续留着。

---

## 交叉复核补充（独立审查者，只读）

我另起了一个只读复核 Agent 对同一批文件独立审查。它确认了 F1–F5，并补出以下四点。以下为我核对后采纳的内容；没有采纳的，在末尾单列。

### F8（高）根因比 F1 更靠上一层

`SurfaceBinder.ts:33-37` 的复用分支在 `isSceneEnabled`（`:49`）之前就 return，等于**复用路径完全绕过场景开关**。这是 F1 的结构性根因，不只是 `onReuse` 少判断一次。U1 的收敛方案必须把 scene 判断放进 `bind()` 每次都会走到的地方。

另外 `onSettingsChanged` 关场景时没有 `contexts.remove`（对比 `pruneDead` `:155`），禁用的 context 会一直留在 registry，`active()`（`SearchContextManager.ts:74-82`）持续把它交出去，污染 `noteNavigation`（`main.ts:176`）、`match-now`（`:188`）和九条命令（`:224`）。

### F9（中）`toggle-auto-match` 命令不触发设置同步

`main.ts:206-216` 直接改 `this.settings.autoMatchEnabled` 再 `saveSettings()`，没有调 `onSettingsChanged`（全项目唯一调用点是 `SettingsTab.ts:67`）。`buildConfig` 每次 schedule 都重新读设置，所以主路径碰巧还有效；但「从关切成开」时当前列表不会重新调度，要等下一次按键才有反应。

### F10（中）自动确认的 watcher 也是一次性的

`AutoMatchManager.evaluate` 在 confirm 成功后 `unwatch(context.id)`（`:147`），而 `autoMatch.watch` 全项目唯一调用点是 `onAttach`（`main.ts:38`）。对关窗的模态无影响；但对确认后不关闭的第三方 popover，自动匹配此后永久失效。**U1 的幂等 reconcile 会顺带修掉这条**，因为每次复用都会调 `watch`。

### F11（中）`isAlive` 把「暂时没有结果」当成「界面已死」

`SuggestionContext.ts:185` 要求 `values.length > 0`。查询打到无结果时宿主仍开着，但 `findByHost` / `active()` / `pruneDead` 全部失效；结果回来后新建 context、id 漂移。`evaluate` 里的 `if (!context.isAlive()) this.unwatch()`（`:100-102`）也因此在空结果时把 watcher 拆掉。

### 覆盖盲区

13 个测试文件没有任何一个 `import main.ts`。编排层的状态机完全没测，这才是 115 全绿却漏掉 F1/F2/F9 的原因。

### 两处升级与一处不采纳

- **升级为确认**：复核者把「快速切换输入不会重调 `open()`」标为推测。我在 1.15.1 bundle 里读到 `qh` 的 `onOpen()` → `updateSuggestions()`，以及 `inputEl.addEventListener("input", this.onInput)` → `onInput` → `updateSuggestions()`，全程没有 `open()`。F3 可以定为确凿。
- **不采纳**：「popout 里没有 suggest 界面时方向键 / badge class 不生效」不是缺陷。没有界面就没有需要跟踪的状态，按设计如此，不为此加代码。

---

## 本轮决策（已定稿，无需确认）

| 编号 | 决策 | 理由 |
| --- | --- | --- |
| D5 | F1 用**一个幂等 reconcile** 收敛，不补三处补丁 | 三个分支各自维护「快捷键 / watcher / 徽章」的状态，正是这类不一致的来源。让每个动作自己把 scene 算进 enabled，就没有「关了要记得再开」这回事 |
| D6 | runtime-check 的去重断言改用第一方 `AbstractInputSuggest` 场景，不装第三方插件 | 确定性、可重复、零外部依赖；顺带把「未验证」清单清掉一项 |
| D7 | 浅色主题本轮做掉 | 拖了两轮，成本只有一次截图 + 对比度检查 |
| D8 | README 把第三方弹窗降级为「同一套代码路径，未实测」；不为凑数装插件，第三方弹窗留 0.2 | 撒谎比少写一条更贵 |
| D9 | `Plugin.onExternalSettingsChange` 本轮顺手实现 | 三行代码，roadmap 挂了两轮 |
| D10 | HostPatcher 重载累积不修，写进 ADR | 为一个 no-op 函数引入检测机制不划算 |
| D11 | 删掉 F7 的死代码 | 不再留「将来可能用」的抽象 |
| D12 | `isDesktopOnly` / `minAppVersion` / `contains` 门槛不动 | 上轮已定稿，没有新证据 |
| D13 | 禁用场景的 context **保留在 registry**，但新增 `activeEnabledContext()` 门控所有命令与 `noteNavigation` | 复核者建议「禁用时 remove」。我不采纳：remove 之后重新启用要等一次新的 `open()`，而模态输入不会重调 `open()`，快捷键就回不来了。保留 context + 门控消费者，两边都成立 |
| D14 | `isAlive()` 改为只看 `containerEl.isConnected`；空 values 是正常的瞬时状态 | 根因修法，不再让「暂时没结果」拆掉 watcher、漂移 id。`evaluate` 里保留 `candidates.length === 0` 提前返回 |
| D15 | 补 `main.ts` 编排层集成测试，不做更多孤立单测 | 13 个测试文件没有一个 import main.ts，这是 115 全绿仍漏掉 F1/F2/F9 的真正原因 |
| D16 | `toggle-auto-match` 命令补 `onSettingsChanged()` | 消除「设置改了但不走同步」这条旁路 |

---

## U1 用一个幂等 reconcile 收敛界面状态（阻塞级）

### 实现要求

1. `main.ts` 加一个方法，所有入口都调它：

```ts
private reconcile(context: SuggestionContext): void {
  const sceneOn = this.settings.scenes[context.scene]?.enabled === true;
  this.tracker?.attachDocument(context.containerEl.ownerDocument);
  this.syncContext(context, sceneOn);
  this.refreshBadges(context, sceneOn);
  this.autoMatch?.watch(context);   // 幂等；buildConfig 已经按 scene 返回 null
}
```

2. `syncContext(context, sceneOn)` 里 `enabled: this.settings.quickSelectEnabled && sceneOn`。`ShortcutManager.sync` 在 `enabled: false` 时会自己 unregister，不需要外部 `dispose`。
3. `refreshBadges(context, sceneOn)`：`if (this.settings.showBadges && sceneOn) apply() else clear()`。
4. **删掉** `onSettingsChanged` 里的 dispose / unwatch / clear 分支，改成 `for (const c of this.contexts.all()) this.reconcile(c)`。
5. `SurfaceBinder` 的 `onAttach` / `onReuse` 合并为一个 `onBind(context)`（两者现在做同一件事）。`bind()` 里 reuse 和 first-attach 都调它。
6. 命令门禁：`match-now` 和两个 `select-result-N` 的 callback / checkCallback 开头加 `if (!this.settings.scenes[active.scene]?.enabled) return false;`。`match-now` 是 `callback`，改成提前 return 加 `Notice` 或直接静默返回，二选一，与 `noticeNoContext` 的体验保持一致。
7. `buildConfig` 保持现状（已经按 scene 返回 null）。**不要**在 reconcile 里对禁用场景 `unwatch`——除非你同时保证启用时必定 `watch`，否则又会写出 F1 的第二半。
8. `SurfaceBinder.bind()` 的复用分支也必须经过 scene 判断（`SurfaceBinder.ts:33-37` 现在在 `isSceneEnabled` `:49` 之前 return）。把 `isSceneEnabled` 检查提到 `findByHost` 之前，或让 `onBind` 自己处理；二选一，但**不能**只改 `main.ts`。
9. 新增 `activeEnabledContext()`：取 `contexts.active()`，再判 `settings.scenes[scene]?.enabled`，不满足返回 null。`match-now`、`select-result-N`、`noteNavigation` 全部改用它。这样禁用场景的 context 留在 registry 里（保证重新启用时即时生效），却不会污染任何消费方。
10. `SuggestionContext.isAlive()` 改为只返回 `containerEl.isConnected`。`AutoMatchManager.evaluate` 里保留 `candidates.length === 0` 提前返回，但把 `!isAlive()` 分支的 `unwatch` 保留（现在只会在容器真被移除时触发）。同步修改 `SuggestionContext.test.ts:163` 的 "goes dead when the list empties"——新语义是「空结果仍活着」。
11. `toggle-auto-match` 命令在改完 settings 后调 `onSettingsChanged()`。

### 测试（新增 ≥ 5 条，见 U8 的集成测试要求）

| 场景 | 断言 |
| --- | --- |
| scene 关 → 再触发一次 `bind`（模拟下一次按键） | `shortcuts.count() === 0`、无 badge、auto-match 不动作 |
| scene 关 → 开 → 界面仍开着 | 快捷键回来、badge 回来、自动匹配恢复 |
| scene 关 → `select-result-N` 的 `checkCallback(true)` | 返回 false |
| scene 关 → `match-now` | 不提交、不改动选中项 |
| `quickSelectEnabled` 关 → 开，scene 保持开 | 快捷键回来 |

这些要用真实的 `main.ts` 路径或 `SurfaceBinder` + 真实 manager 组合，不要只断言一个布尔值。

---

## U2 runtime-check 换到真实的 `AbstractInputSuggest`

### 可达入口（我从 1.15.1 bundle 里查到，第一方，无需装插件）

`app.js` 里 `Files & Links` 设置页的「Attachment folder path」输入框挂的是 `new jp(this.app, inputEl, false, true)`，`jp` → `B4` → `Jo` → `Ol`（`PopoverSuggest`），带 `textInputEl`，每键调用 `open()`。

CDP 里的准备动作：

```js
app.vault.setConfig("attachmentFolderPath", "Inbox");  // 让 d() === "folder"
// 然后打开 Settings → Files & Links（设置页是独立 CDP target，按已有流程切）
```

另一个可选入口：笔记 Properties 视图里 `type: file` 的属性值编辑器（`new qp(app, inputEl)`，`suggestEl` 带 `mod-property-value`）。用它顺带把「tag / property 弹层未验证」也清掉。

### 实现要求

1. 把现有的 "one context after repeated input" 断言从 `.prompt-input` 移到这个输入框：连打 3 个字符，断言 `contexts.size() === 1`、`shortcuts.count() === 1`、`autoMatch.count() === 1`。
2. **保留** quick switcher 的原有断言（它仍然有用，但改名，别叫 dedupe）。
3. 加一条：该输入框里 `Ctrl+2` 选中预期项；以及一条自动匹配断言（`textInputEl.value` 可用，所以这里能跑自动匹配）。
4. 断言要能区分场景：检查 `active().scene === "popover-suggest"`，否则脚本可能在设置页里抓到别的 context 而误判通过。
5. 在 `FEATURE_MATRIX.md` 的 Runtime verification log 里写明用的是哪个入口。

### 验收

把 `contexts.size()` 的断言临时改成 `=== 2`（或用 git stash 回到 `0262253^`）必须能让它失败。做不到就说明测的还是错的界面，继续改。

---

## U3 文档纠偏

1. `docs/ARCHITECTURE.md` 按当前代码重写：模块树补 `SurfaceBinder`；「Opening a list」的数据流改成 `HostPatcher → SurfaceBinder.bind → findByHost → (reuse | attach) → reconcile`；补一小节说明 popout 的多文档 tracker；补一小节说明场景状态由 `reconcile` 单点收敛。
2. `docs/API_COMPATIBILITY.md` 删掉 `HTMLElement.instanceOf()` 那一行，或改成「1.15.1 实测跨 realm 恒为 false，现改用鸭子类型」。
3. `README.md` / `README.zh.md`：「已实测」列表删掉第三方插件弹窗，改成单独一句「其他插件基于标准弹窗的建议列表走同一套代码路径，尚未实测」。
4. `docs/DEVELOPMENT.md`：删掉「duplicate contexts … plus a runtime assertion」这句话，改成如实描述 U2 新增的入口。
5. `docs/ROADMAP.md`：0.1.1 的 "Scene toggles apply to already-open surfaces" 改为 "immediate disable only (0.1.2 fixes the state drift)"，或直接移到 0.1.2 Done 段；`Later` 的全局搜索引用改成 0012。
6. `docs/TECHNICAL_DECISIONS.md` 新增 `0013`：记录 D5（幂等 reconcile 取代三处分支）与 D10（HostPatcher 重载累积是已知取舍，不修）。
7. `CHANGELOG.md` 加 `0.1.2`，把 F1 写成 "turning a scene off now stays off"，不要写成 "improved state handling"。

---

## U4 ModifierTracker 释放已关闭窗口

1. 加 `detachDocument(doc: Document)`：移除三个监听、清 body class、从 `docs` 删除。
2. `attachDocument` 里给该 window 加一次 `pagehide` 监听，触发时 `detachDocument(doc)`。**只用浏览器标准事件，不要引入未确认的 Obsidian workspace API。**
3. 若实机验证 `pagehide` 在 Electron popout 上不触发：不猜别的机制，把结果写进 `FEATURE_MATRIX` 的 Environment 表，接受这个低量级泄漏，并在 ADR 0013 里注明。
4. 新增测试：attach 两个 doc，detach 一个，`documentCount() === 1`，剩余 doc 仍正常响应；`stop()` 后为 0。

---

## U5 浅色主题实测

1. 隔离实例切到浅色主题，打开快速切换，按住修饰键截图。
2. 检查序号与 `.suggestion-title` 的对比度、序号是否挤压或换行、被选中行的序号是否仍可读。
3. 结论写进 `FEATURE_MATRIX` 的 Environment 表（把 "Light theme: Not verified" 改掉）。截图放 `docs/` 或写明留存位置。

---

## U6 设置外部变更

```ts
async onExternalSettingsChange(): Promise<void> {
  await this.loadSettings();
  this.onSettingsChanged();
}
```

注意 `loadSettings` 会替换整个 `settings` 对象，之后必须走 `reconcile` 让已打开的界面跟着改。加一条测试：外部改了 modifier 后，live context 的快捷键签名更新。

---

## U7 删除死代码

删 `SearchContextManager` 的 `listeners` / `subscribe` / `emit` / `ContextListener`、`:39-50` 的 `prune()`（无人调用，且与 `main.ts` 的 `pruneDead()` 是两套不一致的清理逻辑），以及 `types/index.ts` 的 `SearchAdapter`。`add/remove/clear` 里的 `emit()` 调用一并清掉。确认 `npm run verify` 仍全绿。

---

## U8 编排层集成测试（补覆盖盲区）

新建 `test/main.test.ts`，**import 真实的 `src/main.ts`**，不是把逻辑复制一遍再测。

1. 扩展 `test/mocks/obsidian.ts` 的 `Plugin` 基类，补最小实现：`constructor(app, manifest)`、`loadData()/saveData()`、`addSettingTab()`、`addCommand()`、`app`。`test/setup/obsidian-dom.ts` 里设 `globalThis.activeDocument = document`（`main.ts:65` 需要它）。
2. 用例必须覆盖真实状态机：
   - `onload()` → 打开一个宿主 → 改 `settings.scenes` → `onSettingsChanged()` → 再次 `bind` 同一宿主 → 断言快捷键为 0、无徽章、命令不可用；
   - 再把 scene 打开 → `onSettingsChanged()` → 断言快捷键、徽章、自动匹配 watcher 全回来；
   - `toggle-auto-match` 命令执行后，live context 的配置同步；
   - 空结果（`values = []`，容器仍在 DOM）→ `isAlive()` 为 true、`contexts.size()` 不变。
3. 这些用例在**当前代码上必须失败**，才说明测到了真东西。记录一次失败输出作为证据。
4. 不要为测试新增生产抽象；`SurfaceBinder` 已经是可测的接缝，这里只补编排层。

---

## 全局约束

- 不加全局 keydown，不改宿主 scope 绑定策略，不动 `MatchEngine`。
- 不引入新的接口层；U1 是**减少**分支和回调，不是加抽象。
- 不为了「看起来完整」把未验证的东西写成已验证。
- 沿用 conventional commit 前缀，一个主题一个 commit，每次 commit 前 `npm run verify`。

## 本轮验收

1. `npm run verify`：0 error，warning ≤ 1。
2. 用例 115 → ≥ 125，全绿；U8 的编排层用例须有「在当前代码上失败」的记录。
3. `runtime-check`：check 数 ≥ 11，退出码 0；U2 的「故意改断言必失败」验证已做过并记录。
4. 浅色主题、`AbstractInputSuggest`、tag/property 三项结论都进了 `FEATURE_MATRIX`。
5. `docs/ARCHITECTURE.md` 已按现状重写；`API_COMPATIBILITY` / README 中英 / `DEVELOPMENT` / `ROADMAP` 的不实描述全部清掉。
6. `git status` 干净，commit 5-7 个。

## 风险

- U1 让禁用场景保留一个空转的 MutationObserver。`buildConfig` 返回 null 时 `schedule()` 会直接 return，没有副作用；如果你选择改成 `unwatch`，必须同时处理双向恢复，别重犯 F1。
- U2 的设置页是独立 CDP target，且输入框只有在 `attachmentFolderPath` 既非 `/` 也非 `./` 前缀时才渲染。脚本里要显式断言 `input` 存在，缺了就报失败，不要静默跳过。
- U4 的 `pagehide` 在 Electron popout 的触发时机未验证，先实测再决定是否接入生产代码。
