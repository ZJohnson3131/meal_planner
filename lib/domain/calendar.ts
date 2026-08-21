const ISO_CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const FIRST_SUPPORTED_YEAR = 1;
const LAST_SUPPORTED_YEAR = 9999;
const FIRST_MONTH = 1;
const LAST_MONTH = 12;
const FIRST_DAY_OF_MONTH = 1;
const FEBRUARY = 2;
const LEAP_YEAR_INTERVAL = 4;
const LEAP_YEAR_CENTURY_INTERVAL = 100;
const LEAP_YEAR_CYCLE = 400;
const LEAP_DAY_COUNT = 1;
const MONDAY_DAY_INDEX = 1;

export const DAYS_PER_CALENDAR_WEEK = 7;
export const CALENDAR_WEEK_END_OFFSET_DAYS = DAYS_PER_CALENDAR_WEEK - 1;

const DAYS_IN_MONTH = [
  31,
  28,
  31,
  30,
  31,
  30,
  31,
  31,
  30,
  31,
  30,
  31,
] as const;

declare const isoCalendarDateBrand: unique symbol;

/** A validated, four-digit proleptic-Gregorian calendar date. */
export type IsoCalendarDate = string & {
  readonly [isoCalendarDateBrand]: true;
};

export type CalendarDateParts = Readonly<{
  day: number;
  isoDate: IsoCalendarDate;
  month: number;
  year: number;
}>;

export type CalendarWeekRange = Readonly<{
  endDate: IsoCalendarDate;
  startDate: IsoCalendarDate;
}>;

export const MEAL_PLAN_STATUSES = ["planned", "completed", "skipped"] as const;
export type MealPlanStatus = (typeof MEAL_PLAN_STATUSES)[number];

function isLeapYear(year: number): boolean {
  return (
    year % LEAP_YEAR_CYCLE === 0 ||
    (year % LEAP_YEAR_INTERVAL === 0 &&
      year % LEAP_YEAR_CENTURY_INTERVAL !== 0)
  );
}

function daysInMonth(year: number, month: number): number {
  const baseDays = DAYS_IN_MONTH[month - FIRST_MONTH];

  if (baseDays === undefined) {
    return 0;
  }

  return month === FEBRUARY && isLeapYear(year)
    ? baseDays + LEAP_DAY_COUNT
    : baseDays;
}

function formatCalendarDateParts(
  year: number,
  month: number,
  day: number,
): IsoCalendarDate {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}` as IsoCalendarDate;
}

/**
 * Parses the product's canonical calendar-date representation without treating
 * it as a timestamp. Invalid and non-canonical values return null.
 */
export function parseIsoCalendarDate(value: string): CalendarDateParts | null {
  const match = ISO_CALENDAR_DATE_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (
    year < FIRST_SUPPORTED_YEAR ||
    year > LAST_SUPPORTED_YEAR ||
    month < FIRST_MONTH ||
    month > LAST_MONTH ||
    day < FIRST_DAY_OF_MONTH ||
    day > daysInMonth(year, month)
  ) {
    return null;
  }

  return { day, isoDate: value as IsoCalendarDate, month, year };
}

export function isIsoCalendarDate(value: string): value is IsoCalendarDate {
  return parseIsoCalendarDate(value) !== null;
}

export function requireIsoCalendarDate(value: string): IsoCalendarDate {
  const parsed = parseIsoCalendarDate(value);

  if (!parsed) {
    throw new RangeError("Expected a valid calendar date in YYYY-MM-DD format");
  }

  return parsed.isoDate;
}

/**
 * Captures a Date's local calendar fields. Call this in the browser for the
 * local-first MVP; server requests must receive the resulting string explicitly.
 */
export function localCalendarDate(date: Date): IsoCalendarDate {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Cannot read calendar fields from an invalid Date");
  }

  return requireIsoCalendarDate(
    formatCalendarDateParts(
      date.getFullYear(),
      date.getMonth() + FIRST_MONTH,
      date.getDate(),
    ),
  );
}

/**
 * Projects a calendar value onto UTC solely for stable arithmetic or display.
 * The returned Date is not a user instant and must never be persisted as one.
 */
export function calendarDateToNeutralDate(value: string): Date {
  const parsed = parseIsoCalendarDate(value);

  if (!parsed) {
    throw new RangeError("Expected a valid calendar date in YYYY-MM-DD format");
  }

  const { day, month, year } = parsed;
  const neutralDate = new Date(0);

  neutralDate.setUTCHours(0, 0, 0, 0);
  neutralDate.setUTCFullYear(year, month - FIRST_MONTH, day);

  return neutralDate;
}

/** Adds whole calendar days without consulting the runtime's local timezone. */
export function addCalendarDays(value: string, days: number): IsoCalendarDate {
  if (!Number.isSafeInteger(days)) {
    throw new RangeError("Calendar-day offset must be a safe integer");
  }

  const neutralDate = calendarDateToNeutralDate(value);
  neutralDate.setUTCDate(neutralDate.getUTCDate() + days);

  return requireIsoCalendarDate(
    formatCalendarDateParts(
      neutralDate.getUTCFullYear(),
      neutralDate.getUTCMonth() + FIRST_MONTH,
      neutralDate.getUTCDate(),
    ),
  );
}

/** Returns the Monday containing the supplied calendar date. */
export function startOfCalendarWeek(value: string): IsoCalendarDate {
  const neutralDate = calendarDateToNeutralDate(value);
  const dayIndex = neutralDate.getUTCDay();
  const daysSinceMonday =
    (dayIndex - MONDAY_DAY_INDEX + DAYS_PER_CALENDAR_WEEK) %
    DAYS_PER_CALENDAR_WEEK;

  return addCalendarDays(value, -daysSinceMonday);
}

/** Returns the inclusive, exactly-seven-day Monday-to-Sunday week. */
export function calendarWeekRange(value: string): CalendarWeekRange {
  const startDate = startOfCalendarWeek(value);

  return {
    endDate: addCalendarDays(startDate, CALENDAR_WEEK_END_OFFSET_DAYS),
    startDate,
  };
}

/** Enumerates the inclusive Monday-to-Sunday week, bounded to seven values. */
export function calendarWeekDates(value: string): readonly IsoCalendarDate[] {
  const { startDate } = calendarWeekRange(value);

  return Array.from({ length: DAYS_PER_CALENDAR_WEEK }, (_, dayOffset) =>
    addCalendarDays(startDate, dayOffset),
  );
}
