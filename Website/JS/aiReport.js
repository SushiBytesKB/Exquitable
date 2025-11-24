import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {
  initDashboard();
  setupFilters();
});

function setupFilters() {
  const buttons = document.querySelectorAll(".filter-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      // UI Toggle
      buttons.forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");

      // Load Data
      const range = e.target.getAttribute("data-range");
      loadData(range);
    });
  });
}

async function initDashboard() {
  // Check Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  // Default to Today
  loadData("today");
}

async function loadData(range) {
  const dateRange = getDateRange(range);

  const { data: reservations, error } = await supabase
    .from("reservations")
    .select("*")
    .gte("start_time", dateRange.start)
    .lte("start_time", dateRange.end);

  if (error) {
    console.error("Error fetching report data:", error);
    return;
  }

  calculateAndRenderMetrics(reservations);
}

// --- LOGIC CORE ---

function calculateAndRenderMetrics(data) {
  // 1. Filter by Status
  const confirmed = data.filter(
    (r) => r.status === "confirmed" || r.status === "completed"
  );
  const unsuccessful = data.filter((r) =>
    ["denied", "rejected", "cancelled"].includes(r.status)
  );
  const completed = data.filter((r) => r.status === "completed");

  // --- Counts ---
  document.getElementById("totalBookings").textContent = confirmed.length;
  document.getElementById("totalUnsuccessful").textContent =
    unsuccessful.length;

  // --- Revenue ---
  const revenue = confirmed.reduce(
    (sum, r) => sum + (parseFloat(r.price_paid) || 0),
    0
  );
  document.getElementById("totalRevenue").textContent = formatCurrency(revenue);

  // --- Guest Stats ---
  if (confirmed.length > 0) {
    const totalGuests = confirmed.reduce(
      (sum, r) => sum + (r.guest_count || 0),
      0
    );
    document.getElementById("avgGuests").textContent = (
      totalGuests / confirmed.length
    ).toFixed(1);
  } else {
    document.getElementById("avgGuests").textContent = "0";
  }

  // --- Highest Paying Customer ---
  if (confirmed.length > 0) {
    const topPayer = confirmed.reduce((prev, current) => {
      return (parseFloat(prev.price_paid) || 0) >
        (parseFloat(current.price_paid) || 0)
        ? prev
        : current;
    });
    document.getElementById("topCustomerAmount").textContent = formatCurrency(
      topPayer.price_paid || 0
    );
    document.getElementById("topCustomerEmail").textContent =
      topPayer.customer_email || "Unknown";
  } else {
    document.getElementById("topCustomerAmount").textContent = "$0.00";
    document.getElementById("topCustomerEmail").textContent = "--";
  }

  // --- Prediction Accuracy (+/- 7 mins) ---
  const validPredictions = completed.filter(
    (r) => r.actual_end_time && r.predicted_end_time
  );

  if (validPredictions.length > 0) {
    let accurateCount = 0;
    validPredictions.forEach((r) => {
      const start = new Date(r.start_time).getTime();
      const predictedDur =
        (new Date(r.predicted_end_time).getTime() - start) / 60000;
      const actualDur = (new Date(r.actual_end_time).getTime() - start) / 60000;

      if (Math.abs(predictedDur - actualDur) <= 7) {
        accurateCount++;
      }
    });
    const accuracy = (accurateCount / validPredictions.length) * 100;
    document.getElementById("predictionAccuracy").textContent =
      accuracy.toFixed(1) + "%";
  } else {
    document.getElementById("predictionAccuracy").textContent = "N/A";
  }

  // --- Peak Occupancy ---
  const hourCounts = new Array(24).fill(0);
  confirmed.forEach((r) => {
    const hour = new Date(r.start_time).getHours();
    hourCounts[hour]++;
  });

  const maxCount = Math.max(...hourCounts);
  const peakHour = hourCounts.indexOf(maxCount);
  document.getElementById("peakOccupancy").textContent =
    maxCount > 0 ? formatHour(peakHour) : "--";
}

// --- HELPERS ---

function getDateRange(range) {
  const start = new Date();
  const end = new Date();

  if (range === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (range === "week") {
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (range === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(start.getMonth() + 1);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);
  } else if (range === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
  }

  return { start: start.toISOString(), end: end.toISOString() };
}

function formatCurrency(val) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(val);
}

function formatHour(hour) {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h} ${ampm}`;
}
