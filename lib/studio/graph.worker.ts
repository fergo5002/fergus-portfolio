import { buildGraph, type AtlasFile } from "./graph";
self.onmessage = (event: MessageEvent<AtlasFile[]>) => {
  try {
    self.postMessage({ graph: buildGraph(event.data) });
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
};
