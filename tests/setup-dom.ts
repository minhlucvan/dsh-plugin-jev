import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/*
 * A rendered tree that outlives its test leaks into the next one, and the
 * failure it causes is attributed to whichever test ran afterwards.
 */
afterEach(() => {
  cleanup()
})

