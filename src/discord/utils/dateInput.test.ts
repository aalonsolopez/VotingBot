import { describe, expect, it } from "vitest";
import { parseDateInput } from "./dateInput.js";

describe("parseDateInput", () => {
  it("interpreta DD-MM-YYYY HH:MM como dia-mes-ano", () => {
    const parsed = parseDateInput("12-01-2026 20:00");

    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(0);
    expect(parsed?.getDate()).toBe(12);
    expect(parsed?.getHours()).toBe(20);
    expect(parsed?.getMinutes()).toBe(0);
  });

  it("rechaza fechas con overflow", () => {
    expect(parseDateInput("31-02-2026 20:00")).toBeNull();
  });

  it("sigue aceptando ISO 8601", () => {
    const parsed = parseDateInput("2026-01-12T20:00:00+01:00");
    expect(parsed).not.toBeNull();
    expect(Number.isFinite(parsed?.getTime())).toBe(true);
  });
});
