export const MEMBERSHIP_TIERS = {
  BRONZE: 'Bronze',
  SILVER: 'Silver',
  GOLD: 'Gold'
} as const;

export const TIER_THRESHOLDS = {
  BRONZE: 0,
  SILVER: 3,
  GOLD: 6
} as const;

export function calculateTier(acquisitions: number): string {
  if (acquisitions >= TIER_THRESHOLDS.GOLD) {
    return MEMBERSHIP_TIERS.GOLD;
  }
  if (acquisitions >= TIER_THRESHOLDS.SILVER) {
    return MEMBERSHIP_TIERS.SILVER;
  }
  return MEMBERSHIP_TIERS.BRONZE;
}
