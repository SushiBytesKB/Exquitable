import { supabase } from "../supabaseClient.js";

/**
 * Get all tables for a restaurant
 * @param {string} restaurantId - Restaurant UUID
 * @returns {Promise<{tables: Array, error: string|null}>}
 */
export async function getTablesForRestaurant(restaurantId) {
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

/**
 * Calculate available seats for tables based on confirmed reservations
 * @param {string} restaurantId - Restaurant UUID
 * @param {Array} tables - Array of table objects
 * @returns {Promise<Object>} Map of table_id to available seats
 */
export async function calculateAvailableSeats(restaurantId, tables) {
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

  // Calculate available seats for each table
  const availableSeatsMap = {};
  tables.forEach((table) => {
    const allocated = allocatedSeatsByTable[table.id] || 0;
    const capacity = table.capacity || 0;
    availableSeatsMap[table.id] = Math.max(0, capacity - allocated);
  });

  return availableSeatsMap;
}

// Expose function globally for testing in console
window.getTablesForRestaurant = getTablesForRestaurant;

