let context;
export function playTone(kind, enabled) {
  if(!enabled) return;
  try {
    context ??= new (window.AudioContext||window.webkitAudioContext)();
    if(context.state==='suspended') context.resume().catch(()=>{});
    const sequence=kind==='correct'?[523.25,659.25]:kind==='complete'?[523.25,659.25,783.99]:[330];
    sequence.forEach((frequency,index)=>{const oscillator=context.createOscillator(),gain=context.createGain(),start=context.currentTime+index*.12;
      oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.06,start+.015);gain.gain.exponentialRampToValueAtTime(.001,start+.16);
      oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start);oscillator.stop(start+.18);
    });
  } catch { /* Sound is optional; gameplay continues on browsers without Web Audio. */ }
}
