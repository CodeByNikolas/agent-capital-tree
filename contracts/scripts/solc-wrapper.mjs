#!/usr/bin/env node
import solc from "solc";

if (process.argv.includes("--version")) {
  process.stdout.write(`${solc.version()}\n`);
} else if (process.argv.includes("--standard-json")) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  process.stdout.write(solc.compile(Buffer.concat(chunks).toString("utf8")));
} else {
  process.stderr.write("Expected --version or --standard-json\n");
  process.exitCode = 1;
}
