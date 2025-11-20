import { supabase } from "../supabaseClient.js";

/**
 * Initialize index page functionality
 */
export async function initIndex() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = "login.html";
    return;
  } else {
    const { data: reservations, error } = await supabase
      .from("reservations")
      .select("*")
      .eq("status", "confirmed");
    // Additional logic can be added here if needed
  }
}

