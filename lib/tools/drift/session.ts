/**
 * The small piece of UI state whose transitions carry Drift's privacy claims.
 *
 * Keeping the source beside the persisted timestamp prevents two independent
 * booleans from disagreeing about whether a measurement is the worked example
 * and whether an older profile still exists on this machine.
 */
export type DriftSession = {
  source: "demo" | "visitor";
  savedAt: string | null;
  samples: string;
  draft: string;
};

export function demoSession(draft: string): DriftSession {
  return { source: "demo", savedAt: null, samples: "", draft };
}

export function canMeasure(session: DriftSession): boolean {
  return session.source === "visitor";
}

export function afterRestore(session: DriftSession, savedAt: string): DriftSession {
  return { ...session, source: "visitor", savedAt };
}

/** A new in-memory profile does not erase an older saved one. */
export function afterBuild(session: DriftSession): DriftSession {
  return { ...session, source: "visitor" };
}

export function afterSave(session: DriftSession, savedAt: string): DriftSession {
  return { ...session, source: "visitor", savedAt };
}

export function afterDemo(session: DriftSession, draft: string): DriftSession {
  return { ...session, source: "demo", draft };
}

/** A failed deletion changes nothing; a successful one clears both text fields. */
export function afterDelete(
  session: DriftSession,
  succeeded: boolean,
  demoDraft: string,
): DriftSession {
  return succeeded ? demoSession(demoDraft) : session;
}
