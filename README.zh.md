[English](README.md) | 简体中文

# SnapTo

用数字键直接选 Obsidian 搜索弹窗里的结果；停止输入后，完全匹配的结果会自己选中。

SnapTo 不新增搜索框。它作用在 Obsidian 已有的建议列表上：快速切换、命令面板、标签与链接补全，以及其他插件打开的建议弹窗。

## 它做什么

**数字快捷键。** 按 `Ctrl`（macOS 是 `Cmd`）加 `1`-`9` 选对应结果。只有建议列表打开时这些键才生效，在笔记里 `Ctrl+1` 保持原样。

**自动匹配。** 列表停止变化 1 秒后，SnapTo 拿关键词和列表逐行比较，把选中项移到最匹配的一行。有两条是有意为之：

- 默认只移动选中项。确认选择需要手动开启，而且只在完全匹配或规范化匹配时才生效。输入 `note` 不会打开 `notebook.md`。
- 多个结果匹配强度相同时，它什么都不做。不同文件夹里同名文件太常见，猜一个会让插件显得不可靠。

**结果序号。** 按住修饰键时，前九行右侧显示一个小数字。数字始终占位（只是不可见），列表不会因此跳动。

## 它不做什么

- 不支持全局搜索面板。那个面板没有可供驱动的选中模型，详见 [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md)。
- 不支持笔记内查找（`Ctrl+F`）。它高亮的是正文文字，不是结果列表。
- 不支持原生大纲搜索。Obsidian 的大纲是个视图，不是搜索框。

各入口的实际情况与验证方式见 [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md)。

## 安装

插件进入社区目录之前：

1. 从最新 release 下载 `main.js`、`manifest.json`、`styles.css`。
2. 放进 `<vault>/.obsidian/plugins/snapto/`。
3. 在 设置 → 第三方插件 里启用 **SnapTo**。

需要 Obsidian 1.5.0 及以上。桌面端是实测目标；代码没有用 Node.js API，设置页在移动端也可用，但触摸操作尚未验证。

## 设置

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| 自动匹配 | 开 | 监听结果列表，不是输入框。 |
| 匹配到结果时 | 只高亮 | 「确认选择」只对完全匹配和规范化匹配生效。 |
| 空闲延迟 | 1000 毫秒 | 范围 200-5000。 |
| 最低匹配强度 | 包含 | 完全 → 规范化 → 前缀 → 包含 → 模糊。 |
| 多个结果同样匹配 | 不动作 | 也可取第一个 / 最后一个，或从不动作。 |
| 修饰键 | Mod（Cmd / Ctrl） | Windows 上 Alt 不可靠。 |
| 场景 | 全开 | 按入口单独开关。关闭后该入口与原生完全一致。 |

`Mod` 在 macOS 上是 Cmd，其他平台是 Ctrl。

## 隐私

SnapTo 完全在本机运行。不上传任何内容，没有遥测，不扫描整个库，只把自己的设置写进 `data.json`。

## 开发

```bash
npm install
npm run dev        # 监听构建
npm run verify     # 类型检查 + 测试 + lint + 构建
npm run sync "D:/MyNotes/Test"   # 把构建产物复制进库
```

每次提交前跑 `npm run verify`。目录结构与调试流程见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 致谢

「把数字键绑到界面自己的 keymap scope 上」这个思路来自 [Quick Select](https://github.com/itsonlyjames/obsidian-quick-select)（MIT）。没有复制代码，设计取舍记录在 [docs/TECHNICAL_DECISIONS.md](docs/TECHNICAL_DECISIONS.md)。

## 许可

MIT
