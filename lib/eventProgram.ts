export type EventProgramSession = {
  id: string;
  startDateTime: Date;
  endDateTime: Date;
  sortOrder: number;
  delayMinutes: number;
};

/**
 * Planned times remain immutable. A session's delay is accumulated only after
 * its own effective time is calculated, so it shifts later sessions without
 * changing that session's displayed start or end time.
 */
export function effectiveEventProgram<T extends EventProgramSession>(sessions: T[]) {
  let cumulativeDelayMinutes = 0;
  return [...sessions]
    .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime() || a.sortOrder - b.sortOrder)
    .map((session) => {
      // Existing rows created before the live-delay migration may not expose
      // the new field until their database migration has been applied.
      const delayMinutes = Number.isFinite(session.delayMinutes) ? session.delayMinutes : 0;
      const effectiveStartDateTime = new Date(
        session.startDateTime.getTime() + cumulativeDelayMinutes * 60_000,
      );
      const effectiveEndDateTime = new Date(
        session.endDateTime.getTime() + cumulativeDelayMinutes * 60_000,
      );
      const result = {
        ...session,
        delayMinutes,
        cumulativeDelayMinutes,
        effectiveStartDateTime,
        effectiveEndDateTime,
      };
      cumulativeDelayMinutes += delayMinutes;
      return result;
    });
}
