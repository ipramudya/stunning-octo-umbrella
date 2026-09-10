export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function calendarMonth(month: Date) {
  const firstWeekday = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();

  return {
    cells: Array.from(
      { length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 },
      (_, index) => index - firstWeekday + 1,
    ),
    dateFrom: dateKey(month),
    dateTo: dateKey(
      new Date(month.getFullYear(), month.getMonth(), daysInMonth),
    ),
    daysInMonth,
  };
}

export function shiftMonth(month: Date, offset: number) {
  return new Date(month.getFullYear(), month.getMonth() + offset, 1);
}
