/**
 * The settings fields: presentational components with no state of their own.
 *
 * Each field reads and writes through a hook, so none of them receives a value,
 * a change handler, or the host scope as props — which is what lets a field be
 * rendered twice, or moved, without rewiring anything. The label and hint for
 * each field are locale keys looked up in `FIELD_COPY` rather than strings
 * written here.
 *
 * Every field is a stacked column: label, control, help text. The host's own
 * styling lives in `styles.ts`; this file only names the parts.
 *
 * @module dsh-plugin-jev/client/settings-fields
 */

import type { ReactElement } from 'react'

import { useNumberField, useTextField, useToggleField } from './hooks.ts'
import type { MessageKey } from './locale.ts'
import type {
  NumberFieldName,
  SettingsFieldName,
  TextFieldName,
} from './settings.ts'
import type { Translate } from './translate.ts'

/** DOM id prefix for every field, so each label points at its own input. */
const FIELD_ID_PREFIX = 'dsh-plugin-jev'

/** String fields, rendered in this order. */
const TEXT_FIELDS: readonly TextFieldName[] = ['apiKeyEnv', 'model', 'baseUrl']

/** Numeric fields, rendered in this order. */
const NUMBER_FIELDS: readonly NumberFieldName[] = [
  'confidenceFloor',
  'confirmFloor',
  'ledgerLimit',
]

/** Fields whose value is an identifier rather than prose, and reads as code. */
const CODE_FIELDS: ReadonlySet<SettingsFieldName> = new Set(['apiKeyEnv', 'model', 'baseUrl'])

/** Copy keys describing one field. */
interface FieldCopy {
  /** Message key of the field's label. */
  label: MessageKey
  /** Message key of the hint paragraph describing the field. */
  hint: MessageKey
}

/** Copy keys for every field the form edits. */
const FIELD_COPY: Record<SettingsFieldName, FieldCopy> = {
  enabled: { label: 'enabledLabel', hint: 'enabledHint' },
  apiKeyEnv: { label: 'apiKeyEnvLabel', hint: 'apiKeyEnvHint' },
  model: { label: 'modelLabel', hint: 'modelHint' },
  baseUrl: { label: 'baseUrlLabel', hint: 'baseUrlHint' },
  confidenceFloor: { label: 'confidenceFloorLabel', hint: 'confidenceFloorHint' },
  confirmFloor: { label: 'confirmFloorLabel', hint: 'confirmFloorHint' },
  ledgerLimit: { label: 'ledgerLimitLabel', hint: 'ledgerLimitHint' },
}

/** Props accepted by every field. */
interface FieldProps {
  /** Translator bound to this feature's namespace. */
  translate: Translate
}

/** Props accepted by {@link TextField}. */
interface TextFieldProps extends FieldProps {
  /** The string field this component edits. */
  field: TextFieldName
}

/** Props accepted by {@link NumberField}. */
interface NumberFieldProps extends FieldProps {
  /** The numeric field this component edits. */
  field: NumberFieldName
}

/**
 * DOM id of a field's input.
 *
 * @param field - The field to address.
 * @returns The input's id.
 */
function fieldId(field: SettingsFieldName): string {
  return `${FIELD_ID_PREFIX}-${field}`
}

/**
 * DOM id of a field's hint paragraph.
 *
 * @param field - The field to address.
 * @returns The hint's id.
 */
function hintId(field: SettingsFieldName): string {
  return `${fieldId(field)}-hint`
}

/**
 * Build the class list for a text-style input.
 *
 * @param field - The field the input edits.
 * @returns The input's class names.
 */
function inputClass(field: SettingsFieldName): string {
  if (CODE_FIELDS.has(field)) {
    return 'jev-input jev-input--code'
  }
  return 'jev-input'
}

/**
 * Render a field's label, input and hint as one stacked column.
 *
 * @param props - The field, its copy keys, and the input to describe.
 * @returns The label, input and hint.
 */
function FieldShell({
  field,
  copy,
  translate,
  children,
}: FieldProps & {
  field: SettingsFieldName
  copy: FieldCopy
  children: ReactElement
}): ReactElement {
  return (
    <div className='jev-field'>
      <label className='jev-field__label' htmlFor={fieldId(field)}>
        {translate(copy.label)}
      </label>
      {children}
      <p className='jev-field__hint' id={hintId(field)}>
        {translate(copy.hint)}
      </p>
    </div>
  )
}

/**
 * Render one string field.
 *
 * @param props - The field to render and the bound translator.
 * @returns The labelled text input and its hint.
 */
function TextField({ field, translate }: TextFieldProps): ReactElement {
  const { value, disabled, onChange } = useTextField(field)
  return (
    <FieldShell field={field} copy={FIELD_COPY[field]} translate={translate}>
      <input
        id={fieldId(field)}
        className={inputClass(field)}
        type='text'
        value={value}
        disabled={disabled}
        aria-describedby={hintId(field)}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
    </FieldShell>
  )
}

/**
 * Render one numeric field.
 *
 * The input is textual rather than `type="number"`: the browser's numeric
 * control discards partial input such as a trailing separator, which is exactly
 * the state a user passes through while typing a fraction.
 *
 * @param props - The field to render and the bound translator.
 * @returns The labelled numeric input and its hint.
 */
function NumberField({ field, translate }: NumberFieldProps): ReactElement {
  const { value, disabled, onChange } = useNumberField(field)
  return (
    <FieldShell field={field} copy={FIELD_COPY[field]} translate={translate}>
      <input
        id={fieldId(field)}
        className='jev-input'
        type='text'
        inputMode='decimal'
        value={value}
        disabled={disabled}
        aria-describedby={hintId(field)}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
    </FieldShell>
  )
}

/**
 * Render the master switch.
 *
 * The control and its label share a row, because a switch is read as one line;
 * its help text still sits beneath, indented to the label rather than to the
 * box.
 *
 * @param props - The bound translator.
 * @returns The labelled checkbox and its hint.
 */
function ToggleField({ translate }: FieldProps): ReactElement {
  const { checked, disabled, onChange } = useToggleField()
  return (
    <div className='jev-field'>
      <div className='jev-check'>
        <input
          id={fieldId('enabled')}
          className='jev-check__input'
          type='checkbox'
          checked={checked}
          disabled={disabled}
          aria-describedby={hintId('enabled')}
          onChange={(event) => {
            onChange(event.target.checked)
          }}
        />
        <label className='jev-field__label' htmlFor={fieldId('enabled')}>
          {translate(FIELD_COPY.enabled.label)}
        </label>
      </div>
      <p className='jev-field__hint' id={hintId('enabled')}>
        {translate(FIELD_COPY.enabled.hint)}
      </p>
    </div>
  )
}

/**
 * Render every field the form edits.
 *
 * The field lists are data rather than markup, so adding a setting is an entry
 * here plus its copy keys, not another block of JSX inside the section.
 *
 * @param props - The bound translator.
 * @returns The switch followed by the string and numeric fields.
 */
function SettingsFields({ translate }: FieldProps): ReactElement {
  return (
    <>
      <ToggleField translate={translate} />
      {TEXT_FIELDS.map((field) => (
        <TextField key={field} field={field} translate={translate} />
      ))}
      {NUMBER_FIELDS.map((field) => (
        <NumberField key={field} field={field} translate={translate} />
      ))}
    </>
  )
}

export {
  FIELD_COPY,
  NumberField,
  SettingsFields,
  TextField,
  ToggleField,
  fieldId,
  hintId,
  inputClass,
  type FieldProps,
}

