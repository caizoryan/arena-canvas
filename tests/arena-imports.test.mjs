// Run: node --test tests/arena-imports.test.mjs
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
// The Are.na adapter is wired up in adapters/index.js; everything else loads
// and saves through the active state adapter.
const ALLOWED = ["adapters/index.js"];
const SKIP = new Set(["node_modules", "pdfjs", "markdown-it", "tests", ".git", ".agents", ".claude", ".scratch"]);

async function sourceFiles(dir = "") {
	const entries = await readdir(new URL(dir, root), { withFileTypes: true });
	const files = await Promise.all(entries.map(entry => {
		const path = dir + entry.name;
		if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : sourceFiles(path + "/");
		return /\.m?js$/.test(entry.name) ? [path] : [];
	}));
	return files.flat();
}

test("only the Are.na adapter imports the Are.na API module", async () => {
	const importers = [];
	for (const file of await sourceFiles()) {
		if (file == "arena.js") continue;
		const source = await readFile(new URL(file, root), "utf8");
		if (/from\s+["'](?:\.\.?\/)+arena\.js["']|import\(\s*["'](?:\.\.?\/)+arena\.js["']\s*\)/.test(source)) {
			importers.push(file);
		}
	}
	assert.deepEqual(importers.sort(), ALLOWED);
});
