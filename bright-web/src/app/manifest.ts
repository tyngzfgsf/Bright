import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/** Generated once at build time: the site is a static export. */
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} — AI emergency-scenario training`,
    short_name: site.name,
    description:
      "An AI plays the patient or the doctor. You type what you'd actually do.",
    start_url: "/",
    display: "standalone",
    background_color: "#141619",
    theme_color: "#141619",
    icons: [
      { src: "/icon", sizes: "64x64", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
