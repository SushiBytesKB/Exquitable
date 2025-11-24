import { supabase } from "./supabaseClient.js";

const signupForm = document.getElementById("signupForm");

if (signupForm) {
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Get values from the form
    const restaurantName = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    // Validation
    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    try {
      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
      });

      if (authError) throw authError;

      if (authData.user) {
        console.log("User created:", authData.user.id);

        // create the restaurant entry
        const { error: dbError } = await supabase.from("restaurants").insert([
          {
            name: restaurantName,
            email: email,
            owner_id: authData.user.id,
          },
        ]);

        if (dbError) {
          console.error("Error creating restaurant profile:", dbError);
          alert(
            "Account created, but failed to set up restaurant profile. Please contact support."
          );
        } else {
          alert("Registration Successful! Please log in.");
          window.location.href = "login.html";
        }
      }
    } catch (error) {
      console.error("Signup Error:", error.message);
      alert("Signup failed: " + error.message);
    }
  });
}
