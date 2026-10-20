// Tests for formats.js. Run with `npm test`.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { describePeriod, timeAgo } from "../../static/frontpagejews/formats.js";

describe("describePeriod", () => {
  test("names the month picked", () => {
    assert.equal(describePeriod("2024-03", 30), "March 2024");
  });

  test("says how many days back with no month picked", () => {
    assert.equal(describePeriod(null, 30), "last 30 days");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const before = (minutes) => new Date(now - minutes * 60_000);

  test("says just now under a minute", () => {
    assert.equal(timeAgo(before(0.5), now), "just now");
  });

  test("counts minutes under an hour", () => {
    assert.equal(timeAgo(before(1), now), "1 minute ago");
    assert.equal(timeAgo(before(59), now), "59 minutes ago");
  });

  test("counts whole hours under two days", () => {
    assert.equal(timeAgo(before(60), now), "1 hour ago");
    assert.equal(timeAgo(before(150), now), "2 hours ago");
    assert.equal(timeAgo(before(47 * 60), now), "47 hours ago");
  });

  test("counts whole days from two days on", () => {
    assert.equal(timeAgo(before(48 * 60), now), "2 days ago");
    assert.equal(timeAgo(before(80 * 60), now), "3 days ago");
  });
});
