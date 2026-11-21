/**
 * The owner-approved first-release scope.
 *
 * `false` means the feature is not offered in this release. The interface must
 * not link to it and the workspace should not fetch or subscribe to its tables,
 * so a stale/old client is not the only thing keeping it quiet. This is still a
 * client-side restriction: it does not revoke database privileges or stop other
 * clients from calling the APIs. Server-side enforcement is tracked separately
 * in the launch checklist.
 */
export const LAUNCH_SCOPE = {
  marketplace: false,
  ridesErrands: false,
  /** Anonymous posts/comments are a limited pilot and stay hidden until gated. */
  anonymousFeed: false,
  anonymousComments: false,
  /** One-to-one voice calls are a limited pilot and stay hidden until gated. */
  voiceCalls: false,
} as const;

export type LaunchFeature = keyof typeof LAUNCH_SCOPE;

export function isLaunchFeatureEnabled(feature: LaunchFeature): boolean {
  return Boolean(LAUNCH_SCOPE[feature]);
}
