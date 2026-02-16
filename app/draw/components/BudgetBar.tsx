import { classNames } from "../hostStyles";
import { formatCurrency } from "../hostUtils";

type BudgetBarProps = {
  totalBudget: number;
  remainingBudget: number;
  availableUnits: number;
};

export default function BudgetBar({
  totalBudget,
  remainingBudget,
  availableUnits,
}: BudgetBarProps) {
  return (
    <div className={classNames.budgetBar}>
      <span className={classNames.budgetPill}>
        Tổng ngân sách: {formatCurrency(totalBudget)}
      </span>
      <span className={classNames.budgetPill}>
        Còn lại: {formatCurrency(remainingBudget)}
      </span>
      <span className={classNames.budgetPill}>Số tờ còn lại: {availableUnits}</span>
    </div>
  );
}
