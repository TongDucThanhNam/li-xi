import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly(
  "cleanup expired public claim links",
  { minuteUTC: 7 },
  internal.migrations.cleanupExpiredPublicLinksCron
);

crons.hourly(
  "cleanup stale campaign asset reservations",
  { minuteUTC: 17 },
  internal.migrations.cleanupStaleReservedAssetsCron
);

export default crons;
