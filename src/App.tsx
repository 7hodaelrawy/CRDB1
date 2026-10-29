import { Switch, Route, Link, useLocation } from "wouter";
import ArabicMovies from "./pages/ArabicMovies"; 

// ============================================================================
// ⚠️ تنبيه: الصفحات دي مؤقتة عشان البيلد ينجح. 
// عشان ترجع أفلامك الأجنبية، هتستبدل الدوال دي بالكود الأصلي بتاعك.
// ============================================================================
const Discover = () => <div className="p-8 text-center text-xl font-bold">الصفحة الرئيسية (اكتشف)</div>;
const Movies = () => <div className="p-8 text-center text-xl font-bold">صفحة الأفلام الأجنبية</div>;
const Series = () => <div className="p-8 text-center text-xl font-bold">صفحة المسلسلات</div>;
// ============================================================================

export default function App() {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans" dir="rtl">
      
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          
          <Link href="/" className="text-2xl font-black text-orange-500 cursor-pointer">
            CRDB
          </Link>
          
          <nav className="flex gap-4 md:gap-6 font-semibold text-sm md:text-base">
            <Link href="/" className={`hover:text-orange-500 ${location === "/" ? "text-orange-500" : ""}`}>اكتشف</Link>
            <Link href="/movies" className={`hover:text-orange-500 ${location === "/movies" ? "text-orange-500" : ""}`}>أفلام أجنبية</Link>
            <Link href="/series" className={`hover:text-orange-500 ${location === "/series" ? "text-orange-500" : ""}`}>مسلسلات</Link>
            <Link href="/arabic" className={`font-bold hover:text-orange-500 ${location === "/arabic" ? "text-orange-500" : ""}`}>أفلام عربية</Link>
          </nav>

        </div>
      </header>

      <main className="pb-12">
        <Switch>
          <Route path="/" component={Discover} />
          <Route path="/movies" component={Movies} />
          <Route path="/series" component={Series} />
          <Route path="/arabic" component={ArabicMovies} />
          
          <Route>
            <div className="text-center mt-20 text-2xl font-bold">404 - الصفحة غير موجودة</div>
          </Route>
        </Switch>
      </main>

    </div>
  );
}
