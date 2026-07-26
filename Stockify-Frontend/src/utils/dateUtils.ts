
/**
 * Format timestamp for display
 * @param timestamp - Timestamp string from backend
 * @returns Formatted date string in local timezone
 */
export function formatToIST(timestamp: string): string {
  const corrected = timestamp.replace("Z", "");
  const date = new Date(corrected);

  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

/**
 * Convert UTC timestamp to IST Date object
 * @param utcTimestamp - UTC timestamp string from backend
 * @returns Date object in IST
 */
export function toISTDate(utcTimestamp: string): Date {
  const date = new Date(utcTimestamp);
  // Add 5 hours 30 minutes to UTC to get IST
  const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
  return new Date(date.getTime() + istOffset);
}

/**
 * Check if Indian stock market is currently open
 * @returns boolean indicating if market is live
 */
export function isMarketLive(): boolean {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const ist = new Date(utc + (3600000 * 5.5));
  const day = ist.getDay(); 
  if (day === 0 || day === 6) return false;
  
  const timeInMinutes = ist.getHours() * 60 + ist.getMinutes();
  const startMinutes = 9 * 60 + 15; // 09:15 AM
  const endMinutes = 15 * 60 + 30;  // 03:30 PM
  
  return timeInMinutes >= startMinutes && timeInMinutes <= endMinutes;
}
