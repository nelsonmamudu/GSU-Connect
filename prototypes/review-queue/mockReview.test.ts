import test from "node:test";
import assert from "node:assert/strict";
import { createMockReview } from "./mockReview";
test("rep scope, oldest first and invited status are independent", () => {
  const db = createMockReview();
  assert.deepEqual(
    db.list("Class rep").map((x) => [x.id, !!x.invited]),
    [
      ["DEMO-001", false],
      ["DEMO-002", true],
    ]
  );
  assert.deepEqual(db.list("Unassigned rep"), []);
  assert.throws(() => db.decide("Class rep", "DEMO-004", "approved", "", ""));
  assert.throws(() =>
    db.decide("Class rep", "DEMO-001", "approved", "300", "")
  );
  assert.throws(() => db.decide("Admin", "DEMO-008", "approved", "200", ""));
});
test("reason, stale decisions, approved removal and invite rotation", () => {
  const db = createMockReview();
  assert.throws(() => db.decide("Admin", "DEMO-001", "rejected", "", " "));
  db.simulate("DEMO-001");
  assert.throws(
    () => db.decide("Admin", "DEMO-001", "approved", "200", ""),
    /Another reviewer/
  );
  db.decide("Admin", "DEMO-002", "approved", "300", "");
  assert.equal(db.list("Class rep").length, 0);
  assert.notEqual(
    db.invite("Class rep").link,
    db.invite("Class rep", true).link
  );
  assert.throws(() => db.invite("Unassigned rep"));
});
