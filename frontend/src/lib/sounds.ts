
export class SoundManager {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public playMetallicClink(frequencyValue: number = 1) {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    
    // Main tone (fundamental)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    // Metallic resonance often has high, non-harmonic overtones
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800 * frequencyValue, now);
    osc.frequency.exponentialRampToValueAtTime(1200 * frequencyValue, now + 0.05);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    // High frequency "ping" (inharmonic overtone)
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2400 * frequencyValue, now);
    
    gain2.gain.setValueAtTime(0.15, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);

    // Subtle noise burst for the impact
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.05, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    noise.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.5);
    osc2.start(now);
    osc2.stop(now + 0.3);
    noise.start(now);
  }

  public playDeepDonk() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.6);
  }

  public playMarbleBounce() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    let startTime = now;
    let velocity = 0.5; // Initial energy
    const gravity = 0.15;
    const elasticity = 0.7;

    // Simulate marble bounce timing
    for (let i = 0; i < 12; i++) {
      const timeOffset = startTime - now;
      
      // Synthesis for one bounce "click"
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      // High frequency click for marble
      osc.frequency.setValueAtTime(3000 + (Math.random() * 500), startTime);
      
      gain.gain.setValueAtTime(velocity * 0.1, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.02);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + 0.03);
      
      // Calculate next bounce time
      startTime += velocity;
      velocity *= elasticity;
      
      if (velocity < 0.01) break;
    }
  }

  public playHeavyCollision() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    
    // 1. Impact Noise (Thud)
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 1000); // Filtered noise burst
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    noise.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noise.start(now);

    // 2. Fundamental Heavy Tone (Thump)
    const oscBody = this.ctx.createOscillator();
    const gainBody = this.ctx.createGain();
    oscBody.type = 'sine';
    oscBody.frequency.setValueAtTime(120, now);
    oscBody.frequency.exponentialRampToValueAtTime(80, now + 0.1);
    gainBody.gain.setValueAtTime(0.5, now);
    gainBody.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    oscBody.connect(gainBody);
    gainBody.connect(this.ctx.destination);
    oscBody.start(now);
    oscBody.stop(now + 0.6);

    // 3. Metallic Resonants (Ringing)
    const frequencies = [320, 580, 840, 1200];
    frequencies.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      
      const volume = 0.1 / (i + 1);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8 + (Math.random() * 0.4));
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 1.5);
    });
  }

  public playBitcoinHum() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const duration = 1.2;

    // 1. Electrical Hum (60Hz AC-like buzz)
    const humOsc = this.ctx.createOscillator();
    const humGain = this.ctx.createGain();
    humOsc.type = 'sawtooth';
    humOsc.frequency.setValueAtTime(60, now);
    humGain.gain.setValueAtTime(0.05, now);
    humGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    // Add a low-pass filter to make it "submerged" and hummy
    const humFilter = this.ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.setValueAtTime(200, now);
    
    humOsc.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(this.ctx.destination);
    humOsc.start(now);
    humOsc.stop(now + duration);

    // 2. Drone Whir (Harmonically related oscillators with beating)
    const droneFrequencies = [250, 500, 750]; // Base harmonics for drones
    droneFrequencies.forEach((freq, idx) => {
      // Create two slightly detuned oscillators per frequency to create beating
      [freq - 2, freq + 2].forEach(detunedFreq => {
        const droneOsc = this.ctx!.createOscillator();
        const droneGain = this.ctx!.createGain();
        const droneLFO = this.ctx!.createOscillator();
        const lfoGain = this.ctx!.createGain();

        droneOsc.type = 'triangle';
        droneOsc.frequency.setValueAtTime(detunedFreq, now);

        // LFO for the propeller "whir"
        droneLFO.frequency.setValueAtTime(10 + Math.random() * 5, now);
        lfoGain.gain.setValueAtTime(15, now); // Variance in frequency
        droneLFO.connect(lfoGain);
        lfoGain.connect(droneOsc.frequency);
        droneLFO.start(now);
        droneLFO.stop(now + duration);

        droneGain.gain.setValueAtTime(0.015 / (idx + 1), now);
        droneGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        droneOsc.connect(droneGain);
        droneGain.connect(this.ctx!.destination);
        droneOsc.start(now);
        droneOsc.stop(now + duration);
      });
    });

    // 3. Data Processing "Chirps" (Random blips)
    for (let i = 0; i < 8; i++) {
        const chirpStartTime = now + (i * 0.15);
        const chirpOsc = this.ctx.createOscillator();
        const chirpGain = this.ctx.createGain();
        chirpOsc.type = 'sine';
        chirpOsc.frequency.setValueAtTime(800 + Math.random() * 1200, chirpStartTime);
        chirpGain.gain.setValueAtTime(0.01, chirpStartTime);
        chirpGain.gain.exponentialRampToValueAtTime(0.001, chirpStartTime + 0.05);
        chirpOsc.connect(chirpGain);
        chirpGain.connect(this.ctx.destination);
        chirpOsc.start(chirpStartTime);
        chirpOsc.stop(chirpStartTime + 0.05);
    }
  }

  public playRuffle() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const duration = 0.4;
    
    // Create soft noise for the ruffle
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // Pink-ish noise (filtering would be better but this is a quick approximation)
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    // Filter to make it sound like paper/fabric (mid-range focused)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1000, now);
    filter.Q.setValueAtTime(0.5, now);
    // Modulate filter frequency for movement
    filter.frequency.exponentialRampToValueAtTime(2500, now + duration);

    const gain = this.ctx.createGain();
    
    // Ruffle pattern: series of quick pulses
    const pulseCount = 6;
    gain.gain.setValueAtTime(0, now);
    for (let i = 0; i < pulseCount; i++) {
        const pulseTime = now + (i * (duration / pulseCount));
        gain.gain.linearRampToValueAtTime(0.15 - (i * 0.02), pulseTime + 0.02);
        gain.gain.linearRampToValueAtTime(0.02, pulseTime + 0.05);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    noise.start(now);
    noise.stop(now + duration);
  }

  public playBullBellow() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const duration = 1.0;

    // Bull sound is tonal but resonant and rough
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc2.type = 'square';

    // Characteristic "bellow" pitch curve
    const baseFreq = 110;
    osc1.frequency.setValueAtTime(baseFreq, now);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.3);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, now + duration);

    osc2.frequency.setValueAtTime(baseFreq * 1.01, now); // Detune
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 1.51, now + 0.3);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.81, now + duration);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(800, now + 0.3);
    filter.frequency.exponentialRampToValueAtTime(300, now + duration);
    filter.Q.setValueAtTime(10, now); // Resonance

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  }

  public playBearRoar() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const duration = 1.6; // Slightly longer for a more epic roar

    // Base Tone
    const oscBody = this.ctx.createOscillator();
    const oscBody2 = this.ctx.createOscillator();
    const gainBody = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    // The "Shredding" Growl - modulated amplitude
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const amGain = this.ctx.createGain();

    oscBody.type = 'sawtooth';
    oscBody.frequency.setValueAtTime(65, now);
    oscBody.frequency.exponentialRampToValueAtTime(32, now + duration);

    oscBody2.type = 'square';
    oscBody2.frequency.setValueAtTime(67, now); // Detuned for thickness
    oscBody2.frequency.exponentialRampToValueAtTime(33, now + duration);

    // LFO for the "rbrbrbrb" growl texture
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(45, now); // 45Hz provides a rough shred
    lfo.frequency.linearRampToValueAtTime(25, now + duration);

    lfoGain.gain.setValueAtTime(0.5, now);
    lfoGain.gain.linearRampToValueAtTime(0.8, now + duration);

    // Filter for chest resonance
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + duration);
    filter.Q.setValueAtTime(8, now); // Resonant chest cavity

    // Noise for breath/rasp
    const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilter = this.ctx.createBiquadFilter();
    const noiseGain = this.ctx.createGain();

    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(800, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(400, now + duration);
    noiseFilter.Q.setValueAtTime(0.5, now);

    noiseGain.gain.setValueAtTime(0.08, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Connections
    oscBody.connect(amGain);
    oscBody2.connect(amGain);
    
    lfo.connect(lfoGain);
    lfoGain.connect(amGain.gain); // AM Modulation for growl

    amGain.connect(filter);
    filter.connect(gainBody);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);

    gainBody.gain.setValueAtTime(0, now);
    gainBody.gain.linearRampToValueAtTime(0.25, now + 0.1);
    gainBody.gain.exponentialRampToValueAtTime(0.001, now + duration);

    gainBody.connect(this.ctx.destination);
    noiseGain.connect(this.ctx.destination);

    oscBody.start(now);
    oscBody2.start(now);
    lfo.start(now);
    noise.start(now);
    oscBody.stop(now + duration);
    oscBody2.stop(now + duration);
    lfo.stop(now + duration);
    noise.stop(now + duration);
  }

  public playPlateClank(pitch: number = 1) {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    
    // 1. Sharp Impact (Metallic 'Ting')
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'square'; // More "edgy" than bullion triangle
    osc1.frequency.setValueAtTime(1200 * pitch, now);
    osc1.frequency.exponentialRampToValueAtTime(1600 * pitch, now + 0.02);
    
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);

    // 2. Resonant Ring-back (Plate vibration)
    const frequencies = [440, 660, 950]; // Distinct plate harmonics
    frequencies.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * pitch, now);
        
        // Add a slight frequency wobble (vibration)
        const lfo = this.ctx!.createOscillator();
        const lfoGain = this.ctx!.createGain();
        lfo.frequency.setValueAtTime(15, now);
        lfoGain.gain.setValueAtTime(20, now);
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(now);
        lfo.stop(now + 0.6);

        gain.gain.setValueAtTime(0.05 / (idx + 1), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now);
        osc.stop(now + 0.6);
    });

    // 3. Short friction "Zip" (Plate sliding/click)
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin(i / 10);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    noise.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noise.start(now);

    osc1.start(now);
    osc1.stop(now + 0.3);
  }

  public playJewelryFall() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const count = 15; // Number of jewels falling
    const duration = 0.8;

    for (let i = 0; i < count; i++) {
        const startTime = now + (Math.random() * duration * 0.5);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
        // Random high frequencies for gems (shimmering/crystalline)
        osc.frequency.setValueAtTime(4000 + Math.random() * 2000, startTime);
        // Slight slide on impact
        osc.frequency.exponentialRampToValueAtTime(3000 + Math.random() * 1000, startTime + 0.05);

        gain.gain.setValueAtTime(0.05, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05 + Math.random() * 0.1);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.2);
    }
    
    // Low frequency "thuds" for the physical impact of the gems
    for (let i = 0; i < 3; i++) {
        const startTime = now + (Math.random() * 0.15);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150 + Math.random() * 50, startTime);
        gain.gain.setValueAtTime(0.03, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.1);
    }
  }

  public playCoinSpin() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const duration = 2.0;
    
    // A coin spin is a series of impacts that get faster as the coin settles (Euler's Disk effect)
    let time = 0;
    let interval = 0.15; // Initial slow interval
    const decay = 0.94; // How fast the interval shrinks
    const minInterval = 0.01;

    let iteration = 0;
    while (time < duration && interval > minInterval) {
        const hitTime = now + time;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
        // Metallic pitch - slightly higher as it spins faster?
        const freq = 1500 + (iteration * 10);
        osc.frequency.setValueAtTime(freq, hitTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.8, hitTime + 0.02);

        gain.gain.setValueAtTime(0.04, hitTime);
        gain.gain.exponentialRampToValueAtTime(0.001, hitTime + 0.03);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(hitTime);
        osc.stop(hitTime + 0.05);

        time += interval;
        interval *= decay; // Speed up
        iteration++;
    }

    // Add a final "clatter" noise burst
    const finalImpactTime = now + time;
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 500);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.05, finalImpactTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, finalImpactTime + 0.1);
    noise.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noise.start(finalImpactTime);
  }

  public playEagleScreech() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const duration = 1.2;
    
    // Eagle screech consists of a piercing core and a raspier layer
    const oscBody = this.ctx.createOscillator();
    const oscRasp = this.ctx.createOscillator();
    const gainCore = this.ctx.createGain();
    const gainRasp = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    // 1. Piercing Core (High pitched descending tone)
    oscBody.type = 'sawtooth';
    oscBody.frequency.setValueAtTime(3500, now);
    oscBody.frequency.exponentialRampToValueAtTime(1500, now + duration);

    gainCore.gain.setValueAtTime(0, now);
    gainCore.gain.linearRampToValueAtTime(0.08, now + 0.1);
    gainCore.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // 2. Raspiness (FM modulation for the 'screech' texture)
    oscRasp.type = 'square';
    oscRasp.frequency.setValueAtTime(2800, now);
    oscRasp.frequency.exponentialRampToValueAtTime(1200, now + duration);

    gainRasp.gain.setValueAtTime(0, now);
    gainRasp.gain.linearRampToValueAtTime(0.04, now + 0.15);
    gainRasp.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Filter to focus the scream and remove sub-bass rumble
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(800, now);
    filter.Q.setValueAtTime(1.0, now);

    // Add some noise for the "breath" of the scream
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.4));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.02, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    oscBody.connect(filter);
    oscRasp.connect(filter);
    filter.connect(gainCore);
    noise.connect(noiseGain);
    
    gainCore.connect(this.ctx.destination);
    gainRasp.connect(this.ctx.destination);
    noiseGain.connect(this.ctx.destination);

    oscBody.start(now);
    oscRasp.start(now);
    noise.start(now);
    oscBody.stop(now + duration);
    oscRasp.stop(now + duration);
  }

  public playLaserBeam() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const duration = 0.5;
    
    // Laser sound: rapid frequency sweep downwards with resonance
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    // Starting high and sweeping down quickly (the 'pew' sound)
    osc.frequency.setValueAtTime(1500, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + duration);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(500, now + duration);
    filter.Q.setValueAtTime(20, now); // High resonance for that "electric" feel

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    // Add a secondary high-frequency sine layer for the "beam" focus
    const beamOsc = this.ctx.createOscillator();
    const beamGain = this.ctx.createGain();
    beamOsc.type = 'sine';
    beamOsc.frequency.setValueAtTime(3000, now);
    beamOsc.frequency.exponentialRampToValueAtTime(800, now + duration * 0.5);
    
    beamGain.gain.setValueAtTime(0.05, now);
    beamGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.5);
    
    beamOsc.connect(beamGain);
    beamGain.connect(this.ctx.destination);

    osc.start(now);
    beamOsc.start(now);
    osc.stop(now + duration);
    beamOsc.stop(now + duration);
  }

  public playMorphBack() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const duration = 0.6;

    // 1. Rising Metallic Swell (The "Reform")
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(400, now);
    osc1.frequency.exponentialRampToValueAtTime(800, now + duration);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, now);
    filter.frequency.exponentialRampToValueAtTime(3000, now + duration);
    filter.Q.setValueAtTime(5, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.2, now + duration * 0.8);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.1);

    osc1.connect(filter);
    filter.connect(gain1);
    gain1.connect(this.ctx.destination);

    // 2. Resonant Metallic "Chime" at the end (The "Lock")
    const chimeFrequencies = [1200, 1800, 2400];
    chimeFrequencies.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + duration);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0.1 / (idx + 1), now + duration);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now);
      osc.stop(now + duration + 0.5);
    });

    // 3. Low Thud for solidity
    const thudOsc = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(120, now + duration);
    thudOsc.frequency.exponentialRampToValueAtTime(60, now + duration + 0.1);
    
    thudGain.gain.setValueAtTime(0, now);
    thudGain.gain.setValueAtTime(0.3, now + duration);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.3);

    thudOsc.connect(thudGain);
    thudGain.connect(this.ctx.destination);
    thudOsc.start(now);
    thudOsc.stop(now + duration + 0.4);

    osc1.start(now);
    osc1.stop(now + duration + 0.2);
  }
}

export const soundManager = new SoundManager();
