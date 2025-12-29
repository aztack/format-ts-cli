# format-ts-cli

A simple, zero-config CLI tool for formatting all `*.ts`, `*.tsx`, and `*.js` files in a specified directory. It leverages the [TypeScript Language Service API](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API) to provide an experience consistent with the built-in formatting features of VS Code.

## Features

-   **High-Quality Formatting**: Uses the official TypeScript Language Service API, ensuring results are consistent with mainstream IDEs like VS Code.
-   **Zero-Config**: Comes with universal formatting rules similar to Prettier and VS Code default settings, requiring no configuration file.
-   **File Support**: Supports recursive formatting of `*.ts`, `*.tsx`, and `*.js` files.
-   **Flexible Control**: Precisely control the range of files to format using `include` and `exclude` glob patterns.
-   **CI/CD Integration**: Supports `--check` mode for checking code formatting in continuous integration environments.
-   **Safe Preview**: Supports `--dry` mode to preview pending changes without actually writing to files.
-   **Performance**: Improved speed in large projects through concurrent processing.

## Installation

You can use this tool directly in the current repository or install it into other projects.

### Running Locally (Example)

1. Install dependencies in the `format-ts-cli` directory:

```bash
npm install
```

2. Run the CLI directly using Node to format the provided examples:

```bash
node bin/format-ts.js examples
```

Or use `npx .` which calls the `bin` field in `package.json`:

```bash
npx . examples
```

### Install as a Dependency in Your Project

In your project root, add it as a development dependency (assuming it's published to npm):

```bash
npm install format-ts-cli --save-dev
```

Then, you can add a script to your `package.json` to run it:

```json
"scripts": {
  "format": "format-ts src",
  "format:check": "format-ts src --check"
}
```

Now you can run it via `npm run format` or `npm run format:check`.

You can also run it directly using `npx`:

```bash
npx format-ts-cli src
```

### Global Installation

If you want to use the `format-ts` command anywhere, run the following in the tool directory:

```bash
npm install -g .
```

After installation, you can run the `format-ts` command in any project directory.

```bash
format-ts ./path/to/your/project
```

## Usage

### Basic Usage

The simplest usage is providing a directory or a single file path to format:

```bash
format-ts <directory or file path>
```

For example, format the `src` folder in the current directory:

```bash
format-ts src
```

### CLI Arguments

| Argument | Alias | Description | Default |
|---|---|---|---|
| `--dir <path>` | | Specify root directory or file path. Usually replaced by positional argument `<dir|file>`; kept for backward compatibility. | Optional |
| `--include <glob>` | | Glob pattern for matching files. | `**/*.{ts,tsx,js}` |
| `--exclude <glob>` | | Glob pattern for excluding files/directories, multiple patterns separated by commas. | `node_modules,dist,build,coverage,.git` |
| `--concurrency <n>`| | Maximum number of files processed concurrently. | `8` |
| `--dry` | | Dry run mode. Only prints files that would change, without writing to disk. | `false` |
| `--check` | | Check mode. Exits with non-zero status if any file needs formatting. Used for CI/CD. | `false` |
| `--silent` | | Silent mode, minimizes log output. | `false` |
| `--help` | `-h` | Show help information. | |

## Examples

### Format Entire Project

Assuming all your TypeScript/JavaScript source code is in the `src` directory:

```bash
format-ts src
```

### Dry Run Mode: Preview Changes

View which files would be formatted before actually modifying them:

```bash
format-ts src --dry
```

Output might look like this:

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

### CI/CD Check Mode

In a CI pipeline, check if all code is correctly formatted. If unformatted files are found, the command will fail, blocking the merge request.

```bash
format-ts src --check
```

-   If all files are already formatted, the command exits successfully with status code 0.
-   If unformatted files are detected, the command fails with status code 1.

## Implementation Details

The core of `format-ts-cli` leverages the TypeScript compiler API, specifically `ts.createLanguageService`. For each file processed, it:

1.  **Creates an isolated Language Service instance**: Creates a lightweight `LanguageServiceHost` for a single file. This Host tells the TypeScript compiler how to read file contents without involving type checking or dependency resolution for the entire project, making it very fast.
2.  **Gets Formatting Edits**: Calls the `languageService.getFormattingEditsForDocument()` method. This returns a list of "edits" (TextChange) describing the insertions, deletions, or replacements needed to bring the original text into compliance with formatting rules.
3.  **Applies Edits**: Iterates through the edit list in reverse order (back-to-front) to apply changes to the original text. Applying from the back ensures that the text spans of subsequent edits remain valid.
4.  **Compares and Writes**: Compares the formatted text with the original text. If there are differences, it decides whether to write to the file or just report the changes based on the mode (normal, `--dry`, or `--check`).

The advantage of this approach is that it completely reuses the well-tested formatting engine built into the TypeScript compiler, ensuring high consistency with development tools like VS Code without needing to re-implement complex formatting rules.

## Contribution

Issues and code contributions are welcome! If you find a bug or have feature suggestions, feel free to create an Issue on GitHub.

## License

This project is released under the MIT License.
