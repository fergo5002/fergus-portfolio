"use server";

import { submitMeeting } from "@/lib/meeting-server";
import type { MeetingState } from "@/lib/meeting";

export async function meetingAction(previous: MeetingState, data: FormData): Promise<MeetingState> {
  return submitMeeting(previous, data);
}
