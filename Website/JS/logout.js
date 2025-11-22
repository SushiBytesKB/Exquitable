import { supabase } from "./supabaseClient.js";

window.logout = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Error signing out:", error);
    alert("Error signing out: " + error.message);
  } else {
    window.location.href = "login.html";
  }
};

