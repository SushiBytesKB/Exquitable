import { supabase } from "./supabaseClient.js";

const signupForm = document.getElementById("signupForm");
const errorMessage = document.getElementById("errorMessage");

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const restaurantName = e.target.restaurantName.value;
    const email = e.target.email.value;
    const password = e.target.password.value;

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (authError) throw authError;

    if (authData.user) {
      const { error: dbError } = await supabase.from("restaurants").insert([
        {
          owner_id: authData.user.id,
          name: restaurantName,
          email: email,
          password: password,
          operating_hours: { default: "17:00-22:00" }, // Default hours
        },
      ]);

      if (dbError) {
        throw new Error(
          "Account created, but failed to set up restaurant profile: " +
            dbError.message
        );
      }

      alert("Account created successfully! Please log in.");
      window.location.href = "login.html";
    }
  });
}
