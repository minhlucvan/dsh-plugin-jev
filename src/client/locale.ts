/**
 * Feature-owned locale dictionaries for the client face.
 *
 * Every product-visible string lives here: headings, field labels and hints,
 * button text, the usage panel's column headers, and its loading, empty and
 * failure copy. Components receive the translator as a prop and never invent
 * fallback copy, so a missing key is a visible gap rather than English leaking
 * into another language.
 *
 * @module dsh-plugin-jev/client/locale
 */

import type { LocaleDictionaries } from './contracts.ts'

/** Single namespace owned by this feature. */
const LOCALE_NAMESPACE = 'dsh-plugin-jev'

/** The reference dictionary. Every other language must cover its key set. */
const en = {
  nav: 'Jev',
  heading: 'Jev settings',
  description:
    'Typed, calibrated decisions from TypeSafe System One, and the token accounting they cost.',
  enabledLabel: 'Enabled',
  enabledHint: 'When off, the plugin loads without contacting TypeSafe.',
  apiKeyEnvLabel: 'API key variable',
  apiKeyEnvHint:
    'Name of the environment variable holding the TypeSafe key. The key itself is never stored here.',
  modelLabel: 'Model',
  modelHint: 'Model id or alias sent with every evaluation.',
  baseUrlLabel: 'Endpoint',
  baseUrlHint: 'Base URL of the TypeSafe evaluation endpoint.',
  confidenceFloorLabel: 'Confidence floor',
  confidenceFloorHint:
    'Answers below this confidence are escalated instead of acted on. Between 0 and 1.',
  confirmFloorLabel: 'Confirm floor',
  confirmFloorHint:
    'At or above this confidence a high-risk answer may act unreviewed. Between 0 and 1.',
  ledgerLimitLabel: 'Ledger retention',
  ledgerLimitHint: 'How many recent evaluations the usage ledger keeps.',
  save: 'Save',
  saving: 'Saving…',
  reset: 'Reset',
  saveFailed: 'Could not save',
  usageHeading: 'Token ledger',
  usageDescription:
    'What this session has spent on evaluations, and what those tokens bought.',
  usageRefresh: 'Refresh',
  usageRefreshing: 'Refreshing…',
  usageLoading: 'Reading the ledger…',
  usageEmpty: 'No evaluations recorded yet.',
  usageFailed: 'Could not read the ledger',
  usageUnknown: 'reason not reported',
  healthLabel: 'Plugin state',
  healthLive: 'live',
  healthDisabled: 'disabled',
  healthModelLabel: 'answering as',
  usageTotalsHeading: 'Cumulative totals',
  usageCalls: 'Calls',
  usageInputTokens: 'Billed input tokens',
  usageOutputTokens: 'Free output tokens',
  usageMegaTokens: 'Billed volume (Mtok)',
  usageQuestions: 'Questions',
  usageStateChars: 'State characters',
  usageByToolHeading: 'By tool',
  usageRecentHeading: 'Recent evaluations',
  usageColumnWhen: 'When',
  usageColumnTool: 'Tool',
  usageColumnModel: 'Model',
  usageColumnQuestions: 'Questions',
  usageColumnStateChars: 'State chars',
  usageColumnInputTokens: 'Input tokens',
  usageColumnOutputTokens: 'Output tokens',
  usageColumnDuration: 'Duration',
  usageMillis: 'ms',
  usageCatalogHeading: 'Question banks',
  usageCatalogEmpty: 'This build ships no question banks.',
} as const

/** Keys the reference dictionary declares. */
type MessageKey = keyof typeof en

/**
 * Simplified Chinese dictionary, constrained to the reference key set.
 *
 * The explicit `Record<MessageKey, string>` annotation is the constraint:
 * adding a key to the reference dictionary without translating it fails the
 * build rather than shipping a missing string.
 */
const zh: Record<MessageKey, string> = {
  nav: 'Jev',
  heading: 'Jev 设置',
  description: '来自 TypeSafe System One 的类型化决策，以及它们消耗的 token 账目。',
  enabledLabel: '启用',
  enabledHint: '关闭后，插件会在不访问 TypeSafe 的情况下加载。',
  apiKeyEnvLabel: 'API 密钥变量',
  apiKeyEnvHint: '保存 TypeSafe 密钥的环境变量名。密钥本身不会保存在这里。',
  modelLabel: '模型',
  modelHint: '每次评估发送的模型 id 或别名。',
  baseUrlLabel: '端点',
  baseUrlHint: 'TypeSafe 评估端点的基址。',
  confidenceFloorLabel: '置信度下限',
  confidenceFloorHint: '低于该置信度的答案会升级处理而不会直接执行。取值 0 到 1。',
  confirmFloorLabel: '确认下限',
  confirmFloorHint: '达到或超过该置信度时，高风险答案可直接执行。取值 0 到 1。',
  ledgerLimitLabel: '账本保留条数',
  ledgerLimitHint: '用量账本保留的最近评估条数。',
  save: '保存',
  saving: '保存中…',
  reset: '重置',
  saveFailed: '保存失败',
  usageHeading: 'Token 账本',
  usageDescription: '本次会话在评估上花费的 token，以及这些 token 换来了什么。',
  usageRefresh: '刷新',
  usageRefreshing: '刷新中…',
  usageLoading: '正在读取账本…',
  usageEmpty: '还没有记录任何评估。',
  usageFailed: '无法读取账本',
  usageUnknown: '未报告原因',
  healthLabel: '插件状态',
  healthLive: '运行中',
  healthDisabled: '已禁用',
  healthModelLabel: '当前模型',
  usageTotalsHeading: '累计合计',
  usageCalls: '调用次数',
  usageInputTokens: '计费输入 token',
  usageOutputTokens: '免费输出 token',
  usageMegaTokens: '计费量（Mtok）',
  usageQuestions: '问题数',
  usageStateChars: '状态字符数',
  usageByToolHeading: '按工具',
  usageRecentHeading: '最近评估',
  usageColumnWhen: '时间',
  usageColumnTool: '工具',
  usageColumnModel: '模型',
  usageColumnQuestions: '问题数',
  usageColumnStateChars: '状态字符',
  usageColumnInputTokens: '输入 token',
  usageColumnOutputTokens: '输出 token',
  usageColumnDuration: '耗时',
  usageMillis: '毫秒',
  usageCatalogHeading: '问题库',
  usageCatalogEmpty: '当前构建不包含问题库。',
}

/** Dictionaries registered under this feature's namespace. */
const locales: LocaleDictionaries = { en, zh }

export { LOCALE_NAMESPACE, locales, type MessageKey }
