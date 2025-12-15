import './App.css';

import React, {Component} from 'react';
import * as constants from './constants';

import Slider from 'rc-slider';
import Tooltip from 'rc-tooltip';
import 'rc-slider/assets/index.css';

import {Button, ToggleButton, ToggleButtonGroup} from 'react-bootstrap';

import Tone from 'tone';
import StartAudioContext from 'startaudiocontext';

class App extends Component {
    constructor(props, context) {
        super(props, context);


        // use local storage for volume and frequency
        let localVolume = this.getLocalStorageInt(constants.VOLUME_KEY, constants.DEFAULT_VOLUME);
        let localFreqs = this.getLocalStorageFrequencies();
        let playerState = this.getLocalStorageInt(constants.PLAYER_STATE_KEY, constants.PLAYER_STATES.PLAY_TONE);
        let localCourse = this.getLocalStorageInt(constants.COURSE_KEY, constants.COURSE_MINS);
        let localInterval = this.getLocalStorageInt(constants.INTERVAL_KEY, constants.INTERVAL_MINS);

        let buttonText = constants.PLAY_TONE_TEXT;
        if (playerState === constants.PLAYER_STATES.PLAY_ACRN) {
            buttonText = constants.PLAY_SEQ_TEXT;
        }

        // setup initial state
        this.state = {
            frequencies: localFreqs,
            volume: localVolume,
            course: localCourse,
            interval: localInterval,
            playState: playerState,
            isPlaying: false,
            userStarted: false,
            playButtonText: buttonText,
            osc: new Tone.Oscillator({
                "frequency": constants.DEFAULT_FREQ
            }).toMaster(),
            nextFreqId: localFreqs.length > 0 ? Math.max(...localFreqs.map(f => f.id)) + 1 : 1
        }
    }

    getLocalStorageInt = (localKey, defaultValue) => {
        let localValue = localStorage.getItem(localKey);
        if (localValue === null) {
            return defaultValue
        } else {
            return parseInt(localValue, 10);
        }
    };

    getLocalStorageFrequencies = () => {
        let storedFreqs = localStorage.getItem(constants.FREQS_KEY);
        if (storedFreqs) {
            try {
                let parsed = JSON.parse(storedFreqs);
                return parsed.map(f => ({
                    id: f.id,
                    freq: f.freq,
                    synth: this.createSynth(),
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
            synth: this.createSynth(),
            sequence: null
        }];
    };

    createSynth = () => {
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
    };


    componentDidMount = () => {
        //set the bpm and initialize sound context
        Tone.Transport.bpm.value = 90 * 4;
        Tone.context.latencyHint = 'interactive';
        StartAudioContext(Tone.context, '.App');
        // make sure volume is off initially
        Tone.Master.volume.rampTo(-Infinity, 0.05);
    };

    componentWillUnmount = () => {
        // Clean up all audio resources to prevent memory leaks
        let {frequencies, osc, isPlaying} = this.state;

        // Stop and clear intervals/timeouts
        if (this.courseInterval) {
            clearInterval(this.courseInterval);
        }
        if (this.resumeTimeout) {
            clearTimeout(this.resumeTimeout);
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
    };

    handleTextFreqChange = (id, e) => {
        let value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value >= constants.MIN_FREQ && value <= constants.MAX_FREQ) {
            this.handleFreqChange(id, value);
        }
    };

    handleFreqChange = (id, value) => {
        let {frequencies, osc} = this.state;
        let updatedFreqs = frequencies.map(f => {
            if (f.id === id) {
                return {...f, freq: value};
            }
            return f;
        });

        // Update oscillator if in tone mode and only one frequency
        if (updatedFreqs.length === 1) {
            osc.frequency.value = value;
        }

        this.setState({frequencies: updatedFreqs});
        this.saveFrequenciesToLocalStorage(updatedFreqs);
    };

    addFrequency = () => {
        let {frequencies, nextFreqId, isPlaying} = this.state;
        if (isPlaying) return; // Don't allow adding while playing

        let newFreq = {
            id: nextFreqId,
            freq: constants.DEFAULT_FREQ,
            synth: this.createSynth(),
            sequence: null
        };

        let updatedFreqs = [...frequencies, newFreq];
        this.setState({
            frequencies: updatedFreqs,
            nextFreqId: nextFreqId + 1
        });
        this.saveFrequenciesToLocalStorage(updatedFreqs);
    };

    removeFrequency = (id) => {
        let {frequencies, isPlaying} = this.state;
        if (isPlaying) return; // Don't allow removing while playing
        if (frequencies.length <= 1) return; // Keep at least one frequency

        let freqToRemove = frequencies.find(f => f.id === id);
        if (freqToRemove && freqToRemove.synth) {
            freqToRemove.synth.dispose();
        }

        let updatedFreqs = frequencies.filter(f => f.id !== id);
        this.setState({frequencies: updatedFreqs});
        this.saveFrequenciesToLocalStorage(updatedFreqs);
    };

    saveFrequenciesToLocalStorage = (frequencies) => {
        let toSave = frequencies.map(f => ({id: f.id, freq: f.freq}));
        localStorage.setItem(constants.FREQS_KEY, JSON.stringify(toSave));
    };



    handleTextCourseChange = (e) => {
        let value = parseInt(e.target.value, 10);
        if (!isNaN(value)) {
            this.handleCourseChange(value);
        }
    };
    handleCourseChange = value => {
        this.setState({
            course: value,
        });
        localStorage.setItem(constants.COURSE_KEY, value);
    };

    handleTextIntervalChange = (e) => {
        let value = parseInt(e.target.value, 10);
        if (!isNaN(value)) {
            this.handleIntervalChange(value);
        }
    };
    handleIntervalChange = value => {
        this.setState({
            interval: value,
        });
        localStorage.setItem(constants.INTERVAL_KEY, value);
    };


    handleClickPlay = () => {
        let {isPlaying, volume, playState, course, interval} = this.state;
        let courseMs = course * 60 * 1000;
        let intervalMs = interval * 60 * 1000;
        if (!isPlaying) {
            Tone.Transport.start();
            Tone.Master.volume.rampTo(volume, 0.05);

            // create the interval that pauses every courseMs
            this.courseInterval = setInterval(() => {
                // Stop playback
                this.stopPlayback(playState);

                // Clear any existing resume timeout to prevent memory leak
                if (this.resumeTimeout) {
                    clearTimeout(this.resumeTimeout);
                }

                // resume after intervalMs
                this.resumeTimeout = setTimeout(() => {
                    // Restart playback
                    this.startPlayback(playState);
                }, intervalMs);
            }, courseMs);
        } else {
            Tone.Master.volume.rampTo(-Infinity, 0.05);
            Tone.Transport.stop();
            // Cancel all scheduled events on Transport to prevent memory buildup
            Tone.Transport.cancel(0);
            if (this.courseInterval) {
                clearInterval(this.courseInterval);
                this.courseInterval = null;
            }
            if (this.resumeTimeout) {
                clearTimeout(this.resumeTimeout);
                this.resumeTimeout = null;
            }
        }
        this.updatePlayState(!isPlaying, playState);
        this.setState({isPlaying: !isPlaying});
    };

    stopPlayback = (playState) => {
        Tone.Master.volume.rampTo(-Infinity, 0.05);
        Tone.Transport.stop();
        Tone.Transport.cancel(0);

        let {frequencies, osc} = this.state;

        if (playState === constants.PLAYER_STATES.PLAY_ACRN) {
            // Stop and dispose all sequences
            let updatedFrequencies = frequencies.map(freqObj => {
                if (freqObj.sequence) {
                    freqObj.sequence.cancel();
                    freqObj.sequence.dispose();
                }
                return {...freqObj, sequence: null};
            });
            this.setState({frequencies: updatedFrequencies});
        } else if (playState === constants.PLAYER_STATES.PLAY_TONE) {
            osc.stop();
        }
    };

    startPlayback = (playState) => {
        let {volume, frequencies, osc} = this.state;
        Tone.Transport.start();
        Tone.Master.volume.rampTo(volume, 0.05);

        if (playState === constants.PLAYER_STATES.PLAY_ACRN) {
            this.playAcrn();
        } else if (playState === constants.PLAYER_STATES.PLAY_TONE) {
            if (frequencies.length === 1) {
                osc.frequency.value = frequencies[0].freq;
            }
            osc.start();
        }
    };

    playAcrn = () => {
        let {frequencies} = this.state;
        let freqSeq = this.generateSequence();

        // Create a sequence for each frequency
        let updatedFrequencies = frequencies.map(freqObj => {
            // Dispose old sequence if it exists (prevent memory leak)
            if (freqObj.sequence) {
                freqObj.sequence.cancel();
                freqObj.sequence.dispose();
            }

            let seqCount = 0;
            let freqList = this.generateFreqs(freqObj.freq);
            let currentFreqList = [];
            let maxPatternLength = constants.LOOP_REPEAT * freqList.length;

            let newSequence = new Tone.Sequence((time, frequency) => {
                seqCount++;
                if (seqCount < maxPatternLength) {
                    if (currentFreqList.length === 0) {
                        currentFreqList = this.shuffle(freqList.slice());
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

        this.setState({frequencies: updatedFrequencies});
    };

    updatePlayState = (isPlaying, playState) => {
        let {osc, volume, frequencies} = this.state;
        if (isPlaying) {
            switch (playState) {
                case constants.PLAYER_STATES.PLAY_ACRN:
                    this.setState({playButtonText: constants.STOP_SEQ_TEXT});
                    Tone.Master.volume.rampTo(volume, 0.1);
                    this.playAcrn();
                    break;
                case constants.PLAYER_STATES.PLAY_TONE:
                    this.setState({playButtonText: constants.STOP_TONE_TEXT});
                    if (frequencies.length === 1) {
                        osc.frequency.value = frequencies[0].freq;
                    }
                    osc.start();
                    break;
                default:
                    break;

            }
        } else {
            switch (playState) {
                case constants.PLAYER_STATES.PLAY_ACRN:
                    this.setState({playButtonText: constants.PLAY_SEQ_TEXT});
                    // Stop and dispose all sequences
                    let updatedFrequencies = frequencies.map(freqObj => {
                        if (freqObj.sequence) {
                            freqObj.sequence.cancel();
                            freqObj.sequence.dispose();
                        }
                        return {...freqObj, sequence: null};
                    });
                    this.setState({frequencies: updatedFrequencies});
                    // Cancel all scheduled events on Transport
                    Tone.Transport.cancel(0);
                    break;
                case constants.PLAYER_STATES.PLAY_TONE:
                    this.setState({playButtonText: constants.PLAY_TONE_TEXT});
                    osc.stop();
                    break;
                default:
                    break;
            }
        }
    };

    generateFreqs = (currentFreq) => {
        return [Math.floor(currentFreq * 0.773 - 44.5), Math.floor(currentFreq * 0.903 - 21.5),
            Math.floor(currentFreq * 1.09 + 52), Math.floor(currentFreq * 1.395 + 26.5)];
    };

    generateSequence = () => {
        // just needs to be the correct number of beats. Frequency content is ignored.
        let freqSeq = [];

        // can all be empty since tones are geneated during loop play
        for (let i = 0; i < constants.LOOP_REPEAT; i++) {
            freqSeq.push(...[0,0,0,0]);
        }
        for (let i = 0; i < constants.REST_LENGTH + 1; i++) {
            freqSeq.push([0]);
        }
        return freqSeq;
    };

    shuffle = (a) => {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };

    handleRadioChange = (newPlayState) => {
        let {isPlaying, playState} = this.state;
        let buttonText = null;
        let enableSlider = true;

        if (isPlaying) {
            // stop the sound
            this.updatePlayState(false, playState)
        }

        switch (newPlayState) {
            case constants.PLAYER_STATES.PLAY_ACRN:
                if (isPlaying) {
                    enableSlider = false;
                    buttonText = constants.STOP_SEQ_TEXT;
                } else {
                    buttonText = constants.PLAY_SEQ_TEXT;
                }
                break;
            case constants.PLAYER_STATES.PLAY_TONE:
                if (isPlaying) {
                    buttonText = constants.STOP_TONE_TEXT;
                } else {
                    buttonText = constants.PLAY_TONE_TEXT;
                }
                break;
            default:
                break;

        }

        this.setState({
            playState: newPlayState,
            enableSlider: enableSlider,
            playButtonText: buttonText
        });

        if (isPlaying) {
            // start the new sound
            this.updatePlayState(true, newPlayState);
        }
        localStorage.setItem(constants.PLAYER_STATE_KEY, newPlayState);
    };

    handleTextVolumeChange = (e) => {
        let value = parseFloat(e.target.value, 10);
        if (!isNaN(value) && val > -80 && val < -30) {
            this.handleVolumeChangeVal(value);
        }
    };

    handleVolumeChange = (event) => {
        let volume = event - 0.05;
        this.handleVolumeChangeVal(volume);
    };

    handleVolumeChangeVal = (volume) => {
        console.log(volume);
        Tone.Master.volume.rampTo(volume, 0.05);
        this.setState({volume: volume});
        localStorage.setItem(constants.VOLUME_KEY, volume);
    };

    freqSliderTooltip = (freqValue) => (props) => {
        const {dragging, index, ...restProps} = props;
        const Handle = Slider.Handle;
        return (
            <Tooltip
                prefixCls="rc-slider-tooltip"
                overlay={freqValue}
                visible={dragging}
                placement="top"
                key={index}
            >
                <Handle value={freqValue} {...restProps} />
            </Tooltip>
        );
    };


    render = () => {
        let {frequencies, volume, playButtonText, playState, course, interval, isPlaying} = this.state;
        return (
            <div className="App">
                <nav className="navbar navbar-default">
                    <div className="container">
                        <div className="navbar-header navbar-right">
                            <ul className="nav navbar-nav">
                                <li><a href="http://github.com/generalfuzz/acrn-react">Source</a></li>
                                <li><a href="http://generalfuzz.net/contact.php">Contact</a></li>
                                <li><a href="http://www.generalfuzz.net">Music</a></li>

                            </ul>
                        </div>
                    </div>
                </nav>
                <div className="container ">
                    <div className="jumbotron bg-info">
                        <h1 className="App-title">ACRN Protocol</h1>
                    </div>
                    <p>This is my attempt at implementing the <a
                        href="https://www.thetinnitusclinic.co.uk/tinnitus-treatment/acoustic-neuromodulation/">Acoustic Coordinated Reset
                        Neuromodulation</a> tinnitus treatment protocol
                        using <a
                            href="https://www.tinnitustalk.com/attachments/tass-et-al_rnn-2012_counteracting-tinnitus-by-acoustic-cr-neuromodulation-pdf.183/">this
                            paper</a> as a guide.</p>
                    <div className="instructions">
                        <ul>
                            <li>First lower the volume on your device, so it is not too loud to start.</li>
                            <li>Start the tone by pressing the "Play Tone" button.</li>
                            <li>Adjust the frequency slider until it matches your tinnitus tone. You can also type in
                                the frequency if you know it already.
                            </li>
                            <li>Adjust the volume until it is a little bit louder than your tinnitus tone.</li>
                            <li>Switch from "Tone" to "Sequence" mode</li>
                            <li>For multiple simultaneous tones, use the "Add Frequency" button in Sequence mode</li>
                        </ul>
                    </div>
                    <p>Inspired by <a
                        href="http://www.tinnitustalk.com/threads/acoustic-cr%C2%AE-neuromodulation-do-it-yourself-guide.1469/">this</a> thread on <a href="http://www.tinnitustalk.com">tinnitustalk.com</a> and <a
                            href="http://www.reddit.com/r/tinnitus/comments/15x99f/recent_tinnitus_study_and_my_attempt_at_utilizing/">this</a> reddit thread.</p>
                    <br/>
                    <div>
                        <ToggleButtonGroup type="radio" name="options"
                                           defaultValue={playState}
                                           onChange={this.handleRadioChange}>
                            <ToggleButton value={constants.PLAYER_STATES.PLAY_TONE}>Tone</ToggleButton>
                            <ToggleButton value={constants.PLAYER_STATES.PLAY_ACRN}>Sequence</ToggleButton>
                        </ToggleButtonGroup>
                        <br/>
                        <br/>
                        {playState == constants.PLAYER_STATES.PLAY_TONE && frequencies.length > 1 &&
                        <div className="alert alert-warning">
                            Note: Tone mode only supports one frequency. Using the first frequency: {frequencies[0].freq} Hz
                        </div>
                        }
                        {frequencies.map((freqObj, index) => (
                            <div key={freqObj.id} style={{marginBottom: '20px', padding: '10px', border: '1px solid #ddd', borderRadius: '5px'}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                    <h4>Frequency {index + 1}</h4>
                                    {frequencies.length > 1 && !isPlaying &&
                                        <Button
                                            className='btn-danger btn-sm'
                                            onClick={() => this.removeFrequency(freqObj.id)}>
                                            Remove
                                        </Button>
                                    }
                                </div>
                                <div className='slider'>
                                    Frequency
                                    <Slider
                                        min={constants.MIN_FREQ}
                                        max={constants.MAX_FREQ}
                                        value={freqObj.freq}
                                        onChange={(value) => this.handleFreqChange(freqObj.id, value)}
                                        handle={this.freqSliderTooltip(freqObj.freq)}
                                        disabled={isPlaying}
                                    />
                                </div>
                                <div>
                                    <input
                                        className='freq-value'
                                        onChange={(e) => this.handleTextFreqChange(freqObj.id, e)}
                                        value={freqObj.freq}
                                        disabled={isPlaying}
                                    />
                                </div>
                                {playState == constants.PLAYER_STATES.PLAY_ACRN &&
                                <div>
                                    <br/>
                                    <i>frequencies used in sequence: {this.generateFreqs(freqObj.freq).map((value, index) => ((index ? ', ' : '') + value))}</i>
                                </div>
                                }
                            </div>
                        ))}
                        {playState == constants.PLAYER_STATES.PLAY_ACRN && !isPlaying &&
                        <div>
                            <Button
                                className='btn-primary'
                                onClick={this.addFrequency}>
                                Add Frequency
                            </Button>
                            <br/><br/>
                        </div>
                        }
                        <p>
                            <Button className='btn-success btn-lg'
                                    onClick={this.handleClickPlay}>{playButtonText}</Button>
                        </p>
                        <div className='slider volume'>
                            Volume
                            <Slider
                                min={-80}
                                max={-30}
                                value={volume}
                                onChange={this.handleVolumeChange}
                            />
                        </div>
                        <div>
                            <input className='volume-value' onChange={this.handleTextVolumeChange} value={volume}/>
                        </div>
                        <div>
                            Course
                        </div>
                        <div>
                            <input className='course-value' onChange={this.handleTextCourseChange} value={course}/>
                        </div>
                        <div>
                            Interval
                        </div>
                        <div>
                            <input className='interval-value' onChange={this.handleTextIntervalChange} value={interval}/>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default App;
