import test from "node:test";
import assert from "node:assert/strict";
import {
  filterInsightsByAdName,
  parseDateRange,
  sanitizeInsightRow,
  SAFE_META_FIELDS
} from "../src/safety.js";

test("cost and budget fields are not present in the Meta request allowlist", () => {
  const forbiddenPatterns = [
    /^spend$/,
    /^cpc$/,
    /^cpm$/,
    /^cpp$/,
    /^cost_/,
    /roas/,
    /budget/,
    /bid/
  ];

  for (const field of SAFE_META_FIELDS) {
    assert.equal(
      forbiddenPatterns.some((pattern) => pattern.test(field)),
      false,
      `${field} can disclose cost data`
    );
  }
});

test("sanitizer strips direct and derived cost fields", () => {
  const result = sanitizeInsightRow({
    ad_name: "Video 01",
    impressions: "1000",
    clicks: "10",
    actions: [
      { action_type: "post_reaction", value: "20" },
      { action_type: "post_engagement", value: "35" },
      { action_type: "purchase", value: "3" }
    ],
    spend: "12.34",
    cpm: "12.34",
    cost_per_action_type: [{ action_type: "lead", value: "2.00" }],
    daily_budget: "5000",
    purchase_roas: [{ value: "4.2" }]
  });

  assert.deepEqual(result, {
    ad_name: "Video 01",
    impressions: 1000,
    clicks: 10,
    reactions: 20,
    engagements: 35,
    image_url: ""
  });
});

test("public response has exactly the approved fields", () => {
  const result = sanitizeInsightRow({
    ad_name: "Image 01",
    impressions: "50",
    clicks: "4",
    actions: [{ action_type: "post_reaction", value: "2" }],
    reach: "45",
    campaign_name: "Secret campaign",
    spend: "99.99"
  });

  assert.deepEqual(Object.keys(result), [
    "ad_name",
    "impressions",
    "clicks",
    "reactions",
    "engagements",
    "image_url"
  ]);
  assert.equal("actions" in result, false);
  assert.equal("spend" in result, false);
});

test("ad name filter only keeps names containing Instagram", () => {
  const rows = [
    { ad_name: "Instagram Reel 01" },
    { ad_name: "Facebook Feed 01" },
    { ad_name: "Summer instagram promotion" }
  ];

  assert.deepEqual(filterInsightsByAdName(rows, "Instagram"), [
    { ad_name: "Instagram Reel 01" },
    { ad_name: "Summer instagram promotion" }
  ]);
});

test("date range defaults to the last 30 inclusive days", () => {
  const range = parseDateRange(
    new URLSearchParams(),
    93,
    new Date("2026-08-03T12:00:00.000Z")
  );
  assert.deepEqual(range, { since: "2026-07-05", until: "2026-08-03" });
});

test("date range rejects an excessive interval", () => {
  const params = new URLSearchParams({ since: "2026-01-01", until: "2026-08-03" });
  assert.throws(() => parseDateRange(params, 93), /cannot exceed 93 days/);
});
