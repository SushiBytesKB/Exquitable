import { supabase } from "./supabaseClient.js";

const path = window.location.pathname;
const supabase = createClient(
  supabase.SUPABASE_URL,
  supabase.SUPABASE_ANON_KEY
);

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

// --- NEW LOGIC FOR reservation.html (CREATE NEW RESERVATION) ---
if (path.includes("reservation.html")) {
  console.log("📌 Reservation page detected. Setting up form submission...");

  // Helper function to get all tables for a restaurant
  async function getTablesForRestaurant(restaurantId) {
    if (!restaurantId) {
      console.error("❌ Restaurant ID is required");
      return { tables: [], error: "Restaurant ID is required" };
    }

    console.log("🔍 Fetching tables for restaurant:", restaurantId);

    const { data: tables, error } = await supabase
      .from("restaurant_seating")
      .select("id, restaurant_id, table_name, room_name, capacity")
      .eq("restaurant_id", restaurantId)
      .order("room_name", { ascending: true })
      .order("table_name", { ascending: true });

    if (error) {
      console.error("❌ Error fetching tables:", error.message);
      return { tables: [], error: error.message };
    }

    console.log("✅ Tables found for restaurant:", { restaurantId, count: tables?.length || 0, tables });
    return { tables: tables || [], error: null };
  }

  // Expose function globally for testing in console
  window.getTablesForRestaurant = getTablesForRestaurant;

  const reservationForm = document.querySelector("#newReservationForm");

  if (reservationForm) {
    // First, let's get and display tables when the form loads or restaurant_id changes
    const restaurantIdInput = reservationForm.querySelector('[name="restaurant_id"]');
    if (restaurantIdInput) {
      restaurantIdInput.addEventListener("change", async (e) => {
        const restaurantId = e.target.value?.trim();
        if (restaurantId) {
          const { tables, error } = await getTablesForRestaurant(restaurantId);
          if (error) {
            alert(`Error loading tables: ${error}`);
            return;
          }
          console.log("📋 Available tables for this restaurant:", tables);
          alert(`Found ${tables.length} table(s) for this restaurant. Check console for details.`);
        }
      });
    }

    reservationForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Get all values from the form inputs
      const restaurantId = e.target.restaurant_id?.value?.trim();
      const tableId = e.target.table_id?.value?.trim();
      const customerEmail = e.target.customer_email?.value?.trim();
      const customerName = e.target.customer_name?.value?.trim();
      const guestCountValue = e.target.guest_count?.value || e.target.party_size?.value || e.target.guests?.value;
      const guestCount = parseInt(guestCountValue, 10);
      const start_time = e.target.start_time?.value || e.target.reservation_time?.value;

      // Basic validation check
      if (!restaurantId) {
        alert("Error: Restaurant ID is missing.");
        return;
      }

      if (!tableId) {
        alert("Please select a table for this reservation.");
        return;
      }

      if (!Number.isFinite(guestCount) || guestCount <= 0) {
        alert("Please provide a valid party size greater than zero.");
        return;
      }

      // --- Step 1: Get all tables for this restaurant ---
      console.log("🔍 Step 1: Getting all tables for restaurant:", restaurantId);
      const { tables: restaurantTables, error: tablesError } = await getTablesForRestaurant(restaurantId);
      
      if (tablesError) {
        alert(`Error loading tables: ${tablesError}`);
        return;
      }

      if (!restaurantTables || restaurantTables.length === 0) {
        alert(`No tables found for restaurant ${restaurantId}. Please add tables first.`);
        return;
      }

      console.log(`✅ Found ${restaurantTables.length} table(s) for restaurant ${restaurantId}:`, restaurantTables);

      // --- Step 2: Verify that the selected table belongs to this restaurant ---
      console.log("🔍 Step 2: Validating table ownership:", { restaurantId, tableId });
      
      const selectedTable = restaurantTables.find(table => table.id === tableId);
      
      if (!selectedTable) {
        const tableIds = restaurantTables.map(t => t.id).join(", ");
        const errorMsg = `Error: Table ${tableId} does not belong to restaurant ${restaurantId}.\n\nValid table IDs for this restaurant: ${tableIds}`;
        alert(errorMsg);
        console.error("❌ Table validation failed:", {
          requestedTableId: tableId,
          restaurantId,
          validTableIds: restaurantTables.map(t => ({ id: t.id, name: t.table_name }))
        });
        return;
      }

      console.log("✅ Table validation passed:", {
        tableId: selectedTable.id,
        tableName: selectedTable.table_name,
        restaurantId: selectedTable.restaurant_id,
        capacity: selectedTable.capacity
      });

      // Use the selected table's capacity
      const tableCapacity = selectedTable.capacity || 0;

      if (tableCapacity <= 0) {
        alert("Selected table has no capacity configured.");
        return;
      }

      // 2. Sum all confirmed guests for this restaurant
      const { data: confirmedReservations, error: confirmedError } =
        await supabase
          .from("reservations")
          .select("guest_count")
          .eq("restaurant_id", restaurantId)
          .eq("status", "confirmed")
          .eq("table_id", tableId);

      if (confirmedError) {
        console.error("❌ Error fetching confirmed reservations:", confirmedError.message);
        alert(`Unable to verify existing reservations: ${confirmedError.message}`);
        return;
      }

      const allocatedSeats = (confirmedReservations || []).reduce(
        (sum, r) => sum + (r.guest_count || 0),
        0
      );

      const availableSeats = tableCapacity - allocatedSeats;

      if (guestCount > availableSeats) {
        alert(
          `Not enough seats available. Remaining capacity: ${Math.max(
            availableSeats,
            0
          )} seats.`
        );
        return;
      }

      // Create reservation data object
      const reservationData = {
        restaurant_id: restaurantId,
        table_id: tableId,
        customer_email: customerEmail,
        customer_name: customerName,
        start_time: start_time,
        guest_count: guestCount,
      };

      const { data, error } = await supabase
        .from("reservations")
        .insert([reservationData])
        .select(); // Use select() to return the inserted data

      if (error) {
        console.error("❌ Error submitting reservation:", error.message);
        alert(`Failed to create reservation: ${error.message}. Check RLS policy.`);
      } else {
        alert("Reservation successfully created!");
        reservationForm.reset(); // Clear the form on success
      }
    });
  }
}
// function renderReservations(reservations) {
//   const container = document.getElementById("reservationResults");

//   if (!container) return;

//   container.innerHTML = "";

//   reservations.forEach(r => {
//     const div = document.createElement("div");
//     div.className = "reservation-item";

//     div.innerHTML = `
//       <p><strong>Restaurant ID:</strong> ${r.restaurant_id}</p>
//       <p><strong>Name:</strong> ${r.customer_name}</p>
//       <p><strong>Email:</strong> ${r.customer_email}</p>
//       <p><strong>Date:</strong> ${r.reservation_date}</p>
//       <p><strong>Time:</strong> ${r.reservation_time}</p>
//       <p><strong>Party Size:</strong> ${r.party_size}</p>
//       <hr>
//     `;

//     container.appendChild(div);
//   });
// }

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

    }
  })();
}

// --- LOGIC FOR bookings.html (VIEW ALL RESERVATIONS) ---
if (path.includes("bookings.html")) {
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "login.html";
      return;
    }

    const ownerId = user.id;
    const tbody = document.querySelector("#bookingsTable tbody");
    if (tbody) tbody.innerHTML = ""; // Clear table body

    // 1️⃣ Fetch all restaurants owned by this user
    const { data: restaurants, error: rError } = await supabase
      .from("restaurants")
      .select("id, name") // ✅ CORRECTED: Selecting 'id' instead of 'restaurant_id'
      .eq("owner_id", ownerId);

    if (rError) {
      console.error("Error loading restaurants:", rError.message);
      if (tbody) tbody.innerHTML = `<tr><td colspan="7">Error loading restaurants: ${rError.message}</td></tr>`;
      return;
    }

    if (!restaurants || restaurants.length === 0) {
      console.log("No restaurants found for this owner");
      if (tbody) tbody.innerHTML = `<tr><td colspan="7">No restaurants found for your account.</td></tr>`;
      return;
    }

    // 2️⃣ Map the correct 'id' field to build the filter array
    const restaurantIds = restaurants.map(r => r.id); // ✅ CORRECTED: Mapping 'id'

    // 3️⃣ Fetch all reservations for these restaurants
    const { data: reservations, error } = await supabase
      .from("reservations")
      .select("*")
      .in("restaurant_id", restaurantIds);

    if (error) {
      console.error("Error fetching reservations:", error.message);
      if (tbody) tbody.innerHTML = `<tr><td colspan="7">Error fetching reservations: ${error.message}</td></tr>`;
      return;
    }

    if (!reservations || reservations.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7">No reservations found for your restaurants.</td></tr>`;
      return;
    }

    // 4️⃣ Render the reservations
    reservations.forEach((r) => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${r.restaurant_id}</td>
        <td>${r.customer_name}</td>
        <td>${r.customer_email}</td>
        <td>${r.start_time}</td>
        <td>${r.predicted_end_time}</td>
        <td>${r.guest_count}</td>
        <td>${r.status}</td>
        <td>
    <button onclick="updateReservationStatus('${r.id}', 'seated')" class="btn-seat">Seat</button>
    <button onclick="deleteReservation('${r.id}')" class="btn-cancel">Cancel</button>
  </td>
      `;

      if (tbody) tbody.appendChild(row);
    });
  })();
}

if (path.includes("seatingChart.html")) {
  // Ensure DOM is ready (works even if DOM is already loaded)
  const initSeatingChart = async () => {
    console.log("Seating chart page loaded");

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.log("No user found, redirecting to login");
      window.location.href = "login.html";
      return;
    } else {
      console.log("User authenticated:", user.email);

      let restaurantId = null;

      // Try to get restaurant_id from user metadata
      if (user.user_metadata && user.user_metadata.restaurant_id) {
        restaurantId = user.user_metadata.restaurant_id;
        console.log("Restaurant ID from user metadata:", restaurantId);
      } else {
        // Get from restaurants table using email
        const { data: restaurantData, error: restaurantError } = await supabase
          .from("restaurants")
          .select("id")
          .eq("email", user.email)
          .single();

        if (restaurantError) {
          console.error("Error fetching restaurant:", restaurantError.message);
        } else if (restaurantData) {
          restaurantId = restaurantData.id;
          console.log("Restaurant ID from restaurants table:", restaurantId);
        }
      }

      if (!restaurantId) {
        const container = document.querySelector("#seatingChartContainer");
        if (container) {
          container.innerHTML = `
            <p class="empty-message">
              Unable to determine restaurant. Please ensure your account is linked to a restaurant.
            </p>
          `;
        }
        console.error("No restaurant_id found for user");
        return;
      }

      // Fetch seating data filtered by restaurant_id (UUID)
      const { data: seatingData, error } = await supabase
        .from("restaurant_seating")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("room_name", { ascending: true });

      const container = document.querySelector("#seatingChartContainer");
      if (!container) return;


      console.log("Restaurant ID:", restaurantId);
      console.log("Seating data fetch result:", { seatingData, error });

      if (error) {
        console.error("Error fetching seating data:", error.message);
        container.innerHTML = `<p class="empty-message">Error loading seating chart: ${error.message}</p>`;
        return;
      }

      if (!seatingData || seatingData.length === 0) {
        container.innerHTML = `
          <p class="empty-message">
            No seating data available. Please add tables to the Restaurant_Seating table.
          </p>
        `;
        return;
      }


      // Group seating data by room_name (all data is from the same restaurant)
      const groupedData = {};
      seatingData.forEach((seat) => {
        const key = seat.room_name;
        if (!groupedData[key]) {
          groupedData[key] = {
            roomName: seat.room_name,
            tables: []
          };
        }
        groupedData[key].tables.push(seat);
      });

      // Create HTML for each room
      let html = "";
      Object.values(groupedData).forEach((group) => {
        html += `
          <div class="seating-room">
            <h2>${group.roomName || "Unnamed Room"}</h2>
            <table class="seating-table">
              <thead>
                <tr>
                  <th>Table Name</th>
                  <th>Capacity</th>
                </tr>
              </thead>
              <tbody>
        `;

        group.tables.forEach((table) => {
          html += `
            <tr>
              <td>${table.table_name || "N/A"}</td>
              <td>${table.capacity || 0}</td>
            </tr>
          `;
        });

        html += `
              </tbody>
            </table>
          </div>
        `;
      });

      container.innerHTML = html;
    }
  };


  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSeatingChart);
  } else {
    initSeatingChart();
  }
}

// --- NEW UTILITY FUNCTIONS FOR RESERVATION MANAGEMENT ---

// Function to handle DELETE request
async function deleteReservation(reservationId) {
  const { error } = await supabase
    .from("reservations")
    .delete()
    .eq("id", reservationId); // Target the row by its primary key ID

  if (error) {
    console.error("❌ Error deleting reservation:", error.message);
    alert(`Failed to delete reservation: ${error.message}`);
  } else {
    alert("Reservation successfully cancelled/deleted!");
    // Refresh the page or the table to show the change
    window.location.reload();
  }
}

// Function to handle PATCH/UPDATE request (e.g., changing status)
async function updateReservationStatus(reservationId, newStatus, price, actual_end_time) {
  const { error } = await supabase
    .from("reservations")
    .update({ status: newStatus, price: price, actual_end_time: actual_end_time })
    .eq("id", reservationId); // Target the row by its primary key ID

  if (error) {
    console.error("❌ Error updating reservation:", error.message);
    alert(`Failed to update reservation status: ${error.message}`);
  } else {
    alert(`Reservation ${reservationId} updated to ${newStatus}!`);
    // Refresh the page or the table to show the change
    window.location.reload();
  }
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
