import { supabase } from "./supabaseClient.js";

const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
      // Sign in with Supabase Auth
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email,
          password: password,
        });

      if (authError) throw authError;

      console.log("Logged in:", authData.user.id);

      // fetch the Restaurant ID
      const { data: restaurantData, error: restaurantError } = await supabase
        .from("restaurants")
        .select("id, name")
        .eq("owner_id", authData.user.id)
        .single();

      if (restaurantError) {
        console.error("No restaurant found for this user:", restaurantError);
        alert(
          "Login successful, but no restaurant profile found. Please contact support."
        );
        return;
      }

      // Save critical info to Local Storage for other pages to use
      localStorage.setItem("access_token", authData.session.access_token);
      localStorage.setItem("user_id", authData.user.id);
      localStorage.setItem("restaurant_id", restaurantData.id);
      localStorage.setItem("restaurant_name", restaurantData.name);

      console.log("Restaurant Context Set:", restaurantData.name);

      // Redirect to the main dashboard
      window.location.href = "index.html";
    } catch (error) {
      console.error("Login Error:", error.message);
      alert("Login failed: " + error.message);
    }
  });
}
