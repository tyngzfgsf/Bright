import { site } from "./site";

export type Release = {
  tag: string;
  name: string;
  htmlUrl: string;
  publishedAt: string | null;
  body: string;
  prerelease: boolean;
  apk: { url: string; sizeMb: number } | null;
};

type GithubAsset = {
  name: string;
  browser_download_url: string;
  size: number;
};

type GithubRelease = {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  assets: GithubAsset[];
};

/**
 * Reads the public releases feed — the same one the Android app checks for
 * updates. Returns null on any failure so pages can fall back to a plain link
 * to GitHub rather than failing to render.
 */
export async function fetchReleases(): Promise<Release[] | null> {
  try {
    const response = await fetch(site.releasesApi, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "bright-web",
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as GithubRelease[];
    if (!Array.isArray(data)) return null;

    return data
      .filter((release) => !release.draft)
      .map((release) => {
        const apk = release.assets.find((asset) =>
          asset.name.toLowerCase().endsWith(".apk"),
        );
        return {
          tag: release.tag_name,
          name: release.name?.trim() || release.tag_name,
          htmlUrl: release.html_url,
          publishedAt: release.published_at,
          body: (release.body ?? "").trim(),
          prerelease: release.prerelease,
          apk: apk
            ? {
                url: apk.browser_download_url,
                sizeMb: Math.round((apk.size / 1_048_576) * 10) / 10,
              }
            : null,
        };
      });
  } catch {
    return null;
  }
}
