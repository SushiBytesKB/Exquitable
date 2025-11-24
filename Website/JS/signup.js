import { supabase } from "./supabaseClient.js";

const signupForm = document.getElementById("signupForm");
const errorMessage = document.getElementById("errorMessage");

if (signupForm) {
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    // Sign up the user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (authError) {
      errorMessage.style.display = "block";
      errorMessage.textContent = authError.message;
      return;
    }

    if (authData.user) {
      // Using the email as a placeholder name
      const { error: profileError } = await supabase
        .from("restaurants")
        .insert([
          {
            owner_id: authData.user.id,
            email: email,
            name: "My Restaurant", // Default
            password: "hashed_placeholder", // Schema
          },
        ]);

      if (profileError) {
        console.error("Error creating profile:", profileError);
        errorMessage.textContent =
          "Account created, but failed to set up profile.";
        errorMessage.style.display = "block";
      } else {
        errorMessage.style.display = "none";
        // Redirect to dashboard
        window.location.href = "index.html";
      }
    }
  });
}
