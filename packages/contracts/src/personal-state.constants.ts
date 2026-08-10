export const personalStateLedgerPolicyVersion = 'personal-state-ledger-v1' as const

export const personalStateInvalidationReasons = [
  'source_record_changed',
  'time_advanced',
  'plan_reflection_changed',
] as const
