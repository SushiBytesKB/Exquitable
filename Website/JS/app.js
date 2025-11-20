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
    let restaurantDefaultHours = { open: null, close: null };
    let restaurantOperatingHours = null;

    const parseTimeToMinutes = (timeString) => {
      if (!timeString) return null;
      let cleaned = String(timeString).trim().toLowerCase();
      if (!cleaned) return null;

      cleaned = cleaned.replace(/\s+/g, "");
      const hyphenIndex = cleaned.indexOf("-");
      if (hyphenIndex !== -1) {
        cleaned = cleaned.slice(0, hyphenIndex);
      }

      const timeRegex = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/;
      const match = cleaned.match(timeRegex);

      if (match) {
        let hours = parseInt(match[1], 10);
        let minutes = match[2] ? parseInt(match[2], 10) : 0;
        const meridiem = match[3];

        if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

        if (meridiem === "pm" && hours !== 12) hours += 12;
        if (meridiem === "am" && hours === 12) hours = 0;

        return hours * 60 + minutes;
      }

      const [hourStr, minuteStr = "0"] = cleaned.split(":");
      const hours = Number(hourStr);
      const minutes = Number(minuteStr);
      if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
      return hours * 60 + minutes;
    };

    const formatDisplayTime = (timeString) => {
      if (!timeString) return "";
      const [hourStr, minuteStr = "0"] = timeString.split(":");
      const hours = Number(hourStr);
      const minutes = Number(minuteStr);
      if (Number.isNaN(hours) || Number.isNaN(minutes)) return timeString;
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    };

    const normalizeHoursObject = (raw) => {
      if (!raw || typeof raw !== "object") return null;
      const normalized = {};
      const closedTokens = new Set(["", "null", "none", "closed", "holiday", "off"]);

      for (const [key, value] of Object.entries(raw)) {
        const dayKey = String(key || "").toLowerCase();
        if (!dayKey) continue;

        if (value === "Null" || value === undefined) {
          normalized[dayKey] = null;
          continue;
        }

        if (typeof value === "string") {
          const cleaned = value.trim();
          if (closedTokens.has(cleaned.toLowerCase())) {
            normalized[dayKey] = null;
            continue;
          }

          if (cleaned.includes("-")) {
            const [openStr, closeStr] = cleaned.split("-");
            const open = openStr?.trim();
            const close = closeStr?.trim();
            if (open && close) {
              normalized[dayKey] = { open, close };
            }
          }
          continue;
        }

        if (typeof value === "object") {
          const openVal =
            value.open ??
            value.opens ??
            value.open_time ??
            value.start ??
            value.from ??
            null;
          const closeVal =
            value.close ??
            value.closes ??
            value.close_time ??
            value.end ??
            value.to ??
            null;

          if (!openVal || !closeVal) {
            normalized[dayKey] = null;
          } else {
            normalized[dayKey] = { open: openVal, close: closeVal };
          }
        }
      }

      return Object.keys(normalized).length ? normalized : null;
    };

    const setRestaurantHours = (restaurant) => {
      restaurantDefaultHours = { open: null, close: null };
      restaurantOperatingHours = null;

      if (!restaurant) return;

      if (restaurant.operating_hours) {
        let hoursData = restaurant.operating_hours;
        if (typeof hoursData === "string") {
          try {
            hoursData = JSON.parse(hoursData);
          } catch (err) {
            console.warn("Unable to parse operating_hours JSON:", err);
          }
        }
        restaurantOperatingHours = normalizeHoursObject(hoursData);
      }

      restaurantDefaultHours = {
        open:
          restaurant.open_time ??
          restaurant.opening_time ??
          restaurant.opens_at ??
          restaurant.open_at ??
          null,
        close:
          restaurant.close_time ??
          restaurant.closing_time ??
          restaurant.closes_at ??
          restaurant.close_at ??
          null,
      };
    };

    const getHoursForDate = (date) => {
      if (restaurantOperatingHours) {
        const dayName = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
        const specialMap = {
          thursday: ["thu", "thur", "thurs"],
          tuesday: ["tue", "tues"],
          wednesday: ["wed", "weds"],
          saturday: ["sat"],
          sunday: ["sun"],
          monday: ["mon"],
          friday: ["fri"],
        };

        const candidates = new Set([
          dayName,
          dayName.slice(0, 3),
          dayName.slice(0, 2),
          ...(specialMap[dayName] || []),
        ]);

        for (const key of candidates) {
          if (!key) continue;
          if (Object.prototype.hasOwnProperty.call(restaurantOperatingHours, key)) {
            const daily = restaurantOperatingHours[key];
            if (!daily) {
              return null;
            }
            if (daily.open && daily.close) {
              return daily;
            }
            return null;
          }
        }
      }

      if (restaurantDefaultHours.open && restaurantDefaultHours.close) {
        return restaurantDefaultHours;
      }
      return null;
    };

    const isWithinOperatingHours = (date) => {
      const hours = getHoursForDate(date);
      if (!hours) return { allowed: false, reason: "closed" };

      const openMinutes = parseTimeToMinutes(hours.open);
      const closeMinutes = parseTimeToMinutes(hours.close);
      if (openMinutes === null || closeMinutes === null) return true;
      if (openMinutes === closeMinutes) return true; // treat as 24 hours

      const reservationMinutes = date.getHours() * 60 + date.getMinutes();
      if (openMinutes < closeMinutes) {
        return {
          allowed: reservationMinutes >= openMinutes && reservationMinutes < closeMinutes,
          hours,
        };
      }
      // Closing time passes midnight
      return {
        allowed: reservationMinutes >= openMinutes || reservationMinutes < closeMinutes,
        hours,
      };
    };

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
      .select("*")
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
    setRestaurantHours(restaurants[0]);
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

      if (!start_time) {
        alert("Please select a start time for this reservation.");
        return;
      }

      const startDateTime = new Date(start_time);
      if (Number.isNaN(startDateTime.getTime())) {
        alert("Please provide a valid start time.");
        return;
      }

      const hoursCheck = isWithinOperatingHours(startDateTime);
      if (hoursCheck !== true && hoursCheck?.allowed === false) {
        const hours = hoursCheck.hours || getHoursForDate(startDateTime);
        const dayLabel = startDateTime.toLocaleDateString("en-US", { weekday: "long" });
        if (!hours) {
          alert(`The restaurant is closed on ${dayLabel}. Please choose another day.`);
        } else {
          const openLabel = formatDisplayTime(hours.open);
          const closeLabel = formatDisplayTime(hours.close);
          alert(
            `The restaurant operates on ${dayLabel} from ${openLabel} to ${closeLabel}. Please choose another time.`
          );
        }
        return;
      }

      if (!start_time) {
        alert("Please select a start time for this reservation.");
        return;
      }


      if (!isWithinOperatingHours(startDateTime)) {
        const openLabel = formatDisplayTime(restaurantHours.open);
        const closeLabel = formatDisplayTime(restaurantHours.close);
        const hoursText =
          openLabel && closeLabel
            ? `${openLabel} - ${closeLabel}`
            : "the restaurant's working hours";
        alert(`Selected time is outside of the restaurant's working hours (${hoursText}). Please choose another time.`);
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

// --- LOGIC FOR updateReservation.html ---
if (path.endsWith("updatereservation.html")) {
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    const form = document.getElementById("updateReservationForm");
    if (!form) return;

    const reservationIdInput = document.getElementById("reservationId");
    const statusSelect = document.getElementById("newStatus");
    const priceInput = document.getElementById("price");
    const actualEndInput = document.getElementById("actual_end_time");
    const errorMessage = document.getElementById("errorMessage");
    const successMessage = document.getElementById("successMessage");
    const submitBtn = document.getElementById("submitBtn");

    const showError = (message) => {
      if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = "block";
      }
      if (successMessage) successMessage.style.display = "none";
    };

    const showSuccess = (message) => {
      if (successMessage) {
        successMessage.textContent = message;
        successMessage.style.display = "block";
      }
      if (errorMessage) errorMessage.style.display = "none";
    };

    const hideMessages = () => {
      if (errorMessage) errorMessage.style.display = "none";
      if (successMessage) successMessage.style.display = "none";
    };

    const urlParams = new URLSearchParams(window.location.search);
    const reservationIdFromUrl = urlParams.get("id");
    const statusFromUrl = urlParams.get("status");
    const priceFromUrl = urlParams.get("price_paid");
    const actualEndTimeFromUrl = urlParams.get("actual_end_time");

    if (reservationIdFromUrl && reservationIdInput) {
      reservationIdInput.value = reservationIdFromUrl;
    }
    if (statusFromUrl && statusSelect) {
      statusSelect.value = statusFromUrl;
    }
    if (priceFromUrl && priceInput) {
      priceInput.value = priceFromUrl;
    }
    if (actualEndTimeFromUrl && actualEndInput) {
      const date = new Date(actualEndTimeFromUrl);
      if (!Number.isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        actualEndInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
      }
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideMessages();

      const reservationId = reservationIdInput?.value?.trim();
      const newStatus = statusSelect?.value;
      const price = priceInput?.value ? parseFloat(priceInput.value) : null;
      const actualEndTime = actualEndInput?.value || null;

      if (!reservationId) {
        showError("Reservation ID is required");
        return;
      }
      if (!newStatus) {
        showError("Status is required");
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Updating...";
      }

      try {
        const updateData = { status: newStatus };
        if (price !== null && !Number.isNaN(price)) {
          updateData.price_paid = price;
        }
        if (actualEndTime) {
          updateData.actual_end_time = actualEndTime;
        }

        const { error } = await supabase
          .from("reservations")
          .update(updateData)
          .eq("id", reservationId);

        if (error) {
          console.error("Error updating reservation:", error);
          showError(`Failed to update reservation: ${error.message}`);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Update Reservation";
          }
        } else {
          showSuccess("Reservation successfully updated!");
          setTimeout(() => {
            window.location.href = "bookings.html";
          }, 2000);
        }
      } catch (err) {
        console.error("Unexpected error:", err);
        showError(`An unexpected error occurred: ${err.message}`);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Update Reservation";
        }
      }
    });
  })();
}

// --- LOGIC FOR deleteReservation.html ---
if (path.endsWith("deletereservation.html")) {
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "login.html";
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const reservationId = urlParams.get("id");
    const loadingMessage = document.getElementById("loadingMessage");
    const reservationContent = document.getElementById("reservationContent");
    const errorEl = document.getElementById("errorMessage");
    const successEl = document.getElementById("successMessage");
    const deleteBtn = document.getElementById("deleteBtn");

    if (!reservationId) {
      if (loadingMessage) {
        loadingMessage.textContent = "Error: No reservation ID provided.";
      }
      return;
    }

    const showError = (message) => {
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = "block";
      }
      if (successEl) successEl.style.display = "none";
    };

    const showSuccess = (message) => {
      if (successEl) {
        successEl.textContent = message;
        successEl.style.display = "block";
      }
      if (errorEl) errorEl.style.display = "none";
    };

    const formatDateTime = (dateString) => {
      if (!dateString) return "N/A";
      const date = new Date(dateString);
      return date.toLocaleString();
    };

    const renderReservationDetails = (reservation, tableInfo) => {
      const detailsContainer = document.getElementById("reservationDetails");
      if (!detailsContainer) return;

      const tableName = tableInfo ? tableInfo.table_name : "N/A";
      const roomName = tableInfo ? tableInfo.room_name : "N/A";

      detailsContainer.innerHTML = `
        <h2>Reservation Details</h2>
        <div class="detail-row">
          <span class="detail-label">Reservation ID:</span>
          <span class="detail-value">${reservation.id}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Customer Name:</span>
          <span class="detail-value">${reservation.customer_name || "N/A"}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Customer Email:</span>
          <span class="detail-value">${reservation.customer_email || "N/A"}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Room:</span>
          <span class="detail-value">${roomName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Table:</span>
          <span class="detail-value">${tableName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Start Time:</span>
          <span class="detail-value">${formatDateTime(reservation.start_time)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Predicted End Time:</span>
          <span class="detail-value">${formatDateTime(reservation.predicted_end_time)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Actual End Time:</span>
          <span class="detail-value">${formatDateTime(reservation.actual_end_time)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Guest Count:</span>
          <span class="detail-value">${reservation.guest_count || "N/A"}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status:</span>
          <span class="detail-value">${reservation.status || "N/A"}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Price Paid:</span>
          <span class="detail-value">${reservation.price_paid != null ? `$${Number(reservation.price_paid).toFixed(2)}` : "N/A"}</span>
        </div>
      `;
    };

    const loadReservationDetails = async () => {
      try {
        const { data: reservation, error: reservationError } = await supabase
        .from("reservations")
        .select("*")
          .eq("id", reservationId)
          .single();

        if (reservationError) {
          console.error("Error loading reservation:", reservationError);
          if (loadingMessage) {
            loadingMessage.textContent = `Error loading reservation: ${reservationError.message}`;
          }
          return;
        }
        if (!reservation) {
          if (loadingMessage) loadingMessage.textContent = "Reservation not found.";
          return;
        }

        let tableInfo = null;
        if (reservation.table_id) {
          const { data: tableData, error: tableError } = await supabase
            .from("restaurant_seating")
            .select("table_name, room_name")
            .eq("id", reservation.table_id)
            .eq("restaurant_id", reservation.restaurant_id)
            .limit(1);

          if (tableError) {
            const { data: fallbackData } = await supabase
              .from("restaurant_seating")
              .select("table_name, room_name")
              .eq("id", reservation.table_id)
              .limit(1);

            if (fallbackData && fallbackData.length > 0) {
              tableInfo = fallbackData[0];
            }
          } else if (tableData && tableData.length > 0) {
            tableInfo = tableData[0];
          }
        }

        renderReservationDetails(reservation, tableInfo);
        if (loadingMessage) loadingMessage.classList.add("is-hidden");
        if (reservationContent) reservationContent.classList.remove("is-hidden");
      } catch (err) {
        console.error("Unexpected error:", err);
        if (loadingMessage) loadingMessage.textContent = `An unexpected error occurred: ${err.message}`;
      }
    };

    const handleDelete = async () => {
      const confirmed = confirm(
        "Are you absolutely sure you want to delete this reservation? This action cannot be undone."
      );
      if (!confirmed) return;

      if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = "Deleting...";
      }

      try {
        const { error } = await supabase
          .from("reservations")
          .delete()
          .eq("id", reservationId);

        if (error) {
          console.error("Error deleting reservation:", error);
          showError(`Failed to delete reservation: ${error.message}`);
          if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = "Delete Reservation";
          }
        } else {
          showSuccess("Reservation successfully deleted!");
          setTimeout(() => {
            window.location.href = "bookings.html";
          }, 2000);
        }
      } catch (err) {
        console.error("Unexpected error deleting reservation:", err);
        showError(`An unexpected error occurred: ${err.message}`);
        if (deleteBtn) {
          deleteBtn.disabled = false;
          deleteBtn.textContent = "Delete Reservation";
        }
      }
    };

    if (deleteBtn) {
      deleteBtn.addEventListener("click", handleDelete);
    }
    loadReservationDetails();
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

