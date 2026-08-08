import { createRoot, type Root } from "react-dom/client";
import { Capsule } from "./Capsule";
import "./style.css";

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",
  runAt: "document_idle",
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: "speaktype-ui",
      position: "inline",
      anchor: "body",
      onMount: (container): Root => {
        const root = createRoot(container);
        root.render(<Capsule />);
        return root;
      },
      onRemove: (root) => root?.unmount(),
    });
    ui.mount();
  },
});
