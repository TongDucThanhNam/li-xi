import CreateSessionPanel from "./CreateSessionPanel";
import PendingSessionPanel from "./PendingSessionPanel";

type PendingSessionSnapshot = {
  guestNameDisplay: string;
} | null;

type SessionSectionProps = {
  pendingSession: PendingSessionSnapshot;
  guestName: string;
  hostPin: string;
  pinLength: number;
  loading: boolean;
  isRevealing: boolean;
  onGuestNameChange: (value: string) => void;
  onHostPinChange: (value: string) => void;
  onCreate: () => void;
  onEnterGuest: () => void;
  onCancel: () => void;
};

export default function SessionSection({
  pendingSession,
  guestName,
  hostPin,
  pinLength,
  loading,
  isRevealing,
  onGuestNameChange,
  onHostPinChange,
  onCreate,
  onEnterGuest,
  onCancel,
}: SessionSectionProps) {
  if (!pendingSession) {
    return (
      <CreateSessionPanel
        guestName={guestName}
        hostPin={hostPin}
        pinLength={pinLength}
        loading={loading}
        onGuestNameChange={onGuestNameChange}
        onHostPinChange={onHostPinChange}
        onCreate={onCreate}
      />
    );
  }

  return (
    <PendingSessionPanel
      guestNameDisplay={pendingSession.guestNameDisplay}
      loading={loading}
      isRevealing={isRevealing}
      onEnterGuest={onEnterGuest}
      onCancel={onCancel}
    />
  );
}
