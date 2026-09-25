/**
 * Commission banding rules.
 *
 * Justin's rates step up with job size and he only gave one band on the call
 * ("up to 20,000 gets 3%"), so the important behaviours are: bands are
 * inclusive of their cap, the smallest matching band wins regardless of row
 * order, and a contract that no band covers returns null rather than a
 * confident $0 — that null is what makes the UI say "add a band" instead of
 * quietly under-reporting someone's pay.
 *
 * Run: pnpm --filter @workspace/api-server run test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { commissionFor } from "@workspace/db";

const upTo20kAt3 = [{ upToAmount: "20000.00", ratePercent: "3.000" }];

const fullTable = [
  { upToAmount: "20000.00", ratePercent: "3.000" },
  { upToAmount: "50000.00", ratePercent: "4.000" },
  { upToAmount: null, ratePercent: "5.000" },
];

test("applies the band's rate to the contract amount", () => {
  assert.equal(commissionFor(9300, upTo20kAt3), 279);
});

test("a band's cap is inclusive", () => {
  assert.equal(commissionFor(20000, upTo20kAt3), 600);
});

test("a contract above every band earns null, not zero", () => {
  assert.equal(commissionFor(25000, upTo20kAt3), null);
});

test("the smallest band that fits wins", () => {
  assert.equal(commissionFor(25000, fullTable), 1000); // 4% band
  assert.equal(commissionFor(15000, fullTable), 450); // 3% band
});

test("an open-ended band catches everything above the caps", () => {
  assert.equal(commissionFor(80000, fullTable), 4000); // 5%
});

test("row order does not matter — bands are sorted by cap", () => {
  const shuffled = [fullTable[2], fullTable[1], fullTable[0]];
  assert.equal(commissionFor(15000, shuffled), 450);
  assert.equal(commissionFor(80000, shuffled), 4000);
});

test("no contract amount means no commission", () => {
  assert.equal(commissionFor(null, fullTable), null);
  assert.equal(commissionFor(undefined, fullTable), null);
});

test("with no bands configured at all, nothing is claimed", () => {
  assert.equal(commissionFor(9300, []), null);
});

test("rounds to cents", () => {
  // 3% of 9333.33 = 279.9999 -> 280.00
  assert.equal(commissionFor(9333.33, upTo20kAt3), 280);
});
