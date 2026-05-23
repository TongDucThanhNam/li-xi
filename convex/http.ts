import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { polar, polarWebhookPath } from "./polarClient";

const http = httpRouter();

auth.addHttpRoutes(http);
polar.registerRoutes(http, { path: polarWebhookPath });

export default http;
