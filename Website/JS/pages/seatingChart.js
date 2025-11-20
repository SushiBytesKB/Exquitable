import { supabase } from "../supabaseClient.js";

/**
 * Initialize seating chart page
 */
export async function initSeatingChart() {
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
      const { data: restaurants, error: restaurantError } = await supabase
        .from("restaurants")
        .select("id")
        .eq("email", user.email);
      
      const restaurantData = restaurants && restaurants.length > 0 ? restaurants[0] : null;

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
      const key = seat.room_name;
      if (!groupedData[key]) {
        groupedData[key] = {
          roomName: seat.room_name,
          tables: []
        };
      }
      
      // Calculate allocated and available seats for this table
      const allocated = allocatedSeatsByTable[seat.id] || 0;
      const capacity = seat.capacity || 0;
      const available = Math.max(0, capacity - allocated);
      
      groupedData[key].tables.push({
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
}

