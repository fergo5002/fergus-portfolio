"use server";

import { submitContact, type ContactState } from "@/lib/contact-server";

/**
 * The server action `components/ContactForm.tsx` posts to.
 *
 * A wrapper and nothing else. All the behaviour lives in `lib/contact-server.ts`
 * so it can be driven by tests: a `"use server"` module is a network boundary,
 * and putting logic behind one is how a failure path ends up only ever being
 * exercised by a stranger who has already typed a message.
 */
export async function contactAction(
  prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  return submitContact(prev, formData);
}
