export type AppRole = "admin" | "owner" | "user";
export type SubscriptionTier = "free" | "premium";

export type TierAccessLike = {
  subscriptionTier: SubscriptionTier | null | undefined;
};

export type RoleAccessLike = {
  appRole: AppRole | null | undefined;
};

export type AccessLike = TierAccessLike & RoleAccessLike;

export function isPremiumTier(subscriptionTier: SubscriptionTier | null | undefined) {
  return subscriptionTier === "premium";
}

export function isFreeTier(subscriptionTier: SubscriptionTier | null | undefined) {
  return !isPremiumTier(subscriptionTier);
}

export function getTierFlags(access: TierAccessLike) {
  return {
    isPremiumTier: isPremiumTier(access.subscriptionTier),
    isFreeTier: isFreeTier(access.subscriptionTier),
  };
}

export function isAdminRole(appRole: AppRole | null | undefined) {
  return appRole === "admin";
}

export function isOwnerRole(appRole: AppRole | null | undefined) {
  return appRole === "owner";
}

export function isUserRole(appRole: AppRole | null | undefined) {
  return appRole === "user";
}

export function getRoleFlags(access: RoleAccessLike) {
  return {
    isAdminRole: isAdminRole(access.appRole),
    isOwnerRole: isOwnerRole(access.appRole),
    isUserRole: isUserRole(access.appRole),
  };
}

export function getAccessFlags(access: AccessLike) {
  return {
    ...getTierFlags(access),
    ...getRoleFlags(access),
  };
}
