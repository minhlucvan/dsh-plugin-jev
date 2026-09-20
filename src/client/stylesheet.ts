/**
 * The panel's stylesheet.
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
 * It lives apart from the injector so neither file has to be scrolled to be
 * read: this one is data, and `styles.ts` is the three lines that put it
 * in the document and take it out again.
 *
 * @module dsh-plugin-system-one/client/stylesheet
 */

const STYLESHEET = `
.jev {
  --jev-surface: #1c1c1f;
  --jev-surface: light-dark(#ffffff, #1c1c1f);
  --jev-raised: rgba(255, 255, 255, 0.04);
  --jev-raised: light-dark(rgba(0, 0, 0, 0.02), rgba(255, 255, 255, 0.04));
  --jev-border: rgba(255, 255, 255, 0.16);
  --jev-border: light-dark(rgba(0, 0, 0, 0.14), rgba(255, 255, 255, 0.16));
  --jev-border-strong: rgba(255, 255, 255, 0.32);
  --jev-border-strong: light-dark(rgba(0, 0, 0, 0.28), rgba(255, 255, 255, 0.32));
  --jev-text: inherit;
  --jev-muted: rgba(249, 250, 251, 0.62);
  --jev-muted: light-dark(rgba(21, 21, 23, 0.6), rgba(249, 250, 251, 0.62));
  --jev-faint: rgba(249, 250, 251, 0.4);
  --jev-faint: light-dark(rgba(21, 21, 23, 0.4), rgba(249, 250, 251, 0.4));
  --jev-danger: #ff8f8f;
  --jev-danger: light-dark(#b42318, #ff8f8f);
  --jev-danger-bg: rgba(255, 143, 143, 0.1);
  --jev-danger-bg: light-dark(rgba(180, 35, 24, 0.07), rgba(255, 143, 143, 0.1));
  --jev-ok: #7ee2a8;
  --jev-ok: light-dark(#0a7c42, #7ee2a8);
  --jev-radius: 8px;
  --jev-radius-lg: 12px;

  display: grid;
  gap: 26px;
  max-width: 560px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--jev-text);
}

/* Header — a title and one sentence, then breathing room before the form. */
.jev__title {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.jev__intro {
  margin: 0;
  color: var(--jev-muted);
  text-wrap: pretty;
}

/*
 * The tab strip is a segmented control: a raised track holding one pill, the
 * open pill lifted onto the surface colour. It reads as one control rather than
 * three buttons, which is what keeps it from competing with the form below.
 */
.jev-tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--jev-raised);
  border: 1px solid var(--jev-border);
  border-radius: var(--jev-radius-lg);
}
.jev-tab {
  flex: 1;
  padding: 7px 12px;
  font: inherit;
  font-weight: 500;
  color: var(--jev-muted);
  background: transparent;
  border: 0;
  border-radius: 9px;
  cursor: pointer;
  transition: color 0.1s ease, background 0.1s ease;
}
.jev-tab:hover {
  color: inherit;
}
.jev-tab[aria-selected='true'] {
  color: inherit;
  background: var(--jev-surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
}
.jev-tab:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(127, 127, 127, 0.22);
}
/* The open panel is the section's own rhythm, one level down. */
.jev-panel {
  display: grid;
  gap: 22px;
}
.jev-panel:focus-visible {
  outline: none;
}

/* A group is one idea: settings, or the key, or the ledger. */
.jev-group {
  display: grid;
  gap: 16px;
}
.jev-group__title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--jev-faint);
}
.jev-group__fields {
  display: grid;
  gap: 16px;
}
/* Groups that sit on their own surface get a hairline and padding. */
.jev-card {
  padding: 16px;
  border: 1px solid var(--jev-border);
  border-radius: var(--jev-radius-lg);
  background: var(--jev-raised);
}

/*
 * One field is a stacked column: label above its control, help text beneath.
 * Stacking is the whole fix for the label welded to the input edge.
 */
.jev-field {
  display: grid;
  gap: 6px;
}
.jev-field__label {
  font-weight: 500;
}
.jev-field__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--jev-muted);
  text-wrap: pretty;
}

/* Controls. Full width, one size, one border. */
.jev-input {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  font: inherit;
  color: inherit;
  background: var(--jev-raised);
  border: 1px solid var(--jev-border);
  border-radius: var(--jev-radius);
  transition: border-color 0.1s ease, box-shadow 0.1s ease;
}
.jev-input::placeholder {
  color: var(--jev-faint);
}
.jev-input:hover:not(:disabled) {
  border-color: var(--jev-border-strong);
}
.jev-input:focus-visible {
  outline: none;
  border-color: var(--jev-border-strong);
  box-shadow: 0 0 0 3px rgba(127, 127, 127, 0.18);
}
.jev-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* Values that are identifiers read better in the mono face. */
.jev-input--code {
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
}

/* The master switch: control and label on one line, help beneath. */
.jev-check {
  display: flex;
  align-items: center;
  gap: 9px;
}
.jev-check__input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: currentColor;
  cursor: pointer;
}
.jev-check__input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Actions: a primary, then secondaries, then the failure beneath them. */
.jev-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.jev-btn {
  padding: 8px 16px;
  font: inherit;
  font-weight: 500;
  color: inherit;
  background: var(--jev-raised);
  border: 1px solid var(--jev-border);
  border-radius: var(--jev-radius-lg);
  cursor: pointer;
  transition: background 0.1s ease, border-color 0.1s ease, opacity 0.1s ease;
}
.jev-btn:hover:not(:disabled) {
  border-color: var(--jev-border-strong);
}
.jev-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(127, 127, 127, 0.22);
}
.jev-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.jev-btn--primary {
  color: #151517;
  color: light-dark(#f9fafb, #151517);
  background: #f9fafb;
  background: light-dark(#151517, #f9fafb);
  border-color: transparent;
}
.jev-btn--primary:hover:not(:disabled) {
  opacity: 0.88;
}
/* A destructive-adjacent action stays secondary but reads as caution. */
.jev-btn--quiet {
  background: transparent;
}

/* Status lines and messages. */
.jev-status {
  display: grid;
  gap: 4px;
  margin: 0;
  font-size: 12px;
  color: var(--jev-muted);
}
.jev-status > * {
  margin: 0;
}
.jev-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--jev-border);
  border-radius: 999px;
  color: var(--jev-muted);
}
.jev-pill--ok {
  color: var(--jev-ok);
  border-color: currentColor;
}
.jev-alert {
  display: block;
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--jev-danger);
  background: var(--jev-danger-bg);
  border: 1px solid currentColor;
  border-radius: var(--jev-radius);
  text-wrap: pretty;
}

/* Ledger tables: full width, hairline rows, numbers aligned right. */
.jev-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.jev-table th,
.jev-table td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid var(--jev-border);
}
.jev-table th {
  font-weight: 500;
  color: var(--jev-faint);
}
.jev-table td + td,
.jev-table th + th {
  text-align: right;
}
.jev-table tr:last-child td {
  border-bottom: none;
}
.jev-empty {
  margin: 0;
  font-size: 12px;
  color: var(--jev-muted);
}

/* A label/value list reads as a compact two-column grid, values aligned. */
.jev-stats {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px 16px;
  margin: 0;
  font-size: 12px;
}
.jev-stats dt {
  color: var(--jev-muted);
}
.jev-stats dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
`

export { STYLESHEET }
