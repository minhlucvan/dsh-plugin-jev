/**
 * Settings-model tests for the two fields the behavior tab adds.
 *
 * Both have a meaning that is not obvious from their type: a non-boolean has to
 * fall back rather than reach a switch, and an empty bank selection means
 * *every* bank rather than none. These cases pin that boundary, and the set
 * comparison the form's dirty check relies on.
 */
import { describe, expect, it } from 'vitest'

import type { ClientSettings } from '#src/client/settings'
import {
  defaultSettings,
  normalizeSettings,
  sameSettings,
} from '#src/client/settings'

const TEST_TIMEOUT = 5000

function testNormalizesTheAdoptionSwitch(): void {
  expect.hasAssertions()
  expect(normalizeSettings({ adoptionPrompt: false }).adoptionPrompt).toBe(false)
  /* A non-boolean falls back rather than reaching the switch as something else. */
  expect(normalizeSettings({ adoptionPrompt: 'yes' }).adoptionPrompt).toBe(true)
}

function testKeepsOnlyUsableBankIds(): void {
  expect.hasAssertions()
  /*
   * Anything but a non-empty string would put a checkbox on the form that
   * nothing corresponds to, and a duplicate would toggle twice.
   */
  expect(normalizeSettings({ banks: ['b', 'a', 'b', '', false] }).banks)
    .toStrictEqual(['b', 'a'])
  /* An unusable selection is the default: every bank this build ships. */
  expect(normalizeSettings({ banks: 'all' }).banks).toStrictEqual([])
}

function testComparesBankSelectionsAsSets(): void {
  expect.hasAssertions()
  const narrow: ClientSettings = { ...defaultSettings, banks: ['a', 'b'] }
  /* A reordered copy is not a change worth offering the user a save for. */
  expect(sameSettings(narrow, { ...narrow, banks: ['b', 'a'] })).toBe(true)
  expect(sameSettings(narrow, { ...narrow, banks: ['a'] })).toBe(false)
  expect(sameSettings(narrow, { ...narrow, banks: ['a', 'b', 'c'] })).toBe(false)
}

describe('behavior settings', () => {
  it('normalizes the adoption switch', { timeout: TEST_TIMEOUT }, testNormalizesTheAdoptionSwitch)

  it('keeps only usable bank ids', { timeout: TEST_TIMEOUT }, testKeepsOnlyUsableBankIds)

  it('compares bank selections as sets', { timeout: TEST_TIMEOUT }, testComparesBankSelectionsAsSets)
})
