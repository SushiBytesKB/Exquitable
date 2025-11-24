import { supabase } from "./supabaseClient.js";

(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    const { data: reservations, error } = await supabase
      .from("reservations")
      .select("status, guest_count");

    if (error) throw error;

    const totalBookings = reservations.length;
    const accepted = reservations.filter(
      (r) => r.status === "confirmed"
    ).length;
    const denied = reservations.filter((r) => r.status === "denied").length;

    const totalGuests = reservations
      .filter((r) => r.status === "confirmed")
      .reduce((sum, r) => sum + r.guest_count, 0);

    const estRevenue = totalGuests * 45; // $45 avg spend

    // Update UI
    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.innerText = val;
    };

    setTxt("stat-total-bookings", totalBookings);
    setTxt("stat-accepted", accepted);
    setTxt("stat-denied", denied);
    setTxt("stat-revenue", `$${estRevenue}`);

    // Chart.js rendering
    const ctx = document.getElementById("revenueChart");
    if (ctx && window.Chart) {
      new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: ["Accepted", "Denied"],
          datasets: [
            {
              data: [accepted, denied],
              backgroundColor: ["#4CAF50", "#FF5252"],
            },
          ],
        },
      });
    }
  } catch (err) {
    console.error("Analytics Error:", err);
  }
})();
