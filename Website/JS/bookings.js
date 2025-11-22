// bookings.js - All bookings-related logic with modals

import { supabase } from "./supabaseClient.js";

console.log("✅ Bookings.js module loaded successfully");

// Wait for authentication before initializing
function waitForAuth() {
  return new Promise((resolve) => {
    if (window.authReady) {
      console.log("Auth already ready");
      resolve();
      return;
    }
    console.log("Waiting for auth-ready event...");
    window.addEventListener('auth-ready', () => {
      console.log("Auth-ready event received");
      window.authReady = true;
      resolve();
    }, { once: true });
  });
}

const path = window.location.pathname.toLowerCase();

console.log("Current path:", path);
console.log("Checking if path includes 'bookings':", path.includes("bookings"));

// --- LOGIC FOR bookings.html (VIEW ALL RESERVATIONS) ---
if (path.includes("bookings")) {
  (async () => {
    await waitForAuth();
    
    const { data: { user } } = await supabase.auth.getUser();
    console.log("📧 User email from Supabase:", user?.email);
console.log("Raw user object:", user);

    if (!user) {
      window.location.href = "login.html";
      return;
    }

    const user_email = user.email;
    let restaurantId = null;
    let restaurantDefaultHours = { open: null, close: null };
    let restaurantOperatingHours = null;
    
    const tbody = document.querySelector("#bookingsTable tbody");
    if (tbody) tbody.innerHTML = "";

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

    // Load and display bookings
    async function loadBookings() {
      const { data: restaurants, error: rError } = await supabase
        .from("restaurants")
        .select("*")
        .eq("email", user_email);

      if (rError || !restaurants || restaurants.length === 0) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="9">No restaurants found for your account.</td></tr>`;
        return;
      }

      restaurantId = restaurants[0].id;
      setRestaurantHours(restaurants[0]);

      const restaurantIds = restaurants.map(r => r.id);
      const { data: reservations, error } = await supabase
        .from("reservations")
        .select("*")
        .in("restaurant_id", restaurantIds)
        .in("status", ["confirmed", "pending"]);

      if (error || !reservations || reservations.length === 0) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="9">No reservations found.</td></tr>`;
        return;
      }

      const uniqueTableIds = [...new Set(reservations.map(r => r.table_id).filter(Boolean))];
      const { data: tablesData } = await supabase
        .from("restaurant_seating")
        .select("id, table_name, room_name")
        .in("id", uniqueTableIds);
      
      const tableInfoMap = {};
      if (tablesData) {
        tablesData.forEach((table) => {
          tableInfoMap[table.id] = {
            table_name: table.table_name || "N/A",
            room_name: table.room_name || "N/A"
          };
        });
      }

      tbody.innerHTML = "";
      reservations.forEach((r) => {
        const row = document.createElement("tr");
        const tableInfo = r.table_id ? tableInfoMap[r.table_id] : null;
        const tableName = tableInfo ? tableInfo.table_name : "N/A";
        const roomName = tableInfo ? tableInfo.room_name : "N/A";

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
            <button onclick="window.openUpdateModal('${r.id}', '${r.status}', '${r.price_paid || ''}', '${r.actual_end_time || ''}')" class="btn-seat">Update</button>
            <button onclick="window.openDeleteModal('${r.id}', '${r.customer_name}', '${r.customer_email}', '${tableName}', '${roomName}')" class="btn-cancel">Delete</button>
          </td>
        `;
        tbody.appendChild(row);
      });
    }

    // Helper functions for operating hours
    const parseTimeToMinutes = (timeString) => {
      if (!timeString) return null;
      let cleaned = String(timeString).trim().toLowerCase().replace(/\s+/g, "");
      const hyphenIndex = cleaned.indexOf("-");
      if (hyphenIndex !== -1) cleaned = cleaned.slice(0, hyphenIndex);

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
            if (open && close) normalized[dayKey] = { open, close };
          }
          continue;
        }

        if (typeof value === "object") {
          const openVal = value.open ?? value.opens ?? value.open_time ?? value.start ?? value.from ?? null;
          const closeVal = value.close ?? value.closes ?? value.close_time ?? value.end ?? value.to ?? null;

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
        open: restaurant.open_time ?? restaurant.opening_time ?? restaurant.opens_at ?? restaurant.open_at ?? null,
        close: restaurant.close_time ?? restaurant.closing_time ?? restaurant.closes_at ?? restaurant.close_at ?? null,
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
            if (!daily) return null;
            if (daily.open && daily.close) return daily;
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
      if (openMinutes === closeMinutes) return true;

      const reservationMinutes = date.getHours() * 60 + date.getMinutes();
      if (openMinutes < closeMinutes) {
        return {
          allowed: reservationMinutes >= openMinutes && reservationMinutes < closeMinutes,
          hours,
        };
      }
      return {
        allowed: reservationMinutes >= openMinutes || reservationMinutes < closeMinutes,
        hours,
      };
    };

    async function getTablesForRestaurant(restaurantId) {
      if (!restaurantId) return { tables: [], error: "Restaurant ID is required" };

      const { data: tables, error } = await supabase
        .from("restaurant_seating")
        .select("id, restaurant_id, table_name, room_name, capacity")
        .eq("restaurant_id", restaurantId)
        .order("room_name", { ascending: true })
        .order("table_name", { ascending: true });

      if (error) return { tables: [], error: error.message };
      return { tables: tables || [], error: null };
    }

    async function loadTables() {
      const tableSelect = document.getElementById("table_id");
      if (!tableSelect) return;

      tableSelect.disabled = true;
      tableSelect.innerHTML = '<option value="">Loading tables...</option>';

      const { tables, error } = await getTablesForRestaurant(restaurantId);

      if (error) {
        tableSelect.innerHTML = '<option value="">Error loading tables</option>';
        return;
      }

      if (tables && tables.length > 0) {
        const { data: reservations } = await supabase
          .from("reservations")
          .select("table_id, guest_count, status")
          .eq("restaurant_id", restaurantId)
          .eq("status", "confirmed");

        const allocatedSeatsByTable = {};
        if (reservations) {
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
      } else {
        tableSelect.innerHTML = '<option value="">No tables available</option>';
      }
    }

    // Open modal and load tables when new reservation button is clicked
    const btnNewReservation = document.getElementById("btnNewReservation");

if (btnNewReservation) {
  btnNewReservation.addEventListener("click", async () => {
    console.log("btnNewReservation actually clicked"); 
    await loadTables();
  });
}

    // Handle new reservation form submission
    const newReservationForm = document.getElementById("newReservationForm");
    const submitBtn = document.getElementById("submitBtn");
    const reservationLoadingBar = document.getElementById("reservationLoadingBar");
    let reservationSubmitting = false;

    const setReservationLoadingState = (isLoading) => {
      if (submitBtn) {
        submitBtn.disabled = isLoading;
        submitBtn.textContent = isLoading ? "Creating..." : "Create Reservation";
      }
      if (reservationLoadingBar) {
        reservationLoadingBar.classList.toggle("active", isLoading);
      }
    };

    if (newReservationForm) {
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
      
            if (reservationSubmitting) {
              console.log("⚠️ Reservation submission already in progress, ignoring duplicate click.");
              return;
            }

            reservationSubmitting = true;
            setReservationLoadingState(true);

            try {
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
            } catch (err) {
              console.error("❌ Unexpected error while creating reservation:", err);
              alert("Unexpected error while creating the reservation. Please try again.");
            } finally {
              reservationSubmitting = false;
              setReservationLoadingState(false);
            }
          });
    }
        })();
      }

    // Handle update reservation
    window.openUpdateModal = (id, status, price, actualEndTime) => {
      document.getElementById("reservationId").value = id;
      document.getElementById("newStatus").value = status || "";
      document.getElementById("price").value = price || "";
      
      if (actualEndTime && actualEndTime !== "null") {
        const date = new Date(actualEndTime);
        if (!Number.isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");
          const hours = String(date.getHours()).padStart(2, "0");
          const minutes = String(date.getMinutes()).padStart(2, "0");
          document.getElementById("actual_end_time").value = `${year}-${month}-${day}T${hours}:${minutes}`;
        }
      } else {
        document.getElementById("actual_end_time").value = "";
      }
      
      window.openModal('updateReservationModal');
    };

    const updateReservationForm = document.getElementById("updateReservationForm");
    if (updateReservationForm) {
      updateReservationForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const reservationId = document.getElementById("reservationId").value;
        const newStatus = document.getElementById("newStatus").value;
        const price = document.getElementById("price").value;
        const actualEndTime = document.getElementById("actual_end_time").value;

        const errorMessage = document.getElementById("updateErrorMessage");
        const successMessage = document.getElementById("updateSuccessMessage");

        errorMessage.textContent = "";
        successMessage.textContent = "";

        const updateData = { status: newStatus };
        if (price) updateData.price_paid = parseFloat(price);
        if (actualEndTime) updateData.actual_end_time = actualEndTime;

        const { error } = await supabase
          .from("reservations")
          .update(updateData)
          .eq("id", reservationId);

        if (error) {
          errorMessage.textContent = `Failed to update reservation: ${error.message}`;
        } else {
          successMessage.textContent = "Reservation successfully updated!";
          setTimeout(() => {
            window.closeModal('updateReservationModal');
            loadBookings();
          }, 1500);
        }
      });
    }

    // Handle delete reservation
    window.openDeleteModal = (id, customerName, customerEmail, tableName, roomName) => {
      const deleteInfo = document.getElementById("deleteReservationInfo");
      deleteInfo.innerHTML = `
        <p><strong>Customer:</strong> ${customerName}</p>
        <p><strong>Email:</strong> ${customerEmail}</p>
        <p><strong>Room:</strong> ${roomName}</p>
        <p><strong>Table:</strong> ${tableName}</p>
        <p><strong>Reservation ID:</strong> ${id}</p>
      `;
      
      document.getElementById("confirmDeleteBtn").dataset.reservationId = id;
      window.openModal('deleteReservationModal');
    };

    const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
    if (confirmDeleteBtn) {
      confirmDeleteBtn.addEventListener("click", async () => {
        const reservationId = confirmDeleteBtn.dataset.reservationId;
        const errorMessage = document.getElementById("deleteErrorMessage");
        const successMessage = document.getElementById("deleteSuccessMessage");

        errorMessage.textContent = "";
        successMessage.textContent = "";

        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.textContent = "Deleting...";

        const { error } = await supabase
          .from("reservations")
          .delete()
          .eq("id", reservationId);

        if (error) {
          errorMessage.textContent = `Failed to delete reservation: ${error.message}`;
          confirmDeleteBtn.disabled = false;
          confirmDeleteBtn.textContent = "Delete Reservation";
        } else {
          successMessage.textContent = "Reservation successfully deleted!";
          setTimeout(() => {
            window.closeModal('deleteReservationModal');
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.textContent = "Delete Reservation";
            loadBookings();
          }, 1500);
        }
      });
    }

    // Initial load
    loadBookings();
  })();
}