"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";

// Auto sign-out after this long with no user activity.
const IDLE_LIMIT_MS = 30 * 60 * 1000;

// Any of these firing resets the idle timer. Covers mouse, keyboard, touch,
// and scroll — the common ways someone is "still there" without necessarily
// clicking anything.
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];

export default function IdleLogout() {
  const { user, logout } = useAuth();
  const timerRef = useRef(null);

  useEffect(() => {
    // Nothing to guard while signed out — also avoids logging out someone
    // sitting on the login screen itself.
    if (!user) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        toast("تم تسجيل الخروج تلقائيًا بسبب عدم النشاط لمدة 30 دقيقة", {
          icon: "🔒",
          duration: 5000,
        });
        await logout();
      }, IDLE_LIMIT_MS);
    }

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, logout]);

  return null;
}
