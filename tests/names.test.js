import { test } from "node:test";
import assert from "node:assert/strict";
import { isOffensive, safeName } from "../shared/names.js";

test("offensive names are caught, even disguised", () => {
  for (const n of ["fuck", "F.u.u.c.k", "sh1t lord", "N1gg3r", "big c0ck", "RAPE", "hitler fan"]) assert.ok(isOffensive(n), n);
  assert.equal(safeName("sh1t"), "Stellarch");
});

test("ordinary and astronomy names pass", () => {
  for (const n of ["Paul", "Overmind Vega", "Captain Null", "Scunthorpe", "Peacock", "Dickens", "Grape Nebula", "Spicy Pulsar", "Therapist", "Lady Parsec", "Sirius B"]) assert.ok(!isOffensive(n), n);
});
