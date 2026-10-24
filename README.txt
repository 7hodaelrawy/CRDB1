CRDb Cinema — حزمة النشر

تتضمن هذه الحزمة ملفات الموقع المبنية داخل dist، مع دوال API اللازمة لجلب بيانات TMDB من الخادم.
لا ترفع مجلد dist وحده إذا أردت عمل البحث والتفاصيل؛ يجب نشر ملفات api/ أو functions/ مع ملفات الموقع.

قبل النشر:
- أضف TMDB_API_KEY كـ Secret/Environment Variable على منصة الاستضافة.
- لا تضع المفتاح داخل dist أو في ملفات JavaScript التي تصل للمتصفح.

Vercel:
1. فك ضغط الحزمة.
2. أضف TMDB_API_KEY في إعدادات المشروع كمتغير بيئة، ثم أعد النشر.
3. من مجلد الحزمة شغّل: npx vercel --prod
   تحتوي الحزمة على vercel.json ومجلد api/ لدوال Vercel.

Cloudflare Pages:
1. أضف TMDB_API_KEY في إعدادات مشروع Pages ضمن Variables and Secrets.
2. انشر من Wrangler CLI من مجلد الحزمة: npx wrangler pages deploy dist --project-name <اسم-المشروع>
   مجلد functions/ موجود في جذر الحزمة ويحتوي Pages Function.
3. الرفع بالسحب والإفلات في لوحة Cloudflare لا يبني Pages Functions؛ استخدم Wrangler CLI أو Git integration.

ملاحظة: هذا إصدار كتالوج واستكشاف. الحسابات وقوائم المشاهدة والمراجعات الدائمة ليست ضمن هذا الإصدار.
