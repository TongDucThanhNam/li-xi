import type { ReactNode } from "react";
import {
  classNames,
  lightOneStyle,
  lightThreeStyle,
  lightTwoStyle,
  noiseStyle,
  pageBackground,
} from "../hostStyles";

export default function HostShell({ children }: { children: ReactNode }) {
  return (
    <main className={classNames.page} style={pageBackground}>
      <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.05]" style={noiseStyle} />
      <div
        className="pointer-events-none absolute -left-[10%] -top-[20%] h-[800px] w-[800px] rounded-full opacity-30 blur-[100px]"
        style={lightOneStyle}
      />
      <div
        className="pointer-events-none absolute -bottom-[20%] -right-[10%] h-[600px] w-[600px] rounded-full opacity-[0.18] blur-[100px]"
        style={lightTwoStyle}
      />
      <div
        className="pointer-events-none absolute left-[40%] top-[40%] h-[400px] w-[400px] rounded-full opacity-[0.12] blur-[100px] mix-blend-overlay"
        style={lightThreeStyle}
      />
      {children}
    </main>
  );
}
