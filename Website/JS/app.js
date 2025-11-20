import { supabase } from "./supabaseClient.js";

const path = window.location.pathname.toLowerCase();

if (path.includes("login.html")) {
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
        errorMessage.textContent = error.message;
      } else {
        window.location.href = "index.html";
      }
    });
  }
}

// --- LOGIC FOR reservation.html (owner-only reservations) ---
if (path.endsWith("reservation.html")) {
  (async () => {
    console.log("📌 Reservation page detected. Setting up form submission...");

    const { data: { user } } = await supabase.auth.getUser();
    
    // Show back link for authenticated owners
    const backLink = document.getElementById("backLink");
    if (backLink) {
      backLink.style.display = "inline-block";
    }

    const reservationForm = document.querySelector("#newReservationForm");
    const tableSelect = document.querySelector("#table_id");
    const tableLoading = document.querySelector("#tableLoading");
    let restaurantId = null;

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

    // Function to load tables with available seats into dropdown
    async function loadTables(restaurantId) {
      if (!tableSelect) return;

      tableSelect.disabled = true;
      tableSelect.innerHTML = '<option value="">Loading tables...</option>';
      if (tableLoading) tableLoading.style.display = "block";

      const { tables, error } = await getTablesForRestaurant(restaurantId);

      if (tableLoading) tableLoading.style.display = "none";

      if (error) {
        tableSelect.innerHTML = '<option value="">Error loading tables</option>';
        return;
      }

      if (tables && tables.length > 0) {
        // Fetch confirmed reservations to calculate available seats
        const { data: reservations, error: reservationsError } = await supabase
          .from("reservations")
          .select("table_id, guest_count, status")
          .eq("restaurant_id", restaurantId)
          .eq("status", "confirmed"); // Only count confirmed reservations

        // Calculate allocated seats per table
        const allocatedSeatsByTable = {};
        if (reservations && !reservationsError) {
          reservations.forEach((reservation) => {
            if (reservation.table_id && reservation.status === "confirmed") {
              if (!allocatedSeatsByTable[reservation.table_id]) {
                allocatedSeatsByTable[reservation.table_id] = 0;
              }
              allocatedSeatsByTable[reservation.table_id] += reservation.guest_count || 0;
            }
          });
        }

        tableSelect.innerHTML = '<option value="">Select a table</option>';
        tables.forEach((table) => {
          const allocated = allocatedSeatsByTable[table.id] || 0;
          const capacity = table.capacity || 0;
          const available = Math.max(0, capacity - allocated);

          const option = document.createElement("option");
          option.value = table.id;
          option.textContent = `${table.room_name} - ${table.table_name} (Available: ${available})`;
          tableSelect.appendChild(option);
        });
        tableSelect.disabled = false;
        console.log(`✅ Loaded ${tables.length} table(s) with available seats`);
      } else {
        tableSelect.innerHTML = '<option value="">No tables available</option>';
      }
    }

    // Ensure the user is authenticated and load their restaurant automatically
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    const user_email = user.email;
    const { data: restaurants, error: rError } = await supabase
      .from("restaurants")
      .select("id, name")
      .eq("email", user_email);

    if (rError) {
      console.error("Error loading restaurant:", rError);
      if (tableSelect) {
        tableSelect.innerHTML = '<option value="">Error loading restaurant</option>';
      }
      return;
    }

    if (!restaurants || restaurants.length === 0) {
      if (tableSelect) {
        tableSelect.innerHTML = '<option value="">No restaurant found</option>';
      }
      return;
    }

    restaurantId = restaurants[0].id;
    console.log("✅ Restaurant ID automatically loaded for owner:", restaurantId);

    await loadTables(restaurantId);

    if (reservationForm) {

      reservationForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Get all values from the form inputs
        const tableId = e.target.table_id?.value?.trim();
        const customerEmail = e.target.customer_email?.value?.trim();
        const customerName = e.target.customer_name?.value?.trim();
        const guestCountValue = e.target.guest_count?.value || e.target.party_size?.value || e.target.guests?.value;
        const guestCount = parseInt(guestCountValue, 10);
        const start_time = e.target.start_time?.value || e.target.reservation_time?.value;

        // Basic validation check
        if (!restaurantId) {
          alert("Error: Restaurant not found. Please refresh the page.");
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

        // Calculate predicted_end_time (1 hour after start_time)
        const startDateTime = new Date(start_time);
        const predictedEndDateTime = new Date(startDateTime);
        predictedEndDateTime.setHours(predictedEndDateTime.getHours() + 1);

        const start_time_iso = startDateTime.toISOString();
        const predicted_end_time_iso = predictedEndDateTime.toISOString();

        // Create reservation data object
        const reservationData = {
          restaurant_id: restaurantId,
          table_id: tableId,
          customer_email: customerEmail,
          customer_name: customerName,
          start_time: start_time_iso,
          predicted_end_time: predicted_end_time_iso,
          guest_count: guestCount,
          status: "confirmed", // Set status to confirmed by default
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
          
          // Reload table availability
          if (tableSelect) {
            await loadTables(restaurantId);
          }
          
          // Redirect to bookings page after 2 seconds
          setTimeout(() => {
            window.location.href = "bookings.html";
          }, 2000);
        }
      });
    }
  })();
}
if (path.includes("index.html")) {
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) window.location.href = "login.html";
  })();
}

// --- LOGIC FOR setupSeating.html (owner adds restaurant seating) ---
if (path.endsWith("setupseating.html")) {
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "login.html";
      return;
    }

    const restaurantInfo = document.getElementById("restaurantInfo");
    const form = document.getElementById("setupSeatingForm");
    const errorEl = document.getElementById("setupError");
    const successEl = document.getElementById("setupSuccess");
    const submitBtn = document.getElementById("setupSubmitBtn");

    const showError = (message) => {
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = "block";
      } else {
        alert(message);
      }
      if (successEl) successEl.style.display = "none";
    };

    const showSuccess = (message) => {
      if (successEl) {
        successEl.textContent = message;
        successEl.style.display = "block";
      } else {
        alert(message);
      }
      if (errorEl) errorEl.style.display = "none";
    };

    const hideMessages = () => {
      if (errorEl) errorEl.style.display = "none";
      if (successEl) successEl.style.display = "none";
    };

    if (!form) {
      console.warn("setupSeatingForm not found");
      return;
    }

    const { data: restaurants, error: rError } = await supabase
      .from("restaurants")
      .select("id, name")
      .eq("email", user.email);

    if (rError) {
      console.error("Error loading restaurant:", rError);
      showError(`Error loading restaurant: ${rError.message}`);
      form.querySelectorAll("input, button").forEach((el) => (el.disabled = true));
      return;
    }

    if (!restaurants || restaurants.length === 0) {
      showError("No restaurant found for your account. Please create a restaurant first.");
      form.querySelectorAll("input, button").forEach((el) => (el.disabled = true));
      return;
    }

    const restaurantId = restaurants[0].id;
    const restaurantName = restaurants[0].name || "your restaurant";

    if (restaurantInfo) {
      restaurantInfo.textContent = `Adding seating for ${restaurantName}`;
      restaurantInfo.classList.remove("loading");
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideMessages();

      const tableName = form.table_name?.value?.trim();
      const roomName = form.room_name?.value?.trim();
      const capacityValue = parseInt(form.capacity?.value, 10);

      if (!tableName) {
        showError("Table name is required.");
        return;
      }

      if (!roomName) {
        showError("Room/Zone is required.");
        return;
      }

      if (!Number.isFinite(capacityValue) || capacityValue <= 0) {
        showError("Capacity must be a positive number.");
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving...";
      }

      const { error } = await supabase
        .from("restaurant_seating")
        .insert([
          {
            restaurant_id: restaurantId,
            table_name: tableName,
            room_name: roomName,
            capacity: capacityValue,
          },
        ]);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Save Seating";
      }

      if (error) {
        console.error("Error inserting seating:", error);
        showError(`Failed to save seating: ${error.message}`);
      } else {
        showSuccess("Seating saved successfully!");
        form.reset();
      }
    });
  })();
}

// --- LOGIC FOR updateSetupSeating.html (owner updates seating entries) ---
if (path.endsWith("updatesetupseating.html")) {
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "login.html";
      return;
    }

    const infoEl = document.getElementById("updateRestaurantInfo");
    const form = document.getElementById("updateSeatingForm");
    const seatingSelect = document.getElementById("seating_id");
    const tableNameInput = document.getElementById("update_table_name");
    const roomNameInput = document.getElementById("update_room_name");
    const capacityInput = document.getElementById("update_capacity");
    const errorEl = document.getElementById("updateSeatingError");
    const successEl = document.getElementById("updateSeatingSuccess");
    const submitBtn = document.getElementById("updateSeatingSubmitBtn");

    const showError = (message) => {
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = "block";
      } else {
        alert(message);
      }
      if (successEl) successEl.style.display = "none";
    };

    const showSuccess = (message) => {
      if (successEl) {
        successEl.textContent = message;
        successEl.style.display = "block";
      } else {
        alert(message);
      }
      if (errorEl) errorEl.style.display = "none";
    };

    const hideMessages = () => {
      if (errorEl) errorEl.style.display = "none";
      if (successEl) successEl.style.display = "none";
    };

    if (!form || !seatingSelect || !tableNameInput || !roomNameInput || !capacityInput) {
      console.warn("Update seating form elements not found");
      return;
    }

    const { data: restaurants, error: rError } = await supabase
      .from("restaurants")
      .select("id, name")
      .eq("email", user.email);

    if (rError) {
      console.error("Error loading restaurant:", rError);
      showError(`Error loading restaurant: ${rError.message}`);
      form.querySelectorAll("input, button, select").forEach((el) => (el.disabled = true));
      return;
    }

    if (!restaurants || restaurants.length === 0) {
      showError("No restaurant found for your account. Please create a restaurant first.");
      form.querySelectorAll("input, button, select").forEach((el) => (el.disabled = true));
      return;
    }

    const restaurantId = restaurants[0].id;
    const restaurantName = restaurants[0].name || "your restaurant";

    if (infoEl) {
      infoEl.textContent = `Updating seating for ${restaurantName}`;
      infoEl.classList.remove("loading");
    }

    const { data: seatingRows, error: seatingError } = await supabase
      .from("restaurant_seating")
      .select("id, table_name, room_name, capacity")
      .eq("restaurant_id", restaurantId)
      .order("room_name", { ascending: true })
      .order("table_name", { ascending: true });

    if (seatingError) {
      console.error("Error loading seating:", seatingError);
      showError(`Error loading seating: ${seatingError.message}`);
      seatingSelect.innerHTML = '<option value="">Unable to load seating</option>';
      return;
    }

    if (!seatingRows || seatingRows.length === 0) {
      seatingSelect.innerHTML = '<option value="">No seating found. Add tables first.</option>';
      return;
    }

    seatingSelect.innerHTML = '<option value="">Select a table to edit</option>';
    seatingRows.forEach((seat) => {
      const option = document.createElement("option");
      option.value = seat.id;
      option.textContent = `${seat.room_name || "Room"} - ${seat.table_name || seat.id}`;
      option.dataset.room = seat.room_name || "";
      option.dataset.table = seat.table_name || "";
      option.dataset.capacity = seat.capacity || 0;
      seatingSelect.appendChild(option);
    });
    seatingSelect.disabled = false;

    const enableInputs = (enabled) => {
      [tableNameInput, roomNameInput, capacityInput, submitBtn].forEach((el) => {
        if (el) el.disabled = !enabled;
      });
    };

    seatingSelect.addEventListener("change", (e) => {
      hideMessages();
      const selected = e.target.selectedOptions[0];
      if (!selected || !selected.value) {
        enableInputs(false);
        tableNameInput.value = "";
        roomNameInput.value = "";
        capacityInput.value = "";
        return;
      }

      tableNameInput.value = selected.dataset.table || "";
      roomNameInput.value = selected.dataset.room || "";
      capacityInput.value = selected.dataset.capacity || "";
      enableInputs(true);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideMessages();

      const seatingId = seatingSelect.value;
      const tableName = tableNameInput.value.trim();
      const roomName = roomNameInput.value.trim();
      const capacityValue = parseInt(capacityInput.value, 10);

      if (!seatingId) {
        showError("Please select a table to update.");
        return;
      }

      if (!tableName) {
        showError("Table name is required.");
        return;
      }

      if (!roomName) {
        showError("Room/Zone is required.");
        return;
      }

      if (!Number.isFinite(capacityValue) || capacityValue <= 0) {
        showError("Capacity must be a positive number.");
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving...";
      }

      const { data: updatedRow, error } = await supabase
        .from("restaurant_seating")
        .update({
          table_name: tableName,
          room_name: roomName,
          capacity: capacityValue,
        })
        .eq("id", seatingId)
        .eq("restaurant_id", restaurantId)
        .select("id, table_name, room_name, capacity")
        .maybeSingle();

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Save Changes";
      }

      if (error) {
        console.error("Error updating seating:", error);
        showError(`Failed to update seating: ${error.message}`);
      } else if (!updatedRow) {
        showError("No seating entry was updated. Please refresh and try again.");
      } else {
        showSuccess("Seating updated successfully!");
        const option = seatingSelect.querySelector(`option[value=\"${seatingId}\"]`);
        if (option) {
          option.dataset.table = updatedRow.table_name || "";
          option.dataset.room = updatedRow.room_name || "";
          option.dataset.capacity = updatedRow.capacity || 0;
          option.textContent = `${updatedRow.room_name || "Room"} - ${updatedRow.table_name || seatingId}`;
        }
      }
    });
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

    const user_id = user.id;
    const user_email = user.email;
    
    console.log("Owner ID:", user_id);
    console.log("User Email:", user_email);
    console.log("Querying restaurants with email:", JSON.stringify(user_email));
    
    const tbody = document.querySelector("#bookingsTable tbody");
    if (tbody) tbody.innerHTML = ""; // Clear table body

    // Helper function to format date
    const formatDateTime = (dateString) => {
      if (!dateString) return "N/A";
      try {
        const date = new Date(dateString);
        return date.toLocaleString();
      } catch (e) {
        return dateString;
      }
    };

    // 1️⃣ Fetch all restaurants owned by this user
    console.log("Making query to restaurants table...");
    const { data: restaurants, error: rError } = await supabase
      .from("restaurants")
      .select("id, name")
      .eq("email", user_email);

    if (rError) {
      console.error("Error loading restaurants:", rError);
      console.error("Error details:", JSON.stringify(rError, null, 2));
      if (tbody) tbody.innerHTML = `<tr><td colspan="9">Error loading restaurants: ${rError.message}</td></tr>`;
      return;
    }

    console.log("Restaurants found:", restaurants);
    console.log("Number of restaurants:", restaurants?.length || 0);

    if (!restaurants || restaurants.length === 0) {
      console.log("No restaurants found for this owner");
      if (tbody) tbody.innerHTML = `<tr><td colspan="9">No restaurants found for your account.</td></tr>`;
      return;
    }

    // 2️⃣ Map the correct 'id' field to build the filter array
    const restaurantIds = restaurants.map(r => r.id);

    // 3️⃣ Fetch all reservations for these restaurants with status 'confirmed' or 'pending'
    const { data: reservations, error } = await supabase
      .from("reservations")
      .select("*")
      .in("restaurant_id", restaurantIds)
      .in("status", ["confirmed", "pending"]);

    if (error) {
      console.error("Error fetching reservations:", error.message);
      if (tbody) tbody.innerHTML = `<tr><td colspan="9">Error fetching reservations: ${error.message}</td></tr>`;
      return;
    }

    if (!reservations || reservations.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="9">No reservations found for your restaurants.</td></tr>`;
      return;
    }

    // 4️⃣ Fetch table information for all unique table_ids
    const uniqueTableIds = [...new Set(reservations.map(r => r.table_id).filter(Boolean))];
    const { data: tablesData, error: tablesError } = await supabase
      .from("restaurant_seating")
      .select("id, table_name, room_name")
      .in("id", uniqueTableIds);
    
    const tableInfoMap = {};
    if (tablesData && !tablesError) {
      tablesData.forEach((table) => {
        tableInfoMap[table.id] = {
          table_name: table.table_name || "N/A",
          room_name: table.room_name || "N/A"
        };
      });
    }

    // 5️⃣ Render the reservations
    reservations.forEach((r) => {
      const row = document.createElement("tr");
      const tableInfo = r.table_id ? tableInfoMap[r.table_id] : null;
      const tableName = tableInfo ? tableInfo.table_name : "N/A";
      const roomName = tableInfo ? tableInfo.room_name : "N/A";

      // Build URL with all reservation data for update page
      const updateParams = new URLSearchParams({
        id: r.id,
        status: r.status || "",
        price_paid: r.price_paid || "",
        actual_end_time: r.actual_end_time || "",
        customer_name: r.customer_name || "",
        customer_email: r.customer_email || "",
        guest_count: r.guest_count || "",
        start_time: r.start_time || "",
        predicted_end_time: r.predicted_end_time || ""
      });
      const updateUrl = `updateReservation.html?${updateParams.toString()}`;

      row.innerHTML = `
        <td>${r.customer_name || "N/A"}</td>
        <td>${r.customer_email || "N/A"}</td>
        <td>${roomName}</td>
        <td>${tableName}</td>
        <td>${formatDateTime(r.start_time)}</td>
        <td>${formatDateTime(r.predicted_end_time)}</td>
        <td>${r.guest_count || 0}</td>
        <td>${r.status || "N/A"}</td>
        <td>
          <button onclick="window.location.href='${updateUrl}'" class="btn-seat">Update</button>
          <button onclick="window.location.href='deleteReservation.html?id=${r.id}'" class="btn-cancel">Delete</button>
        </td>
      `;

      if (tbody) tbody.appendChild(row);
    });
  })();
}

if (path.includes("seatingchart.html")) {
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


      // Fetch reservations for this restaurant to calculate allocated seats
      const { data: reservations, error: reservationsError } = await supabase
        .from("reservations")
        .select("table_id, guest_count, status")
        .eq("restaurant_id", restaurantId)
        .in("status", ["confirmed"]);

      if (reservationsError) {
        console.error("Error fetching reservations:", reservationsError);
      }

      // Calculate allocated seats per table
      const allocatedSeatsByTable = {};
      if (reservations) {
        reservations.forEach((reservation) => {
          if (reservation.table_id) {
            if (!allocatedSeatsByTable[reservation.table_id]) {
              allocatedSeatsByTable[reservation.table_id] = 0;
            }
            allocatedSeatsByTable[reservation.table_id] += reservation.guest_count || 0;
          }
        });
      }

      // Group seating data by room_name and add allocated/available seat info
      const groupedData = {};
      seatingData.forEach((seat) => {
        const rawRoomName = seat.room_name ? seat.room_name.trim() : "";
        const normalizedKey = rawRoomName.toLowerCase() || "unnamed-room";

        if (!groupedData[normalizedKey]) {
          groupedData[normalizedKey] = {
            roomName: rawRoomName || "Unnamed Room",
            tables: []
          };
        }
        
        // Calculate allocated and available seats for this table
        const allocated = allocatedSeatsByTable[seat.id] || 0;
        const capacity = seat.capacity || 0;
        const available = Math.max(0, capacity - allocated);
        
        groupedData[normalizedKey].tables.push({
          ...seat,
          allocated,
          available
        });
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
                  <th>Allocated</th>
                  <th>Available</th>
                </tr>
              </thead>
              <tbody>
        `;

        group.tables.forEach((table) => {
          html += `
            <tr>
              <td>${table.table_name || "N/A"}</td>
              <td>${table.capacity || 0}</td>
              <td>${table.allocated}</td>
              <td>${table.available}</td>
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

