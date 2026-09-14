export type EventProgramSession = {
  id: string;
  trackId?: string | null;
  startDateTime: Date;
  endDateTime: Date;
  sortOrder: number;
  delayMinutes: number;
};

/**
 * Planned times remain immutable. A session's delay is accumulated only after
 * its own effective time is calculated, so it shifts later sessions in the
 * same programme track without changing planned times in any track.
 */
export function effectiveEventProgram<T extends EventProgramSession>(sessions: T[]) {
  const cumulativeDelayByTrack = new Map<string, number>();
  return [...sessions]
    .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime() || a.sortOrder - b.sortOrder)
    .map((session) => {
      // Existing rows created before the live-delay migration may not expose
      // the new field until their database migration has been applied.
      const delayMinutes = Number.isFinite(session.delayMinutes) ? session.delayMinutes : 0;
      const trackId = session.trackId || "legacy-default-track";
      const cumulativeDelayMinutes = cumulativeDelayByTrack.get(trackId) ?? 0;
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
      cumulativeDelayByTrack.set(trackId, cumulativeDelayMinutes + delayMinutes);
      return result;
    });
}

export function conflictingTrackSessionIds<T extends Pick<EventProgramSession, "id" | "trackId" | "startDateTime" | "endDateTime">>(sessions: T[]) {
  const conflicts = new Set<string>();
  const byTrack = new Map<string, T[]>();
  for (const session of sessions) {
    const trackId = session.trackId || "legacy-default-track";
    byTrack.set(trackId, [...(byTrack.get(trackId) ?? []), session]);
  }
  for (const sessionsInTrack of byTrack.values()) {
    const ordered = [...sessionsInTrack].sort(
      (a, b) => a.startDateTime.getTime() - b.startDateTime.getTime(),
    );
    for (let index = 0; index < ordered.length; index += 1) {
      for (let next = index + 1; next < ordered.length; next += 1) {
        const current = ordered[index]!;
        const candidate = ordered[next]!;
        if (candidate.startDateTime >= current.endDateTime) break;
        conflicts.add(current.id);
        conflicts.add(candidate.id);
      }
    }
  }
  return conflicts;
}
