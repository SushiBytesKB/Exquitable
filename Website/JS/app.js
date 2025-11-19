import { supabase } from "./supabaseClient.js";

const path = window.location.pathname;

if (path.includes("login.html")) {
  const loginForm = document.querySelector("#loginForm"); // action form id
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
        errorMessage.textContent = error.message;
      } else {
        window.location.href = "index.html";
      }
    });
  }
}

if (path.includes("index.html")) {
  (async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "login.html";
      return;
    } else {
      const { data: reservations, error } = await supabase
        .from("reservations")
        .select("*")
        .eq("status", "confirmed");

      // Example for using the data:
      // const widget = document.querySelector('.widget-data');
      // widget.textContent = reservations.length;
    }
  })();
}

if (path.includes("bookings.html")) {
  (async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "login.html";
      return;
    } else {
      const { data: reservations, error } = await supabase
        .from("Reservation")
        .select("*");

      const tbody = document.querySelector("#bookingsTable tbody");
      if (tbody) tbody.innerHTML = "";

      if (error) {
        console.error("Error fetching reservations:", error.message);
        if (tbody)
          tbody.innerHTML = `<tr><td colspan="5">Error loading reservations</td></tr>`;
        return;
      }

      reservations.forEach((r) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${r.Reservation_id}</td>
          <td>${r.Table_no}</td>
          <td>${r.Reserver_email}</td>
          <td>${r.Guests_no}</td>
          <td>${r.Reservation_time}</td>
          <td>${r.Status}</td>
        `;
        tbody.appendChild(row);
      });
    }
  })();
}

if (path.includes("seatingChart.html")) {
  //
}

if (path.includes("aiReport.html")) {
  //
}

if (path.includes("systemSettings.html")) {
  // maybe we push seatingChart to here
  // update seatings
  // update/append logs
  // update open hours of restaurant
  // update error range of predicted reservation durations, number of seats to leave vacant for unpredictable senarios
  // logout -- else remember use logged in
}
