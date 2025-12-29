"use strict";

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

/**
 * Create a formatter for a single file using a minimal TypeScript LanguageService.
 * This mirrors what editors like VS Code do via tsserver's getFormattingEditsForDocument.
 */
function createSingleFileFormatter(fileName, initialText) {
  let text = initialText;
  const normalizedFileName = path.resolve(fileName);

  const servicesHost = {
    getScriptFileNames: () => [normalizedFileName],
    getScriptVersion: () => "0",
    getScriptSnapshot: (name) => {
      if (path.resolve(name) !== normalizedFileName) return undefined;
      return ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => process.cwd(),
    getCompilationSettings: () => ({}),
    getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  };

  const languageService = ts.createLanguageService(
    servicesHost,
    ts.createDocumentRegistry()
  );

  /**
   * Default formatting options similar to VS Code / tsserver defaults,
   * starting from ts.getDefaultFormatCodeSettings().
   */
  const formatOptions = {
    ...ts.getDefaultFormatCodeSettings(),
    indentSize: 2,
    tabSize: 2,
    convertTabsToSpaces: true,
    insertSpaceAfterCommaDelimiter: true,
    insertSpaceAfterSemicolonInForStatements: true,
    insertSpaceBeforeAndAfterBinaryOperators: true,
  };

  function format() {
    const edits = languageService.getFormattingEditsForDocument(
      normalizedFileName,
      formatOptions
    );

    if (!edits || edits.length === 0) {
      return text;
    }

    let result = text;
    // Apply edits from back to front so offsets stay valid.
    for (let i = edits.length - 1; i >= 0; i--) {
      const e = edits[i];
      const start = e.span.start;
      const end = e.span.start + e.span.length;
      result = result.slice(0, start) + e.newText + result.slice(end);
    }

    return result;
  }

  return { format };
}

/**
 * Format a file on disk. Returns an object with the new text and a flag
 * indicating whether any changes were made.
 */
function formatFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const originalText = fs.readFileSync(absolutePath, "utf8");

  const formatter = createSingleFileFormatter(absolutePath, originalText);
  const formattedText = formatter.format();

  const changed = formattedText !== originalText;
  return { formattedText, changed };
}

module.exports = {
  createSingleFileFormatter,
  formatFile,
};
