<script>
  import { onMount, onDestroy } from 'svelte';
  import Tone from 'tone';
  import StartAudioContext from 'startaudiocontext';
  import * as constants from './constants';

  // ===== HELPER FUNCTIONS =====
  function getLocalStorageInt(localKey, defaultValue) {
    let localValue = localStorage.getItem(localKey);
    if (localValue === null) {
      return defaultValue;
    } else {
      return parseInt(localValue, 10);
    }
  }

  function createSynth() {
    return new Tone.PolySynth(6, Tone.Synth, {
      "oscillator": {
        "type": "sine"
      },
      "envelope": {
        "attack": 0.1,
        "decay": 0.00,
        "sustain": 0.07,
        "release": 0.08,
      }
    }).toMaster();
  }

  function getLocalStorageFrequencies() {
    let storedFreqs = localStorage.getItem(constants.FREQS_KEY);
    if (storedFreqs) {
      try {
        let parsed = JSON.parse(storedFreqs);
        return parsed.map(f => ({
          id: f.id,
          freq: f.freq,
          synth: createSynth(),
          sequence: null
        }));
      } catch (e) {
        // If parsing fails, return default
      }
    }
    // Default: one frequency
    return [{
      id: 0,
      freq: constants.DEFAULT_FREQ,
      synth: createSynth(),
      sequence: null
    }];
  }

  function saveFrequenciesToLocalStorage(frequencies) {
    let toSave = frequencies.map(f => ({id: f.id, freq: f.freq}));
    localStorage.setItem(constants.FREQS_KEY, JSON.stringify(toSave));
  }

  // ===== STATE MANAGEMENT =====
  let frequencies = getLocalStorageFrequencies();
  let volume = getLocalStorageInt(constants.VOLUME_KEY, constants.DEFAULT_VOLUME);
  let course = getLocalStorageInt(constants.COURSE_KEY, constants.COURSE_MINS);
  let interval = getLocalStorageInt(constants.INTERVAL_KEY, constants.INTERVAL_MINS);
  let playState = getLocalStorageInt(constants.PLAYER_STATE_KEY, constants.PLAYER_STATES.PLAY_TONE);
  let isPlaying = false;
  let nextFreqId = frequencies.length > 0 ? Math.max(...frequencies.map(f => f.id)) + 1 : 1;

  // Tone.js objects
  let osc;
  let phaseTimeout;
  let progressInterval;

  // Progress tracking
  let progress = 0;
  let currentPhase = 'course'; // 'course' or 'interval'
  let phaseStartTime = 0;
  let elapsedTime = '0:00';
  let totalTime = '0:00';

  // Derived/reactive state (auto-computed)
  $: playButtonText = playState === constants.PLAYER_STATES.PLAY_ACRN
    ? (isPlaying ? constants.STOP_SEQ_TEXT : constants.PLAY_SEQ_TEXT)
    : (isPlaying ? constants.STOP_TONE_TEXT : constants.PLAY_TONE_TEXT);

  // ===== LIFECYCLE =====
  onMount(() => {
    // Set the bpm and initialize sound context
    Tone.Transport.bpm.value = 90 * 4;
    Tone.context.latencyHint = 'interactive';

    // Create oscillator
    osc = new Tone.Oscillator({
      "frequency": constants.DEFAULT_FREQ
    }).toMaster();

    // Mobile audio unlock
    StartAudioContext(Tone.context, '.App');
    // Make sure volume is off initially
    Tone.Master.volume.rampTo(-Infinity, 0.05);
  });

  onDestroy(() => {
    // Clean up all audio resources to prevent memory leaks

    // Stop and clear intervals/timeouts
    if (phaseTimeout) {
      clearTimeout(phaseTimeout);
    }
    if (progressInterval) {
      clearInterval(progressInterval);
    }

    // Stop transport
    Tone.Transport.stop();
    Tone.Transport.cancel();

    // Dispose all sequences
    frequencies.forEach(freqObj => {
      if (freqObj.sequence) {
        freqObj.sequence.cancel();
        freqObj.sequence.dispose();
      }
      if (freqObj.synth) {
        freqObj.synth.dispose();
      }
    });

    // Dispose oscillator
    if (osc) {
      if (isPlaying) {
        osc.stop();
      }
      osc.dispose();
    }
  });

  // ===== AUDIO FUNCTIONS =====
  function generateFreqs(currentFreq) {
    return [
      Math.floor(currentFreq * 0.773 - 44.5),
      Math.floor(currentFreq * 0.903 - 21.5),
      Math.floor(currentFreq * 1.09 + 52),
      Math.floor(currentFreq * 1.395 + 26.5)
    ];
  }

  function generateSequence() {
    // just needs to be the correct number of beats. Frequency content is ignored.
    let freqSeq = [];

    // can all be empty since tones are generated during loop play
    for (let i = 0; i < constants.LOOP_REPEAT; i++) {
      freqSeq.push(...[0,0,0,0]);
    }
    for (let i = 0; i < constants.REST_LENGTH + 1; i++) {
      freqSeq.push([0]);
    }
    return freqSeq;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function playAcrn() {
    let freqSeq = generateSequence();

    // Create a sequence for each frequency
    frequencies = frequencies.map(freqObj => {
      // Dispose old sequence if it exists (prevent memory leak)
      if (freqObj.sequence) {
        freqObj.sequence.stop();
        freqObj.sequence.cancel();
        freqObj.sequence.dispose();
      }
      // Also dispose and recreate synth to clear voice pool
      if (freqObj.synth) {
        freqObj.synth.dispose();
        freqObj.synth = createSynth();
      }

      let seqCount = 0;
      let freqList = generateFreqs(freqObj.freq);
      let currentFreqList = [];
      let maxPatternLength = constants.LOOP_REPEAT * freqList.length;

      let newSequence = new Tone.Sequence((time, frequency) => {
        seqCount++;
        if (seqCount < maxPatternLength) {
          if (currentFreqList.length === 0) {
            currentFreqList = shuffle(freqList.slice());
          }
          freqObj.synth.triggerAttackRelease(currentFreqList.pop(), "4n");
        } else {
          if (seqCount < maxPatternLength + constants.REST_LENGTH) {
            // do nothing
          } else {
            seqCount = 0;
          }
        }
      }, freqSeq);

      newSequence.set({loop: true});
      newSequence.start(0);

      return {...freqObj, sequence: newSequence};
    });
  }

  function updatePlayState(isPlaying, playState) {
    if (isPlaying) {
      switch (playState) {
        case constants.PLAYER_STATES.PLAY_ACRN:
          Tone.Master.volume.rampTo(volume, 0.1);
          playAcrn();
          break;
        case constants.PLAYER_STATES.PLAY_TONE:
          if (frequencies.length === 1) {
            osc.frequency.value = frequencies[0].freq;
          }
          osc.start();
          break;
      }
    } else {
      switch (playState) {
        case constants.PLAYER_STATES.PLAY_ACRN:
          // Stop transport first
          Tone.Transport.stop();
          // Stop and dispose all sequences
          frequencies = frequencies.map(freqObj => {
            if (freqObj.sequence) {
              freqObj.sequence.stop();
              freqObj.sequence.cancel();
              freqObj.sequence.dispose();
            }
            return {...freqObj, sequence: null};
          });
          // Cancel all scheduled events on Transport
          Tone.Transport.cancel(0);
          break;
        case constants.PLAYER_STATES.PLAY_TONE:
          // Dispose and recreate oscillator to prevent memory buildup
          if (osc) {
            osc.stop();
            osc.dispose();
          }
          osc = new Tone.Oscillator({
            "frequency": frequencies.length === 1 ? frequencies[0].freq : constants.DEFAULT_FREQ
          }).toMaster();
          break;
      }
    }
  }

  function stopPlayback(playState) {
    Tone.Master.volume.rampTo(-Infinity, 0.05);
    Tone.Transport.stop();

    if (playState === constants.PLAYER_STATES.PLAY_ACRN) {
      // Stop and dispose all sequences
      frequencies = frequencies.map(freqObj => {
        if (freqObj.sequence) {
          freqObj.sequence.stop();
          freqObj.sequence.cancel();
          freqObj.sequence.dispose();
        }
        return {...freqObj, sequence: null};
      });
    } else if (playState === constants.PLAYER_STATES.PLAY_TONE) {
      if (osc) {
        osc.stop();
        osc.dispose();
      }
      // Recreate oscillator to prevent memory accumulation
      osc = new Tone.Oscillator({
        "frequency": frequencies.length === 1 ? frequencies[0].freq : constants.DEFAULT_FREQ
      }).toMaster();
    }

    // Cancel all scheduled events after stopping
    Tone.Transport.cancel(0);
  }

  function startPlayback(playState) {
    // Cancel any remaining events before starting
    Tone.Transport.cancel(0);
    Tone.Transport.start();
    Tone.Master.volume.rampTo(volume, 0.05);

    if (playState === constants.PLAYER_STATES.PLAY_ACRN) {
      playAcrn();
    } else if (playState === constants.PLAYER_STATES.PLAY_TONE) {
      if (frequencies.length === 1) {
        osc.frequency.value = frequencies[0].freq;
      }
      osc.start();
    }
  }

  // ===== PROGRESS TRACKING =====
  function formatTime(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  function updateProgress() {
    if (!isPlaying) return;

    const now = Date.now();
    const elapsed = now - phaseStartTime;
    const totalDuration = currentPhase === 'course' ? course * 60 * 1000 : interval * 60 * 1000;

    progress = Math.min((elapsed / totalDuration) * 100, 100);

    // Update time displays
    elapsedTime = formatTime(elapsed);
    totalTime = formatTime(totalDuration);
  }

  function startProgressTracking() {
    phaseStartTime = Date.now();
    currentPhase = 'course';
    progress = 0;
    elapsedTime = '0:00';
    totalTime = formatTime(course * 60 * 1000);

    // Update progress every 100ms for smooth animation
    progressInterval = setInterval(updateProgress, 100);
  }

  function stopProgressTracking() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    progress = 0;
    currentPhase = 'course';
    elapsedTime = '0:00';
    totalTime = '0:00';
  }

  // ===== EVENT HANDLERS =====
  function handleFreqChange(id, value) {
    frequencies = frequencies.map(f => {
      if (f.id === id) {
        return {...f, freq: value};
      }
      return f;
    });

    // Update oscillator if in tone mode and this is the first frequency
    if (playState === constants.PLAYER_STATES.PLAY_TONE && id === frequencies[0].id) {
      osc.frequency.value = value;
    }

    saveFrequenciesToLocalStorage(frequencies);
  }

  function handleTextFreqChange(id, e) {
    let textValue = e.target.textContent || e.target.value;
    let value = parseInt(textValue, 10);

    // Only update if valid
    if (!isNaN(value) && value >= constants.MIN_FREQ && value <= constants.MAX_FREQ) {
      handleFreqChange(id, value);
    } else {
      // Revert to previous valid value on blur if invalid
      if (e.type === 'blur') {
        let freqObj = frequencies.find(f => f.id === id);
        if (freqObj) {
          e.target.textContent = freqObj.freq;
        }
      }
    }
  }

  function addFrequency() {
    if (isPlaying) return; // Don't allow adding while playing

    let newFreq = {
      id: nextFreqId,
      freq: constants.DEFAULT_FREQ,
      synth: createSynth(),
      sequence: null
    };

    frequencies = [...frequencies, newFreq];
    nextFreqId = nextFreqId + 1;
    saveFrequenciesToLocalStorage(frequencies);
  }

  function removeFrequency(id) {
    if (isPlaying) return; // Don't allow removing while playing
    if (frequencies.length <= 1) return; // Keep at least one frequency

    let freqToRemove = frequencies.find(f => f.id === id);
    if (freqToRemove && freqToRemove.synth) {
      freqToRemove.synth.dispose();
    }

    frequencies = frequencies.filter(f => f.id !== id);
    saveFrequenciesToLocalStorage(frequencies);
  }

  function handleVolumeChange(e) {
    let vol = +e.target.value - 0.05;
    handleVolumeChangeVal(vol);
  }

  function handleVolumeChangeVal(vol) {
    Tone.Master.volume.rampTo(vol, 0.05);
    volume = vol;
    localStorage.setItem(constants.VOLUME_KEY, vol);
  }

  function handleTextVolumeChange(e) {
    let value = parseFloat(e.target.value);
    if (!isNaN(value) && value > -80 && value < -30) {
      handleVolumeChangeVal(value);
    }
  }

  function handleCourseChange(e) {
    let textValue = e.target.textContent || e.target.value;
    let value = parseInt(textValue, 10);
    if (!isNaN(value) && value > 0) {
      course = value;
      localStorage.setItem(constants.COURSE_KEY, value);
    } else {
      // Revert to previous valid value on blur if invalid
      if (e.type === 'blur') {
        e.target.textContent = course;
      }
    }
  }

  function handleIntervalChange(e) {
    let textValue = e.target.textContent || e.target.value;
    let value = parseInt(textValue, 10);
    if (!isNaN(value) && value > 0) {
      interval = value;
      localStorage.setItem(constants.INTERVAL_KEY, value);
    } else {
      // Revert to previous valid value on blur if invalid
      if (e.type === 'blur') {
        e.target.textContent = interval;
      }
    }
  }

  function handleRadioChange(newPlayState) {
    if (isPlaying) {
      // stop the sound
      updatePlayState(false, playState);
    }

    playState = newPlayState;

    if (isPlaying) {
      // start the new sound
      updatePlayState(true, newPlayState);
    }

    localStorage.setItem(constants.PLAYER_STATE_KEY, newPlayState);
  }

  function scheduleNextPhase() {
    if (!isPlaying) return;

    const courseMs = course * 60 * 1000;
    const intervalMs = interval * 60 * 1000;

    if (currentPhase === 'course') {
      // Schedule end of course phase
      phaseTimeout = setTimeout(() => {
        // Stop playback and switch to interval
        stopPlayback(playState);
        currentPhase = 'interval';
        phaseStartTime = Date.now();
        progress = 0;
        elapsedTime = '0:00';
        totalTime = formatTime(intervalMs);

        // Schedule next phase (back to course)
        scheduleNextPhase();
      }, courseMs);
    } else {
      // In interval phase, schedule resumption of course
      phaseTimeout = setTimeout(() => {
        // Switch back to course and restart playback
        currentPhase = 'course';
        phaseStartTime = Date.now();
        progress = 0;
        elapsedTime = '0:00';
        totalTime = formatTime(courseMs);
        startPlayback(playState);

        // Schedule next phase (interval)
        scheduleNextPhase();
      }, intervalMs);
    }
  }

  function handleClickPlay() {
    if (!isPlaying) {
      // Set playing state first
      isPlaying = true;

      Tone.Transport.start();
      Tone.Master.volume.rampTo(volume, 0.05);

      // Start progress tracking
      startProgressTracking();

      // Start playback
      updatePlayState(true, playState);

      // Schedule the first phase transition (course → interval)
      scheduleNextPhase();
    } else {
      // Set playing state first
      isPlaying = false;

      // Stop playback using consistent cleanup function
      stopPlayback(playState);

      // Stop progress tracking
      stopProgressTracking();

      // Clear phase timer
      if (phaseTimeout) {
        clearTimeout(phaseTimeout);
        phaseTimeout = null;
      }

      // Update play state
      updatePlayState(false, playState);
    }
  }
</script>

<!-- ===== MARKUP ===== -->
<div class="App">
  <nav class="navbar">
    <div class="container">
      <ul class="nav-links">
        <li><a href="https://github.com/cervellous/acrn-svelte">Source</a></li>
        <li><a href="http://github.com/generalfuzz/acrn-react">Original</a></li>
        <li><a href="http://www.generalfuzz.net">Music</a></li>
      </ul>
    </div>
  </nav>

  <div class="container">
    <div class="jumbotron">
      <h1>ACRN Protocol</h1>
    </div>

    <p>
      This is a fork of <a href="http://github.com/generalfuzz/acrn-react">acrn-react</a>, an implementation of the
      <a href="https://www.thetinnitusclinic.co.uk/tinnitus-treatment/acoustic-neuromodulation/">
        Acoustic Coordinated Reset Neuromodulation
      </a> tinnitus treatment protocol using
      <a href="https://www.tinnitustalk.com/attachments/tass-et-al_rnn-2012_counteracting-tinnitus-by-acoustic-cr-neuromodulation-pdf.183/">
        this paper
      </a> as a guide. Changes allow for the ACRN tone to cycle on and off, play ACRN tones for multiple frequencies simultaneously, and fixes memory leaks from the original implementation.
    </p>

    <div class="instructions">
      <ul>
        <li>First lower the volume on your device, so it is not too loud to start.</li>
        <li>Start the tone by pressing the "Play Tone" button.</li>
        <li>Adjust the frequency slider until it matches your tinnitus tone. You can also type in the frequency if you know it already.</li>
        <li>Adjust the volume until it is a little bit louder than your tinnitus tone.</li>
        <li>Switch from "Tone" to "Sequence" mode</li>
        <li>For multiple simultaneous tones, use the "Add Frequency" button in Sequence mode</li>
      </ul>
    </div>

    <p>
      Inspired by
      <a href="http://www.tinnitustalk.com/threads/acoustic-cr%C2%AE-neuromodulation-do-it-yourself-guide.1469/">this</a>
      thread on <a href="http://www.tinnitustalk.com">tinnitustalk.com</a> and
      <a href="http://www.reddit.com/r/tinnitus/comments/15x99f/recent_tinnitus_study_and_my_attempt_at_utilizing/">this</a>
      reddit thread.
    </p>

    <br/>

    <!-- Mode Toggle -->
    <div class="mode-toggle">
      <button
        class:active={playState === constants.PLAYER_STATES.PLAY_TONE}
        on:click={() => handleRadioChange(constants.PLAYER_STATES.PLAY_TONE)}
      >
        Tone
      </button>
      <button
        class:active={playState === constants.PLAYER_STATES.PLAY_ACRN}
        on:click={() => handleRadioChange(constants.PLAYER_STATES.PLAY_ACRN)}
      >
        Sequence
      </button>
    </div>

    <br/><br/>

    <!-- Warning for Tone mode with multiple frequencies -->
    {#if playState === constants.PLAYER_STATES.PLAY_TONE && frequencies.length > 1}
      <div class="alert alert-warning">
        Note: Tone mode only supports one frequency. Using the first frequency: {frequencies[0].freq} Hz
      </div>
    {:else}
      <!-- Course/Interval Control -->
      <div class="timing-sentence">
        Play
        {#key course}
          <span
            class="timing-value"
            contenteditable="true"
            on:blur={(e) => handleCourseChange(e)}
            on:keydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.target.blur();
              }
            }}
          >{course}</span>
        {/key}
        minutes, rest
        {#key interval}
          <span
            class="timing-value"
            contenteditable="true"
            on:blur={(e) => handleIntervalChange(e)}
            on:keydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.target.blur();
              }
            }}
          >{interval}</span>
        {/key}
        minutes
      </div>
    {/if}

    <!-- Frequency Controls -->
    {#each frequencies as freqObj, index (freqObj.id)}
      <div class="frequency-card">
        <div class="freq-header">
          {#key freqObj.freq}
            <div
              class="freq-title"
              contenteditable={!isPlaying}
              on:blur={(e) => handleTextFreqChange(freqObj.id, e)}
              on:keydown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.target.blur();
                }
              }}
            >{freqObj.freq}</div>
          {/key}
          {#if frequencies.length > 1 && !isPlaying}
            <button
              class="btn btn-danger btn-sm"
              on:click={() => removeFrequency(freqObj.id)}
            >
              Remove
            </button>
          {/if}
        </div>

        <div class="slider">
          <input
            id="freq-slider-{freqObj.id}"
            type="range"
            min={constants.MIN_FREQ}
            max={constants.MAX_FREQ}
            value={freqObj.freq}
            on:input={(e) => handleFreqChange(freqObj.id, +e.target.value)}
            disabled={isPlaying}
          />
        </div>

        {#if playState === constants.PLAYER_STATES.PLAY_ACRN}
          <div>
            <br/>
            <i>frequencies used in sequence: {generateFreqs(freqObj.freq).join(', ')}</i>
          </div>
        {/if}
      </div>
    {/each}

    <!-- Add Frequency Button -->
    {#if playState === constants.PLAYER_STATES.PLAY_ACRN && !isPlaying}
    <div class="add-frequency-btn-wrapper">
      <div>
        <button class="btn btn-primary" on:click={addFrequency}>
          Add Frequency
        </button>
        <br/><br/>
      </div>
    </div>
    {/if}

    <!-- Play Button -->
    <p>
      <button class="btn btn-success btn-lg" on:click={handleClickPlay}>
        {playButtonText}
      </button>
    </p>

    <!-- Progress Bar -->
    {#if isPlaying}
      <div class="progress-container">
        <div class="progress-label">
          <span class="phase-name">{currentPhase === 'course' ? 'Course' : 'Interval'}</span>
          <span class="progress-time">{elapsedTime} / {totalTime}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {progress}%"></div>
        </div>
      </div>
    {/if}

    <!-- Volume Control -->
    <div class="slider volume">
      <label for="volume-slider">Volume</label>
      <input
        id="volume-slider"
        type="range"
        min={-80}
        max={-30}
        value={volume}
        on:input={handleVolumeChange}
      />
    </div>
    <div>
      <input class="volume-value" type="number" value={volume} on:input={handleTextVolumeChange} />
    </div>
  </div>
  <footer>&nbsp;</footer>
</div>

<style>
  .App {
    text-align: center;
    min-height: 100vh;
  }

  .navbar {
    background-color: var(--navbar-bg);
    border-bottom: 1px solid var(--navbar-border);
    padding: 1rem 0;
  }

  .nav-links {
    list-style: none;
    display: flex;
    gap: 1.5rem;
    justify-content: flex-end;
    margin: 0;
    padding: 0;
  }

  .nav-links a {
    color: var(--text-color);
    text-decoration: none;
  }

  .nav-links a:hover {
    color: var(--link-color);
  }

  .container {
    max-width: 1140px;
    margin: 0 auto;
    padding: 0 15px;
  }

  .jumbotron {
    background-color: var(--jumbotron-bg);
    padding: 1rem 1.5rem;
    border-radius: 6px;
    margin: 2rem 0;
  }

  h1 {
    font-size: 2.5rem;
    margin: 0;
  }

  .instructions {
    text-align: left;
    margin: 1.5rem 0;
  }

  .mode-toggle {
    display: inline-flex;
    gap: 0;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    overflow: hidden;
  }

  .mode-toggle button {
    padding: 0.5rem 1.5rem;
    background: var(--input-bg);
    color: var(--text-color);
    border: none;
    cursor: pointer;
    transition: background 0.2s;
    font-size: 1rem;
  }

  .mode-toggle button:not(:last-child) {
    border-right: 1px solid var(--border-color);
  }

  .mode-toggle button.active {
    background: #337ab7;
    color: white;
  }

  .mode-toggle button:hover:not(.active) {
    background: var(--container-bg);
  }

  .alert-warning {
    background-color: #fcf8e3;
    border: 1px solid #faebcc;
    color: #8a6d3b;
    padding: 1rem;
    border-radius: 4px;
    margin: 1rem 0;
  }

  @media (prefers-color-scheme: dark) {
    .alert-warning {
      background-color: #664d03;
      border-color: #997404;
      color: #ffecb5;
    }
  }

  .frequency-card {
    margin-bottom: 1.5rem;
    padding: 0.5rem;
    border: 1px solid var(--freq-box-border);
    border-radius: 8px;
    background: var(--freq-box-bg);
  }

  .freq-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  h4 {
    margin: 0;
  }

  .freq-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 500;
    outline: none;
    transition: all 0.2s;
  }
  .freq-title::after {
    content: " Hz";
  }
  .freq-title[contenteditable="true"] {
    cursor: text;
  }

  input[type="range"] {
    width: 100%;
    height: 6px;
  }

  .volume {
    margin: 1.5rem auto;
    max-width: 600px;
  }

  .freq-value,
  .volume-value {
    width: 5em;
    background-color: var(--input-bg);
    color: var(--input-text);
    border: 1px solid var(--border-color);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 1rem;
  }

  .timing-sentence {
    margin: 1.5rem 0;
    font-size: 1.1rem;
    line-height: 2;
  }

  .timing-value {
    display: inline-block;
    min-width: 2em;
    padding: 0.25rem 0.5rem;
    margin: 0 0.25rem;
    background-color: var(--input-bg);
    color: var(--input-text);
    border: 2px solid transparent;
    border-radius: 4px;
    outline: none;
    cursor: text;
    transition: all 0.2s;
    font-weight: 600;
    text-align: center;
  }

  .timing-value:hover {
    border-color: var(--border-color);
  }

  .timing-value:focus {
    border-color: #337ab7;
    background: var(--container-bg);
  }

  .add-frequency-btn-wrapper {
    width: 100%;
    display: flex;
    flex-direction: row-reverse;
  }

  .btn {
    padding: 0.5rem 1.5rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 500;
    transition: all 0.2s;
  }

  .btn-lg {
    padding: 0.75rem 2rem;
    font-size: 1.25rem;
  }

  .btn-sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
  }

  .btn-success {
    background: #5cb85c;
    color: white;
  }

  .btn-success:hover {
    background: #4cae4c;
  }

  .btn-primary {
    background: #337ab7;
    color: white;
  }

  .btn-primary:hover {
    background: #286090;
  }

  .btn-danger {
    background: #d9534f;
    color: white;
  }

  .btn-danger:hover {
    background: #c9302c;
  }

  /* Progress Bar */
  .progress-container {
    max-width: 600px;
    margin: 1.5rem auto;
    padding: 1rem;
    background: var(--freq-box-bg);
    border: 1px solid var(--freq-box-border);
    border-radius: 8px;
  }

  .progress-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
  }

  .phase-name {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .progress-time {
    color: var(--text-color);
    opacity: 0.8;
    font-family: monospace;
    font-size: 1rem;
  }

  .progress-bar {
    width: 100%;
    height: 20px;
    background: var(--border-color);
    border-radius: 10px;
    overflow: hidden;
    position: relative;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #5cb85c 0%, #4cae4c 100%);
    border-radius: 10px;
    transition: width 0.1s linear;
    box-shadow: 0 0 10px rgba(92, 184, 92, 0.3);
  }

  @media (prefers-color-scheme: dark) {
    .progress-fill {
      box-shadow: 0 0 10px rgba(92, 184, 92, 0.5);
    }
  }
</style>
