import { supabase } from "./supabaseClient.js";

const path = window.location.pathname.toLowerCase();

// Authentication check for protected pages
(async () => {
  // Wait for Supabase to actually load the session
  supabase.auth.onAuthStateChange(async (event, session) => {

    const user = session?.user || null;

    const protectedPages = [
      "index.html",
      "bookings.html",
      "reservation.html",
      "updatereservation.html",
      "deletereservation.html",
      "seatingchart.html",
      "updatesetupseating.html"
    ];

    const isProtectedPage = protectedPages.some(page => path.includes(page));

    if (isProtectedPage && !user) {
      console.log("Unauthorized access, redirecting to login");
      window.location.href = "login.html";
      return;
    }

    // Auth is now ready & guaranteed to have correct user info
    window.authReady = true;
    window.dispatchEvent(new Event("auth-ready"));

    console.log("Authentication check complete, user:", user?.email);
  });
})();