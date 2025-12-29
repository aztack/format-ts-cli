#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { Minimatch } = require("minimatch");
const { formatFile } = require("../src/formatter");

function printHelp() {
  const cmd = "format-ts";
  console.log(`Usage: ${cmd} [options] <dir|file>\n`);
  console.log("Options:");
  console.log("  --dir <path>         Root directory or file to format (alternative to positional <dir|file>)");
  console.log("  --include <glob>     Include glob (default: \"**/*.{ts,tsx,js}\")");
  console.log("  --exclude <glob>     Exclude glob(s), comma-separated (default: node_modules,dist,build,coverage,.git)");
  console.log("  --concurrency <n>    Max concurrent files to process (default: 8)");
  console.log("  --dry                Dry-run: do not write files, just report changes");
  console.log("  --check              Check mode: exit with non-zero code if any file would be changed");
  console.log("  --silent             Reduce logging output");
  console.log("  -h, --help           Show this help");
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    dir: undefined,
    include: "**/*.{ts,tsx,js}",
    exclude: ["node_modules", "dist", "build", "coverage", ".git"],
    concurrency: 8,
    dry: false,
    check: false,
    silent: false,
  };

  let positionalPath;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "-h":
      case "--help":
        return { options, positionalPath, showHelp: true };
      case "--dir": {
        const next = args[++i];
        if (!next) throw new Error("--dir requires a value");
        options.dir = next;
        break;
      }
      case "--include": {
        const next = args[++i];
        if (!next) throw new Error("--include requires a value");
        options.include = next;
        break;
      }
      case "--exclude": {
        const next = args[++i];
        if (!next) throw new Error("--exclude requires a value");
        options.exclude = next.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      }
      case "--concurrency": {
        const next = args[++i];
        if (!next) throw new Error("--concurrency requires a value");
        const n = Number(next);
        if (!Number.isInteger(n) || n <= 0) {
          throw new Error("--concurrency must be a positive integer");
        }
        options.concurrency = n;
        break;
      }
      case "--dry":
        options.dry = true;
        break;
      case "--check":
        options.check = true;
        break;
      case "--silent":
        options.silent = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        if (!positionalPath) {
          positionalPath = arg;
        } else {
          throw new Error(`Unexpected positional argument: ${arg}`);
        }
    }
  }

  return { options, positionalPath, showHelp: false };
}

function isTextFile(filePath) {
  // We only target *.ts, *.tsx, *.js by glob, so here we just ensure it's not binary.
  // Simple heuristic: try reading a small chunk and check for null bytes.
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(1024);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function collectFiles(rootDir, includePattern, excludePatterns) {
  const files = [];

  const includeMatcher = new Minimatch(includePattern, {
    dot: false,
    matchBase: true,
  });

  const excludeMatchers = excludePatterns.map(
    (pattern) =>
      new Minimatch(pattern.replace(/\\+/g, "/"), {
        dot: true,
        matchBase: true,
      })
  );

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, fullPath).split(path.sep).join("/");

      if (excludeMatchers.some((m) => m.match(relPath) || m.match(entry.name))) {
        if (entry.isDirectory()) {
          continue;
        }
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (includeMatcher.match(relPath) || includeMatcher.match(entry.name)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(rootDir);
  return files;
}

async function run() {
  const startTime = Date.now();
  let options;
  let showHelp;
  let positionalPath;

  try {
    const parsed = parseArgs(process.argv);
    options = parsed.options;
    showHelp = parsed.showHelp;
    positionalPath = parsed.positionalPath;
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error("Use --help for usage information.");
    process.exitCode = 2;
    return;
  }

  if (showHelp) {
    printHelp();
    return;
  }

  const targetFromFlag = options.dir;
  const targetFromPositional = positionalPath;

  if (!targetFromFlag && !targetFromPositional) {
    printHelp();
    console.error("\nError: target path is required.");
    process.exitCode = 2;
    return;
  }

  if (targetFromFlag && targetFromPositional && !options.silent) {
    console.warn(
      "Warning: both positional path and --dir were provided; using positional path and ignoring --dir."
    );
  }

  const rawTarget = targetFromPositional || targetFromFlag;
  const targetPath = path.resolve(rawTarget);

  if (!fs.existsSync(targetPath)) {
    console.error(`Error: path does not exist: ${targetPath}`);
    process.exitCode = 2;
    return;
  }

  let stat;
  try {
    stat = fs.statSync(targetPath);
  } catch {
    console.error(`Error: failed to stat path: ${targetPath}`);
    process.exitCode = 2;
    return;
  }

  let files = [];

  if (stat.isDirectory()) {
    const rootDir = targetPath;

    if (!options.silent) {
      console.log(`Formatting in directory: ${rootDir}`);
      console.log(`Include: ${options.include}`);
      console.log(`Exclude: ${options.exclude.join(", ")}`);
      console.log(`Concurrency: ${options.concurrency}`);
      if (options.dry) console.log("Mode: dry-run");
      if (options.check) console.log("Mode: check");
    }

    files = collectFiles(rootDir, options.include, options.exclude);

    if (!files.length) {
      if (!options.silent) {
        console.log("No matching files found.");
      }
      return;
    }

    if (!options.silent) {
      console.log(`Found ${files.length} file(s).`);
    }
  } else if (stat.isFile()) {
    const ext = path.extname(targetPath).toLowerCase();
    if (ext !== ".ts" && ext !== ".tsx" && ext !== ".js") {
      console.error("Error: unsupported file type");
      process.exitCode = 2;
      return;
    }

    if (!options.silent) {
      console.log(`Formatting file: ${targetPath}`);
      if (options.dry) console.log("Mode: dry-run");
      if (options.check) console.log("Mode: check");
    }

    files = [targetPath];
  } else {
    console.error("Error: target path is neither a file nor a directory");
    process.exitCode = 2;
    return;
  }


  let filesChecked = 0;
  let filesChanged = 0;
  const changedFiles = [];

  // Simple promise pool for concurrency control.
  const concurrency = options.concurrency || os.cpus().length || 4;
  let index = 0;

  async function worker() {
    while (true) {
      const i = index++;
      if (i >= files.length) return;
      const filePath = files[i];

      if (!isTextFile(filePath)) {
        continue;
      }

      try {
        const { formattedText, changed } = formatFile(filePath);
        filesChecked++;
        if (changed) {
          filesChanged++;
          changedFiles.push(filePath);
          if (!options.silent) {
            const label = options.dry || options.check ? "Would format" : "Formatted";
            console.log(`${label}: ${filePath}`);
          }
          if (!options.dry && !options.check) {
            fs.writeFileSync(filePath, formattedText, "utf8");
          }
        }
      } catch (err) {
        console.error(`Error formatting ${filePath}: ${err.message}`);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  const elapsedMs = Date.now() - startTime;

  if (!options.silent) {
    console.log("");
    console.log("Summary:");
    console.log(`  Files checked:   ${filesChecked}`);
    console.log(`  Files formatted: ${filesChanged}`);
    console.log(`  Time elapsed:    ${elapsedMs} ms`);
  }

  if (options.dry || options.check) {
    if (filesChanged > 0) {
      if (!options.silent) {
        console.log("");
        console.log("Files that would be changed:");
        for (const f of changedFiles) {
          console.log(`  ${f}`);
        }
      }
      process.exitCode = 1;
    } else {
      if (!options.silent) {
        console.log("No changes needed.");
      }
      process.exitCode = 0;
    }
  }
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exitCode = 1;
});
