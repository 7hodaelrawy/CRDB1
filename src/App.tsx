import { Switch, Route, Link, useLocation } from "wouter";
import ArabicMovies from "./pages/ArabicMovies"; 

// ⚠️⚠️⚠️ مهم جداً: 
// غير أسماء الاستدعاءات دي لأسماء ملفاتك الحقيقية اللي في مجلد pages
// لو الملفات بتاعتك اسمها حاجة تانية، غير الاسم هنا
import Discover from "./pages/Discover"; 
import Movies from "./pages/Movies";     
import Series from "./pages/Series";     

export default function App() {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans" dir="rtl">
      
      {/* 1. شريط التنقل العلوي */}
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          
          <Link href="/" className="text-2xl font-black text-orange-500 cursor-pointer">
            CRDB
          </Link>
          
          <nav className="flex gap-4 md:gap-6 font-semibold text-sm md:text-base">
            <Link href="/" className={`transition-colors hover:text-orange-500 ${location === "/" ? "text-orange-500" : ""}`}>اكتشف</Link>
            <Link href="/movies" className={`transition-colors hover:text-orange-500 ${location === "/movies" ? "text-orange-500" : ""}`}>أفلام أجنبية</Link>
            <Link href="/series" className={`transition-colors hover:text-orange-500 ${location === "/series" ? "text-orange-500" : ""}`}>مسلسلات</Link>
            
            {/* الرابط الجديد */}
            <Link href="/arabic" className={`transition-colors hover:text-orange-500 font-bold ${location === "/arabic" ? "text-orange-500" : ""}`}>أفلام عربية</Link>
          </nav>

        </div>
      </header>

      {/* 2. محتوى الصفحات */}
      <main className="pb-12">
        <Switch>
          {/* الصفحات الأصلية (الأفلام الأجنبية) */}
          <Route path="/" component={Discover} />
          <Route path="/movies" component={Movies} />
          <Route path="/series" component={Series} />
          
          {/* الصفحة الجديدة (الأفلام العربية) */}
          <Route path="/arabic" component={ArabicMovies} />
          
          {/* صفحة 404 */}
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
