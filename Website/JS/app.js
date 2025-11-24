import { supabase } from "./supabaseClient.js";

// 1. Auth & Context Guard
let currentRestaurantId = null;

(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  // Fetch the restaurant owned by this user
  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (restaurant) {
    currentRestaurantId = restaurant.id;
  } else {
    console.error("No restaurant found for this user.");
  }
})();

// 2. Dashboard Logic
document.addEventListener("DOMContentLoaded", async () => {
  // --- A. Load Dashboard Stats ---
  const loadStats = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];

      const { data: reservations, error } = await supabase
        .from("reservations")
        .select("guest_count")
        .eq("status", "confirmed")
        .gte("start_time", `${today}T00:00:00`)
        .lte("start_time", `${today}T23:59:59`);

      if (reservations) {
        const bookingCountEl = document.querySelector("#today-booking-count");
        if (bookingCountEl) bookingCountEl.textContent = reservations.length;

        const revenueEl = document.querySelector("#projected-revenue");
        if (revenueEl) {
          // Simple calc: $50 per head
          const totalGuests = reservations.reduce(
            (sum, r) => sum + (r.guest_count || 0),
            0
          );
          revenueEl.textContent = `$${totalGuests * 50}`;
        }
      }
    } catch (err) {
      console.error("Error loading stats:", err);
    }
  };

  loadStats();

  // --- B. AI Reservation Handler ---
  const bookingForm = document.querySelector("#bookingForm");

  if (bookingForm) {
    bookingForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!currentRestaurantId) {
        alert("System Error: Restaurant ID not loaded.");
        return;
      }

      const submitBtn = bookingForm.querySelector("button[type='submit']");
      const originalText = submitBtn.textContent;
      submitBtn.textContent = "Consulting AI...";
      submitBtn.disabled = true;

      // 1. Gather Data
      const guestCount = parseInt(document.getElementById("partySize").value);
      const timeVal = document.getElementById("reservationTime").value; // HH:MM

      const formData = {
        party_size: guestCount,
        day_of_week: new Date().getDay(),
        time: timeVal,
      };

      try {
        // 2. Call Python AI Server
        const response = await fetch("http://127.0.0.1:5000/decide_booking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        const decision = await response.json();

        // 3. Handle Decision
        if (decision.action === "Accept") {
          // Map AI Table Number (e.g. "5") to Supabase UUID
          const { data: tableData } = await supabase
            .from("restaurant_seating")
            .select("id")
            .eq("restaurant_id", currentRestaurantId)
            .eq("table_name", decision.table_id.toString())
            .single();

          const assignedTableUUID = tableData ? tableData.id : null;

          alert(
            `✅ Booking Accepted!\nAssigned Table: ${decision.table_id}\nPredicted Duration: ${decision.predicted_duration} mins`
          );

          // Save to Supabase
          const { error } = await supabase.from("reservations").insert([
            {
              restaurant_id: currentRestaurantId,
              customer_email: document.getElementById("customerEmail").value,
              guest_count: guestCount,
              start_time: `${
                new Date().toISOString().split("T")[0]
              }T${timeVal}:00`,
              predicted_end_time: calculateEndTime(
                timeVal,
                decision.predicted_duration
              ),
              status: "confirmed",
              table_id: assignedTableUUID,
            },
          ]);

          if (error) throw error;

          loadStats();
          bookingForm.reset();
        } else {
          // Optional: Log denied requests to DB if you want analytics on them
          alert(
            "❌ Booking Denied.\nThe AI has determined this booking is not optimal for nightly profit."
          );
        }
      } catch (err) {
        console.error("AI Error:", err);
        alert("System Error: Could not reach AI server or save data.");
      } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    });
  }
});

function calculateEndTime(startTime, durationMins) {
  const [hours, minutes] = startTime.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes + Math.round(durationMins), 0);
  // Returns ISO string format for Supabase timestamptz
  const isoDate = new Date().toISOString().split("T")[0];
  return `${isoDate}T${date.toTimeString().slice(0, 8)}`;
}
