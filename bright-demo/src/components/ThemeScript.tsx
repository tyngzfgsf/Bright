import { STORAGE } from "@/lib/storage";

/**
 * Applies a saved theme override before first paint, so a dark-mode visitor
 * never sees a white flash. With no saved value the page stays on the system
 * preference, which globals.css already handles on its own.
 */
export default function ThemeScript() {
  const script = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
    STORAGE.theme,
  )});if(t==="dark"||t==="light"){document.documentElement.classList.add(t);}}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
