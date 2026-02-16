import { type Rarity } from "@/lib/lixiPolicy";
import { classNames, rarityClass } from "../hostStyles";
import { formatCurrency } from "../hostUtils";

type ResultSummaryProps = {
  guestNameDisplay: string;
  amount: number;
  rarity: Rarity;
};

export default function ResultSummary({
  guestNameDisplay,
  amount,
  rarity,
}: ResultSummaryProps) {
  return (
    <div className={classNames.resultBox}>
      <span>{guestNameDisplay} nhận:</span>
      <strong>{formatCurrency(amount)}</strong>
      <span className={`${classNames.rarityBadge} ${rarityClass(rarity)}`}>
        {rarity.toUpperCase()}
      </span>
    </div>
  );
}
