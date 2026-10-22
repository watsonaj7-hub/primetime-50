import { expect, it } from "vitest";
import postgres from "postgres";
import { completeProfile } from "../sql/draft-orders.mjs";
import { validProfile } from "../fixture";

it("binds the shared completion fixture as a JSON object with the installed postgres.js serializer", async () => {
  // The actual driver's query is lazy: do not await/execute it. Query.args holds
  // the value passed to Bind after PostgreSQL describes $1::jsonb as OID3802.
  // This is a driver-boundary contract, not database or concurrency execution.
  const db = postgres({ max: 1, prepare: false });
  try {
    const query = completeProfile(db, validProfile);
    const [parameter] = Object.getOwnPropertyDescriptor(query, "args")!.value;
    const serializeJsonb = db.options.serializers[3802];
    expect(JSON.parse(String(serializeJsonb(parameter)))).toEqual(validProfile);
    // Negative control: pre-encoding causes the installed driver to send a
    // JSON string, matching the controller's actual database diagnostic.
    expect(typeof JSON.parse(String(serializeJsonb(JSON.stringify(validProfile))))).toBe("string");
  } finally { await db.end(); }
});
