import { supabase } from "./supabaseClient.js";

const loginForm = document.querySelector("#loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      const errorMessage = document.getElementById("errorMessage");
      if (errorMessage) {
        errorMessage.textContent = error.message;
      } else {
        alert(error.message);
      }
    } else {
      window.location.href = "index.html";
    }
  });
}




