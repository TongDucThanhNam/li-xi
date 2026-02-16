import type { Rarity } from "@/lib/lixiPolicy";
import ResultSummary from "./ResultSummary";

type HostFeedbackProps = {
  error: string;
  notice: string;
  result: {
    guestNameDisplay: string;
    amount: number;
    rarity: Rarity;
  } | null;
};

export default function HostFeedback({ error, notice, result }: HostFeedbackProps) {
  return (
    <>
      {error ? (
        <p className="mt-3 rounded-[10px] border border-[rgba(255,132,132,0.5)] bg-[rgba(109,16,16,0.6)] px-3 py-2 text-[#ffd2d2]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-3 rounded-[10px] border border-[rgba(150,233,172,0.48)] bg-[rgba(6,96,36,0.4)] px-3 py-2 text-[#d7ffe4]">
          {notice}
        </p>
      ) : null}
      {result ? (
        <ResultSummary
          guestNameDisplay={result.guestNameDisplay}
          amount={result.amount}
          rarity={result.rarity}
        />
      ) : null}
    </>
  );
}
