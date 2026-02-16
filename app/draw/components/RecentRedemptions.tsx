import type { Id } from "@/convex/_generated/dataModel";
import type { Rarity } from "@/lib/lixiPolicy";
import { classNames, rarityClass } from "../hostStyles";
import { formatCurrency, formatTime } from "../hostUtils";

type RecentRedemption = {
  id: Id<"redemptions">;
  guestNameDisplay: string;
  amount: number;
  rarity: Rarity;
  createdAt: number;
};

type RecentRedemptionsProps = {
  items: RecentRedemption[];
};

export default function RecentRedemptions({ items }: RecentRedemptionsProps) {
  return (
    <section className={classNames.block}>
      <h2 className={classNames.sideTitle}>Lượt rút gần đây</h2>
      <div className={classNames.historyList}>
        {items.length === 0 ? (
          <p className={classNames.empty}>Chưa có lượt rút nào.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className={classNames.historyItem}>
              <div className="flex flex-wrap items-center gap-2">
                <strong>{item.guestNameDisplay}</strong>
                <span className={`${classNames.rarityBadge} ${rarityClass(item.rarity)}`}>
                  {item.rarity}
                </span>
              </div>
              <div className={classNames.itemMeta}>
                <span>{formatCurrency(item.amount)}</span>
                <span>{formatTime(item.createdAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
