/**
 * Verify the packed tarball contains every entry the manifest promises.
 *
 * A package can build, lint, test and pack cleanly while shipping an archive
 * that is missing a file the manifest points at — a new subpath export whose
 * `lib/` entry is not listed in `files`, or a bundle patch left out — and the
 * only symptom is a consumer's import that fails after publish.
 *
 * So this packs with `pnpm pack --dry-run --json` and asserts that every path
 * named by `exports`, `main`, `types` and `dsh.bundle.patch` is present in the
 * archive. It does not care what else is packed, only that nothing declared is
 * missing. Run it after `pnpm run build`, from CI and before publishing.
 *
 * Usage: `node scripts/check-package.mjs`
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** Manifest keys whose paths must appear in the archive. */
const PATH_KEYS = ['main', 'types']

/**
 * Fail the check with a message that says what was wrong.
 * @param message - Why verification failed.
 * @returns Never; throws.
 */
function fail(message) {
	throw new Error(`check-package: ${message}`)
}

/**
 * Collect a path from every manifest field that names a packed file.
 * @param manifest - Parsed package.json.
 * @returns Unique archive-relative paths, sorted.
 */
function declaredPaths(manifest) {
	const declared = new Set()

	for (const key of PATH_KEYS) {
		if (typeof manifest[key] === 'string') {
			declared.add(manifest[key])
		}
	}

	for (const entry of Object.values(manifest.exports ?? {})) {
		if (typeof entry === 'string') {
			declared.add(entry)
			continue
		}
		for (const condition of Object.values(entry ?? {})) {
			if (typeof condition === 'string') {
				declared.add(condition)
			}
		}
	}

	const patch = manifest.dsh?.bundle?.patch
	if (typeof patch === 'string') {
		declared.add(patch)
	}

	return [...declared].map((path) => path.replace(/^\.\//, '')).sort()
}

/**
 * Pack the package without writing a tarball and return the archive listing.
 * @returns The `files[].path` entries pnpm reported.
 */
function packedPaths() {
	const result = spawnSync('pnpm', ['pack', '--dry-run', '--json'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	if (result.error) {
		fail(`could not run pnpm pack: ${result.error.message}`)
	}
	if (result.status !== 0) {
		fail(`pnpm pack exited ${result.status}\n${result.stderr}`)
	}

	/*
	 * pnpm can print lifecycle noise before the JSON payload, so decode from the
	 * first `{` rather than assuming stdout is pure JSON.
	 */
	const start = result.stdout.indexOf('{')
	if (start === -1) {
		fail(`pnpm pack printed no JSON payload:\n${result.stdout}`)
	}

	let report
	try {
		report = JSON.parse(result.stdout.slice(start))
	} catch (error) {
		fail(`pnpm pack JSON did not parse: ${error.message}`)
	}

	return (report.files ?? []).map((file) => file.path)
}

/**
 * Assert the archive covers the manifest.
 * @returns Nothing; throws when a declared path is missing.
 */
function main() {
	const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
	const expected = declaredPaths(manifest)
	const packed = new Set(packedPaths())

	const missing = expected.filter((path) => !packed.has(path))
	if (missing.length > 0) {
		fail(
			`the packed archive is missing ${missing.length} declared path(s): ` +
				`${missing.join(', ')}. Check the "files" field in package.json.`,
		)
	}

	process.stdout.write(
		`check-package: OK — ${String(expected.length)} declared paths present ` +
			`in ${String(packed.size)} packed files\n`,
	)
}

main()
