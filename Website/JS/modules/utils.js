// Utility functions used across the application

/**
 * Format a date string to a readable locale string
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date string or "N/A"
 */
export function formatDateTime(dateString) {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    return date.toLocaleString();
  } catch (e) {
    return dateString;
  }
}

/**
 * Show error message in the UI
 * @param {HTMLElement} errorElement - Error message element
 * @param {HTMLElement} successElement - Success message element (optional)
 * @param {string} message - Error message to display
 */
export function showError(errorElement, successElement, message) {
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = "block";
    if (successElement) successElement.style.display = "none";
  }
}

/**
 * Show success message in the UI
 * @param {HTMLElement} successElement - Success message element
 * @param {HTMLElement} errorElement - Error message element (optional)
 * @param {string} message - Success message to display
 */
export function showSuccess(successElement, errorElement, message) {
  if (successElement) {
    successElement.textContent = message;
    successElement.style.display = "block";
    if (errorElement) errorElement.style.display = "none";
  }
}

/**
 * Hide error and success messages
 * @param {HTMLElement} errorElement - Error message element
 * @param {HTMLElement} successElement - Success message element
 */
export function hideMessages(errorElement, successElement) {
  if (errorElement) errorElement.style.display = "none";
  if (successElement) successElement.style.display = "none";
}

