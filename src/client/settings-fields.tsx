/**
 * The settings fields: presentational components with no state of their own.
 *
 * Each field reads and writes through a hook, so none of them receives a value,
 * a change handler, or the host scope as props — which is what lets a field be
 * rendered twice, or moved, without rewiring anything. Labels and hints are
 * locale keys looked up in `FIELD_COPY`, never strings written here.
 *
 * Every field is a stacked column: label, control, help text, with the host's
 * own styling in `styles.ts`; this file only names the parts.
 *
 * @module dsh-plugin-jev/client/settings-fields
 */

import type { ReactElement } from 'react'

import {
  useBanksField,
  useNumberField,
  useTextField,
  useToggleField,
} from './hooks.ts'
import type { MessageKey } from './locale.ts'
import type {
  NumberFieldName,
  SettingsFieldName,
  TextFieldName,
  ToggleFieldName,
} from './settings.ts'
import type { Translate } from './translate.ts'

/** DOM id prefix for every field, so each label points at its own input. */
const FIELD_ID_PREFIX = 'dsh-plugin-jev'

/**
 * String fields, rendered in this order. `apiKeyEnv` is deliberately absent:
 * the key is typed into the API-key tab, so no user supplies a variable name.
 */
const TEXT_FIELDS: readonly TextFieldName[] = ['model', 'baseUrl']

/** Switches, rendered in this order. */
const TOGGLE_FIELDS: readonly ToggleFieldName[] = ['enabled', 'adoptionPrompt']

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

/**
 * Copy keys for every field that has copy. The bank group is built from the
 * catalog, so its label and hint are its own keys rather than entries here.
 */
const FIELD_COPY: Record<Exclude<SettingsFieldName, 'banks'>, FieldCopy> = {
  enabled: { label: 'enabledLabel', hint: 'enabledHint' },
  adoptionPrompt: { label: 'adoptionPromptLabel', hint: 'adoptionPromptHint' },
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

/** Props accepted by {@link ToggleField}. */
interface ToggleFieldProps extends FieldProps {
  /** The boolean field this component edits. */
  field: ToggleFieldName
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
 * The input is textual rather than `type="number"`, because the browser's
 * numeric control discards the partial input a user types through.
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
 * Render one switch.
 *
 * The control and its label share a row, because a switch is read as one line;
 * its help text still sits beneath, indented to the label rather than the box.
 *
 * @param props - The field to render and the bound translator.
 * @returns The labelled checkbox and its hint.
 */
function ToggleField({ field, translate }: ToggleFieldProps): ReactElement {
  const { checked, disabled, onChange } = useToggleField(field)
  return (
    <div className='jev-field'>
      <div className='jev-check'>
        <input
          id={fieldId(field)}
          className='jev-check__input'
          type='checkbox'
          checked={checked}
          disabled={disabled}
          aria-describedby={hintId(field)}
          onChange={(event) => {
            onChange(event.target.checked)
          }}
        />
        <label className='jev-field__label' htmlFor={fieldId(field)}>
          {translate(FIELD_COPY[field].label)}
        </label>
      </div>
      <p className='jev-field__hint' id={hintId(field)}>
        {translate(FIELD_COPY[field].hint)}
      </p>
    </div>
  )
}

/**
 * DOM id of one bank's checkbox.
 *
 * @param id - The bank's own id.
 * @returns The checkbox's id.
 */
function bankId(id: string): string {
  return `${FIELD_ID_PREFIX}-bank-${id}`
}

/**
 * Render one checkbox per question bank this build ships.
 *
 * An empty selection means every bank, so the boxes open checked; turning one
 * off is what stores an explicit subset. A catalog that could not be read is
 * reported rather than shown as an empty group, which would read as "this
 * build ships no banks" rather than as a failed read.
 *
 * @param props - The bound translator.
 * @returns The labelled bank checkboxes, or the failure notice.
 */
function BanksField({ translate }: FieldProps): ReactElement {
  const { banks, failed, disabled, isOn, toggle } = useBanksField()
  if (failed) {
    return (
      <div className='jev-field'>
        <p className='jev-field__label'>{translate('banksLabel')}</p>
        <p className='jev-alert' role='alert'>{translate('banksUnavailable')}</p>
      </div>
    )
  }
  return (
    <div className='jev-field'>
      <p className='jev-field__label'>{translate('banksLabel')}</p>
      <p className='jev-field__hint'>{translate('banksHint')}</p>
      {banks.map((bank) => (
        <div className='jev-check' key={bank.id}>
          <input
            id={bankId(bank.id)}
            className='jev-check__input'
            type='checkbox'
            checked={isOn(bank.id)}
            disabled={disabled}
            onChange={(event) => {
              toggle(bank.id, event.target.checked)
            }}
          />
          <label className='jev-field__label' htmlFor={bankId(bank.id)}>
            {bank.title}
          </label>
        </div>
      ))}
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
 * @returns The switches, the string and numeric fields, and the bank group.
 */
function SettingsFields({ translate }: FieldProps): ReactElement {
  return (
    <>
      {TOGGLE_FIELDS.map((field) => (
        <ToggleField key={field} field={field} translate={translate} />
      ))}
      {TEXT_FIELDS.map((field) => (
        <TextField key={field} field={field} translate={translate} />
      ))}
      {NUMBER_FIELDS.map((field) => (
        <NumberField key={field} field={field} translate={translate} />
      ))}
      <BanksField translate={translate} />
    </>
  )
}

export {
  BanksField,
  FIELD_COPY,
  NumberField,
  SettingsFields,
  TextField,
  ToggleField,
  bankId,
  fieldId,
  hintId,
  inputClass,
  type FieldProps,
  type ToggleFieldProps,
}

