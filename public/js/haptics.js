const durations={tap:10,correct:35,wrong:160};
export function vibrate(kind, enabled) {
  if(!enabled) return;
  // iOS Safari has no Vibration API at all; the game simply continues without a buzz.
  try{navigator.vibrate?.(durations[kind]);}catch{ /* Haptics are optional. */ }
}
