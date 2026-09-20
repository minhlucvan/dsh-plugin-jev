/**
 * The translator contract, split from `contracts.ts` so components depend on a
 * one-line type instead of the whole host service surface.
 *
 * @module dsh-plugin-jev/client/translate
 */

/** Translates a key in this feature's namespace. */
type Translate = (key: string) => string

export type { Translate }
