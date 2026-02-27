"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function VoiceCalibratingPopup() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (searchParams.get("voiceCalibrating") === "1") {
      setVisible(true);
      // Clean the URL without triggering a navigation
      window.history.replaceState({}, "", "/");
    }
  }, [searchParams]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-[#1a1a1a] border border-black/[0.1] dark:border-white/[0.1] rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 space-y-5">
        {/* Animated calibrating icon */}
        <div className="flex items-center justify-center">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-violet-400/20 dark:border-violet-400/15" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-400 animate-spin" />
            <div className="absolute inset-2 rounded-full border-2 border-transparent border-b-violet-300 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-[18px] font-semibold text-black/90 dark:text-white tracking-tight">
            Voice calibrating
          </h2>
          <p className="text-[13px] text-black/45 dark:text-white/35 leading-relaxed">
            Your ghostwriter is analyzing your writing samples and building your custom voice profile. This usually takes about a minute.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setVisible(false);
              router.push("/profile");
            }}
            className="w-full bg-black/[0.88] text-white dark:bg-white dark:text-black rounded-xl px-4 py-2.5 text-[13px] font-medium hover:bg-black/75 dark:hover:bg-white/90 transition-colors"
          >
            View progress on Profile →
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="w-full text-[12px] text-black/40 dark:text-white/30 hover:text-black/60 dark:hover:text-white/50 py-2 transition-colors"
          >
            Stay on dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
