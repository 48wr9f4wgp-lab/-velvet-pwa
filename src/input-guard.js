import "./ui-ja.js?v=48";
import "./flow-feedback.js?v=44";
import "./feed-bridge.js?v=44";
import "./media-viewer.js?v=49.4";

const UX_STYLESHEET = "./flow-ux.css?v=49.4";
if (!document.querySelector('link[data-velvet-flow-ux]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = UX_STYLESHEET;
  link.dataset.velvetFlowUx = "1";
  document.head.append(link);
}
