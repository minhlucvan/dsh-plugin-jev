/**
 * Content handling: classify a passage before it is copied or logged.
 *
 * @module dsh-plugin-jev/jev/catalog/content
 */

import type { JevQuestionBank } from './index.ts'

/**
 * Content handling.
 *
 * Used before material is copied into logs, prompts, or third-party calls, where
 * a wrong guess is a policy problem rather than a quality one.
 */
const CONTENT_BANK: JevQuestionBank = {
  id: 'content',
  title: 'Content handling',
  description:
    'Classify a passage before it is copied, logged, or sent onward: whether it carries '
    + 'personal or secret material, whether it is durable preference rather than a passing '
    + 'detail, and whether it is time sensitive.',
  questions: {
    contains_personal_data: {
      type: 'noul',
      instructions:
        'Does this text contain personally identifying information such as a full name, '
        + 'address, email, phone number, or government identifier?',
      criteria: {
        true: 'At least one identifying detail is present',
        false: 'No identifying detail is present',
      },
    },
    contains_secret: {
      type: 'noul',
      instructions:
        'Does this text contain a credential, private key, access token, or password?',
      criteria: {
        true: 'A credential-like value is present',
        false: 'No credential-like value is present',
      },
    },
    durability: {
      type: 'score',
      instructions: 'How durable is the information, if it were to be remembered?',
      criteria: [
        'A passing detail that will be stale within the session',
        'Useful for this project but not beyond it',
        'A stable preference or constraint worth carrying forward',
      ],
    },
    time_sensitive: {
      type: 'noul',
      instructions: 'Does this text become wrong or misleading as time passes?',
      criteria: {
        true: 'It describes a transient state',
        false: 'It remains true regardless of when it is read',
      },
    },
  },
}

export { CONTENT_BANK }
