import { filterInsightsByAdName, SAFE_META_FIELDS, sanitizeInsightRow } from "./safety.js";

const MAX_META_PAGES = 100;

export async function fetchSafeInsights(config, dateRange, fetchImpl = fetch) {
  const rawRows = await fetchInsightRows(
    config,
    dateRange,
    SAFE_META_FIELDS,
    fetchImpl
  );

  const filteredRows = filterInsightsByAdName(rawRows, config.adNameContains);
  const creativeDetails = await fetchAdCreativeDetails(config, filteredRows, fetchImpl);
  return filteredRows.map((row) =>
    sanitizeInsightRow(
      row,
      creativeDetails.get(String(row.ad_id))?.imageUrl || "",
      creativeDetails.get(String(row.ad_id))?.postUrl || "",
      creativeDetails.get(String(row.ad_id))?.pageName || ""
    )
  );
}

export async function fetchDailyReach(config, dateRange, fetchImpl = fetch) {
  const rawRows = await fetchInsightRows(
    config,
    dateRange,
    ["ad_name", "reach", "date_start"],
    fetchImpl,
    "1"
  );

  return filterInsightsByAdName(rawRows, config.adNameContains).map((row) => ({
    date: typeof row.date_start === "string" ? row.date_start : "",
    ad_name: typeof row.ad_name === "string" ? row.ad_name : "",
    reach: toNonNegativeNumber(row.reach)
  }));
}

async function fetchInsightRows(config, dateRange, fields, fetchImpl, timeIncrement = "") {
  const firstUrl = new URL(
    `https://graph.facebook.com/${config.metaGraphVersion}` +
      `/act_${config.metaAdAccountId}/insights`
  );

  firstUrl.searchParams.set("access_token", config.metaAccessToken);
  firstUrl.searchParams.set("level", "ad");
  firstUrl.searchParams.set("fields", fields.join(","));
  firstUrl.searchParams.set("limit", "500");
  firstUrl.searchParams.set("time_range", JSON.stringify(dateRange));
  if (timeIncrement) firstUrl.searchParams.set("time_increment", timeIncrement);

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

  return rawRows;
}

function toNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
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
      "creative{thumbnail_url,instagram_permalink_url,effective_object_story_id,object_story_spec}"
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
          postUrl: getPostUrl(creative),
          pageId: getPageId(creative),
          pageName: ""
        });
      }
    } catch {
      // Images are optional. Reporting data remains available if thumbnails fail.
    }
  }

  const pageIds = [...new Set([...details.values()].map((item) => item.pageId).filter(Boolean))];
  const pageNames = await fetchPageNames(config, pageIds, fetchImpl);
  for (const detail of details.values()) {
    detail.pageName = pageNames.get(detail.pageId) || "";
  }

  return details;
}

async function fetchPageNames(config, pageIds, fetchImpl) {
  const names = new Map();
  for (let index = 0; index < pageIds.length; index += 50) {
    const ids = pageIds.slice(index, index + 50);
    const url = new URL(`https://graph.facebook.com/${config.metaGraphVersion}/`);
    url.searchParams.set("ids", ids.join(","));
    url.searchParams.set("fields", "name");
    url.searchParams.set("access_token", config.metaAccessToken);
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(config.metaRequestTimeoutMs)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) continue;
      for (const id of ids) {
        if (typeof payload[id]?.name === "string") names.set(id, payload[id].name);
      }
    } catch {
      // Page identity is optional and does not block reporting data.
    }
  }
  return names;
}

function getPageId(creative) {
  const specPageId = creative.object_story_spec?.page_id;
  if (specPageId !== undefined && specPageId !== null) return String(specPageId);
  const storyId = creative.effective_object_story_id;
  if (typeof storyId !== "string") return "";
  const separator = storyId.indexOf("_");
  return separator > 0 ? storyId.slice(0, separator) : "";
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
