export const RATE_LIMIT_CLASS = {
  listResorts: 'read',
  resortDetail: 'read',
  resortUpsert: 'write',
  publish: 'write',
  listPublishes: 'read',
  health: 'read',
} as const

export type RateLimitClass = typeof RATE_LIMIT_CLASS[keyof typeof RATE_LIMIT_CLASS]
