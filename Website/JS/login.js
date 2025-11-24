import { supabase } from "./supabaseClient.js";

const loginForm = document.querySelector("#loginForm");
const errorMessage = document.querySelector("#errorMessage");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = e.target.email.value;
    const password = e.target.password.value;
    const submitBtn = e.target.querySelector("button");

    try {
      if (submitBtn) submitBtn.textContent = "Logging in...";

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) throw error;

      window.location.href = "index.html";
    } catch (error) {
      console.error("Login error:", error);
      if (errorMessage) errorMessage.textContent = "Invalid login credentials.";
      if (submitBtn) submitBtn.textContent = "Login";
    }
  });
}
