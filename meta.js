import { filterInsightsByAdName, SAFE_META_FIELDS, sanitizeInsightRow } from "./safety.js";

const MAX_META_PAGES = 100;

export async function fetchSafeInsights(config, dateRange, fetchImpl = fetch) {
  const firstUrl = new URL(
    `https://graph.facebook.com/${config.metaGraphVersion}` +
      `/act_${config.metaAdAccountId}/insights`
  );

  firstUrl.searchParams.set("access_token", config.metaAccessToken);
  firstUrl.searchParams.set("level", "ad");
  firstUrl.searchParams.set("fields", SAFE_META_FIELDS.join(","));
  firstUrl.searchParams.set("limit", "500");
  firstUrl.searchParams.set("time_range", JSON.stringify(dateRange));

  const rawRows = [];
  let nextUrl = firstUrl.toString();
  let pages = 0;

  while (nextUrl) {
    pages += 1;
    if (pages > MAX_META_PAGES) {
      throw new MetaApiError("Meta pagination exceeded the server safety limit.");
    }

    let response;
    try {
      response = await fetchImpl(nextUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(config.metaRequestTimeoutMs)
      });
    } catch (error) {
      if (error?.name === "TimeoutError") {
        throw new MetaApiError(
          `Meta did not respond within ${config.metaRequestTimeoutMs} ms.`
        );
      }
      throw new MetaApiError(`Could not connect to Meta: ${error?.message || "unknown error"}`);
    }
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.error) {
      const message = payload.error?.message || `Meta returned HTTP ${response.status}`;
      throw new MetaApiError(message, payload.error?.code);
    }

    if (Array.isArray(payload.data)) rawRows.push(...payload.data);
    nextUrl = payload.paging?.next || "";
  }

  const filteredRows = filterInsightsByAdName(rawRows, config.adNameContains);
  const creativeDetails = await fetchAdCreativeDetails(config, filteredRows, fetchImpl);
  return filteredRows.map((row) =>
    sanitizeInsightRow(
      row,
      creativeDetails.get(String(row.ad_id))?.imageUrl || "",
      creativeDetails.get(String(row.ad_id))?.postUrl || ""
    )
  );
}

async function fetchAdCreativeDetails(config, rows, fetchImpl) {
  const adIds = [...new Set(rows.map((row) => String(row.ad_id || "")).filter(Boolean))];
  const details = new Map();

  for (let index = 0; index < adIds.length; index += 50) {
    const ids = adIds.slice(index, index + 50);
    const url = new URL(`https://graph.facebook.com/${config.metaGraphVersion}/`);
    url.searchParams.set("ids", ids.join(","));
    url.searchParams.set(
      "fields",
      "creative{thumbnail_url,instagram_permalink_url,effective_object_story_id}"
    );
    url.searchParams.set("access_token", config.metaAccessToken);

    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(config.metaRequestTimeoutMs)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) continue;

      for (const id of ids) {
        const creative = payload[id]?.creative;
        if (!creative) continue;
        details.set(id, {
          imageUrl: typeof creative.thumbnail_url === "string" ? creative.thumbnail_url : "",
          postUrl: getPostUrl(creative)
        });
      }
    } catch {
      // Images are optional. Reporting data remains available if thumbnails fail.
    }
  }

  return details;
}

function getPostUrl(creative) {
  if (typeof creative.instagram_permalink_url === "string") {
    return creative.instagram_permalink_url;
  }

  const storyId = creative.effective_object_story_id;
  if (typeof storyId !== "string" || !storyId) return "";
  const separator = storyId.indexOf("_");
  if (separator > 0 && separator < storyId.length - 1) {
    const pageId = storyId.slice(0, separator);
    const postId = storyId.slice(separator + 1);
    return `https://www.facebook.com/${pageId}/posts/${postId}`;
  }
  return `https://www.facebook.com/${storyId}`;
}

export class MetaApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
