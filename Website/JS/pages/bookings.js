import { supabase } from "../supabaseClient.js";
import { getRestaurantByEmail } from "../modules/restaurants.js";
import { getReservationsForRestaurants } from "../modules/reservations.js";
import { getTableInfoByIds } from "../modules/restaurants.js";
import { formatDateTime } from "../modules/utils.js";

/**
 * Initialize bookings page (view all reservations)
 */
export async function initBookings() {
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

  // 1️⃣ Fetch all restaurants owned by this user
  console.log("Making query to restaurants table...");
  const { data: restaurants, error: rError } = await getRestaurantByEmail(user_email);

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
  const { data: reservations, error } = await getReservationsForRestaurants(restaurantIds, ["confirmed", "pending"]);

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
  const { data: tablesData, error: tablesError } = await getTableInfoByIds(uniqueTableIds);
  
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
        <button onclick="window.location.href='updateReservation.html?id=${r.id}'" class="btn-seat">Update</button>
        <button onclick="window.location.href='deleteReservation.html?id=${r.id}'" class="btn-cancel">Delete</button>
      </td>
    `;

    if (tbody) tbody.appendChild(row);
  });
}

