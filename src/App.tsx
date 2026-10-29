import { Switch, Route, Link, useLocation } from "wouter";
import ArabicMovies from "./pages/ArabicMovies"; // استيراد صفحة الأفلام العربية

// ============================================================================
// ⚠️ تنبيه: الدوال دي (Components) عبارة عن صفحات وهمية عشان الكود يشتغل.
// لو إنت عامل صفحات حقيقية في مجلد pages، امسح الدوال دي، وعملها import فوق.
// ============================================================================
const Discover = () => <div className="p-8 text-center text-2xl font-bold">صفحة الاكتشاف (الرئيسية)</div>;
const Movies = () => <div className="p-8 text-center text-2xl font-bold">صفحة الأفلام العالمية</div>;
const Series = () => <div className="p-8 text-center text-2xl font-bold">صفحة المسلسلات</div>;
// ============================================================================


export default function App() {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans" dir="rtl">
      
      {/* شريط التنقل العلوي (Navbar) */}
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          
          {/* اللوجو */}
          <Link href="/" className="text-2xl font-black text-orange-500 cursor-pointer">
            CRDB
          </Link>
          
          {/* روابط التنقل */}
          <nav className="flex gap-4 md:gap-6 font-semibold text-sm md:text-base">
            <Link 
              href="/" 
              className={`transition-colors hover:text-orange-500 ${location === "/" ? "text-orange-500" : ""}`}
            >
              اكتشف
            </Link>
            <Link 
              href="/movies" 
              className={`transition-colors hover:text-orange-500 ${location === "/movies" ? "text-orange-500" : ""}`}
            >
              أفلام
            </Link>
            <Link 
              href="/series" 
              className={`transition-colors hover:text-orange-500 ${location === "/series" ? "text-orange-500" : ""}`}
            >
              مسلسلات
            </Link>
            
            {/* الرابط الجديد بتاع الأفلام العربية */}
            <Link 
              href="/arabic" 
              className={`transition-colors hover:text-orange-500 ${location === "/arabic" ? "text-orange-500" : ""}`}
            >
              أفلام عربية
            </Link>
          </nav>

        </div>
      </header>

      {/* محتوى الصفحات */}
      <main className="pb-12">
        <Switch>
          {/* الصفحة الرئيسية */}
          <Route path="/" component={Discover} />
          
          {/* صفحة الأفلام العالمية */}
          <Route path="/movies" component={Movies} />
          
          {/* صفحة المسلسلات */}
          <Route path="/series" component={Series} />
          
          {/* صفحة الأفلام العربية (اللي عملناها في الخطوة اللي فاتت) */}
          <Route path="/arabic" component={ArabicMovies} />
          
          {/* صفحة 404 لو الرابط مش موجود */}
          <Route>
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
              <h1 className="text-6xl font-black text-gray-300 dark:text-gray-700 mb-4">404</h1>
              <p className="text-xl font-bold mb-6">عذراً، هذه الصفحة غير موجودة</p>
              <Link href="/" className="bg-orange-500 text-white px-6 py-2 rounded-lg font-bold hover:bg-orange-600 transition-colors cursor-pointer">
                العودة للرئيسية
              </Link>
            </div>
          </Route>
        </Switch>
      </main>

    </div>
  );
}
