/**
 * The settings tabs: a segmented control over the panel's three concerns.
 *
 * The panel is long because it does three unrelated jobs — configure the
 * plugin, hold the API key, and report what it has cost. Stacked, the ledger
 * buries the form and the form buries the ledger. Tabs separate them so each is
 * readable without scrolling past the others, and so only the open one mounts:
 * an unopened usage tab has not read the ledger yet.
 *
 * This is the one component that owns view state, and it owns only which tab is
 * open. That is not plugin state, so it does not belong in a store — nothing
 * outside this component can observe it, and nothing survives a remount.
 *
 * @module dsh-plugin-jev/client/tabs
 */

import { useRef, useState } from 'react'
import type { ReactElement } from 'react'

/** DOM id prefix shared by a tab and the panel it controls. */
const TAB_ID_PREFIX = 'dsh-plugin-jev-tab'

/** Index of the first tab, which opens by default. */
const FIRST_TAB = 0

/** Roving tabindex: the open tab is reachable by Tab, the others by arrow key. */
const TAB_REACHABLE = 0

/** A tab that is not open is skipped by Tab and reached with the arrow keys. */
const TAB_SKIPPED = -1

/** Arrow-key step towards the next tab. */
const STEP_FORWARD = 1

/** Arrow-key step towards the previous tab, which also wraps. */
const STEP_BACKWARD = -1

/**
 * Resolve the roving tabindex for one tab.
 *
 * @param selected - Whether the tab is open.
 * @returns 0 for the open tab, -1 for the rest.
 */
function tabIndexFor(selected: boolean): number {
  if (selected) {
    return TAB_REACHABLE
  }
  return TAB_SKIPPED
}

/** One tab: the concern, and what to render when it is open. */
interface SettingsTab {
  /** Stable id, used for the tab's DOM ids. */
  id: string
  /** Already-translated label. */
  label: string
  /** The panel to render while this tab is open. */
  content: ReactElement
}

/** Props accepted by {@link SettingsTabs}. */
interface SettingsTabsProps {
  /** The tabs, in display order. The first one opens by default. */
  tabs: readonly SettingsTab[]
}

/** DOM id of one tab's button. */
function tabId(id: string): string {
  return `${TAB_ID_PREFIX}-${id}`
}

/** DOM id of one tab's panel. */
function panelId(id: string): string {
  return `${TAB_ID_PREFIX}-${id}-panel`
}

/**
 * Render the tab list and the open panel.
 *
 * @param props - The tabs to render.
 * @returns The tab list followed by the active panel.
 */
function SettingsTabs({ tabs }: SettingsTabsProps): ReactElement | undefined {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const [openId, setOpenId] = useState<string>(() => {
    const first = tabs.at(FIRST_TAB)
    if (first === undefined) {
      return ''
    }
    return first.id
  })

  const open = tabs.find((tab) => tab.id === openId)
  if (open === undefined) {
    return undefined
  }

  return (
    <>
      <div className='jev-tabs' role='tablist'>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              buttons.current[index] = element
            }}
            type='button'
            role='tab'
            id={tabId(tab.id)}
            className='jev-tab'
            aria-selected={tab.id === openId}
            aria-controls={panelId(tab.id)}
            tabIndex={tabIndexFor(tab.id === openId)}
            onClick={() => {
              setOpenId(tab.id)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
                return
              }
              let step = STEP_BACKWARD
              if (event.key === 'ArrowRight') {
                step = STEP_FORWARD
              }
              event.preventDefault()
              const count = tabs.length
              const next = (index + step + count) % count
              const target = tabs.at(next)
              if (target === undefined) {
                return
              }
              setOpenId(target.id)
              buttons.current[next]?.focus()
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className='jev-panel'
        role='tabpanel'
        id={panelId(open.id)}
        aria-labelledby={tabId(open.id)}
        tabIndex={-1}
      >
        {open.content}
      </div>
    </>
  )
}

export { SettingsTabs, panelId, tabId, tabIndexFor, type SettingsTab, type SettingsTabsProps }

