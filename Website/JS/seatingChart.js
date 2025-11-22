import { supabase } from "./supabaseClient.js";

function waitForAuth() {
  return new Promise((resolve) => {
    if (window.authReady) {
      resolve();
      return;
    }
    window.addEventListener('auth-ready', () => {
      window.authReady = true;
      resolve();
    }, { once: true });
  });
}
const tabButtons = document.querySelectorAll('.tab-btn');
const seatingViews = document.querySelectorAll('.seating-view');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const viewName = btn.dataset.view;
    if (!viewName) return;
    
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    seatingViews.forEach(v => {
      v.classList.remove('active');
      if (viewName === 'view' && v.id === 'seatingChartContainer') {
        v.classList.add('active');
      } else if (viewName === 'setup' && v.id === 'setupSeatingView') {
        v.classList.add('active');
      } else if (viewName === 'update' && v.id === 'updateSeatingView') {
        v.classList.add('active');
      }
    });
  });
});

const urlParams = new URLSearchParams(window.location.search);
const view = urlParams.get('view') || 'view';
if (view === 'setup') {
  const setupBtn = document.querySelector('[data-view="setup"]');
  if (setupBtn) {
    setupBtn.click();
  }
} else if (view === 'update') {
  const updateBtn = document.querySelector('[data-view="update"]');
  if (updateBtn) {
    updateBtn.click();
  }
}

const path = window.location.pathname.toLowerCase();

if (document.getElementById("seatingChartContainer") && path.includes("seatingchart.html")) {
  const initSeatingChart = async () => {
      const { data: { user } } = await supabase.auth.getUser();
  
      if (!user) {
        window.location.href = "login.html";
        return;
      } else {
        let restaurantId = null;
  
        if (user.user_metadata && user.user_metadata.restaurant_id) {
          restaurantId = user.user_metadata.restaurant_id;
        } else {
          const { data: restaurantData, error: restaurantError } = await supabase
            .from("restaurants")
            .select("id")
            .eq("email", user.email)
            .single();
  
          if (restaurantError) {
          } else if (restaurantData) {
            restaurantId = restaurantData.id;
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
          return;
        }
  
        const { data: seatingData, error } = await supabase
          .from("restaurant_seating")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("room_name", { ascending: true });
  
        const container = document.querySelector("#seatingChartContainer");
        if (!container) return;
  
        if (error) {
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
  
        const { data: reservations, error: reservationsError } = await supabase
          .from("reservations")
          .select("table_id, guest_count, status")
          .eq("restaurant_id", restaurantId)
          .in("status", ["confirmed"]);
  
        if (reservationsError) {
        }
  
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
          
          const allocated = allocatedSeatsByTable[seat.id] || 0;
          const capacity = seat.capacity || 0;
          const available = Math.max(0, capacity - allocated);
          
          groupedData[normalizedKey].tables.push({
            ...seat,
            allocated,
            available
          });
        });
  
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

if (document.getElementById("setupSeatingForm")) {
  (async () => {
    await waitForAuth();
    
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
      return;
    }

    const { data: restaurants, error: rError } = await supabase
      .from("restaurants")
      .select("id, name")
      .eq("email", user.email);

    if (rError) {
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
        showError(`Failed to save seating: ${error.message}`);
      } else {
        showSuccess("Seating saved successfully!");
        form.reset();
      }
    });
  })();
}

if (document.getElementById("updateSeatingForm")) {
  (async () => {
    await waitForAuth();
    
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
      return;
    }

    const { data: restaurants, error: rError } = await supabase
      .from("restaurants")
      .select("id, name")
      .eq("email", user.email);

    if (rError) {
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


