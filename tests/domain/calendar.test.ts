import { afterEach, describe, expect, test, vi } from "vitest";

import {
  addCalendarDays,
  calendarDateToNeutralDate,
  calendarWeekDates,
  calendarWeekRange,
  localCalendarDate,
  parseIsoCalendarDate,
  requireIsoCalendarDate,
  startOfCalendarWeek,
} from "@/lib/domain/calendar";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("calendar dates", () => {
  test.each([
    ["2024-02-29", true],
    ["2023-02-29", false],
    ["2026-04-31", false],
    ["2026-00-10", false],
    ["2026-1-01", false],
    ["0000-01-01", false],
    ["10000-01-01", false],
  ])("validates canonical ISO date %s", (value, valid) => {
    expect(parseIsoCalendarDate(value) !== null).toBe(valid);
  });

  test("uses Monday-to-Sunday weeks across month and year boundaries", () => {
    expect(startOfCalendarWeek("2027-01-01")).toBe("2026-12-28");
    expect(calendarWeekRange("2027-01-01")).toEqual({
      startDate: "2026-12-28",
      endDate: "2027-01-03",
    });
    expect(calendarWeekDates("2027-01-01")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });

  test("calendar arithmetic is stable across Adelaide daylight-saving boundaries", () => {
    vi.stubEnv("TZ", "Australia/Adelaide");

    expect(addCalendarDays("2026-10-03", 1)).toBe("2026-10-04");
    expect(addCalendarDays("2027-04-03", 1)).toBe("2027-04-04");
    expect(calendarDateToNeutralDate("2026-10-04").toISOString()).toBe("2026-10-04T00:00:00.000Z");
    expect(localCalendarDate(new Date(2026, 9, 4, 0, 30))).toBe("2026-10-04");
  });

  test("rejects invalid dates and non-integer offsets", () => {
    expect(() => requireIsoCalendarDate("2026-02-30")).toThrow(RangeError);
    expect(() => addCalendarDays("2026-01-01", 0.5)).toThrow(RangeError);
    expect(() => localCalendarDate(new Date(Number.NaN))).toThrow(RangeError);
  });
});
