import { importChat } from "./lore";
self.onmessage = (e: MessageEvent<{ text: string; order: "dmy" | "mdy" }>) => {
  try {
    self.postMessage({ messages: importChat(e.data.text, e.data.order) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
