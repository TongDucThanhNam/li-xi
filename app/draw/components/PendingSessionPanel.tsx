import { classNames } from "../hostStyles";

type PendingSessionPanelProps = {
  guestNameDisplay: string;
  loading: boolean;
  isRevealing: boolean;
  onEnterGuest: () => void;
  onCancel: () => void;
};

export default function PendingSessionPanel({
  guestNameDisplay,
  loading,
  isRevealing,
  onEnterGuest,
  onCancel,
}: PendingSessionPanelProps) {
  return (
    <div className={classNames.block}>
      <h2 className={classNames.blockTitle}>Phiên đang chờ: {guestNameDisplay}</h2>
      <button type="button" className={classNames.primaryButton} disabled={loading} onClick={onEnterGuest}>
        Vào giao diện người rút
      </button>
      <button type="button" className={classNames.secondaryButton} disabled={loading || isRevealing} onClick={onCancel}>
        Hủy phiên hiện tại
      </button>
    </div>
  );
}
