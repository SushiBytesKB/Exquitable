import { supabase } from "../supabaseClient.js";

/**
 * Get restaurant by user email
 * @param {string} email - User email
 * @returns {Promise<{data: Object|null, error: Object|null}>}
 */
export async function getRestaurantByEmail(email) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name")
    .eq("email", email);

  return { data, error };
}

/**
 * Get all restaurants
 * @returns {Promise<{data: Array|null, error: Object|null}>}
 */
export async function getAllRestaurants() {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name")
    .order("name", { ascending: true });

  return { data, error };
}

/**
 * Get table information by IDs
 * @param {Array} tableIds - Array of table UUIDs
 * @returns {Promise<{data: Array|null, error: Object|null}>}
 */
export async function getTableInfoByIds(tableIds) {
  if (!tableIds || tableIds.length === 0) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from("restaurant_seating")
    .select("id, table_name, room_name")
    .in("id", tableIds);

  return { data, error };
}

