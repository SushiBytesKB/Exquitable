import { supabase } from "./supabaseClient.js";

// Login
const restaurantId = localStorage.getItem("restaurant_id");

if (!restaurantId) {
  alert("No restaurant ID found. Please log in again.");
  window.location.href = "login.html";
}

const reservationsDivElement = document.getElementById("reservations");

async function fetchReservations() {
  reservationsDivElement.innerHTML = "<p>Loading bookings...</p>";

  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("start_time", { ascending: true });

  if (error) {
    console.error("Error fetching bookings:", error);
    reservationsDivElement.innerHTML = "<p>Error loading bookings.</p>";
    return;
  }

  reservationsDivElement.innerHTML = ""; // Clear loading text

  if (data.length === 0) {
    reservationsDivElement.innerHTML = "<p>No upcoming reservations.</p>";
    return;
  }

  data.forEach((booking) => {
    // Only show active bookings
    if (booking.status !== "completed" && booking.status !== "denied") {
      const card = createReservationCard(booking);
      reservationsDivElement.appendChild(card);
    }
  });
}

function createReservationCard(booking) {
  const card = document.createElement("div");
  card.className = "reservationCard";

  // Format DT
  const dateObj = new Date(booking.start_time);
  const dateStr = dateObj.toLocaleDateString();
  const timeStr = dateObj.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Handle nullable table_id
  const tableDisplay = booking.table_id ? booking.table_id : "Unassigned";

  card.innerHTML = `
    <h1>${booking.customer_name || "Guest"}</h1>
    <hr class="nameDivider">
    <p><strong>PAX:</strong> ${booking.guest_count}</p>
    <p><strong>Date:</strong> ${dateStr}</p>
    <p><strong>Time:</strong> ${timeStr}</p>
    <p><strong>Table ID:</strong> ${tableDisplay}</p>
    <hr>
    <p class="details">Status: ${booking.status}</p>
    <button class="btnComplete" data-id="${booking.id}">Complete</button>
    <button class="btnDelete" data-id="${booking.id}">Cancel</button>
  `;

  // eEvent listeners
  card
    .querySelector(".btnComplete")
    .addEventListener("click", () => completeBooking(booking.id));
  card
    .querySelector(".btnDelete")
    .addEventListener("click", () => deleteBooking(booking.id));

  return card;
}

const bookingForm = document.querySelector("#popup form");

if (bookingForm) {
  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("customerNameBooking").value;
    const email = document.getElementById("customerEmailBooking").value;
    const guests = parseInt(
      document.getElementById("customerNumberBooking").value
    );
    const dateVal = document.getElementById("customerDateBooking").value;
    const timeVal = document.getElementById("customerTimeBooking").value;

    if (!name || !guests || !dateVal || !timeVal) {
      alert("Please fill in all fields.");
      return;
    }

    // make DT
    const startDateTime = new Date(`${dateVal}T${timeVal}`);

    // Feedback
    const submitBtn = bookingForm.querySelector("button[type='submit']");
    const originalText = submitBtn.innerText;
    submitBtn.innerText = "Consulting AI...";
    submitBtn.disabled = true;

    try {
      // the badass part <oo>
      const aiResponse = await fetch("http://127.0.0.1:5001/decide_booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          customer_email: email,
          guest_count: guests,
        }),
      });

      if (!aiResponse.ok) throw new Error("AI Server is offline or errored.");

      const decision = await aiResponse.json();
      console.log("AI Decision:", decision);

      if (decision.action === "denied") {
        alert(
          `Reservation Denied by AI.\nReason: High utilization or low profitability.`
        );
        submitBtn.innerText = originalText;
        submitBtn.disabled = false;
        return;
      }

      // decision.predicted_duration is in minutes
      const durationMinutes = decision.predicted_duration || 90; // Default if missing???
      const endDateTime = new Date(
        startDateTime.getTime() + durationMinutes * 60000
      );

      const { error: dbError } = await supabase.from("reservations").insert([
        {
          restaurant_id: restaurantId,
          customer_name: name,
          customer_email: email,
          guest_count: guests,
          start_time: startDateTime.toISOString(),
          predicted_end_time: endDateTime.toISOString(),
          status: "confirmed",
          table_id: decision.table_id || null, // FINALLLYYYYY assigns table
        },
      ]);

      if (dbError) throw dbError;

      alert(
        `Booking Confirmed!\nAI Assigned Table: ${
          decision.table_id
        }\nEst. Duration: ${Math.round(durationMinutes)} mins`
      );

      closePopup();
      bookingForm.reset();
      fetchReservations(); // Refresh list
    } catch (err) {
      console.error(err);
      alert("Error processing booking: " + err.message);
    } finally {
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
    }
  });
}

async function completeBooking(id) {
  if (!confirm("Mark this reservation as completed?")) return;

  const { error } = await supabase
    .from("reservations")
    .update({ status: "completed", actual_end_time: new Date().toISOString() })
    .eq("id", id);

  if (error) alert("Error updating status");
  else fetchReservations();
}

async function deleteBooking(id) {
  if (!confirm("Are you sure you want to cancel this reservation?")) return;

  const { error } = await supabase.from("reservations").delete().eq("id", id);

  if (error) alert("Error deleting booking");
  else fetchReservations();
}

window.openPopup = function () {
  document.getElementById("popup").style.display = "flex";
};

window.closePopup = function () {
  document.getElementById("popup").style.display = "none";
};

fetchReservations();
