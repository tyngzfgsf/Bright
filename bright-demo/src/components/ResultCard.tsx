import BrightMark from "./BrightMark";

/**
 * The session result, laid out like the app's ShareResultCard: always black
 * with white text, whatever the page theme is doing.
 */
export default function ResultCard({
  scenario,
  score,
  note,
  slogan,
}: {
  scenario: string;
  score: string;
  note: string;
  slogan: string;
}) {
  return (
    <div className="w-[17rem] rounded-[1.4rem] bg-[#000000] px-8 py-9 text-center text-white shadow-float ring-1 ring-white/12">
      <span className="flex items-center justify-center gap-2">
        <BrightMark className="size-[17px]" />
        <span className="text-[16px] font-bold tracking-[-0.02em]">Bright</span>
      </span>

      <p className="mt-7 text-[12px] text-white/70">{scenario}</p>

      <p className="mt-2 flex items-end justify-center gap-1.5">
        <span className="tnum text-[3rem] font-bold leading-none tracking-[-0.04em]">
          {score}
        </span>
        <span className="mb-1.5 text-[14px] text-white/70">/10</span>
      </p>

      <p className="mt-5 text-[12px] font-semibold">{note}</p>

      <p className="mt-7 text-[10.5px] text-white/50">{slogan}</p>
    </div>
  );
}
