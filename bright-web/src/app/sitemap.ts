import type { MetadataRoute } from "next";
import { locales } from "@/i18n/routing";
import { site } from "@/lib/site";

const paths = ["", "/download", "/releases", "/faq", "/privacy", "/terms"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return locales.flatMap((locale) =>
    paths.map((path) => ({
      url: `${site.url}/${locale}${path}`,
      lastModified: new Date(),
      priority: path === "" ? 1 : 0.7,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, `${site.url}/${l}${path}`]),
        ),
      },
    })),
  );
}
