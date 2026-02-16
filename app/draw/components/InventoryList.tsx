import type { Id } from "@/convex/_generated/dataModel";
import type { Rarity } from "@/lib/lixiPolicy";
import { classNames, rarityClass } from "../hostStyles";
import { formatCurrency } from "../hostUtils";

type InventoryItem = {
  id: Id<"budgetItems">;
  amount: number;
  rarity: Rarity;
  remainingQuantity: number;
  initialQuantity: number;
};

type InventoryListProps = {
  items: InventoryItem[];
};

export default function InventoryList({ items }: InventoryListProps) {
  return (
    <section className={classNames.block}>
      <h2 className={classNames.sideTitle}>Tồn kho hiện tại</h2>
      <div className={classNames.inventoryList}>
        {items.map((item) => (
          <div key={item.id} className={classNames.inventoryItem}>
            <div className="flex flex-wrap items-center gap-2">
              <strong>{formatCurrency(item.amount)}</strong>
              <span className={`${classNames.rarityBadge} ${rarityClass(item.rarity)}`}>
                {item.rarity}
              </span>
            </div>
            <span>
              {item.remainingQuantity} / {item.initialQuantity} tờ
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
