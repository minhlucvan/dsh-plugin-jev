/**
 * Custom hooks over the scoped stores.
 *
 * These are the only supported way for a component to reach state. Each hook
 * selects the narrowest slice it needs, because zustand re-renders a consumer
 * when its selection changes by reference: subscribing to a whole state object
 * would re-render every field on every keystroke in any field.
 *
 * The credential field's own read path lives in `./credential-hooks.ts`, and
 * the usage panel's in `./usage-hooks.ts`: both answer to authorities other
 * than the settings scope, and neither belongs in the form's hook set.
 *
 * @module dsh-plugin-jev/client/hooks
 */

import { useCallback, useEffect } from 'react'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

import type { CatalogBank } from './api.ts'
import { useSettingsStore } from './context.tsx'
import { ALL_BANKS, sameBanks } from './settings-bounds.ts'
import type {
  DraftSettings,
  NumberFieldName,
  TextFieldName,
  ToggleFieldName,
} from './settings.ts'
import { toDraft } from './settings.ts'
import type { SettingsActions, SettingsState } from './store.ts'
import { useUsageActions, useUsageReport } from './usage-hooks.ts'

/** What a text or numeric field binds to. */
interface TextFieldBinding {
  /** The text to display in the field. */
  value: string
  /** Whether the field is currently editable. */
  disabled: boolean
  /** Record typed text. */
  onChange: (value: string) => void
}

/** What the master switch binds to. */
interface ToggleFieldBinding {
  /** Whether the switch is on. */
  checked: boolean
  /** Whether the switch is currently editable. */
  disabled: boolean
  /** Record the new switch position. */
  onChange: (checked: boolean) => void
}

/** The settings state a field renders from. */
type SettingsDraftSlice = Pick<
  SettingsState,
  'draft' | 'dirty' | 'persisted' | 'saving' | 'error'
>

/** What the save and reset controls bind to. */
interface SettingsControls {
  /** Whether a save is in flight. */
  saving: boolean
  /** Whether the normalized draft differs from the persisted snapshot. */
  dirty: boolean
  /** The last save failure, absent when the previous save succeeded. */
  error: string | undefined
  /** Persist the normalized draft. */
  save: () => Promise<void>
  /** Discard the draft. */
  reset: () => void
}

/**
 * Resolve the values the form should show.
 *
 * A clean form follows the host; an edited one keeps what the user typed. The
 * store already decided which of those applies, so this is a read rather than a
 * rule re-derived during render.
 *
 * @param state - The draft-relevant state slice.
 * @returns The typed draft when it is edited, and the persisted text otherwise.
 */
function displayDraft(state: SettingsDraftSlice): DraftSettings {
  if (state.dirty) {
    return state.draft
  }
  return toDraft(state.persisted)
}

/**
 * Read only what a form field needs to render.
 *
 * `useShallow` compares the picked fields by value, so a change to `saving` —
 * or to any other slice — does not re-render the input that shows the draft.
 *
 * @returns The draft, its origin, and the commit state.
 */
function useSettingsDraft(): SettingsDraftSlice {
  return useStore(
    useSettingsStore(),
    useShallow((state: SettingsState): SettingsDraftSlice => ({
      draft: state.draft,
      dirty: state.dirty,
      persisted: state.persisted,
      saving: state.saving,
      error: state.error,
    })),
  )
}

/**
 * Read the settings store's actions.
 *
 * Actions are stable for the life of the store, so this selection never causes
 * a re-render; `useShallow` keeps it from allocating a fresh object each call
 * and defeating that.
 *
 * @returns The settings state transitions.
 */
function useSettingsActions(): SettingsActions {
  return useStore(
    useSettingsStore(),
    useShallow((state: SettingsActions): SettingsActions => ({
      setText: state.setText,
      setCount: state.setCount,
      setEnabled: state.setEnabled,
      setAdoptionPrompt: state.setAdoptionPrompt,
      setBanks: state.setBanks,
      reset: state.reset,
      save: state.save,
      sync: state.sync,
    })),
  )
}

/**
 * Bind one string field to the scoped store.
 *
 * The composite hook a field component actually consumes: one call, no props,
 * and no knowledge of zustand or the host scope.
 *
 * @param field - The field this binding edits.
 * @returns The field's current text, editability, and change handler.
 */
function useTextField(field: TextFieldName): TextFieldBinding {
  const state = useSettingsDraft()
  const { setText } = useSettingsActions()

  const onChange = useCallback(
    (value: string): void => {
      setText(field, value)
    },
    [field, setText],
  )

  return { value: displayDraft(state)[field], disabled: state.saving, onChange }
}

/**
 * Bind one numeric field to the scoped store.
 *
 * The value stays text: parsing and clamping belong to the boundary, so a
 * half-typed number is never rewritten under the caret.
 *
 * @param field - The field this binding edits.
 * @returns The field's current text, editability, and change handler.
 */
function useNumberField(field: NumberFieldName): TextFieldBinding {
  const state = useSettingsDraft()
  const { setCount } = useSettingsActions()

  const onChange = useCallback(
    (value: string): void => {
      setCount(field, value)
    },
    [field, setCount],
  )

  return { value: displayDraft(state)[field], disabled: state.saving, onChange }
}

/**
 * Bind one switch to the scoped store.
 *
 * @param field - The boolean field this binding edits.
 * @returns The switch position, editability, and change handler.
 */
function useToggleField(field: ToggleFieldName): ToggleFieldBinding {
  const state = useSettingsDraft()
  const { setEnabled, setAdoptionPrompt } = useSettingsActions()

  const onChange = useCallback(
    (checked: boolean): void => {
      if (field === 'enabled') {
        setEnabled(checked)
        return
      }
      setAdoptionPrompt(checked)
    },
    [field, setEnabled, setAdoptionPrompt],
  )

  return {
    checked: displayDraft(state)[field],
    disabled: state.saving,
    onChange,
  }
}

/** Length of an empty list, named to keep it out of the magic-number rule. */
const NONE = 0

/** What the question-bank checkboxes bind to. */
interface BanksFieldBinding {
  /** The banks this build ships, in catalog order. */
  banks: CatalogBank[]
  /** Whether the catalog could not be read. */
  failed: boolean
  /** Whether the checkboxes are currently editable. */
  disabled: boolean
  /** Whether one bank is currently allowed. */
  isOn: (id: string) => boolean
  /** Record one bank's new position. */
  toggle: (id: string, on: boolean) => void
}

/**
 * Read the question banks a deployment allows.
 *
 * An empty selection means every bank, so the catalog decides what the form can
 * offer and the stored ids only ever narrow it. The catalog is read here
 * because the behavior tab can open before the usage tab ever did; a failed
 * read leaves it empty, and repeating the request would only repeat the
 * failure, so the read is keyed to that emptiness rather than to every render.
 *
 * @returns The catalog, the selection that narrows it, and the transitions the
 *   checkboxes invoke.
 */
function useBanksField(): BanksFieldBinding {
  const { banks: catalog, status } = useUsageReport()
  const state = useSettingsDraft()
  const { setBanks } = useSettingsActions()
  const { load } = useUsageActions()
  const empty = catalog.length === NONE

  useEffect(() => {
    if (empty) {
      void load()
    }
  }, [empty, load])

  const selected = displayDraft(state).banks

  const isOn = useCallback(
    (id: string): boolean => selected.length === NONE || selected.includes(id),
    [selected],
  )

  const toggle = useCallback(
    (id: string, on: boolean): void => {
      const all = catalog.map((bank) => bank.id)
      let current = selected
      if (selected.length === NONE) {
        current = all
      }
      const next = current.filter((candidate) => candidate !== id)
      if (on) {
        next.push(id)
      }
      if (sameBanks(next, all)) {
        setBanks([...ALL_BANKS])
        return
      }
      setBanks(next)
    },
    [catalog, selected, setBanks],
  )

  return {
    banks: catalog,
    failed: status === 'error',
    disabled: state.saving,
    isOn,
    toggle,
  }
}

/**
 * Read the commit controls' state.
 *
 * `save` and `reset` are returned as the store's own stable actions rather
 * than as wrappers, so passing them straight to an `onClick` cannot change
 * identity between renders.
 *
 * @returns The controls' state and actions.
 */
function useSettingsControls(): SettingsControls {
  const { dirty, saving, error } = useSettingsDraft()
  const { save, reset } = useSettingsActions()
  return { saving, dirty, error, save, reset }
}

export {
  displayDraft,
  useBanksField,
  useNumberField,
  useSettingsActions,
  useSettingsControls,
  useSettingsDraft,
  useTextField,
  useToggleField,
  type BanksFieldBinding,
  type SettingsControls,
  type SettingsDraftSlice,
  type TextFieldBinding,
  type ToggleFieldBinding,
}
