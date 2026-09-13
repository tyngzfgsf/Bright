import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Defaults: no incremental cache binding — bright-web's pages are static at build time, and the
// middleware only redirects to a locale prefix.
export default defineCloudflareConfig();
