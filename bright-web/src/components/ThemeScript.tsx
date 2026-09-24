import { THEME_STORAGE_KEY } from "@/lib/site";

/**
 * Applies a saved theme override before first paint. Without a saved value the
 * page stays on the system preference, which the CSS handles on its own.
 */
export default function ThemeScript() {
  const script = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
    THEME_STORAGE_KEY,
  )});if(t==="dark"||t==="light"){document.documentElement.classList.add(t);}}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
