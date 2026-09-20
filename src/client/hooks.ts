/**
 * Custom hooks over the scoped stores.
 *
 * These are the only supported way for a component to reach state. Each hook
 * selects the narrowest slice it needs, because zustand re-renders a consumer
 * when its selection changes by reference: subscribing to a whole state object
 * would re-render every field on every keystroke in any field.
 *
 * @module dsh-plugin-jev/client/hooks
 */

import { useCallback, useEffect } from 'react'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

import { useCredentialStore, useSettingsStore, useUsageStore } from './context.tsx'
import type { CredentialActions, CredentialState } from './credential-store.ts'
import { credentialReference } from './credentials.ts'
import type { DraftSettings, NumberFieldName, TextFieldName } from './settings.ts'
import { toDraft } from './settings.ts'
import type { SettingsActions, SettingsState, UsageActions, UsageState } from './store.ts'

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

/** The usage state the panel renders from. */
type UsageReportSlice = Pick<
  UsageState,
  'status' | 'health' | 'report' | 'banks' | 'error'
>

/** The credential state the API-key field renders from. */
type CredentialSlice = Pick<
  CredentialState,
  'status' | 'configured' | 'source' | 'writable' | 'draft' | 'busy' | 'error'
>

/** The credential transitions the API-key field invokes. */
type CredentialControls = Pick<
  CredentialActions,
  'setDraft' | 'describe' | 'save' | 'clear'
>

/** What the API-key field reads and calls. */
type CredentialFieldBinding = CredentialSlice & CredentialControls

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
 * Bind the master switch to the scoped store.
 *
 * @returns The switch position, editability, and change handler.
 */
function useToggleField(): ToggleFieldBinding {
  const state = useSettingsDraft()
  const { setEnabled } = useSettingsActions()

  const onChange = useCallback(
    (checked: boolean): void => {
      setEnabled(checked)
    },
    [setEnabled],
  )

  return {
    checked: displayDraft(state).enabled,
    disabled: state.saving,
    onChange,
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

/**
 * Read the credential field's state and actions.
 *
 * The reference follows the form's effective draft rather than the persisted
 * snapshot, so renaming the variable describes the new reference immediately
 * instead of only after the settings save. A describe already in flight for the
 * previous reference never publishes over the new one — the store orders them.
 *
 * @returns The credential state, and the transitions the field invokes.
 */
function useCredentialField(): CredentialFieldBinding {
  const reference = useStore(
    useSettingsStore(),
    (state: SettingsState): string =>
      credentialReference(displayDraft(state)),
  )
  const field = useStore(
    useCredentialStore(),
    useShallow((state: CredentialState & CredentialActions): CredentialFieldBinding => ({
      status: state.status,
      configured: state.configured,
      source: state.source,
      writable: state.writable,
      draft: state.draft,
      busy: state.busy,
      error: state.error,
      setDraft: state.setDraft,
      describe: state.describe,
      save: state.save,
      clear: state.clear,
    })),
  )
  const { describe } = field

  /*
   * The first describe is the mount-time read, and every later reference
   * change re-reads: both are the same call, so a stale answer cannot outlive
   * the reference it answered for.
   */
  useEffect(() => {
    void describe(reference)
  }, [describe, reference])

  return field
}

/**
 * Read only what the usage panel needs to render.
 *
 * @returns How the last read ended, and what it produced.
 */
function useUsageReport(): UsageReportSlice {
  return useStore(
    useUsageStore(),
    useShallow((state: UsageState): UsageReportSlice => ({
      status: state.status,
      health: state.health,
      report: state.report,
      banks: state.banks,
      error: state.error,
    })),
  )
}

/**
 * Read the usage store's single action.
 *
 * @returns The refresh action, stable for the life of the store.
 */
function useUsageActions(): Pick<UsageActions, 'load'> {
  return useStore(
    useUsageStore(),
    useShallow((state: UsageActions): Pick<UsageActions, 'load'> => ({
      load: state.load,
    })),
  )
}

export {
  displayDraft,
  useCredentialField,
  useNumberField,
  useSettingsActions,
  useSettingsControls,
  useSettingsDraft,
  useTextField,
  useToggleField,
  useUsageActions,
  useUsageReport,
  type CredentialFieldBinding,
  type CredentialSlice,
  type SettingsControls,
  type SettingsDraftSlice,
  type TextFieldBinding,
  type ToggleFieldBinding,
  type UsageReportSlice,
}
