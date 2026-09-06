"use client";

import { useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import toast from "react-hot-toast";

export default function UpdateChecker() {
  useEffect(() => {
    let cancelled = false;

    async function checkForUpdates() {
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
      }
    }

    checkForUpdates();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
