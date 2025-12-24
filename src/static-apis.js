export function getCurrentTime() {
  console.log('[static-apis] getCurrentTime() called');
  return new Date().toLocaleTimeString();
}
