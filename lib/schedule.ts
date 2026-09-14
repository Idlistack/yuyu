export type ScheduleItem = { id: string; title: string; description: string; startDateTime: Date; endDateTime: Date; delayMinutes: number; sortOrder: number };
export function effectiveSchedule(items: ScheduleItem[]) {
  let delay = 0;
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => {
    const effectiveStart = new Date(item.startDateTime.getTime() + delay * 60_000);
    const effectiveEnd = new Date(item.endDateTime.getTime() + delay * 60_000);
    const result = { ...item, effectiveStart, effectiveEnd, cumulativeDelayMinutes: delay };
    delay += item.delayMinutes;
    return result;
  });
}
