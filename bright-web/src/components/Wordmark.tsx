import { site } from "@/lib/site";

/**
 * Logotype: three ascending bars (the "step" in the slogan) beside the name.
 * The bars lift on hover — the same acknowledgement the app gives a tap.
 */
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`group/mark flex items-center gap-2.5 ${className}`}>
      <span aria-hidden="true" className="flex items-end gap-[3px]">
        {[7, 11, 15].map((height, i) => (
          <span
            key={height}
            style={{ height, transitionDelay: `${i * 45}ms` }}
            className="block w-[3px] rounded-full bg-ink transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/mark:-translate-y-[2px]"
          />
        ))}
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.02em]">
        {site.name}
      </span>
    </span>
  );
}
