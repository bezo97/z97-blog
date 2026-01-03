import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

// A plugin for markdown-it that adds support for Mermaid diagrams using the Mermaid CLI
// SVGs are generated from "```mermaid ```" markdown fences at build time and inlined into the HTML output
// Usage: in your Eleventy config file, add:
// import { mermaidFence } from "./mermaid-cli-markdown-it-plugin.js";
// eleventyConfig.amendLibrary("md", (mdLib) => {
//     mdLib.use(mermaidFence);
// });
// Separate SVG files are output to: "/_site/assets/mermaid"
// In case of Mermaid syntax errors, the build will fail with an error message from the Mermaid CLI

//use mermaid cli from node_modules
function getMmdcPath() {
	const binDir = path.resolve("./node_modules/.bin");
	const exe = process.platform === "win32" ? "mmdc.cmd" : "mmdc";
	const full = path.join(binDir, exe);
	if (!existsSync(full)) {
		throw new Error(
			`Mermaid CLI not found at ${full}. Did you run npm install?`
		);
	}
	return full;
}
const MMD_CLI = getMmdcPath();

function renderMermaid(src) {
	const hash = createHash("md5").update(src).digest("hex");
	const outDir = "./_site/assets/mermaid";
	const outFile = `${outDir}/${hash}.svg`;
	// ensure output folder exists
	if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
	// existing svg with same hash -> reuse
	if (existsSync(outFile)) return outFile;

	const cmd = `"${MMD_CLI}" -i - -o "${outFile}" --theme dark --backgroundColor transparent`;

	try {
		execSync(cmd, {
			input: src, // pipe Mermaid source via stdin
			stdio: ["pipe", "ignore", "pipe"], // in:pipe, out:ignore (we only use the svg file), err:pipe
			encoding: "utf8",
			shell: true,
		});
	} catch (err) {
		// Handle error such as broken Mermaid syntax
		const msg = err.stderr?.toString() || err.message;
		throw new Error(`Mermaid CLI failed:\n${msg}`);
	}

	return outFile;
}

/**
 * Markdown-it plugin to render Mermaid diagrams inline as SVGs
 * @param {MarkdownIt} md
 */
export function mermaidFence(md) {
	// Save default fence renderer for later
	const defaultRender =
		md.renderer.rules.fence?.bind(md.renderer.rules) || (() => "");
	// Override fence renderer
	md.renderer.rules.fence = (tokens, idx, options, env, self) => {
		const token = tokens[idx];
		if (token.info.trim() !== "mermaid") {
			// Not a mermaid fence -> use default renderer
			return defaultRender(tokens, idx, options, env, self);
		}

		const svgPath = renderMermaid(token.content);
		return readFileSync(svgPath, "utf8");
	};
}
