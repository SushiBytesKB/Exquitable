import { supabase } from "../supabaseClient.js";
import { getTablesForRestaurant } from "../modules/tables.js";
import { getRestaurantByEmail, getAllRestaurants } from "../modules/restaurants.js";
import { createReservation, getConfirmedReservationsForTable, calculatePredictedEndTime } from "../modules/reservations.js";
import { showError, showSuccess, hideMessages } from "../modules/utils.js";

/**
 * Initialize reservation page (create new reservation)
 */
export async function initReservation() {
  console.log("📌 Reservation page detected. Setting up form submission...");

  // Check if user is logged in
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthenticated = !!user;
  
  // Show/hide back link based on authentication
  const backLink = document.getElementById("backLink");
  if (backLink) {
    backLink.style.display = isAuthenticated ? "inline-block" : "none";
  }

  const reservationForm = document.querySelector("#newReservationForm");
  const tableSelect = document.querySelector("#table_id");
  const tableLoading = document.querySelector("#tableLoading");
  const restaurantSelect = document.querySelector("#restaurant_id");
  const restaurantGroup = document.getElementById("restaurantGroup");
  const restaurantLoading = document.getElementById("restaurantLoading");
  const errorMessage = document.getElementById("errorMessage");
  const successMessage = document.getElementById("successMessage");
  let restaurantId = null;

  // Function to load tables for the restaurant with available seats
  async function loadTables(restaurantId) {
    if (!tableSelect) return;

    tableSelect.disabled = true;
    tableSelect.innerHTML = '<option value="">Loading tables...</option>';
    if (tableLoading) tableLoading.style.display = "block";

    const { tables, error } = await getTablesForRestaurant(restaurantId);

    if (tableLoading) tableLoading.style.display = "none";

    if (error) {
      showError(errorMessage, successMessage, `Error loading tables: ${error}`);
      tableSelect.innerHTML = '<option value="">Error loading tables</option>';
      return;
    }

    if (tables && tables.length > 0) {
      // Fetch reservations to calculate available seats (only confirmed status reduces availability)
      const { data: reservations, error: reservationsError } = await supabase
        .from("reservations")
        .select("table_id, guest_count, status")
        .eq("restaurant_id", restaurantId)
        .eq("status", "confirmed"); // Only count confirmed reservations for availability

      // Calculate allocated seats per table (only from confirmed reservations)
      const allocatedSeatsByTable = {};
      if (reservations && !reservationsError) {
        reservations.forEach((reservation) => {
          // Only count confirmed reservations
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
      console.log(`✅ Loaded ${tables.length} table(s) for restaurant with available seats`);
    } else {
      tableSelect.innerHTML = '<option value="">No tables available</option>';
      showError(errorMessage, successMessage, "No tables found for your restaurant.");
    }
  }

  // 1️⃣ Handle authenticated users (owners) vs public users
  if (isAuthenticated) {
    // AUTHENTICATED USER (OWNER) - Auto-load restaurant and tables
    const user_email = user.email;
    const { data: restaurants, error: rError } = await getRestaurantByEmail(user_email);

    if (rError) {
      console.error("Error loading restaurant:", rError);
      showError(errorMessage, successMessage, `Error loading restaurant: ${rError.message}`);
      if (tableSelect) {
        tableSelect.innerHTML = '<option value="">Error loading restaurant</option>';
      }
      return;
    }

    if (!restaurants || restaurants.length === 0) {
      showError(errorMessage, successMessage, "No restaurant found for your account. Please contact support.");
      if (tableSelect) {
        tableSelect.innerHTML = '<option value="">No restaurant found</option>';
      }
      return;
    }

    // Use the first restaurant (assuming one restaurant per user)
    restaurantId = restaurants[0].id;
    console.log("✅ Restaurant ID automatically loaded for owner:", restaurantId);

    // Load tables automatically
    await loadTables(restaurantId);
  } else {
    // PUBLIC USER - Show restaurant dropdown
    if (restaurantGroup) restaurantGroup.style.display = "block";
    if (restaurantSelect) {
      restaurantSelect.required = true;
      
      // Load all restaurants
      if (restaurantLoading) restaurantLoading.style.display = "block";
      const { data: allRestaurants, error: allRestaurantsError } = await getAllRestaurants();

      if (restaurantLoading) restaurantLoading.style.display = "none";

      if (allRestaurantsError) {
        showError(errorMessage, successMessage, `Error loading restaurants: ${allRestaurantsError.message}`);
        return;
      }

      if (allRestaurants && allRestaurants.length > 0) {
        restaurantSelect.innerHTML = '<option value="">Select a restaurant</option>';
        allRestaurants.forEach((restaurant) => {
          const option = document.createElement("option");
          option.value = restaurant.id;
          option.textContent = restaurant.name || restaurant.id;
          restaurantSelect.appendChild(option);
        });
        console.log(`✅ Loaded ${allRestaurants.length} restaurant(s) for public users`);
      } else {
        showError(errorMessage, successMessage, "No restaurants available.");
        restaurantSelect.innerHTML = '<option value="">No restaurants available</option>';
      }

      // Load tables when restaurant is selected
      restaurantSelect.addEventListener("change", async (e) => {
        const selectedRestaurantId = e.target.value?.trim();
        if (selectedRestaurantId) {
          restaurantId = selectedRestaurantId;
          await loadTables(restaurantId);
        } else {
          if (tableSelect) {
            tableSelect.innerHTML = '<option value="">Select a restaurant first</option>';
            tableSelect.disabled = true;
          }
          restaurantId = null;
        }
      });
    }
  }

  if (reservationForm) {
    reservationForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideMessages(errorMessage, successMessage);

      // Get all values from the form inputs
      const tableId = e.target.table_id?.value?.trim();
      const customerEmail = e.target.customer_email?.value?.trim();
      const customerName = e.target.customer_name?.value?.trim();
      const guestCountValue = e.target.guest_count?.value || e.target.party_size?.value || e.target.guests?.value;
      const guestCount = parseInt(guestCountValue, 10);
      const start_time = e.target.start_time?.value || e.target.reservation_time?.value;

      // Basic validation check
      if (!restaurantId) {
        showError(errorMessage, successMessage, "Error: Restaurant not found. Please refresh the page.");
        const submitBtn = document.getElementById("submitBtn");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create Reservation";
        }
        return;
      }

      if (!tableId) {
        showError(errorMessage, successMessage, "Please select a table for this reservation.");
        return;
      }

      if (!customerName) {
        showError(errorMessage, successMessage, "Customer name is required.");
        return;
      }

      if (!customerEmail) {
        showError(errorMessage, successMessage, "Customer email is required.");
        return;
      }

      if (!Number.isFinite(guestCount) || guestCount <= 0) {
        showError(errorMessage, successMessage, "Please provide a valid party size greater than zero.");
        return;
      }

      if (!start_time) {
        showError(errorMessage, successMessage, "Start time is required.");
        return;
      }

      const submitBtn = document.getElementById("submitBtn");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Creating...";
      }

      // --- Step 1: Get all tables for this restaurant ---
      console.log("🔍 Step 1: Getting all tables for restaurant:", restaurantId);
      const { tables: restaurantTables, error: tablesError } = await getTablesForRestaurant(restaurantId);
      
      if (tablesError) {
        alert(`Error loading tables: ${tablesError}`);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create Reservation";
        }
        return;
      }

      if (!restaurantTables || restaurantTables.length === 0) {
        alert(`No tables found for restaurant ${restaurantId}. Please add tables first.`);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create Reservation";
        }
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
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create Reservation";
        }
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
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create Reservation";
        }
        return;
      }

      // 2. Sum all confirmed guests for this restaurant (only confirmed status reduces availability)
      const { data: confirmedReservations, error: confirmedError } = await getConfirmedReservationsForTable(restaurantId, tableId);

      if (confirmedError) {
        console.error("❌ Error fetching confirmed reservations:", confirmedError.message);
        alert(`Unable to verify existing reservations: ${confirmedError.message}`);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create Reservation";
        }
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
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create Reservation";
        }
        return;
      }

      // Calculate predicted_end_time (1 hour after start_time)
      const { start_time_iso, predicted_end_time } = calculatePredictedEndTime(start_time);

      // Create reservation data object
      const reservationData = {
        restaurant_id: restaurantId,
        table_id: tableId,
        customer_email: customerEmail,
        customer_name: customerName,
        start_time: start_time_iso,
        predicted_end_time: predicted_end_time,
        guest_count: guestCount,
        status: "confirmed", // Set status to confirmed by default
      };

      const { data, error } = await createReservation(reservationData);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Reservation";
      }

      if (error) {
        console.error("❌ Error submitting reservation:", error.message);
        showError(errorMessage, successMessage, `Failed to create reservation: ${error.message}. Check RLS policy.`);
      } else {
        showSuccess(successMessage, errorMessage, "Reservation successfully created!");
        reservationForm.reset();
        
        // Reset table dropdown
        if (tableSelect) {
          tableSelect.innerHTML = '<option value="">Select a restaurant first</option>';
          tableSelect.disabled = true;
        }
        
        // Redirect to bookings page after 2 seconds (only for authenticated users)
        if (isAuthenticated) {
          setTimeout(() => {
            window.location.href = "bookings.html";
          }, 2000);
        }
      }
    });
  }
}

