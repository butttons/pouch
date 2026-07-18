#!/usr/bin/env tsx
/**
 * One-time migration script: uploads CMS images from cf-mono to the pouch R2 bucket.
 *
 * Usage:
 *   tsx scripts/migrate-media.ts
 *
 * Reads images from CF_MONO_CMS_DIR (default: ~/Work/zomunk/cf-mono/apps/web-worker/public/images/cms)
 * and uploads them to the R2 bucket "pouch-media" under the same paths (e.g. images/cms/dest-rome.jpg).
 *
 * Requires: wrangler CLI authenticated, R2 bucket "pouch-media" created.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";

const CF_MONO_CMS_DIR =
	process.env.CF_MONO_CMS_DIR ||
	join(process.env.HOME!, "Work/zomunk/cf-mono/apps/web-worker/public/images/cms");

const R2_BUCKET = "pouch-media";

function getAllFiles(dir: string): string[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...getAllFiles(fullPath));
		} else {
			files.push(fullPath);
		}
	}

	return files;
}

function getContentType(filePath: string): string {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	const mimeMap: Record<string, string> = {
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		gif: "image/gif",
		webp: "image/webp",
		svg: "image/svg+xml",
	};
	return mimeMap[ext] ?? "application/octet-stream";
}

async function main() {
	console.log(`Source: ${CF_MONO_CMS_DIR}`);
	console.log(`Bucket: ${R2_BUCKET}`);
	console.log("");

	const files = getAllFiles(CF_MONO_CMS_DIR);
	console.log(`Found ${files.length} files to upload.\n`);

	let success = 0;
	let skipped = 0;
	let failed = 0;

	for (const filePath of files) {
		// R2 key matches the content path without leading slash: images/cms/dest-rome.jpg
		const r2Key = `images/cms/${relative(CF_MONO_CMS_DIR, filePath)}`;
		const contentType = getContentType(filePath);
		const size = statSync(filePath).size;

		process.stdout.write(`  ${r2Key} (${(size / 1024).toFixed(1)}KB) ... `);

		try {
			const cmd = [
				"npx wrangler r2 object put",
				`"${R2_BUCKET}/${r2Key}"`,
				`--file "${filePath}"`,
				`--content-type "${contentType}"`,
				"--remote",
			].join(" ");

			execSync(cmd, {
				stdio: "pipe",
				timeout: 30_000,
			});

			console.log("ok");
			success++;
		} catch (error) {
			console.log("FAILED");
			failed++;
		}
	}

	console.log(`\nDone: ${success} uploaded, ${skipped} skipped, ${failed} failed.`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
