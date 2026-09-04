# تحويل التطبيق لديسك توب (Tauri) — تعليمات التشغيل

## المتطلبات على جهازك (مرة واحدة فقط)

1. **Node.js** (عندك بالفعل غالبًا) — v18 أو أحدث.
2. **Rust** — لازم تثبته عن طريق الأداة الرسمية rustup (مش عن طريق apt/homebrew، عشان تاخد أحدث نسخة):
   - Windows/Mac/Linux: اذهب إلى https://rustup.rs واتبع التعليمات، أو على Mac/Linux:
     ```bash
     curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
     ```
   - بعد التثبيت أعد فتح الترمينال وتأكد:
     ```bash
     rustc --version   # لازم يكون 1.77.2 أو أحدث
     ```
3. **متطلبات نظام إضافية:**
   - **Windows**: WebView2 (موجود افتراضيًا في Windows 10/11 الحديث) + Visual Studio Build Tools (C++ workload).
   - **macOS**: Xcode Command Line Tools: `xcode-select --install`
   - **Linux (Ubuntu/Debian)**:
     ```bash
     sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
       libayatana-appindicator3-dev libsoup-3.0-dev build-essential pkg-config
     ```

## التشغيل والتطوير

```bash
npm install
npm run desktop:dev     # يشغّل التطبيق في نافذة ديسك توب مع hot-reload
```

## البناء النهائي (للتوزيع)

```bash
npm run desktop:build
```

الناتج هيكون في `src-tauri/target/release/bundle/`:
- **Windows**: `msi/` و `nsis/` (installer .exe)
- **macOS**: `dmg/` و `macos/` (.app)
- **Linux**: `deb/` و `appimage/`

⚠️ **مهم**: Tauri لازم يتبنى على نفس نظام التشغيل المستهدف (متقدرش تبني .exe من ماك). للحصول على الثلاثة دفعة واحدة تلقائيًا، استخدم GitHub Actions مع `tauri-apps/tauri-action` — لو عايز ملف الـ workflow الجاهز قولّي.

## ملاحظات
- تم ضبط `next.config.mjs` على `output: 'export'` — التطبيق يُبنى كملفات ثابتة (static) بدون الحاجة لسيرفر Node.js وقت التشغيل.
- تم توليد أيقونات التطبيق (src-tauri/icons) من app/icon.png (تصميم الجلوب).
- تم إضافة CSP في src-tauri/tauri.conf.json يسمح فقط بدومينات Firebase المطلوبة.
- تم إضافة تحسينات تقليل حجم الـ binary في src-tauri/Cargo.toml (لا تؤثر إلا على release build).

## البناء التلقائي للثلاثة أنظمة عن طريق GitHub Actions

بدل ما تبني على 3 أجهزة بنفسك، فيه ملف جاهز في `.github/workflows/build-desktop.yml` بيبني Windows وmacOS (Intel + Apple Silicon في ملف واحد universal) وLinux تلقائيًا، كل واحد على السيرفر المناسب له من عند GitHub.

### طريقة الاستخدام
1. ارفع المشروع على ريبو GitHub (لو لسه معملتوش):
   ```bash
   git init
   git add .
   git commit -m "Desktop app setup with Tauri"
   git remote add origin <رابط الريبو بتاعك>
   git push -u origin main
   ```
2. **التشغيل اليدوي (تجربة سريعة بدون إصدار رسمي):**
   من تبويب **Actions** في صفحة الريبو على GitHub → اختار workflow اسمه "بناء تطبيق الديسك توب" → **Run workflow**.
3. **إصدار رسمي (الطريقة المعتادة):**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
   ده هيشغّل الـ workflow تلقائيًا، ويجهزلك **Draft Release** فيه:
   - `.msi` و `.exe` (Windows)
   - `.dmg` (macOS — نسخة واحدة تشتغل Intel وApple Silicon)
   - `.deb` و `.AppImage` (Linux)

   روح لتبويب **Releases**، افتح الـ Draft، راجع الملفات، واضغط **Publish** لما تكون جاهز تنزّلها للمستخدمين.

### ملاحظة عن أمان مفاتيح Firebase
لاحظت إن `apiKey` بتاع Firebase حاليًا مكتوب مباشرة (hardcoded) جوه `lib/firebase.js` و`lib/auth.js` بدل ما يتقرا من متغيرات بيئة (رغم وجود ملف `.env.local.example` جاهز لكده) — ده مش مشكلة أمنية خطيرة لأن مفتاح Firebase الأمامي (client apiKey) أصلاً مصمم يكون ظاهر للعميل وحمايته الحقيقية بتبقى في Firebase Security Rules، لكن لو حبيت تفصل بيئة تطوير عن بيئة إنتاج لاحقًا (مثلاً مشروع Firebase مختلف للتجربة)، الملف بيحتوي على قسم معلّق (commented) جاهز في workflow البناء يقرا القيم من GitHub Secrets — تقدر تفعّله وقتها.

