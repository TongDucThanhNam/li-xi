import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config.js";
import polar from "@convex-dev/polar/convex.config.js";
import r2 from "@convex-dev/r2/convex.config.js";
import shardedCounter from "@convex-dev/sharded-counter/convex.config.js";

const app = defineApp();

app.use(aggregate);
app.use(shardedCounter);
app.use(r2);
app.use(polar);

export default app;
