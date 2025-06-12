"use strict";

// eslint-disable-next-line no-var
var MidiFighterSpectra;
(function(MidiFighterSpectra) {
    const mapIndexToChannel = function(index) {
        switch (Math.abs(index) % 4) {
        case 0: return 3;
        case 1: return 1;
        case 2: return 2;
        case 3: return 4;
        }
    };

    class Deck extends components.Deck {
        constructor() {
            super([1, 2, 3, 4]);

            const colorMapper = new ColorMapper({
                // These colors don't always appear to match what the
                // manual says they should be. The "bright" version of
                // the color is what the manual says should be the
                // "dull" version, and "white" is actually purple (and
                // the invalid value, 121, provided is actually white).
                0x000000: 1,   // Black (Off)
                0xC50A08: 19,  // Dim Red
                0xF07800: 31,  // Dim Orange
                0xF8D200: 43,  // Dim Yellow
                0xC4D82E: 55,  // Dim Lime
                0x32BE44: 67,  // Dim Green
                0x42D4F4: 79,  // Dim Bianchi/Celeste
                0x0044FF: 91,  // Dim Blue
                0xAF00CC: 103, // Dim Purple
                0xFCA6D7: 115, // Dim Pink
                0xF2F2FF: 122, // White

                // NI Stem Colors
                // These are sometimes close enough to the wrong color to be
                // mapped to it using the closest match algorithm since we use
                // common Mixxx hotcue colors above.
                0xFD4a4a: 19, // Red (mapped to orange otherwise)
                0xFA8d29: 43, // Yellow (mapped to orange otherwise)
                0xFF652E: 31, // Orange (mapped to red otherwise)
            });

            this.stemLayer = [];
            for (let i = 0; i < 4; i++) {
                this.stemLayer[i + 4] = new components.Button({
                    group: `[QuickEffectRack1_[Channel1_Stem${i + 1}]]`,
                    midi: [0x92, 0x5C + i],
                    key: "enabled",
                    type: components.Button.prototype.types.toggle,
                    on: 66, // green
                });
                this.stemLayer[i] = new components.Button({
                    group: `[Channel1_Stem${i + 1}]`,
                    midi: [0x92, 0x60 + i],
                    key: "mute",
                    colorKey: "color",
                    stemNum: i + 1,
                    type: components.Button.prototype.types.toggle,
                    colorMapper: colorMapper,
                    connect: function() {
                        this.connections[0] = engine.makeConnection(this.group, this.outKey, this.output.bind(this));
                        this.connections[1] = engine.makeConnection(this.group, this.colorKey, this.output.bind(this));
                    },
                    output: function(_value, _group, _control) {
                        const color = engine.getValue(this.group, this.colorKey);
                        const channel = script.channelFromStem(this.group);
                        const stemCount = engine.getValue(channel, "stem_count");
                        if (color === -1 || this.stemNum > stemCount) {
                            this.send(this.off);
                            return;
                        }

                        const nearestColorValue = this.colorMapper.getValueForNearestColor(color);

                        // If muted, use the dim variant of the color, otherwise
                        // use the bright version.
                        const muted = engine.getValue(this.group, this.key);
                        this.send(nearestColorValue - (muted ? 0 : 1));
                    },
                });
            }

            this.cueLayer = [
                // Intro/outro markers
                new components.Button({
                    group: "[Channel1]",
                    midi: [0x92, 0x40],
                    inKey: "intro_start_activate",
                    outKey: "intro_start_enabled",
                    on: engine.getSetting("introOutroColor"),
                    off: engine.getSetting("unsetIntroOutroColor"),
                }),
                new components.Button({
                    group: "[Channel1]",
                    midi: [0x92, 0x41],
                    inKey: "intro_end_activate",
                    outKey: "intro_end_enabled",
                    on: engine.getSetting("introOutroColor"),
                    off: engine.getSetting("unsetIntroOutroColor"),
                }),
                new components.Button({
                    group: "[Channel1]",
                    midi: [0x92, 0x42],
                    inKey: "outro_start_activate",
                    outKey: "outro_start_enabled",
                    on: engine.getSetting("introOutroColor"),
                    off: engine.getSetting("unsetIntroOutroColor"),
                }),
                new components.Button({
                    group: "[Channel1]",
                    midi: [0x92, 0x43],
                    inKey: "outro_end_activate",
                    outKey: "outro_end_enabled",
                    on: engine.getSetting("introOutroColor"),
                    off: engine.getSetting("unsetIntroOutroColor"),
                }),
            ];
            for (let i = 0; i < 8; i++) {
                this.cueLayer[i + 4] = new components.HotcueButton({
                    number: i + 1,
                    group: "[Channel1]",
                    midi: [0x92, [
                        0x3C, 0x3D, 0x3E, 0x3F,
                        0x38, 0x39, 0x3A, 0x3B
                    ][i]],
                    colorMapper: colorMapper,
                    input: function(channel, control, value, status, group) {
                        // If this is a note release event, swap the value as if
                        // this were a normal button release.
                        if (status === 0x82) {
                            value = value ? this.off : this.on;
                            status = 0x92;
                        }
                        components.HotcueButton.prototype.input.bind(this)(channel, control, value, status, group);
                    },
                    outputColor: function(colorCode) {
                        const enabled = engine.getValue(this.group, `hotcue_${this.number}_status`) === 2;
                        // If the loop is enabled or the hotcue is previewing,
                        // set the brighter variant of the closest color.
                        if (enabled) {
                            const nearestColorValue = this.colorMapper.getValueForNearestColor(colorCode);
                            this.send(nearestColorValue - 1);
                            return;
                        }

                        // otherwise set the "dim" variant.
                        components.HotcueButton.prototype.outputColor.bind(this)(colorCode);
                    },
                });
            }
        }
    }

    class Controller extends components.ComponentContainer {
        constructor() {
            super({});

            this.eqLayer = [];
            for (let i = 0; i < 4; i++) {
                this.eqLayer[i] = new components.Button({
                    group: `[EqualizerRack1_[Channel${mapIndexToChannel(i)}]_Effect1]`,
                    midi: [0x92, 0x30 + i],
                    key: "button_parameter3",
                    type: components.Button.prototype.types.toggle,
                    off: engine.getSetting("eqOnColor"),
                    on: engine.getSetting("eqOffColor"),
                });
                this.eqLayer[i + 4] = new components.Button({
                    group: `[EqualizerRack1_[Channel${mapIndexToChannel(i)}]_Effect1]`,
                    midi: [0x92, 0x2C + i],
                    key: "button_parameter2",
                    type: components.Button.prototype.types.toggle,
                    off: engine.getSetting("eqOnColor"),
                    on: engine.getSetting("eqOffColor"),
                });
                this.eqLayer[i + 8] = new components.Button({
                    group: `[EqualizerRack1_[Channel${mapIndexToChannel(i)}]_Effect1]`,
                    midi: [0x92, 0x28 + i],
                    key: "button_parameter1",
                    type: components.Button.prototype.types.toggle,
                    off: engine.getSetting("eqOnColor"),
                    on: engine.getSetting("eqOffColor"),
                });
                this.eqLayer[i + 12] = new components.Button({
                    group: `[QuickEffectRack1_[Channel${mapIndexToChannel(i)}]]`,
                    midi: [0x92, 0x24 + i],
                    key: "enabled",
                    type: components.Button.prototype.types.toggle,
                    off: engine.getSetting("superOnColor"),
                    on: engine.getSetting("superOffColor"),
                });
            }

            this.samplerLayer = [];
            for (let i = 0; i < 16; i++) {
                this.samplerLayer[i] = new components.SamplerButton({
                    number: i + 1,
                    midi: [0x92, [
                        0x50, 0x51, 0x52, 0x53,
                        0x4C, 0x4D, 0x4E, 0x4F,
                        0x48, 0x49, 0x4A, 0x4B,
                        0x44, 0x45, 0x46, 0x47,
                    ][i]],
                    off: engine.getSetting("samplerEmptyColor"),
                    on: engine.getSetting("samplerLoadedColor"),
                });
            }

            this.activeDeck = new Deck();

            // Since this is a radio button set, just have one button that
            // handles setting and unsetting all the LEDs.
            this.selectDeck = new components.Button({
                group: "[Channel1]",
                key: "end_of_track",
                midi: [0x92, [0x34, 0x54]],
                input: function(_channel, control, value, _status, group) {
                    MidiFighterSpectra.controller.activeDeck.setCurrentDeck(group);
                    for (let i = 0; i < 4; i++) {
                        for (const midino of this.midi[1]) {
                            midi.sendShortMsg(this.midi[0], midino + i, (control === midino + i) ? this.on : this.off);
                        }
                    }
                },
                output: function(value, group, _control) {
                    // Pulse the deck select button if the track is ending.
                    const deckNum = parseInt(script.channelRegEx.exec(group)[1]);
                    for (const midino of this.midi[1]) {
                        if (value) {
                            midi.sendShortMsg(this.midi[0] + 1, midino + deckNum - 1, 47);
                        } else {
                            midi.sendShortMsg(this.midi[0] - 0xF, midino + deckNum - 1, 33);
                        }
                    }
                },
                on: engine.getSetting("deckSelectedColor"),
                off: engine.getSetting("deckUnselectedColor"),
                connect: function() {
                    if (engine.getSetting("pulseDeckSelect")) {
                        for (let i = 0; i < 4; i++) {
                            this.connections[i] = engine.makeConnection(`[Channel${i + 1}]`, "end_of_track", this.output.bind(this));
                        }
                    }
                },
            });
            this.selectDeck.output(0x7F, "[Channel1]", 0x34);
            this.selectDeck.output(0x7F, "[Channel1]", 0x54);
        }
    }

    // Functions for scaling a signed byte value to the scale expected to toggle
    // an effect. Each value is a function except for "off", which always
    const groundEffect = {
        off: 18, // 18 is always off
        on: function(value) { return (value / 127 * 15) + 19; }, // 19-33 brightness values
        gate: function(value) { return (value / 127 * 7) + 34; }, // 34-41 sets the strobe rate
        pulse: function(value) { return (value / 127 * 7) + 42; }, // 42-49 sets the pulse rate
    };

    MidiFighterSpectra.init = function() {
        MidiFighterSpectra.controller = new Controller();

        // Blink the ground effect LEDs when a track is ending.
        MidiFighterSpectra.connections = [];
        switch (engine.getSetting("groundEffectLed")) {
        case "off":
            break;
        case "end_of_track":
            MidiFighterSpectra.connections = MidiFighterSpectra.connections.concat([
                engine.makeConnection("[Channel1]", "end_of_track", function(value) {
                    midi.sendShortMsg(0x93, 0x13, (value === 0) ? groundEffect.off : groundEffect.pulse(75));
                }),
                engine.makeConnection("[Channel2]", "end_of_track", function(value) {
                    midi.sendShortMsg(0x93, 0x11, (value === 0) ? groundEffect.off : groundEffect.pulse(75));
                }),
                engine.makeConnection("[Channel3]", "end_of_track", function(value) {
                    midi.sendShortMsg(0x93, 0x12, (value === 0) ? groundEffect.off : groundEffect.pulse(75));
                }),
                engine.makeConnection("[Channel4]", "end_of_track", function(value) {
                    midi.sendShortMsg(0x93, 0x10, (value === 0) ? groundEffect.off : groundEffect.pulse(75));
                }),
            ]);
            break;
        case "beat_active":
            MidiFighterSpectra.connections = MidiFighterSpectra.connections.concat([
                engine.makeConnection("[Channel1]", "beat_active", function(value) {
                    midi.sendShortMsg(0x93, 0x13, (!value) ? groundEffect.off : groundEffect.on(127));
                }),
                engine.makeConnection("[Channel2]", "beat_active", function(value) {
                    midi.sendShortMsg(0x93, 0x11, (!value) ? groundEffect.off : groundEffect.on(127));
                }),
                engine.makeConnection("[Channel3]", "beat_active", function(value) {
                    midi.sendShortMsg(0x93, 0x12, (!value) ? groundEffect.off : groundEffect.on(127));
                }),
                engine.makeConnection("[Channel4]", "beat_active", function(value) {
                    midi.sendShortMsg(0x93, 0x10, (!value) ? groundEffect.off : groundEffect.on(127));
                }),
            ]);
            break;
        };

        // The manual says to send a C1-D#1 (ie. 0x18-0x1B), but it appears that
        // you have to send 0x00-0x03 instead.
        switch (engine.getSetting("defaultLayer")) {
        case "eq":
            midi.sendShortMsg(0x93, 0x00, 127);
            break;
        case "hotcues":
            midi.sendShortMsg(0x93, 0x01, 127);
            break;
        case "samplers":
            midi.sendShortMsg(0x93, 0x02, 127);
            break;
        case "stems":
            midi.sendShortMsg(0x93, 0x03, 127);
            break;
        }
    };

    MidiFighterSpectra.shutdown = function() {
        MidiFighterSpectra.controller.shutdown();

        for (const connection of MidiFighterSpectra.connections) {
            connection.disconnect();
        }

        // Make sure we turn ground effect LEDs off when we shut down.
        for (let i = 0x10; i <= 0x13; i++) {
            midi.sendShortMsg(0x93, i, groundEffect.off);
            midi.sendShortMsg(0x93, i, groundEffect.off);
            midi.sendShortMsg(0x93, i, groundEffect.off);
            midi.sendShortMsg(0x93, i, groundEffect.off);
        }
    };
})(MidiFighterSpectra || (MidiFighterSpectra = {}));

// vim:expandtab:tabstop=4:shiftwidth=4:backupcopy=yes
