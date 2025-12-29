# format-ts-cli

一个简单、免配置的命令行工具，用于格式化指定目录下的所有 `*.ts`, `*.tsx`, 和 `*.js` 文件。它利用 [TypeScript Language Service API](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API) 提供与 VS Code 编辑器内置格式化功能一致的体验。

这个项目的灵感来自于 [microsoft/typescript-go](https://github.com/microsoft/typescript-go)，它展示了如何利用语言服务实现强大的代码分析功能。本项目将其中的格式化思想应用于一个独立的 Node.js CLI 工具中。

## 功能特性

-   **高质量格式化**：使用 TypeScript 官方的语言服务 API，保证格式化结果与主流 IDE（如 VS Code）一致。
-   **开箱即用**：提供了一套与 Prettier 和 VS Code 默认设置类似的通用格式化规则，无需任何配置文件。
-   **文件支持**：支持 `*.ts`, `*.tsx`, `*.js` 文件的递归格式化。
-   **灵活控制**：通过 `include` 和 `exclude` glob 模式精确控制要格式化的文件范围。
-   **CI/CD 集成**：支持 `--check` 模式，用于在持续集成环境中检查代码格式是否规范。
-   **安全预览**：支持 `--dry` 模式，可以在不实际写入文件的情况下预览即将发生的变更。
-   **性能**：通过并发处理来提升在大型项目中的运行速度。

## 安装

你可以在当前仓库本地直接使用本工具，也可以将其安装到其他项目中。

### 在当前仓库本地运行（示例）

1. 在 `format-ts-cli` 目录下安装依赖：

```bash
npm install
```

2. 使用 Node 直接运行 CLI，对自带示例进行格式化：

```bash
node bin/format-ts.js examples
```

或者使用 `npx .` 通过 `package.json` 的 `bin` 字段来调用：

```bash
npx . examples
```

### 作为依赖安装到你的项目

在你的项目根目录下，将其添加为开发依赖（假设已发布到 npm）：

```bash
npm install format-ts-cli --save-dev
```

然后，你可以在 `package.json` 的 `scripts` 中添加一个脚本来运行它：

```json
"scripts": {
  "format": "format-ts src",
  "format:check": "format-ts src --check"
}
```

之后便可通过 `npm run format` 或 `npm run format:check` 执行。

你也可以使用 `npx` 直接运行：

```bash
npx format-ts-cli src
```

### 全局安装

如果你希望在任何地方都能使用 `format-ts` 命令，可以在工具目录中执行：

```bash
npm install -g .
```

安装后，你就可以在任何项目目录下直接运行 `format-ts` 命令。

```bash
format-ts ./path/to/your/project
```

## 使用方法

### 基本用法

最简单的用法是提供一个要格式化的目录或单个文件路径：

```bash
format-ts <目录或文件路径>
```

例如，格式化当前目录下的 `src` 文件夹：

```bash
format-ts src
```

### 命令行参数

| 参数 | 别名 | 描述 | 默认值 |
|---|---|---|---|
| `--dir <path>` | | 指定要格式化的根目录或文件路径。通常可以被位置参数 `<dir|file>` 替代；保留用于向后兼容。 | 可选（若提供位置参数则无需指定） |
| `--include <glob>` | | 用于匹配文件的 glob 模式。 | `**/*.{ts,tsx,js}` |
| `--exclude <glob>` | | 用于排除文件或目录的 glob 模式，多个模式用逗号分隔。 | `node_modules,dist,build,coverage,.git` |
| `--concurrency <n>`| | 并发处理文件的最大数量。 | `8` |
| `--dry` | | Dry run 模式。只打印会发生变更的文件，但不实际写入磁盘。 | `false` |
| `--check` | | 检查模式。如果发现任何文件需要格式化，则以非零状态码退出，用于 CI/CD。 | `false` |
| `--silent` | | 静默模式，最小化日志输出。 | `false` |
| `--help` | `-h` | 显示帮助信息。 | |

## 使用示例

### 格式化整个项目

假设你的所有 TypeScript/JavaScript 源代码都存放在 `src` 目录中：

```bash
format-ts src
```

### Dry Run 模式：预览变更

在实际修改文件之前，查看哪些文件将被格式化：

```bash
format-ts src --dry
```

输出可能如下：

```
Formatting in directory: /path/to/your/project/src
...
Would format: /path/to/your/project/src/components/Button.tsx
Would format: /path/to/your/project/src/utils/helpers.ts

Summary:
  Files checked:   152
  Files formatted: 2
  Time elapsed:    845 ms

Files that would be changed:
  /path/to/your/project/src/components/Button.tsx
  /path/to/your/project/src/utils/helpers.ts
```

### CI/CD 检查模式

在 CI 流水线中，检查代码是否都已正确格式化。如果存在未格式化的文件，命令将失败，从而阻塞合并请求。

```bash
format-ts src --check
```

-   如果所有文件都已格式化，命令将以状态码 0 成功退出。
-   如果检测到需要格式化的文件，命令将以状态码 1 失败退出。

## 实现原理

`format-ts-cli` 的核心是利用了 TypeScript 的编译器 API，特别是 `ts.createLanguageService`。对于每个待处理的文件，它会：

1.  **创建隔离的语言服务实例**：为单个文件创建一个轻量级的 `LanguageServiceHost`。这个 Host 告诉 TypeScript 编译器如何读取文件内容，但不涉及整个项目的类型检查或依赖解析，因此非常快速。
2.  **获取格式化编辑 (Edits)**：调用 `languageService.getFormattingEditsForDocument()` 方法。此方法会返回一个 "编辑" (TextChange) 列表，其中描述了需要对原始文本进行的插入、删除或替换操作，以使其符合格式化规则。
3.  **应用编辑**：从后往前遍历编辑列表，将这些变更应用到原始文本上。从后往前应用是为了确保每次操作的文本偏移量（span）保持有效。
4.  **比较与写入**：将格式化后的文本与原始文本进行比较。如果有差异，则根据运行模式（正常、`--dry` 或 `--check`）决定是写入文件还是仅报告变更。

这种方法的好处是，它完全复用了 TypeScript 编译器内置的、经过良好测试的格式化引擎，确保了与 VS Code 等开发工具的高度一致性，而无需重新实现一套复杂的格式化规则。

## 贡献

欢迎提交问题和贡献代码！如果你发现了 Bug 或有功能建议，请随时在 GitHub 上创建 Issue。

## 许可证

本项目使用 MIT 许可证发布。
