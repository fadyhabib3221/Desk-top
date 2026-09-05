"use client";

import { useEffect } from "react";
import toast from "react-hot-toast";

/**
 * بيتشيك على تحديثات جديدة للتطبيق عند فتحه (بس لما يكون شغال جوه Tauri
 * كتطبيق ديسك توب — مش هيعمل حاجة لو التطبيق شغال في متصفح عادي).
 * لو لقى نسخة أحدث على GitHub Releases، بيحمّلها ويثبتها ويعيد فتح
 * التطبيق تلقائيًا.
 */
export default function UpdateChecker() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.__TAURI_INTERNALS__) return;

    let cancelled = false;

    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const { relaunch } = await import("@tauri-apps/plugin-process");

        const update = await check();
        if (cancelled || !update) return;

        toast.loading(`جاري تحميل التحديث ${update.version}...`, {
          id: "app-update",
        });

        await update.downloadAndInstall();

        toast.success("تم تحميل التحديث، سيُعاد تشغيل التطبيق الآن", {
          id: "app-update",
        });

        setTimeout(() => {
          if (!cancelled) relaunch();
        }, 1500);
      } catch (err) {
        // فشل التحقق من التحديث (مثلاً مفيش نت) مش لازم يوقف التطبيق أو يزعج اليوزر
        console.error("Update check failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
