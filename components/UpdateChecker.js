"use client";

import { useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import toast from "react-hot-toast";

// How often to re-check for a new release while the app stays open, so a
// version published mid-session is caught without waiting for the next
// manual restart. 15 minutes balances freshness against unnecessary
// requests to GitHub's release feed.
const CHECK_INTERVAL_MS = 2 * 60 * 1000;

export default function UpdateChecker() {
  // Guards against two checks running at once (e.g. the interval firing
  // right as the initial check is still awaiting a user's "later" choice).
  const checkingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdates() {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const update = await check();

        if (cancelled || !update) return;

        const shouldUpdate = await ask(
          `يوجد تحديث جديد للتطبيق (الإصدار ${update.version}).\nهل تريد تحميله وتثبيته الآن؟`,
          {
            title: "تحديث متاح",
            kind: "info",
            okLabel: "تحديث الآن",
            cancelLabel: "لاحقًا",
          }
        );

        if (!shouldUpdate || cancelled) return;

        toast.loading("جاري تحميل التحديث...", { id: "update-download" });

        await update.downloadAndInstall();

        toast.dismiss("update-download");

        await message("تم تثبيت التحديث بنجاح. سيتم إعادة تشغيل التطبيق الآن.", {
          title: "اكتمل التحديث",
          kind: "info",
        });

        await relaunch();
      } catch (error) {
        console.error("Update check failed:", error);
      } finally {
        checkingRef.current = false;
      }
    }

    checkForUpdates();
    const interval = setInterval(checkForUpdates, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return null;
}
