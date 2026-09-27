import { readChat, type Order } from "./lore";

/** Reads a chat off the main thread. With no order, it finds one and says whether it was sure. */
self.onmessage = (e: MessageEvent<{ text: string; order?: Order }>) => {
  try {
    self.postMessage(readChat(e.data.text, e.data.order));
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
