/**
 * Verify the built client artifact actually loads through the host's loader.
 *
 * A successful build is not evidence that a browser face works. The host does
 * not import this file as a module; it evaluates it and expects a call to
 * `window.__ModuleLoader__.load({ id, factory })` whose factory returns the
 * plugin's exports. An artifact can build, pack and ship while failing every one
 * of those steps, and the only symptom is a panel that never appears.
 *
 * So this runs the same shape the browser would: install a `__ModuleLoader__`
 * shim, provide the two modules the host supplies, import the artifact, and
 * assert the envelope and its exports. Run from `pnpm run build`, after
 * `scripts/wrap-client.mjs`.
 *
 * Usage: `node scripts/verify-client.mjs`
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The served artifact. */
const ARTIFACT = 'lib/client.js'

/** Modules the host's loader must supply to a client bundle. */
const HOST_MODULES = ['react', 'react/jsx-runtime']

/** Exports every DSH client entry must provide. */
const REQUIRED_EXPORTS = ['apply', 'inject', 'name']

/**
 * Stand-in for the host's React: enough for the module body to evaluate.
 *
 * This shim has to cover every React API the entry touches at *module* scope,
 * because the factory runs here exactly as it would in the browser. A real
 * React tree reaches for `createContext`/`useContext` as the module loads, so a
 * shim missing them fails verification for a bundle the browser would run fine
 * — the check would be wrong, not the artifact.
 */
const reactShim = {
	createContext: (defaultValue) => ({
		Provider: ({ children }) => children,
		Consumer: {},
		_defaultValue: defaultValue,
	}),
	createElement: () => ({}),
	Fragment: {},
	useCallback: (callback) => callback,
	useContext: (context) => context?._defaultValue,
	useEffect: () => undefined,
	useId: () => 'verify-client',
	useMemo: (factory) => factory(),
	useRef: (value) => ({ current: value }),
	useState: (initial) => [
		typeof initial === 'function' ? initial() : initial,
		() => undefined,
	],
	useSyncExternalStore: () => '',
}

/** Stand-in for the host's jsx runtime. */
const jsxRuntimeShim = {
	Fragment: {},
	jsx: () => ({}),
	jsxs: () => ({}),
}

const shims = {
	react: reactShim,
	'react/jsx-runtime': jsxRuntimeShim,
}

/**
 * Read the name this package registers under, which is the loader id.
 * @returns The `name` field of package.json.
 */
function readPackageName() {
	return JSON.parse(readFileSync('package.json', 'utf8')).name
}

/**
 * Fail the build with a message that says what was wrong.
 * @param message - Why verification failed.
 * @returns Never; throws.
 */
function fail(message) {
	throw new Error(`verify-client: ${message}`)
}

/**
 * Evaluate the artifact under a loader shim and assert its exports.
 * @returns Nothing; throws when the artifact is not a valid client entry.
 */
async function main() {
	const expectedId = readPackageName()
	const seen = []

	const requireShim = createRequire(import.meta.url)
	/** The `require` a browser factory receives: host modules only. */
	const hostRequire = (specifier) => {
		if (specifier in shims) {
			return shims[specifier]
		}
		return requireShim(specifier)
	}

	globalThis.window = {
		__ModuleLoader__: {
			load(definition) {
				seen.push(definition)
			},
		},
	}

	await import(pathToFileURL(resolve(ARTIFACT)).href)

	if (seen.length !== 1) {
		fail(`${ARTIFACT} called __ModuleLoader__.load ${seen.length} times; expected exactly 1`)
	}

	const definition = seen[0]
	if (definition.id !== expectedId) {
		fail(`loader id is ${JSON.stringify(definition.id)}; package name is ${JSON.stringify(expectedId)}`)
	}
	if (typeof definition.factory !== 'function') {
		fail('the loader definition has no factory function')
	}

	const exports = definition.factory(hostRequire)
	for (const key of REQUIRED_EXPORTS) {
		if (!(key in exports)) {
			fail(`the factory did not export ${JSON.stringify(key)}`)
		}
	}
	if (typeof exports.apply !== 'function') {
		fail('the exported apply is not a function')
	}
	if (!Array.isArray(exports.inject)) {
		fail('the exported inject is not an array')
	}

	for (const specifier of HOST_MODULES) {
		if (!(specifier in shims)) {
			fail(`no shim registered for host module ${specifier}`)
		}
	}

	process.stdout.write(
		`verify-client: OK — id ${definition.id}, exports ${Object.keys(exports).sort().join(', ')}\n`,
	)
}

await main()
