/**
 * OpenNext config for deploying knowledge-compounder to Cloudflare Workers.
 *
 * Defaults: in-memory cache (no R2 KV needed), no incremental revalidation.
 * Every page that touches D1 sets `dynamic = "force-dynamic"`.
 */

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
