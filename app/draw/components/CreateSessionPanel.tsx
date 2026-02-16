import OtpPinInput from "@/app/components/OtpPinInput";
import { classNames } from "../hostStyles";

type CreateSessionPanelProps = {
  guestName: string;
  hostPin: string;
  pinLength: number;
  loading: boolean;
  onGuestNameChange: (value: string) => void;
  onHostPinChange: (value: string) => void;
  onCreate: () => void;
};

export default function CreateSessionPanel({
  guestName,
  hostPin,
  pinLength,
  loading,
  onGuestNameChange,
  onHostPinChange,
  onCreate,
}: CreateSessionPanelProps) {
  const canSubmit = !loading && guestName.trim().length >= 2 && hostPin.length === pinLength;

  return (
    <div className={classNames.block}>
      <h2 className={classNames.blockTitle}>Tạo lượt rút mới</h2>
      <label className={classNames.label} htmlFor="guest-name">
        Tên người rút
      </label>
      <input
        id="guest-name"
        className={classNames.input}
        value={guestName}
        onChange={(event) => onGuestNameChange(event.currentTarget.value)}
        placeholder="vd: Nguyen Van A"
      />
      <label className={classNames.label}>PIN chủ ví</label>
      <OtpPinInput value={hostPin} onChange={onHostPinChange} length={pinLength} disabled={loading} />
      <button type="button" className={classNames.primaryButton} disabled={!canSubmit} onClick={onCreate}>
        {loading ? "Đang tạo..." : "Tạo phiên"}
      </button>
    </div>
  );
}
