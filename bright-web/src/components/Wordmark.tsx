import BrightMark from "./BrightMark";
import { site } from "@/lib/site";

/**
 * Logotype: the app's own icon mark beside the name. The sun lifts a little on
 * hover — the same acknowledgement the app gives a tap.
 */
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`group/mark flex items-center gap-2 ${className}`}>
      <BrightMark
        className="size-[22px]"
        sunClassName="transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/mark:-translate-y-[2px]"
      />
      <span className="text-[15px] font-semibold tracking-[-0.02em]">
        {site.name}
      </span>
    </span>
  );
}
