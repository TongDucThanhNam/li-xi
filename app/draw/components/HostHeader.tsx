import { classNames } from "../hostStyles";

type HostHeaderProps = {
  ownerUsername: string;
  onSetup: () => void;
  onLeaderboard: () => void;
  onLogout: () => void;
};

export default function HostHeader({
  ownerUsername,
  onSetup,
  onLeaderboard,
  onLogout,
}: HostHeaderProps) {
  return (
    <header className={classNames.header}>
      <div>
        <h1 className={classNames.title}>Host Station</h1>
        <p className={classNames.subtitle}>Chủ ví: {ownerUsername}</p>
      </div>
      <div className={classNames.headerActions}>
        <button type="button" className={classNames.headerButton} onClick={onSetup}>
          Setup
        </button>
        <button type="button" className={classNames.headerButton} onClick={onLeaderboard}>
          Leaderboard
        </button>
        <button type="button" className={classNames.headerButton} onClick={onLogout}>
          Đăng xuất
        </button>
      </div>
    </header>
  );
}
