import { supabase } from "../supabaseClient.js";

/**
 * Create a new reservation
 * @param {Object} reservationData - Reservation data object
 * @returns {Promise<{data: Object|null, error: Object|null}>}
 */
export async function createReservation(reservationData) {
  const { data, error } = await supabase
    .from("reservations")
    .insert([reservationData])
    .select();

  return { data, error };
}

/**
 * Update a reservation
 * @param {string} reservationId - Reservation UUID
 * @param {Object} updateData - Data to update
 * @returns {Promise<{error: Object|null}>}
 */
export async function updateReservation(reservationId, updateData) {
  const { error } = await supabase
    .from("reservations")
    .update(updateData)
    .eq("id", reservationId);

  return { error };
}

/**
 * Delete a reservation
 * @param {string} reservationId - Reservation UUID
 * @returns {Promise<{error: Object|null}>}
 */
export async function deleteReservationById(reservationId) {
  const { error } = await supabase
    .from("reservations")
    .delete()
    .eq("id", reservationId);

  return { error };
}

/**
 * Get reservations for restaurants
 * @param {Array} restaurantIds - Array of restaurant UUIDs
 * @param {Array} statuses - Array of statuses to filter by (optional)
 * @returns {Promise<{data: Array|null, error: Object|null}>}
 */
export async function getReservationsForRestaurants(restaurantIds, statuses = null) {
  let query = supabase
    .from("reservations")
    .select("*")
    .in("restaurant_id", restaurantIds);

  if (statuses && statuses.length > 0) {
    query = query.in("status", statuses);
  }

  const { data, error } = await query;
  return { data, error };
}

/**
 * Get confirmed reservations for a specific table
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} tableId - Table UUID
 * @returns {Promise<{data: Array|null, error: Object|null}>}
 */
export async function getConfirmedReservationsForTable(restaurantId, tableId) {
  const { data, error } = await supabase
    .from("reservations")
    .select("guest_count")
    .eq("restaurant_id", restaurantId)
    .eq("status", "confirmed")
    .eq("table_id", tableId);

  return { data, error };
}

/**
 * Calculate predicted end time (1 hour after start time)
 * @param {string} startTime - Start time in datetime-local format
 * @returns {Object} {start_time_iso: string, predicted_end_time: string}
 */
export function calculatePredictedEndTime(startTime) {
  const startDateTime = new Date(startTime);
  const predictedEndDateTime = new Date(startDateTime);
  predictedEndDateTime.setHours(predictedEndDateTime.getHours() + 1);

  return {
    start_time_iso: startDateTime.toISOString(),
    predicted_end_time: predictedEndDateTime.toISOString()
  };
}

