import { describe, it, expect } from "vitest";
import { reservePort } from "./server-adapter.js";

describe("reservePort", () => {
  it("returns a valid port number", async () => {
    const port = await reservePort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });

  it("returns different ports on successive calls", async () => {
    const port1 = await reservePort();
    const port2 = await reservePort();
    expect(port1).not.toBe(port2);
  });
});
