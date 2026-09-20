/**
 * The section's stylesheet, injected once and owned by the fiber.
 *
 * The host styles its own chrome with hashed CSS-module classes that no plugin
 * can import, so a plugin that emits bare elements gets the browser's default
 * controls dropped into a polished dark app — labels welded to inputs, inputs
 * sized to their content, and help text at body size competing with the labels
 * it describes.
 *
 * Rather than import what cannot be imported, this restates the host's visual
 * language: the same near-black surface, the same 1px translucent border, the
 * same 12px radius on buttons, and the same muted secondary text. Every colour
 * is expressed with `light-dark()` so the sheet follows the app's own
 * `color-scheme` toggle rather than guessing from a media query, with a
 * dark-first fallback line ahead of each pair for engines without it.
 *
 * @module dsh-plugin-system-one/client/styles
 */

import { STYLESHEET } from './stylesheet.ts'

/** Marks the injected element, so a second instance can find and reuse it. */
const STYLE_ID = 'dsh-plugin-system-one-styles'

/**
 * Install the stylesheet, once per document.
 *
 * A second mounted instance finds the first one's element and owns nothing, so
 * the sheet survives while any instance is alive and no instance removes a
 * sheet another is still using.
 *
 * @returns A disposer that removes the sheet this call installed, if any.
 */
function installStyles(): () => void {
  if (typeof document === 'undefined') {
    return () => {
      // Server-side rendering has no document to style.
    }
  }
  if (document.querySelector(`#${STYLE_ID}`) !== null) {
    return () => {
      // Another instance installed the shared sheet; this one owns nothing.
    }
  }
  const element = document.createElement('style')
  element.id = STYLE_ID
  element.textContent = STYLESHEET
  document.head.append(element)
  return () => {
    element.remove()
  }
}

export { STYLE_ID, installStyles }

