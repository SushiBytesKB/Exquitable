import { supabase } from "./supabaseClient.js";

const path = window.location.pathname.toLowerCase();


(async () => {

  supabase.auth.onAuthStateChange(async (event, session) => {

    const user = session?.user || null;

    const protectedPages = [
      "index.html",
      "bookings.html",
      "seatingchart.html"
    ];

    const isProtectedPage = protectedPages.some(page => path.includes(page));

    if (isProtectedPage && !user) {
      console.log("Unauthorized access, redirecting to login");
      window.location.href = "login.html";
      return;
    }

    window.authReady = true;
    window.dispatchEvent(new Event("auth-ready"));

    console.log("Authentication check complete, user:", user?.email);
  });
})();