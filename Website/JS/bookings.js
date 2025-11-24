import { supabase } from "./supabaseClient.js";

let currentRestaurantId = null;

// Initialize
async function init() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  // Get restaurant ID
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (restaurant) {
    currentRestaurantId = restaurant.id;
    fetchReservations();
    setupRealtime();
  } else {
    console.error("No restaurant profile found.");
  }
}

// Fetch and render
async function fetchReservations() {
  const reservationsDivElement = document.getElementById("reservations");
  reservationsDivElement.innerHTML = ""; // Clear current

  // Fetch reservations and join with table names
  const { data: reservations, error } = await supabase
    .from("reservations")
    .select(
      `
      *,
      restaurant_seating (
        table_name
      )
    `
    )
    .eq("restaurant_id", currentRestaurantId)
    .in("status", ["confirmed", "booked"]);

  if (error) {
    console.error("Error fetching reservations:", error);
    return;
  }

  reservations.forEach((res) => {
    // Handle case where table might be null
    const tableName = res.restaurant_seating
      ? res.restaurant_seating.table_name
      : "Unassigned";

    const reservationObj = {
      id: res.id,
      name: res.customer_name || "Unknown",
      table: tableName,
      numPeople: res.guest_count,
      date: new Date(res.start_time).toLocaleDateString(),
      time: new Date(res.start_time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      notes: "No notes", // adding placeholder
      status: res.status,
    };

    const card = reservationCard(reservationObj);
    reservationsDivElement.appendChild(card);
  });
}

function setupRealtime() {
  supabase
    .channel("reservations_channel")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "reservations",
        filter: `restaurant_id=eq.${currentRestaurantId}`,
      },
      (payload) => {
        fetchReservations();
      }
    )
    .subscribe();
}

// Render Card
function reservationCard(reservation) {
  const reservationCardElement = document.createElement("div");
  reservationCardElement.className = "reservationCard";

  reservationCardElement.innerHTML = `<h1>${reservation.name}</h1>
    <hr class= "nameDivider">
    <p>PAX: ${reservation.numPeople}</p>
    <p>Date: ${reservation.date}</p>
    <p>Time: ${reservation.time}</p>
    <p>Table: ${reservation.table}</p>
    <hr>
    <p class= "details">Notes: ${reservation.notes}</p>
    <button class="btnComplete" onclick="updateStatus('${reservation.id}', 'completed')">Complete</button>
    <button class="btnDelete" onclick="deleteReservation('${reservation.id}')">Delete</button>
    <button class="btnModify">Modify</button>`;

  return reservationCardElement;
}

// Make these global
window.updateStatus = async (id, status) => {
  await supabase.from("reservations").update({ status: status }).eq("id", id);
};

window.deleteReservation = async (id) => {
  await supabase.from("reservations").delete().eq("id", id);
};

// Popup Logic
window.openPopup = async function () {
  await getAvailableTables();
  document.getElementById("popup").style.display = "flex";
};

window.closePopup = function () {
  document.getElementById("popup").style.display = "none";
};

// Populate dropdown
async function getAvailableTables() {
  const dropdownTables = document.getElementById("customerTableBooking");
  dropdownTables.innerHTML = "";

  // 1. Get all tables
  const { data: allTables } = await supabase
    .from("restaurant_seating")
    .select("id, table_name")
    .eq("restaurant_id", currentRestaurantId);

  // we check tables that have ANY confirmed status reservation
  const { data: busyReservations } = await supabase
    .from("reservations")
    .select("table_id")
    .eq("restaurant_id", currentRestaurantId)
    .eq("status", "confirmed");

  const busyTableIds = busyReservations.map((r) => r.table_id);

  allTables.forEach((table) => {
    // only show if not in the busy list
    if (!busyTableIds.includes(table.id)) {
      const option = document.createElement("option");
      option.value = table.id; // Store UUID as value for privacy since we were gonna let our ML model do this anyway
      option.textContent = `Table ${table.table_name}`;
      dropdownTables.appendChild(option);
    }
  });
}

// Form Submit
const bookingForm = document.querySelector("#popup form");

if (bookingForm) {
  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.querySelector(".customerNameBooking").value;
    const email = document.querySelector(".customerEmailBooking").value;
    const guests = document.querySelector(".customerNumberBooking").value;
    const date = document.querySelector(".customerDateBooking").value;
    const time = document.querySelector(".customerTimeBooking").value;
    const tableId = document.getElementById("customerTableBooking").value;

    // Construct timestamp
    const startTime = new Date(`${date}T${time}`);
    // 1 hour later
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    const { error } = await supabase.from("reservations").insert([
      {
        restaurant_id: currentRestaurantId,
        customer_name: name,
        customer_email: email,
        guest_count: guests,
        start_time: startTime.toISOString(),
        predicted_end_time: endTime.toISOString(),
        table_id: tableId,
        status: "confirmed",
      },
    ]);

    if (error) {
      alert("Error adding booking: " + error.message);
    } else {
      closePopup();
      bookingForm.reset();
    }
  });
}

init();
