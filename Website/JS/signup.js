import { supabase } from "./supabaseClient.js";

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

days.forEach(day => {
  const closedCheckbox = document.getElementById(`${day}-closed`);
  const openInput = document.getElementById(`${day}-open`);
  const closeInput = document.getElementById(`${day}-close`);
  
  if (closedCheckbox && openInput && closeInput) {
    closedCheckbox.addEventListener('change', (e) => {
      const isClosed = e.target.checked;
      openInput.disabled = isClosed;
      closeInput.disabled = isClosed;
      if (isClosed) {
        openInput.value = '';
        closeInput.value = '';
      }
    });
  }
});

const signupForm = document.querySelector("#signupForm");
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    const password = e.target.password.value;
    const confirmPassword = e.target.confirmPassword.value;
    const restaurantName = e.target.restaurantName.value.trim();

    const message = document.getElementById("message");

    message.textContent = "";
    message.className = "";

    if (password !== confirmPassword) {
      message.textContent = "Passwords do not match.";
      message.className = "error";
      return;
    }

    if (password.length < 6) {
      message.textContent = "Password must be at least 6 characters long.";
      message.className = "error";
      return;
    }

    if (!restaurantName) {
      message.textContent = "Restaurant name is required.";
      message.className = "error";
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (authError) {
      message.textContent = authError.message;
      message.className = "error";
      return;
    }

    if (!authData.user) {
      message.textContent = "Failed to create user account. Please try again.";
      message.className = "error";
      return;
    }

    const userId = authData.user.id;
    const userEmail = (authData.user.email || email).toLowerCase().trim();

    const operatingHours = {};

    days.forEach(day => {
      const closedCheckbox = document.getElementById(`${day}-closed`);
      const openInput = document.getElementById(`${day}-open`);
      const closeInput = document.getElementById(`${day}-close`);
      
      const isClosed = closedCheckbox && closedCheckbox.checked;
      
      if (isClosed) {
        operatingHours[day] = "Null";
      } else {
        const openTime = openInput ? openInput.value : '';
        const closeTime = closeInput ? closeInput.value : '';
        
        if (openTime && closeTime) {
          operatingHours[day] = {
            open: openTime,
            close: closeTime
          };
        } else {
          operatingHours[day] = null;
        }
      }
    });

    const { data: restaurantData, error: restaurantError } = await supabase
      .from("restaurants")
      .insert([
        {
          owner_id: userId,
          email: userEmail,
          password: password,
          name: restaurantName,
          operating_hours: operatingHours,
        },
      ])
      .select();

    if (restaurantError) {
      message.textContent = `Account created but failed to create restaurant: ${restaurantError.message}. Please contact support.`;
      message.className = "error";
      return;
    }

    if (!restaurantData || restaurantData.length === 0) {
      message.textContent = "Account created but restaurant was not created. Please contact support.";
      message.className = "error";
      return;
    }

    message.textContent = "Account and restaurant created successfully! Redirecting to login...";
    message.className = "success";
    setTimeout(() => {
      window.location.href = "login.html";
    }, 2000);
  });
}

