// Character API Client 
// https://github.com/mediasemantics/charapi
// https://aws.amazon.com/marketplace/pp/prodview-43pgbzjb7krp6

export default CharacterApiClient;

function CharacterApiClient(divid, params) {
    var that = this;
    if (!params.animateEndpoint) return console.error("Character API missing parameter animateEndpoint");

    var CLIENT_VERSION = "1.2";
    var featureWarning;
    var fade = true;            // Whether we fade-in the opening scene - true by default but can be overridden in params
    var playQueue = [];         // Queue of [0,id,line] or [1,{do,say,audio,...}]
    var playCur = null;         // Currently playing playQueue item, or null
    var playShield = false;     // true if play shield is up
    var idleType = "normal";
    var saveState = false;
    var clientScale = 1;
    var fpsInterval, now, then, elapsed; // used in animate
    var apogee;                 // Used to detect if an apogee was reached on a line
    var appearedAlready;        // Suppresses greeting on second show/fadeIn    
    var xhrCatalog = null;

    function resetOuterVars() {
        fade = true;
        playQueue = [];
        playCur = null;
        playShield = false;
        idleType = "normal";
        saveState = false;
        clientScale = 1;
        if (xhrCatalog) xhrCatalog.abort();
        xhrCatalog = null;
    }

    function start() {
        // autoplay

        if (params.autoplay) { // IF we asked for autoplay AND we are autoplay-disabled, show play shield
            if (audioContext && audioContext.state == "suspended" ||
                navigator.userAgent.match(/iPhone/i) ||
                navigator.userAgent.match(/iPad/i) ||
                navigator.userAgent.match(/android/i))
                playShield = true;
        }

        if (typeof params.fade === "boolean") fade = params.fade;
        if (typeof params.playShield === "boolean") playShield = params.playShield; // effectively forces autoplay
        if (typeof params.idleType === "string") idleType = params.idleType; // "none"/"blink"/"normal"
        if (typeof params.saveState === "boolean") saveState = params.saveState; // initial state of 2nd dynamicPlay is the final state of the previous one
        if (typeof params.clientScale === "number") clientScale = params.clientScale; // use this to tell the client to further scale the server image by the given factor. Use with raster characters.

        // You can avoid a call to the catalog by providing these as parameters
        if (params.character && (!params.version || !params.format || !params.idleData || !params.voice)) 
            loadCatalog();
        else 
            catalogLoaded();
    }
    
    function loadCatalog() {
        if (!params.catalogEndpoint) return console.error("Character API missing parameter catalogEndpoint");
        xhrCatalog = new XMLHttpRequest();
        xhrCatalog.onload = function() {
            try {
                var o = JSON.parse(xhrCatalog.response);
                xhrCatalog = null;
            } catch (e) {
                xhrCatalog = null;
                console.error("Character API cannot load catalog");
            }
            completeParamsFromCatalog(o);
            catalogLoaded();
        };
        xhrCatalog.onerror = function() {
            console.error("Character API cannot load catalog");
            xhrCatalog = null;
        }
        xhrCatalog.open("GET", params.catalogEndpoint, true); 
        xhrCatalog.send();
    }
    
    function completeParamsFromCatalog(catalog) {
        for (var i = 0; i < catalog.characters.length; i++) {
            var character = catalog.characters[i];
            if (character.id == params.character) {
                if (!params.version) params.version = character.version;
                if (!params.format) params.format = character.requiresPng || character.type == "vector" ? "png" : "jpeg";
                if (!params.idleData) params.idleData = character.idleData;
                if (!params.voice) params.voice = character.defaultVoice;
                break;
            }
        }
    }
    
    function catalogLoaded() {
        setupScene();
        if (playShield) setupPlayShield(params.width, params.height);
        setupCharacter();
    }

    function setupScene() {
        var div = document.getElementById(divid);
        if (!div) return console.error("Character API no div "+divid);

        // The height can be specified as a style, a property, or both.
        if (params.width === undefined) params.width = div.offsetWidth;
        if (params.height === undefined) params.height = div.offsetHeight;
        if (div.style.width == undefined) div.style.width = params.width + "px";
        if (div.style.height == undefined) div.style.height = params.height + "px";
        
        var cx = params.width;
        var cy = params.height;
        var cx2 = cx * clientScale;
        var cy2 = cy * clientScale;
        var scale = 1;
        var s = '';
        s += '<div id="' + divid + '-top' + '" style="visibility:hidden; width:' + cx + 'px; height:' + cy + 'px; position:relative; overflow: hidden; transform:scale(' + scale + '); transform-origin: top left;">';
        s += '  <canvas id="' + divid + '-canvas" width="' + cx + '" height="' + cy + '" style="position:absolute; top:0px; left:0px; width:' + cx2 + 'px; height:' + cy2 + 'px;"></canvas>';
        if (playShield)
            s += '  <canvas id="' + divid + '-playshield-canvas" style="position:absolute; left:0px; top:0px;" width="' + cx +'px" height="' + cy + 'px"/></canvas>';
        s += '</div>'
        div.innerHTML = s;
    }

    function setupCharacter() {
        t1 = Date.now();
        execute("", "", null, null, false, null); // first load results in characterLoaded
    }

    function characterLoaded() {
        // NOTE: dispatched just before we become visible
        document.getElementById(divid).dispatchEvent(createEvent("characterLoaded"));
        fadeInScene();
    }

    function fadeInScene() {
        var topDiv = document.getElementById(divid + "-top");
		if (!topDiv) return;
        if (params.visible !== false) {
            topDiv.style.visibility = "visible";
            if (fade)
                fadeIn(topDiv, 400, sceneFullyFadedIn);
            else
                sceneFullyFadedIn();
        }
    }

    function sceneFullyFadedIn() {
        startIdle();
        if (appearedAlready) return;
        appearedAlready = true;
        if (!playShield) playAutoStart();
    }

    function onPlayShieldClick() {
        var e = document.getElementById(divid + "-playshield-canvas")
        if (e) e.style.display = "none";
        playAutoStart();
    }

    function playAutoStart() {
        // Just an event that is called either when the character is loaded, if possible, or when the play shield is clicked, if not. Client can now call play().
        document.getElementById(divid).dispatchEvent(createEvent("autoStart"));
    }

    this.playing = function() {
        return !!playCur;
    };

    this.playShield = function() {
        return !!playShield;
    };

    this.playQueueLength = function() {
        return playQueue.length;
    };

    this.state = function() {
        return initialState;
    };

    this.visible = function() {
        var topDiv = document.getElementById(divid + "-top");
        return topDiv && topDiv.style.visibility == "visible";
    };

    this.hide = function() {
        stopIdle();
        var topDiv = document.getElementById(divid + "-top");
        if (topDiv) topDiv.style.visibility = "hidden";
    };

    this.show = function() {
        var topDiv = document.getElementById(divid + "-top");
        if (topDiv) topDiv.style.visibility = "visible";
        startIdle();
    };

    this.fadeIn = function() {
        fadeInChar();
    };

    this.fadeOut = function() {
        stopIdle();
        fadeOutChar();
    };

    this.dynamicPlay = function(o) {
        //console.log("dynamicPlay");
        if (audioContext) audioContext.resume();
        if (o) {
            // Process the object
            if (typeof o.say == "number") o.say = o.say.toString();
            else if (typeof o.say != "string") o.say = "";
            // Regular
            if (!o.streaming) {
                if (streaming) {
                    console.warn("Character API ignoring new dynamicPlay call during streaming");
                    return;
                }
                if (!loading && !animating && !stopping) {
                    playCur = o;
                    t1 = Date.now();
                    execute(o.do, o.say, o.audio, o.lipsync, false, onPlayDone);
                }
                else {
                    if (idling) {
                        //console.log("stopping idle");
                        stopAll(); // accelerate any running idle when we begin to play
                    }
                    if (!loading && animating && stopping && (o.do || o.say || o.audio)) {
                        //console.log("loading while stopping");
                        t1 = Date.now();
                        execute(o.do, o.say, o.audio, o.lipsync, false, onPlayDone); // safe to begin loading next if previous is stopping
                    }
                    else {
                        //console.log("queueing");
                        playQueue.push(o);
                        // All queued messages are preload candidates
                        preloadExecute(o.do, o.say, o.audio, o.lipsync);
                    }
                }
            }
            // Streaming
            else {
                // case where updates come too fast and we are still processing the last one
                if (processingStreamingCall) {
					streamingWaitingForProcessing = o;
					//console.log("streaming call while processing streaming call - deferring");
                    // we could already have been waiting, in which case we'd end up dropping one or more dynamicPlay({streaming:true}) requests, but that's okay - it's cumulative
                    return;
                }
                if (playQueue.length > 0) {
                    console.warn("Character API unsupported mix of streaming and non-streaming calls");
                    return;
                }
                processingStreamingCall = true;
                if (!streaming) {
                    // Note that a streaming call can interrupt another streaming call, but only if you stop() the previous call first. This
                    // effectively converts the previous call to a stopping idle.
                    if (idling)
                        stopAll(); // accelerate any running idle when we begin to play - it doesn't hurt to stop a stopping idle again.
                    streamingFirst = true;
                    streaming = true;
                    if (animating) {
                        //console.log("streaming call loading even as previous animation (idle or stopped stream) is stopping")	
                        streamingAfterAbortedIdle = true; // see onIdleComplete
                    }
                    playCur = o;
                }
                else {
                    streamingFirst = false;
					if (!isAContinuation(o)) {
						console.warn("Character API ignoring incompatible dynamicPlay call during streaming");
                        processingStreamingCall = false;
						return;
					}
                }
                if (o.lipsync) streamingLipsync = o.lipsync;
                if (o.animation) streamingAnimation = o.animation;
                if (o.final) streamingFinal = true;
                // Process new buffers
                for (var i = streamingBuffers.length; i < o.audio.length; i++) {
                    var src = audioContext.createBufferSource();
                    src.buffer = o.audio[i];
                    src.connect(gainNode);
                    if (!streamingAudioStarted || streamingPaused) {
                        //console.log("adding")
                        streamingBuffers.push({node:src, time:0, duration:o.audio[i].duration});
                    }
                    else {
                        //console.log("adding and playing")
                        var startTime = streamingBuffers[streamingBuffers.length - 1].time + streamingBuffers[streamingBuffers.length - 1].duration;
                        if (startTime < audioContext.currentTime) console.warn('Character API audio arrived ' + (audioContext.currentTime - startTime) + 's too late');
                        src.start(startTime);
                        streamingBuffers.push({node:src, time:startTime, duration:o.audio[i].duration});
                    }
                }
                // All 3 branches end up calling streamingCallProcessed()
                if (streamingFirst)
                    execute(o.do, o.say, null, null, false, onStreamingPlayDone); // streamingCallProcessed called from testSecondaryTexturesLoaded()
                else if (streamingLipsync)
                    loadStreamingAnimation();  // streamingCallProcessed called on xhr return
                else
                    streamingCallProcessed();
            }
        }
    }

	function isAContinuation(o) {
		// Given a streaming dynamicPlay call, is it a continuation of the current one? We just check for monotonically increasing (or stable)
		// amount of information - noting that lipsync stream is normally compressed.
		if (o.lipsync) {  
			if (o.lipsync.length >= streamingLipsync.length)
				return true;
			//else console.log(o.lipsync.length + " < " + streamingLipsync.length);
		}	
		if (o.animation) { 
			if (frameCount(o.animation) >= (streamingAnimation ? frameCount(streamingAnimation) : 0)) 
				return true;
			//else console.log(frameCount(o.animation) + " < " + (streamingAnimation ? frameCount(streamingAnimation) : 0));
		}
		return false;
	}
	
    function pauseStreamingAudio() {
        var timeStop = audioContext.currentTime;
        for (var i = 0; i < streamingBuffers.length; i++) {
            // Stop the audio buffer that is currently playing and any beyond that, but replace them with unscheduled (time == 0) nodes
            if (timeStop > streamingBuffers[i].time && timeStop < streamingBuffers[i].time + streamingBuffers[i].duration || timeStop < streamingBuffers[i].time) {
                streamingBuffers[i].node.stop();
                if (timeStop > streamingBuffers[i].time && timeStop < streamingBuffers[i].time + streamingBuffers[i].duration) // save the resume offset for the first buffer
                    streamingResumeOffset = timeStop - streamingBuffers[i].time;
                var src = audioContext.createBufferSource();
                src.buffer = streamingBuffers[i].node.buffer;
                src.connect(gainNode);
                streamingBuffers[i].node = src;
                streamingBuffers[i].time = 0; 
            }
        }
    }

    function streamingCallProcessed() {
        if (!streaming) {console.warn('Character API unexpected'); return;}
        processingStreamingCall = false;
        // Save our ticket for a free continuation
		if (streamingFirst)
			streamingContinuation = animDataNext.continuation;
		else
			streamingContinuation = streamingAnimation.continuation;
        if (streamingFirst) {
	        // Give client our "streaming info" on first call - this allows the continuation calls to be pushed to the client, or to its server-side streaming partner - we receive results via animation param in dynamicPlay, instead of lipsync
            var params = makeGetURL("&streaming=true&level=" + (level ? Math.max(1,level-1) : 3) + "&continuation=" + encodeURIComponent(animDataNext.continuation)).split('?')[1];
            document.getElementById(divid).dispatchEvent(createEvent("streamingInfo", params));
        }
        else if (streamingAudioStarted) {
            // We can directly switch the current animData for the new one only because continuations guarantee that all previously-seen frames remain the same.
            animData = streamingAnimation;
        }
        else {
            // animDataNext is not transferred to animData until getItStarted() - to allow previous idle to finish.
            animDataNext = streamingAnimation; 
        }
        // Opportunity to start audio for the first time if we have 1/2 sec of audio or this is the final call
        if (!animating && !streamingAudioStarted && (streamingFinal || streamingBuffers.length > 0 && frameCount(animDataNext) > animDataNext.fps / 2)) {
            //console.log("starting stream after sufficient frames");
            getItStarted(true); // called once, sets streamingAudioStarted
        }
        // Opportunity to restart paused audio, if we have buffered 1 sec OR this is the final call
        else if (streamingAudioStarted && streamingPaused && (streamingFinal || frameCount(animData) - streamingFramesWhenPaused > animData.fps)) {
            var time = audioContext.currentTime;
            //console.log("restarting buffers after streaming pause");
            for (var i = 0; i < streamingBuffers.length; i++) {
                if (streamingBuffers[i].time != 0) continue;
                var offset = 0; // the first unscheduled buffer gets played from the offset where we left off
                if (streamingResumeOffset) {
                    offset = streamingResumeOffset;
                    streamingResumeOffset = 0;
                }
                streamingBuffers[i].time = time;
                streamingBuffers[i].node.start(time, offset);
                time += streamingBuffers[i].duration;
            }
            streamingPaused = false;
            streamingFramesWhenPaused = 0;
            then = Date.now();
        }
        // Restart waiting call if any
        if (streamingWaitingForProcessing) {
            var temp = streamingWaitingForProcessing;
            streamingWaitingForProcessing = null;
            setTimeout(function() {
				//console.log("processing deferred buffers");
                that.dynamicPlay(temp);
            }, 0);
        }
    }

    function frameCount(ad) {
        for (var i = 0; i < ad.frames.length; i++) {
            if (ad.frames[i][1] == -1) break;
        }
        return i;
    }

    function loadStreamingAnimation() {
        // We have some more lipsync and need to convert it to a new animData
        var addedParams = '&streaming=true';
        addedParams += '&lipsync=' + encodeURIComponent(streamingLipsync);
        addedParams += "&continuation=" + encodeURIComponent(streamingContinuation);
        if (streamingFinal) addedParams += '&final=true';
        addedParams += '&level=' + (level ? Math.max(1,level-1) : 3);
        var dataURL = makeGetURL(addedParams + "&type=data");
        xhrStreaming = new XMLHttpRequest();
        xhrStreaming.open('GET', dataURL, true);
        xhrStreaming.onload = function () {
            try {
                streamingAnimation = JSON.parse(xhrStreaming.response);
            } catch(e) {animateFailed();}
			xhrStreaming = null;
            streamingCallProcessed();
        }
        xhrStreaming.onerror = function() {
			resetStreaming();
		}
        xhrStreaming.send();
    }

    // Like dynamicPlay, but merely attempts to preload all the files required
    this.preloadDynamicPlay = function(o) {
        if (o) {
            if (typeof o.say == "number") o.say = o.say.toString();
            else if (typeof o.say != "string") o.say = "";
            o.say = o.say.substr(0, 255);
            preloadExecute(o.do, o.say, o.audio, o.lipsync);
        }
    }

    this.preloading = function(o) {
        return preload && preloadQueue.length > 0;
    }

    this.setIdleType = function(t) {
        idleType = t;
    };

    this.transcriptFromText = function(s) {
        return transcriptFromText(s);
    };

    this.scriptFromText = function(s) {
        return scriptFromText(s);
    };

    this.sentenceSplit = function(s) {
        return sentenceSplit(s);
    };

    function onPlayDone() {
        animData = null;
        texture = null;
        secondaryTextures = {};
        if (playCur && !apogee) onEmbeddedCommand({type:'apogee'});
        if (loadedWhileStopping) {
            //console.log("starting new play after play stop complete");
            loadedWhileStopping = false;
            // Complete the transition to new execute
            executeCallback = executeCallbackNext;
            executeCallbackNext = null;
            getItStarted(!!audioBuffer);
            return;
        }
        if (playQueue.length > 0) {
            playCur = playQueue.shift();
            //console.log("playing from queue");
            t1 = Date.now();
            execute(playCur.do, playCur.say, playCur.audio, playCur.lipsync, false, onPlayDone);
        }
        else {
            if (playCur) {
                playCur = null;
                document.getElementById(divid).dispatchEvent(createEvent("playComplete")); // i.e. all plays complete - we are idle
            }
        }
    }

    function onStreamingPlayDone() {
        //console.log("streaming play done");
        // similar to onPlayDone            
        animData = null;
        animDataNext = null;
        texture = null;
        secondaryTextures = {};
        resetStreaming();
        if (playCur && !apogee) onEmbeddedCommand({type:'apogee'});
        playCur = null;
        document.getElementById(divid).dispatchEvent(createEvent("playComplete"));
    }

    function onIdleComplete() {
        //console.log("onIdleComplete");
        animData = null;
        texture = null;
        secondaryTextures = {};
        if (loadedWhileStopping) {
            //console.log("starting new play after idle complete");
            loadedWhileStopping = false;
            // Complete the transition to new execute
            executeCallback = executeCallbackNext;
            executeCallbackNext = null;
            getItStarted(!!audioBuffer);
        }
        else if (streamingAfterAbortedIdle) {
            streamingAfterAbortedIdle = false;
            executeCallback = executeCallbackNext;
            executeCallbackNext = null;
            // A chance to get it started - could happen if idle takes a long time to stop - recall also that an aborted stream is made to look like a stopping idle
            if (!streamingAudioStarted && animDataNext && animDataNext.frames.length > animDataNext.fps / 2) {
                //console.log("starting new stream after sufficient frames and idle complete");
                getItStarted(true);
            }
        }
    }

    this.stop = function() {
        stopAll();
        playQueue = [];
    }

    this.attention = function() {
        stopAll();
        playQueue = [];
        attention = true;
    }
    this.clearAttention = function() {
        attention = false;
    }

    this.volume = function() {
        return externalGainNode.gain.value;
    }
    
    this.setVolume = function(value) {
        externalGainNode.gain.value = value;
    }

    function onEmbeddedCommand(cmd) {
        if (!playCur) return;
        // Often 'apogee' is often the only embedded command used. It is used to support actions in high level scripts, e.g. [look-right and next].
        if (cmd && cmd.type == 'apogee') {
            if (playCur.and == "run") 
                eval(playCur.script);
            else if (playCur.and == "link") 
                window.open(playCur.url, playCur.target);
            else if (playCur.and == "command") 
                onScriptCommand(playCur.value);
        }
        else {
            var e = new CustomEvent("embeddedCommand", {detail: cmd});  // access via e.detail in your event handler
            document.getElementById(divid).dispatchEvent(e);
        }
    }

    function onScriptCommand(value) {
        var e = new CustomEvent("scriptCommand", {detail: value});  // access via e.detail in your event handler
        document.getElementById(divid).dispatchEvent(e);
    }

    function showTranscript() {
        if (stagedTranscript) {
            document.getElementById(divid).dispatchEvent(createEvent("closedCaption", transcriptFromText(stagedTranscript)));
            stagedTranscript = undefined;
        }
    }

    function makeGetURL(addedParams) { // addedParams starts with & if truthy
        // Caller-supplied endpoint
        var url = params.animateEndpoint;
        // Additional parameters from the caller, e.g. character
        for (var key in params) {
            if (key && key != "endpoint" && key != "fade" && key != "idleType" && key != "autoplay" && key != "playShield" && key != "preload" && key != "saveState" && key != "idleData" && key != "clientScale" && key != "sway" && key != "breath" && key != "animateEndpoint" && key != "catalogEndpoint") // minus the parameters for charapiclient
                url += (url.indexOf("?") == -1 ? "?" : "&") + key + "=" + encodeURIComponent(params[key]);
        }
        // Additional params added by charapiclient.js, e.g. texture, with
        if (addedParams) url += (url.indexOf("?") == -1 ? "?" : "&") + addedParams.substr(1);
        return url;
    }

    // Audio - only one speaking animation occurs at a time
    var audioContext = AudioContext ? new AudioContext() : null;
    var externalGainNode = null;
    var gainNode = null;
    if (audioContext) {
        externalGainNode = audioContext.createGain();
        externalGainNode.gain.value = 1;
        externalGainNode.connect(audioContext.destination);
        gainNode = audioContext.createGain();
        gainNode.gain.value = 1;
        gainNode.connect(externalGainNode);
    }
    var audioBuffer;                     // Audio buffer being loaded
    var audioSource;                     // Audio source, per character

    // State
    var initialState = "";

    // Loading
    var audioXhr = null;              // Audio xhr
    var animDataXhr = null;           // Animation data xhr
    var texture;                      // Latest loaded texture - we try to keep it down to eyes, mouth - the leftovers
    var animData;                     // animData to match texture.
    var secondaryTextures = {};       // e.g. {LookDownLeft:Texture}
    var loadPhase;                    // 0 = not loaded, 1 = audio/data/texture loaded, 2 = secondary textures loaded, 3 = load error
    var defaultTexture;               // The initial texture is also the secondary texture named 'default'
    var textureNext;                  // Loading texture
    var animDataNext;                 // Loading animData
    var secondaryTexturesNext = {};   // Loading secondaryTextures
    var loadedWhileStopping = false;  // True if play occurs while last idle still ending

    // Running
    var loaded;                     // True if default frame is loaded for a given character
    var loading;                    // True if we are loading a new animation - does not overlap animating
    var idling;                     // Qualifies loading/animating - if true then the loading/running animation is an idle animation
    var animating;                  // True if a character is animating
    var frame;                      // Current frame of animation
    var lastRealFrame;              // Used in buffering
    var stopping;                   // True if we are stopping an animation - overlaps animating
    var starting;                   // True if we are starting an animation - overlaps animating
    var executeCallback;            // What to call on execute() return, i.e. when entire animation is complete
    var executeCallbackNext;        // Next executeCallback, when overlapping the new execute with the stopping one    
    var rafid;                      // Defined only when at least one character is animating - otherwise we stop the RAF (game) loop
    var inFade;                     // True if we are fading in or out char
    var then;                       // Time of last animation

    // Idle
    var idleTimeout;
    var timeSinceLastIdleCheck;
    var timeSinceLastAction;            // Time since any action, reset on end of a message - drives idle priority
    var timeSinceLastBlink;             // Similar but only for blink
    var lastIdle = "";                  // Avoid repeating an idle, etc.
    var idleCache = {};                 // Even though idle resources are typically in browser cache, we prefer to keep them in memory, as they are needed repeatedly    

    // Settle feature
    var timeSinceLastMouthMovement = 0; // Used to detect if and how much we should settle for
    var settleTimeout;                  // If non-0, we are animating true but are delaying slightly at the beginning to prevent back-to-back audio
    var delayTimeout;                   // If non-0, we are animating true but are delaying audio slightly for leadingSilence

    // Preloading
    var preload = true;         // Master switch (a param normally)
    var preloaded = [];         // list of things we already pulled on
    var preloadQueue = [];      // de-duped list of urls to pull on
    var preloading = null;     // url being preloaded
    var preloadTimeout = null;  // defined if a preload timeout is outstanding

    // HD characters
    var canvasTransformSrc = [];
    var canvasTransformDst = [];
    var sway = 0;               // if swaying, actual sway angle
    var swayTime;               // time of last sway frame
    var swayTarget;             // target angle in radians
    var swayAccel;              // proportion of distance from sway to swayTarget    
    var breath = 0;             // if breathing, actual (max) shoulder displacement
    var breathTime = 0;         // used to compute breath
    var random = undefined;     // random walk controllers
    var suppressRandom = false;
    
    // Misc
    var stagedTranscript;
    var attention = false;                  // Set by attention() - suppresses/alters idle activity while listening or "at attention"
    var level = undefined;                  // The level of random variation we are requesting - starts at 1 - we actively preload until level 3, then this goes to 0. Sent to the server if non-0, or when streaming as &level.
    var levelTarget = [];                   // The list of textures needed for this level - comes to us in the animData from the previous request
    var allsecondary = false;               // Certain characters put all art in secondary textures beyond the initial default texture
    var t1,t2,t3,t4;

    // Streaming
    var streaming = false;                  // Is this a streaming call i.e. dynamicPlay with streaming:true
    var streamingAfterAbortedIdle = false;  // True if stream call occurs while last idle still playing
    var streamingBuffers = [];              // All streaming audio buffers
    var streamingLipsync = "";              // Latest streaming lipsync
	var xhrStreaming = null;                // See loadStreamingAnimation
    var streamingAnimation = null;          // Latest streaming animation (lipsync OR animation can be supplied on subsequent dynamicPlay)
    var streamingContinuation = null;       // Let's us call animate repeatedly with increasing phoneme data      
    var streamingFirst = false;             // Is this the first dynamic streaming call
    var streamingFinal = false;             // Is it the last
    var streamingAudioStarted = false;      // Has streaming audio started
    var processingStreamingCall = false;    // Are we in a streaming dynamicPlay call when another dynamicPlay occurs
    var streamingWaitingForProcessing = null; // If so then this is the last pending streaming dynamicPlay object
    var streamingPaused = false;            // Is streaming paused for buffering
    var streamingFramesWhenPaused = 0;      // If streaming is paused, how many frames did animation have, total
    var streamingResumeOffset = 0;          // If paused for buffering and we get new audio, the first buffer with time == 0 gets resumed at this offset

    function resetInnerVars() {
        gainNode = null;
        audioBuffer = null;
        audioSource = undefined;

        initialState = "";

        audioXhr = null;
        animDataXhr = null;
        texture = undefined;
        animData = undefined;
        secondaryTextures = {};
        textureNext = undefined;
        animDataNext = undefined;
        secondaryTexturesNext = {};
        loadPhase = 0;
        defaultTexture = undefined;

        loaded = undefined;
        loading = undefined;
        animating = undefined;
        idling = undefined;
        frame = undefined;
        stopping = undefined;
        starting = undefined
        executeCallback = undefined;
        executeCallbackNext = undefined;
        idleTimeout = null;
        rafid = null;
        inFade = false;

        idleTimeout = null;
        timeSinceLastIdleCheck = 0;
        timeSinceLastAction = undefined;
        timeSinceLastBlink = undefined;
        lastIdle = "";

        timeSinceLastMouthMovement = 0;
        settleTimeout = undefined;
        delayTimeout = undefined;

        preload = true;
        preloaded = [];
        preloadQueue = [];
        preloading = null;
        preloadTimeout = null;
        
        random = undefined;
        suppressRandom = false;

        attention = false;
        level = undefined;
        levelTarget = [];
        allsecondary = false;
        resetStreaming();
    }

    function cancelAnyLoads() {
        if (audioXhr) { 
            audioXhr.abort(); 
            audioXhr = null; 
        }                                                     
        if (animDataXhr) { 
            animDataXhr.abort(); 
            animDataXhr = null; 
        }
        if (textureNext) { 
            textureNext.onload = null; 
            textureNext.onerror = null; 
        }
        if (secondaryTexturesNext) {
            for (var key in secondaryTexturesNext) {
                var img = secondaryTexturesNext[key];
                if (img) { img.onload = null; img.onerror = null; }
            }                                                                                                                   
        }
    }

    function resetStreaming() {
        streaming = false;
        streamingBuffers = [];
        streamingLipsync = "";
        streamingAnimation = null;
        streamingContinuation = null;
        streamingFirst = false;
        streamingFinal = false;
        streamingAudioStarted = false;
        streamingWaitingForProcessing = null;
        processingStreamingCall = false;
        streamingPaused = false;
        streamingFramesWhenPaused = 0;
        streamingResumeOffset = 0
        streamingAfterAbortedIdle = false;
		if (xhrStreaming) xhrStreaming.abort();
		xhrStreaming = null;
    }

    function execute(tag, say, audio, lipsync, idle, callback) {
        // Shortcut out in common case where there is no action or audio, i.e. the author could have placed behavior here but did not.
        if (!tag && !say && !audio && !streaming && loaded) {
            onEmbeddedCommand({type:'apogee'}); // however this could be a legit Look At User and Next - this handles it with no server involvement
            if (callback) callback();
            return;
        }
        apogee = false;        
        
        if (loading || (animating && !stopping)) {
            console.error("Character API internal error"); // execute called on a character while animating that character
            return;
        }
        if (!streaming) loading = true;

        if (say) stageTranscript(transcriptFromText(say));

        if (animating && stopping)
            executeCallbackNext = callback;	
        else
            executeCallback = callback;

        idling = idle;

        var addedParams = "";
        if (saveState) addedParams += "&initialstate=" + initialState;
        if (!idling && !streaming && level > 0)
            addedParams += "&level=" + Math.max(1,level-1); // limit complexity of early plays        

        if (audioSource) audioSource.stop();
        audioSource = null;
        audioBuffer = null;

        if (!idling) attention = false;

        if (random && random.length > 0 && !idling) suppressRandom = true; // immediately drive any random controllers to 0 (idles are assumed not to start with an immediate hand action)

        addedParams = addedParams + '&do=' + (tag||"");
        addedParams = addedParams + '&say=' + encodeURIComponent(say||"");

        animDataNext = null;
        textureNext = null;
        secondaryTexturesNext = {};
        loadPhase = 0;
        
        if (say && containsActualSpeech(say) || streaming) {
            if (streaming) {
                // First streaming call like any other for the most part
				addedParams = addedParams + '&streaming=true';
                addedParams = addedParams + '&level=' + (level ? Math.max(1,level-1) : 3); // clamped to 3 even when fully leveled
                // We NEED a level of 1, 2, or 3 for streaming to force reported secondary textures. Or else new length could be filled with animation requiring new textures.
            }
            else if (audio && lipsync) {
                addedParams = addedParams + '&lipsync=' +  encodeURIComponent(lipsync);
                if (audio instanceof AudioBuffer) {
                    audioBuffer = audio;
                }
                else {
                    speakRecorded(addedParams, audio);
                }
            }
            else {
                speakTTS(addedParams);
            }
        }
        else {
            audioBuffer = "na"; // sentinel value exists during loading and indicates animation without audio
        }
        // load audio, data, and texture in parallel
        loadAnimation(addedParams);
    }

    function containsActualSpeech(say) {
        if (!say) return false;
        var textOnly = say.replace(/\[[^\]]*\]/g, ""); // e.g. "Look [cmd] here." --> "Look here."
        if (!textOnly) return false;
        var hasNonWhitespace = !!textOnly.match(/\S/);
        return hasNonWhitespace;
    }
    
    function stageTranscript(text) {
        stagedTranscript = text;
    }

    function transcriptFromText(s) {
        // Filter out tags - adjust for extra space, remove [spoken]...[/spoken] leave [written]...[/written] contents.
        if (typeof(s) == "string") {
            s = s.replace(/\[written\](.*?)\[\/written\]/g, "$1");
            s = s.replace(/\[spoken\].*?\[\/spoken\]/g, "");
            s = s.replace(/\[[^\[]*\]/g, function(x) {return ""});
            s = s.trim().replace(/  /g, " ");
        }
        return s;
    }

    function speakRecorded(addedParams, audioURL) {
        // load the audio, but hold it
        if (audioContext) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', audioURL, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function () {
                audioContext.decodeAudioData(xhr.response, function (buffer) {
                    audioBuffer = buffer;
                    testAudioDataImageLoaded(addedParams);
                }, function (e) {
                    animateFailed();
                });
            };
            xhr.onerror = function() {animateFailed();}
            xhr.send();
        }
        // IE not supported

        if (preloaded.indexOf(audioURL) == -1) preloaded.push(audioURL);
    }

    function speakTTS(addedParams) {
        var audioURL = makeGetURL(addedParams + "&type=audio");
        if (audioContext) {
            audioXhr = new XMLHttpRequest();
            //console.log("loading audio " + audioURL + (preloaded.indexOf(audioURL) > -1 ? " (PRELOADED)" : ""));
            audioXhr.open('GET', audioURL, true);
            audioXhr.responseType = 'arraybuffer';
            audioXhr.onload = function () {
                audioContext.decodeAudioData(audioXhr.response, function (buffer) {
                    audioBuffer = buffer;
                    if (preloaded.indexOf(audioURL) == -1) preloaded.push(audioURL);
                    testAudioDataImageLoaded(addedParams);
                }, function (e) {
                    animateFailed();
                });
            };
            audioXhr.onerror = function() {animateFailed();}
            audioXhr.send();
        }
        if (preloaded.indexOf(audioURL) == -1) preloaded.push(audioURL);
    }

    function loadAnimation(addedParams) {
        var dataURL = makeGetURL(addedParams + "&type=data");
        var imageURL = makeGetURL(addedParams + "&type=image");
        
        // Idle cache shortcut
        if (idleCache[dataURL] && idleCache[imageURL]) {
            animDataNext = idleCache[dataURL];
            textureNext = idleCache[imageURL];
            testAudioDataImageLoaded(addedParams);
            return;
        }
        
        // Load the data
        animDataXhr = new XMLHttpRequest();
        animDataXhr.open('GET', dataURL, true);
        //console.log("loading data " + dataURL + (preloaded.indexOf(dataURL) > -1 ? " (PRELOADED)" : ""));
        animDataXhr.onload = function () {
            try {
                animDataNext = JSON.parse(animDataXhr.response);
                testAudioDataImageLoaded(addedParams);
            } catch(e) {animateFailed();}
        }
        animDataXhr.onerror = function() {animateFailed();}
        animDataXhr.send();

        // Load the image
        if (!allsecondary) {
            textureNext = new Image();
            textureNext.crossOrigin = "Anonymous";
            textureNext.onload = function() {
                testAudioDataImageLoaded(addedParams);
            };
            textureNext.onerror = function() {animateFailed();}
            //console.log("loading image " + imageURL + (preloaded.indexOf(imageURL) > -1 ? " (PRELOADED)" : ""));
            textureNext.src = imageURL;
        }
        
        // No need to preload these
        if (imageURL && preloaded.indexOf(imageURL) == -1) preloaded.push(imageURL);
        if (dataURL && preloaded.indexOf(dataURL) == -1) preloaded.push(dataURL);
    }
    
    function testAudioDataImageLoaded(addedParams) {
        if (loadPhase == 0 && (audioBuffer || streaming) && animDataNext && (allsecondary || (textureNext && textureNext.complete))) audioDataImageLoaded(addedParams);
    }

    function audioDataImageLoaded(addedParams) {
        t2 = Date.now();
        //console.log("time to load audio/data/image: "+(t2-t1));        
        loadPhase = 1;
    
        // Populate idle cache
        if (addedParams.indexOf("&do=idle") != -1) {
            var dataURL = makeGetURL(addedParams + "&type=data");
            var imageURL = makeGetURL(addedParams + "&type=image");
            idleCache[dataURL] = animDataNext;
            idleCache[imageURL] = textureNext;
        }
        
        recordSecondaryTextures();
        loadSecondaryTextures(addedParams);
        testSecondaryTexturesLoaded(); // covers case of no secondary textures
    }

    function recordSecondaryTextures() {
        secondaryTexturesNext = {};
        for (var i = 0; i < animDataNext.textures.length; i++) {
            if (animDataNext.textures[i] != "default")
                secondaryTexturesNext[animDataNext.textures[i]] = null;
        }
    }
    
    function loadSecondaryTextures(addedParams) {
        for (var key in secondaryTexturesNext) {
            var textureURL = makeGetURL("&texture=" + key + "&type=image");
            
            // idle cache shortcut
            if (idleCache[textureURL]) {
                secondaryTexturesNext[key] = idleCache[textureURL];
            }
            else {
                secondaryTexturesNext[key] = new Image();
                secondaryTexturesNext[key].crossOrigin = "Anonymous";
                secondaryTexturesNext[key].onload = function () {
                    if (!secondaryTexturesNext) return; // e.g. reset                    
                    
                    // populate idle cache
                    if (addedParams.indexOf("&do=idle") != -1)
                        idleCache[textureURL] = secondaryTexturesNext[key];
                    
                    testSecondaryTexturesLoaded();
                };
                secondaryTexturesNext[key].onerror = function() {animateFailed();}
                //console.log("loading secondary " + textureURL + (preloaded.indexOf(textureURL) > -1 ? " (PRELOADED)" : ""));
                secondaryTexturesNext[key].src = textureURL;
                if (textureURL && preloaded.indexOf(textureURL) == -1) preloaded.push(textureURL);
            }
        }
    }

    function testSecondaryTexturesLoaded() {
        if (loadPhase != 1) return;
        var allLoaded = true;
        for (var key in secondaryTexturesNext)
            if (!secondaryTexturesNext[key].complete) {allLoaded = false; break;}
        if (allLoaded) {
            if (audioBuffer == "na") // end use as sentinel
                audioBuffer = null;
            loadPhase = 2;
			loading = false;
            t3 = Date.now();
            //console.log("time to load secondaries: "+(t3-t2));
            if (streaming) {
                // if streaming, we are done - we'll wait for subsequent dynamicPlay's with sufficient audio data to actually start
                streamingCallProcessed();
            }
            else if (animating) {
                //console.log("play loaded but still stopping animation");
                loadedWhileStopping = true;
            }
            else {
                getItStarted(!!audioBuffer);
            }
        }
    }
    
    // just fire and forget at any time, as if you were running execute
    function preloadExecute(tag, say, audio, lipsync) {
        var addedParams = "";
        if (saveState) addedParams += "&initialstate=" + initialState;
        if (!idling && level > 0)
            addedParams += "&level=" + Math.max(1,level-1);
        addedParams += '&do=' + encodeURIComponent(tag||"");
        addedParams += '&say=' + encodeURIComponent(say||"");
        if (say && audio && lipsync) {
            addedParams = addedParams + '&lipsync=' +  encodeURIComponent(lipsync);
        }
        if (say && !audio) {
            var audioURL = makeGetURL(addedParams + "&type=audio");
            preloadHelper(audioURL);
        }
        var imageURL = makeGetURL(addedParams + "&type=image");
        if (!allsecondary) preloadHelper(imageURL);
        var dataURL = makeGetURL(addedParams + "&type=data");
        preloadHelper(dataURL);
    }

    function preloadLevelTextures(ad) {
        // level starts at 1
        levelTarget = [];
        if (level == 1 && ad.level1) levelTarget = ad.level1;
        else if (level == 2 && ad.level2) levelTarget = ad.level2;
        else if (level == 3 && ad.level3) levelTarget = ad.level3;
		if (levelTarget.length == 0) return;
        for (var i = 0; i < levelTarget.length; i++) {
            var textureURL = makeGetURL("&texture=" + levelTarget[i] + "&type=image");
            preloadHelper(textureURL);
        }
        checkLevelUp();
    }

    function checkLevelUp() {
        if (level == 0) return;
        if (!levelTarget || levelTarget.length == 0) {
            //console.log("character has no leveling");
            level = 0;
            return;
        }
        if (streaming) return; // must leave level stable for duration of a stream
        if (playQueue.length > 0) return; // if anything queued need to avoid requesting at a higher level than was queued
        var allLoaded = true;
        for (var i = 0; i < levelTarget.length; i++) {
            var url = makeGetURL("&texture=" + levelTarget[i] + "&type=image");
            if (preloaded.indexOf(url) == -1)
                allLoaded = false;
        }
        if (allLoaded) {
            if (level == 1 || level == 2) {
                level++;
                //console.log("level "+level);
            }
            else if (level == 3) {
                level = 0;
                //console.log("no more leveling");
            }
        }
    }

    function preloadHelper(url) {
        if (preloaded.indexOf(url) == -1 && preloadQueue.indexOf(url) == -1) {
            preloadQueue.push(url);
            if (!preloadTimeout && preload)
                preloadTimeout = setTimeout(preloadSomeMore, 100);
        }
    }

    function preloadSomeMore() {
        preloadTimeout = null;
        if (preloading || preloadQueue.length == 0) return;
        if (streaming) { // cases where we shouldn't preload to keep the bandwidth clear
            preloadTimeout = setTimeout(preloadSomeMore, 100);
            return;
        }
        preloading = preloadQueue.shift();
        //console.log("preloading "+preloading)
        var xhr = new XMLHttpRequest();
        xhr.open("GET", preloading, true);
        xhr.onload = function() {
            if (preloading) {
                if (preloaded.indexOf(preloading) == -1)
                    preloaded.push(preloading);
                // if this was animation data, then also find secondary textures
                if (preloading.indexOf("&type=data") != -1) {
                    var animDataPreload = JSON.parse(xhr.response);
                    for (var i = 0; i < (animDataPreload.textures||[]).length; i++) {
                        if (animDataPreload.textures[i] != "default")
                            preloadHelper(makeGetURL("&texture=" + animDataPreload.textures[i] + "&type=image"));
                    }
                }
                preloading = null;
            }
            // leveling
            checkLevelUp();
            // restart in a bit
            if (preloadQueue.length > 0) {
                preloadTimeout = setTimeout(preloadSomeMore, 100);
            }
            else {
                document.getElementById(divid).dispatchEvent(createEvent("preloadComplete"));
            }
        };
        xhr.send();
    }

    function getItStarted(startAudio) {
        //console.log("getItStarted "+startAudio);
        // version check
        if (animDataNext.requireClient) {
            var breaking = parseInt(animDataNext.requireClient.split(".")[0]);
            var feature = parseInt(animDataNext.requireClient.split(".")[1]);
            if (breaking > parseInt(CLIENT_VERSION.split(".")[0])) return console.error("Character API character requires newer client");
            else if (breaking == parseInt(CLIENT_VERSION.split(".")[0]) && feature > parseInt(CLIENT_VERSION.split(".")[1]) && !featureWarning) {console.warn("Character API character requires newer client to be fully functional"); featureWarning = true;}
        }
        // render the first frame and start animation loop
        showTranscript();
        animating = true;
        starting = true;

        // Tranfer from next to actual - from here on we use the actual
        animData = animDataNext;
        animDataNext = null;
        texture = textureNext;
        textureNext = null;
        secondaryTextures = secondaryTexturesNext;
        secondaryTexturesNext = {};

        // Leveling
        if (level === undefined && animData.level1) level = 1;
        if (level > 0) preloadLevelTextures(animData);
        
        // If the first load comes in with allsecondary=true then we know that there is no need for the image going forward
        if (animData.allsecondary) allsecondary = true;

        // Settling feature - establish a minimum time between successive animations - mostly to prevent back to back audio - because we are so good at preloading
        if (settleTimeout) {clearTimeout(settleTimeout); settleTimeout = 0;}
        var t = Date.now();
        if (!streaming && t - timeSinceLastMouthMovement < 750) {
            var delay = 750 - (t - timeSinceLastMouthMovement);
            //console.log("settle delay: " + delay);
            settleTimeout = setTimeout(onSettleComplete.bind(null, startAudio), delay);
			// both the animation and the audio are delayed, but animating=true, starting=true
        }
        else {
            getItStartedCheckDelay(startAudio);
        }
    }

    function onSettleComplete(startAudio) {
        settleTimeout = 0;
        getItStartedCheckDelay(startAudio);
    }

    function getItStartedCheckDelay(startAudio) {
        if (delayTimeout) {clearTimeout(delayTimeout); delayTimeout = 0;}
        if (animData.leadingSilence && startAudio) {
			// animation starts but audio is delayed, animating=true
            //console.log("leading silence");
            delayTimeout = setTimeout(onDelayComplete, animData.leadingSilence);
            getItStartedActual(false);
        }
        else {
            getItStartedActual(startAudio);
        }
    }

    function onDelayComplete() {
        delayTimeout = 0;
        getItStartedActual(true);
    }

    function getItStartedActual(startAudio) {
        t4 = Date.now();
        //if (t1) console.log("total time to start: "+(t4-t1));
        // start animation loop if needed
        if (!rafid) {
            rafid = requestAnimationFrame(animate);
            fpsInterval = 1000 / animData.fps;
            then = Date.now();
        }
        // start audio
        if (startAudio && audioContext) {
            // Normal
            if (!streaming) {
                try {
                    // Start the single buffer
                    audioSource = audioContext.createBufferSource();
                    audioSource.buffer = audioBuffer;
                    audioSource.connect(gainNode);
                    gainNode.gain.value = 1;
                    audioSource.start();
                } catch(e){}   
            }
            // Streaming
            else {
                //console.log("starting buffers");
                // Start/schedule all accumulated buffers
                gainNode.gain.value = 1;
                var time = audioContext.currentTime;
                for (var i = 0; i < streamingBuffers.length; i++) {
                    streamingBuffers[i].time = time;
                    streamingBuffers[i].node.start(time);
                    time += streamingBuffers[i].duration;
                }
                streamingAudioStarted = true;
            }
        }
        starting = false;
		// animation impacts sway in a subtle way
		if (Math.random() < 0.5) swayTarget = sway;
        if (!preloadTimeout && preload)
            preloadTimeout = setTimeout(preloadSomeMore, 100);
    }

    function animate() {
        if (streaming) {
            if (streamingPaused) {
				rafid = requestAnimationFrame(animate);
				return;
			}
            // check that we still have audio (but typically we run out of frames before we run out of audio)
            if (streamingAudioStarted && !streamingFinal && (streamingBuffers.length == 0 || streamingBuffers[streamingBuffers.length - 1].time + streamingBuffers[streamingBuffers.length - 1].duration < audioContext.currentTime)) {
                streamingPaused = true;
                console.warn("Character API animation paused for buffering audio");
				rafid = requestAnimationFrame(animate);
                return;
            }
        }

		rafid = null;
		now = Date.now();
        elapsed = now - then;
        if (elapsed <= fpsInterval) {
            rafid = requestAnimationFrame(animate);
            return;
        }
        
        try {
            
        then = now - (elapsed % fpsInterval);
        var framesSkip = Math.max(1, Math.floor(elapsed / fpsInterval)) - 1;
        //if (framesSkip > 0) console.log("dropped "+framesSkip+" frame(s)");
        
        //if (frame) console.log("frame: " + frame + (stopping ? " stopping" : "") + (streaming ? " streaming" : "") );

        var completed = undefined;
        var update = false;
        if (animData) {
            if (!random) initRandomWalk(animData);
            var swaying = !!animData.swayLength && params.sway !== false;;
            if (swaying && !inFade) {  // For HD character an update can occur because of sway, or actual animation, and often both.
                updateSway(1+framesSkip);
                if (animData.breathCycle && params.breath !== false) updateBreath();
                update = true;
            }
            if (animating && !starting) {
                // exit case
                if (frame == -1) {
                    completed = true;
                }
                else {
                    if (frame === undefined) {
                        frame = 0;
                        lastRealFrame = 0;
                    }
                    else { 
                        lastRealFrame = frame;
                        var frameNew = frame + 1 + framesSkip;
                        while (frame < frameNew) {
                            if (!animData.frames[frame]) {  // We were asked to run a frame beyond our animData - should never happen
                                console.error("Character API animation internal error"); 
                                rafid = requestAnimationFrame(animate); 
                                return;
                            }
                            if (animData.frames[frame][1] == -1) break; // regardless, never move past -1 (end of animation) frame
                            if (stopping && animData.frames[frame][1]) break; // and when recovering, another recovery frame can occur
                            frame++;
                        }
                    }
                    update = true;
                }
            }
            
            if (update) {
                var canvas = document.getElementById(divid + "-canvas");
                var framerec = animData.frames[frame];
                if (canvas) {
                    if (animating && !starting && framerec) { // HD characters only update the offscreen canvas when actually animating
                        if (random.length > 0) controlRandomWalkSuppression(animData, frame);
                        var ctx;
                        if (!swaying) {
                            ctx = canvas.getContext("2d");
                        }
                        else {  // if we are an HD character, we'll blit to an offscreen canvas instead
                            if (!canvasTransformSrc["G"]) {
                                canvasTransformSrc["G"] = document.createElement('canvas');
                                canvasTransformSrc["G"].width = canvas.width;
                                canvasTransformSrc["G"].height = canvas.height + (animData.clothingOverhang||0);
                            }
                            ctx = canvasTransformSrc["G"].getContext('2d', {willReadFrequently:true});
                        }
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        if (animData.recipes) {
                            var recipe = animData.recipes[framerec[0]];
                            for (var i = 0; i < recipe.length; i++) {
                                var iTexture = recipe[i][6];
                                var textureString = (typeof iTexture == "number" ? animData.textures[iTexture] : "");
                                
                                var src;
                                if (textureString == 'default' && defaultTexture)
                                    src = defaultTexture;
                                else if (secondaryTextures && secondaryTextures[textureString])
                                    src = secondaryTextures[textureString];
                                else
                                    src = texture;
                                
                                var process = recipe[i][7]||0;
                                var key = process + '-' + recipe[i][4] + '-' + recipe[i][5];
                                var keyEyeball = 5 + '-' + recipe[i][4] + '-' + recipe[i][5];
                                var toosmall = animData.swayProcess == 2 /*body*/ && animData.density == 1;
                                if (process >= 11 && process < 20) updateRandomWalk(process);
                                if (process == 1 || process == 2 || (!toosmall && (process == 4 || process == 5))) {
                                    var o = updateTransform(src, recipe, i);
                                    ctx.drawImage(canvasTransformDst[key],
                                        0, 0,
                                        recipe[i][4], recipe[i][5],
                                        recipe[i][0] + o.x, recipe[i][1] + o.y,
                                        recipe[i][4], recipe[i][5]);
                                }
                                else if (process == 5 && toosmall) {
                                    var o = updateTransform(src, recipe, i); // retain eyeball
                                }
                                else if (process == 4 && toosmall) {
                                    var o = updateTransform(src, recipe, i);
                                    var ctx2 = canvasTransformDst[keyEyeball].getContext("2d");
                                    ctx2.drawImage(canvasTransformDst[key], 0, 0); // draw mask into eyeball
                                    ctx.drawImage(canvasTransformDst[keyEyeball],
                                        0, 0,
                                        recipe[i][4], recipe[i][5],
                                        recipe[i][0] + o.x / 2, recipe[i][1] + o.y / 2,
                                        recipe[i][4] / 2, recipe[i][5] / 2);
                                }
                                else if (params.format == "png") {
                                    // png characters replacement overlays with alpha need to first clear bits they replace e.g. hands up
                                    if (!animData.layered && process != 3) {
                                        ctx.clearRect(
                                            recipe[i][0], recipe[i][1],
                                            recipe[i][4], recipe[i][5]
                                        );
                                    }
                                    ctx.drawImage(src,
                                        recipe[i][2], recipe[i][3] + (process >= 11 && process < 20 ? recipe[i][5] * random[process - 10].frame : 0),
                                        recipe[i][4], recipe[i][5],
                                        recipe[i][0], recipe[i][1] + (process == 3 ? animData.clothingOverhang||0 : 0), // in HD process 3 (clothing), clothing can be artificially high by clothingOverhang pixels, and needs to be shifted down again here,
                                        recipe[i][4], recipe[i][5]);
                                }
                                else {
                                    ctx.drawImage(src,
                                        recipe[i][2], recipe[i][3],
                                        recipe[i][4], recipe[i][5],
                                        recipe[i][0], recipe[i][1],
                                        recipe[i][4], recipe[i][5]);
                                }
                                if (process == 1 && defaultTexture && src != defaultTexture) {
                                    timeSinceLastMouthMovement = Date.now();
                                    //console.log("mouth moving");
                                }
                            }
                        }
                        else { // simpler, strip format
                            ctx.drawImage(texture, 0, 0, params.width, params.height, 0, 0, params.width, params.height);
                        }
                    }    
                    if (swaying) { // for HD characters, this is where the actual canvas gets updated - often the offscreen canvas will remain unchanged
                        updateGlobalTransform(sway, canvas);
                    }
                }
                
                if (framerec) {
                    // third arg is an extensible side-effect string that is triggered when a given frame is reached
                    if (framerec[2])
                        onEmbeddedCommand(framerec[2]);
                    // second arg is -1 if this is the last frame to show, or a recovery frame to go to if stopping early
                    var recoveryFrame = animData.frames[frame][1];
                    if (recoveryFrame == -1) {
                        frame = -1;
                    }
                    else if (stopping && recoveryFrame) {
                        frame = recoveryFrame;
                    }
                }
            }
        }

        } catch(e) {console.error(e);}

        if (completed) {
			// Case where we completed early because we ran to the end of the animation plan but this is not the final call
	        if (streaming && streamingAudioStarted && !streamingFinal) {
				streamingPaused = true;
                frame = lastRealFrame;
                streamingFramesWhenPaused = animData.frames.length; // this helps us decide when conditions have improved
				console.warn("Character API animation paused for buffering animation");
                pauseStreamingAudio();
				rafid = requestAnimationFrame(animate);
                return;
	        }
			// Normal case
			else {
	            animating = false;
                idling = false;
	            stopping = false;
	            frame = undefined;
	            animateComplete();
			}
        }
        
        rafid = requestAnimationFrame(animate);
    }

    function stopAll() {
        //console.log("stopAll");
        cancelAnyLoads();
        // Ramp down the volume
        if (audioSource) {
            if (gainNode) gainNode.gain.setTargetAtTime(0, audioContext.currentTime, 0.015);
        }
        // If this is a streaming call then there is extra to clean up.
        if (streaming) { 
            // stop all buffers
            for (var i = 0; i < streamingBuffers.length; i++) {
                if (streamingBuffers[i].time)
                    streamingBuffers[i].node.stop();
            }
            var temp = streamingAfterAbortedIdle;
			resetStreaming();
            streamingAfterAbortedIdle = temp;
        }
        // Smooth-stop the animation
        if (animating) {
            stopping = true;
            //executeCallback = onIdleComplete;
        }
        loading = false;
        idling = false; // This only indicates truly idling, not stopping idle
        // Special case where we haven't actually started - skip stopping phase
        var recover = false;
        if (delayTimeout) {
            clearTimeout(delayTimeout);
            delayTimeout = 0;
            recover = true;
        }
        if (settleTimeout) {
            clearTimeout(settleTimeout);
            settleTimeout = 0;
            recover = true;
        }
        if (recover) {
            animating = false;
            stopping = false;
            animateComplete();
        }
    }

    function animateFailed() {
        cancelAnyLoads();
        loading = false;
        loadPhase = 3;
        stopping = false;
        animateComplete();
    }

    function animateComplete() {
        timeSinceLastAction = 0;  // used in checkIdle

        // First appearance
        if (!loaded) {
            loaded = true;

            // Pick up initial default texture if we are loading character for the first time
            if (!defaultTexture && texture && animData && animData.recipes)
                defaultTexture = texture;

            timeSinceLastBlink = 0;

            characterLoaded();
        }
        // Normal case
        else {
            if (params.saveState && animData) initialState = animData.finalState;
            if (executeCallback) {
                var t = executeCallback;
                executeCallback = null;
                if (t) t();
            }
        }
    }

    // Needed for HD characters only
    
    function initRandomWalk(animData) {
        random = [];
        for (var n = 1; n <= 9; n++) {
            var s = animData["random"+n];
            if (s) random[n] = {frame:0, inc:0, count:0, frames:parseInt(s.split(",")[0])};
        }
    }

    function controlRandomWalkSuppression(animData, frame) {
        // Are hands controlled in the next 10 frames? If so, suppressRandom = true, else false.
        try {
			suppressRandom = false;
            for (var d = 0; d < 10; d++) {
                var frameTest = frame + d;
                if (animData.frames[frameTest][1] == -1 || stopping && animData.frames[frameTest][1]) break; // stop searching when we run out of frames
                var framerec = animData.frames[frameTest];
                var recipe = animData.recipes[framerec[0]];
				var count = 0;
                for (var i = 0; i < recipe.length; i++) {
                    var process = recipe[i][7]||0;
                    if (process >= 11 && process < 20) count++;
                }
                if (count < 2) {
                    suppressRandom = true;
                    //console.log("Hand controlled at " + frame + "+" + d);
					break;
				}
            }
        } catch(e) {}
    }

    function updateRandomWalk(process) {
        var n = process - 10;
        // drive rapidly to frame 1
        if (suppressRandom) {
            if (random[n].frame > 1) random[n].frame = Math.max(0, random[n].frame - 2);
            //console.log("Suppressing "+process+" "+random[n].frame);
            random[n].count = 0;
            random[n].inc = 0;
            return;
        }
        // execute a count of steps in a given direction
        if (random[n].count > 0) {
            random[n].frame = Math.max(0, Math.min(random[n].frames-1, random[n].frame + random[n].inc));
            random[n].count--;
        }
        // choose new random direction and count
        else {
            random[n].count = Math.floor(random[n].frames/3) + Math.floor(Math.random() * random[n].frames);
            random[n].inc = Math.random() < 0.5 ? -1 : 1;
        }
    }
    
    function updateTransform(src, recipe, i) {
        // Gather params
        var width = recipe[i][4];
        var height = recipe[i][5];
        var xSrcImage = recipe[i][0];
        var ySrcImage = recipe[i][1];
        var process = recipe[i][7];
        var rb = (process == 4 || process == 5) ? animData.eyeBendRadius : animData.mouthBendRadius;
        var rt = (process == 4 || process == 5) ? animData.eyeTwistRadius : animData.mouthTwistRadius;
        var bend = - recipe[i][8] / 180 * Math.PI;
        var twist = recipe[i][9] / 180 * Math.PI;
        var side = recipe[i][10] / 180 * Math.PI;
        side += twist * animData.twistToSide;
        bend += side * (animData.sideToBend||0);
        var sideLength = (process == 4 || process == 5) ? animData.sideLengthEye : animData.sideLength;
        var lowerJawDisplacement = animData.lowerJawDisplacement;
        var lowerJaw = recipe[i][8];
        var shoulders = recipe[i][8];
        var x = recipe[i][11];
        var y = recipe[i][12];
        // Bend/twist are a non-linear z-rotate - side and x,y are linear - prepare a matrix for the linear portion.
        // 0 2 4 
        // 1 3 5
        var m = [1, 0, 0, 1, 0, 0];
        if (side) {
            addXForm(1, 0, 0, 1, 0, -sideLength, m);
            addXForm(Math.cos(side), Math.sin(side), -Math.sin(side), Math.cos(side), 0, 0, m);
            addXForm(1, 0, 0, 1, 0, sideLength, m);
        }
        if (x || y) {
            addXForm(1, 0, 0, 1, -x, -y, m);
        }
        // Extract the portion of the image we want to a new temp context and get its bits as the source
        var key = process + '-' + width + '-' + height;
        if (!canvasTransformSrc[key]) {
            canvasTransformSrc[key] = document.createElement('canvas');
            canvasTransformSrc[key].width = width;
            canvasTransformSrc[key].height = height;
        }
        canvasTransformSrc[key].getContext('2d', {willReadFrequently:true}).clearRect(0, 0, width, height);
        canvasTransformSrc[key].getContext('2d', {willReadFrequently:true}).drawImage(src, recipe[i][2], recipe[i][3], width, height, 0, 0, width, height);
        var source = canvasTransformSrc[key].getContext('2d', {willReadFrequently:true}).getImageData(0, 0, width, height);
        // Get the bits for a same-size region
        if (!canvasTransformDst[key]) {
            canvasTransformDst[key] = document.createElement('canvas');
            canvasTransformDst[key].width = width;
            canvasTransformDst[key].height = height;
        }
        var target = canvasTransformSrc[key].getContext('2d', {willReadFrequently:true}).createImageData(width, height);
        // Return the image displacement
        var deltax = 0;
        var deltay = 0;
        if (process == 1 || process == 4 || process == 5) {
            // Assume same size for destination image as for src, and compute where the origin will fall
            var xDstImage = xSrcImage + rt * Math.sin(twist);
            var yDstImage = ySrcImage - rb * Math.sin(bend);
			xDstImage -= sideLength * Math.sin(side);
			yDstImage -= sideLength * Math.cos(side) - sideLength;
            xDstImage = Math.round(xDstImage);
            yDstImage = Math.round(yDstImage);
            deltax = xDstImage - xSrcImage;
            deltay = yDstImage - ySrcImage;
            deltax = Math.floor(deltax * 0.6); // a fudge factor to compensate for shift in mouth/eye within moving overlay
            if (animData.swayProcess == 2 && animData.density == 1) {
                deltax = Math.round(deltax / 2) * 2;
                deltay = Math.round(deltay / 2) * 2;
            }
            // Setup feathering (mouth)
            var a = width / 2;
            var b = height / 2;
            var feathering = animData.swayProcess == 2 ? 4 : ((animData.density||2)+1)*2;
            var xp = width - feathering;
            var xpp = width;
            var vp = (xp-a)*(xp-a)/(a*a);
            var vpp = (xpp-a)*(xpp-a)/(a*a);
            // Setup feathering (eyes)
            var aeye = width/2 / 2;
            var beye = height / 2;
            var xpeye = width/2 - feathering;
            var xppeye = width/2;
            var vpeye = (xpeye-aeye)*(xpeye-aeye)/(aeye*aeye);
            var vppeye = (xppeye-aeye)*(xppeye-aeye)/(aeye*aeye);
            // Main loop
            var xDstGlobal,yDstGlobal,xSrcGlobalZ,ySrcGlobalZ,xSrcGlobal,ySrcGlobal,xSrc,ySrc,x1Src,x2Src,y1Src,y2Src,offSrc1,offSrc2,offSrc3,offSrc4,rint,gint,bint,aint;
            var offDst = 0;
            for (var yDst = 0; yDst < height; yDst++) {
                for (var xDst = 0; xDst < width; xDst++) {
                    xDstGlobal = xDst + 0.001 - width/2 + deltax;
                    yDstGlobal = yDst + 0.001 - height/2 + deltay;
                    // z-rotate on an elliptic sphere with radius rb, rt
                    xSrcGlobalZ = rt * Math.sin(Math.asin(xDstGlobal/rt) - twist);
                    ySrcGlobalZ = rb * Math.sin(Math.asin(yDstGlobal/rb) + bend);
                    xSrcGlobal = m[0] * xSrcGlobalZ + m[2] * ySrcGlobalZ + m[4];
                    ySrcGlobal = m[1] * xSrcGlobalZ + m[3] * ySrcGlobalZ + m[5];
                    xSrc = xSrcGlobal + width/2;
                    ySrc = ySrcGlobal + height/2;
                    // bilinear interpolation - https://en.wikipedia.org/wiki/Bilinear_interpolation
                    x1Src = Math.max(Math.min(Math.floor(xSrc), width-1), 0);
                    x2Src = Math.max(Math.min(Math.ceil(xSrc), width-1), 0);
                    y1Src = Math.max(Math.min(Math.floor(ySrc), height-1), 0);
                    y2Src = Math.max(Math.min(Math.ceil(ySrc), height-1), 0);
                    if (x1Src == x2Src) {
                        if (x1Src == 0) x2Src++; else x1Src--;
                    }
                    if (y1Src == y2Src) {
                        if (y1Src == 0) y2Src++; else y1Src--;
                    }
                    // ImageData pixel ordering is RGBA
                    offSrc1 = y1Src*4*width + x1Src*4;
                    offSrc2 = y1Src*4*width + x2Src*4;
                    offSrc3 = y2Src*4*width + x1Src*4;
                    offSrc4 = y2Src*4*width + x2Src*4;
                    rint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+0] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+0] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+0] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+0]);
                    gint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+1] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+1] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+1] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+1]);
                    bint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+2] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+2] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+2] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+2]);
                    aint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+3] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+3] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+3] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+3]);
                    var alpha, v;
                    if (process == 1) { // mouth
                        v = (xDst-a)*(xDst-a)/(a*a) + (yDst-b)*(yDst-b)/(b*b);
                        if (v > vpp) 
                            alpha = 0;
                        else if (v >= vp && v <= vpp) 
                            alpha = Math.round(255 * ((Math.sqrt(vpp) - Math.sqrt(v))/(Math.sqrt(vpp) - Math.sqrt(vp))));
                        else
                            alpha = aint;
                    }
                    else if (process == 4) { //eyemask
                        if (xDst <= width/2)
                            v = (xDst-aeye)*(xDst-aeye)/(aeye*aeye) + (yDst-beye)*(yDst-beye)/(beye*beye);
                        else 
                            v = ((xDst-width/2)-aeye)*((xDst-width/2)-aeye)/(aeye*aeye) + (yDst-beye)*(yDst-beye)/(beye*beye);
                        if (v > vppeye) 
                            alpha = 0;
                        else if (v >= vpeye && v <= vppeye) 
                            alpha = Math.round(255 * ((Math.sqrt(vppeye) - Math.sqrt(v))/(Math.sqrt(vppeye) - Math.sqrt(vpeye))));
                        else
                            alpha = aint;
                    }
                    else if (process == 5) { // eyeball
                        alpha = aint;
                    }
                    target.data[offDst] = rint/*/2*/; offDst++;
                    target.data[offDst] = gint; offDst++;
                    target.data[offDst] = bint; offDst++;
                    target.data[offDst] = alpha/*/2*/; offDst++;
                }
            }
            if (process == 5) { // eyeball - also apply a more natural shadow
                var xPupil = 0;
                var yPupil = height*0.1;
                var offDst = 0;
                for (var yDst = 0; yDst < height; yDst++) {
                    for (var xDst = 0; xDst < width; xDst++) {
                        var xAdj;
                        if (xDst <= width/2)
                            xAdj = xDst - width/4;
                        else 
                            xAdj = xDst - width/2 - width/4;
                        var yAdj = yDst - height/2;
                        var dPupil = Math.sqrt((xAdj-xPupil)*(xAdj-xPupil) + (yAdj-yPupil)*(yAdj-yPupil));
						var dPupilMin = 3*animData.density;
                        var f = dPupil < dPupilMin ? 1 : 1 - ((dPupil-dPupilMin) / (height*0.3));
                        target.data[offDst] = Math.round(target.data[offDst] * f); offDst++;
                        target.data[offDst] = Math.round(target.data[offDst] * f); offDst++;
                        target.data[offDst] = Math.round(target.data[offDst] * f); offDst++;
                        offDst++;
                    }
                }
            }
        }
        else if (process == 2) { //  jaw
            // Main loop
            var xSrc,ySrc,x1Src,x2Src,y1Src,y2Src,offSrc1,offSrc2,offSrc3,offSrc4,rint,gint,bint,aint;
            var offDst = 0;
            for (var yDst = 0; yDst < height; yDst++) {
                for (var xDst = 0; xDst < width; xDst++) {
                    xSrc = xDst;
                    ySrc = yDst - (lowerJaw * lowerJawDisplacement * yDst / height);
                    x1Src = Math.max(Math.min(Math.floor(xSrc), width-1), 0);
                    x2Src = Math.max(Math.min(Math.ceil(xSrc), width-1), 0);
                    y1Src = Math.max(Math.min(Math.floor(ySrc), height-1), 0);
                    y2Src = Math.max(Math.min(Math.ceil(ySrc), height-1), 0);
                    if (x1Src == x2Src) {
                        if (x1Src == 0) x2Src++; else x1Src--;
                    }
                    if (y1Src == y2Src) {
                        if (y1Src == 0) y2Src++; else y1Src--;
                    }
                    offSrc1 = y1Src*4*width + x1Src*4;
                    offSrc2 = y1Src*4*width + x2Src*4;
                    offSrc3 = y2Src*4*width + x1Src*4;
                    offSrc4 = y2Src*4*width + x2Src*4;
                    rint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+0] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+0] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+0] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+0]);
                    gint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+1] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+1] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+1] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+1]);
                    bint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+2] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+2] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+2] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+2]);
                    var alpha;
                    alpha = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+3] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+3] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+3] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+3]);
                    if (alpha < 222) alpha = 0; else alpha = 255;
                    if (yDst < height/10)
                        alpha = Math.min(alpha, yDst /  (height/10) * 255);
                    target.data[offDst] = rint; offDst++;
                    target.data[offDst] = gint/*/2*/; offDst++;
                    target.data[offDst] = bint; offDst++;
                    target.data[offDst] = alpha; offDst++;
                }
            }
        }
        canvasTransformDst[key].getContext('2d').putImageData(target, 0, 0);
        return {x:deltax, y:deltay};
    }
    
    function updateGlobalTransform(sway, canvas) {
        var width = canvas.width;
        var height = canvas.height;
        var swayLength = animData.swayLength;
        var swayBorder = animData.swayBorder;
        var swayProcess = animData.swayProcess||1;
        // 0 2 4 
        // 1 3 5
        var m = [1, 0, 0, 1, 0, 0];
        var m1 = [1, 0, 0, 1, 0, 0];
        var m2 = [1, 0, 0, 1, 0, 0];
        var hipx;
        if (swayProcess == 1) { // note sway expressed in radians throughout
            // pivot around a point swayLength below image center, around where hips would be (assumes sitting)
            addXForm(1, 0, 0, 1, 0, -swayLength, m);
            addXForm(Math.cos(sway), Math.sin(sway), -Math.sin(sway), Math.cos(sway), 0, 0, m);
            addXForm(1, 0, 0, 1, 0, swayLength, m);
        } 
        else if (swayProcess == 2) {
            // assume character centered vertically with feet at or near bottom - use m1 from a point at the bottom to sway bottom half of iamge one way,
            // compute that hip displacement hipx, then use m1 to sway the top half in half the amount, shifted by hipx, the other way. Interpolate in the middle.
            addXForm(1, 0, 0, 1, 0, -height/2, m2);
            addXForm(Math.cos(-sway), Math.sin(-sway), -Math.sin(-sway), Math.cos(-sway), 0, 0, m2);
            addXForm(1, 0, 0, 1, 0, height/2, m2);
            hipx = height/2 * Math.tan(sway);
            addXForm(1, 0, 0, 1, 0, 0, m1);
            addXForm(Math.cos(sway/2), Math.sin(sway/2), -Math.sin(sway/2), Math.cos(sway/2), 0, 0, m1);
            addXForm(1, 0, 0, 1, 0, 0, m1);
        }
        var overhang = (animData.clothingOverhang||0);
        var source = canvasTransformSrc["G"].getContext('2d', {willReadFrequently:true}).getImageData(0, 0, width, height + overhang);
        var target = canvas.getContext('2d', {willReadFrequently:true}).createImageData(width, height);
        var xDstGlobal,yDstGlobal,xSrcGlobal,ySrcGlobal;
        var xSrc,ySrc,x1Src,x2Src,y1Src,y2Src,offSrc1,offSrc2,offSrc3,offSrc4,rint,gint,bint,aint;
        var offDst = 0;
        var a = []; // optimize inner loop
        for (var xDst = 0; xDst < width; xDst++) {
            a[xDst] = breath*(Math.cos(xDst*2*Math.PI/width)/2 + 0.5);
        }
        for (var yDst = 0; yDst < height; yDst++) {
            for (var xDst = 0; xDst < width; xDst++) {
                if (swayBorder && (xDst < swayBorder || xDst > width-swayBorder)) { // optimization - our body characters have a lot of blank space on sides
                    target.data[offDst] = 0; offDst++;
                    target.data[offDst] = 0; offDst++;
                    target.data[offDst] = 0; offDst++;
                    target.data[offDst] = 0; offDst++;
                    continue;
                }
                xDstGlobal = xDst + 0.001 - width/2;
                yDstGlobal = yDst + 0.001 - height/2;
                if (swayProcess == 1) {
                    xSrcGlobal = m[0] * xDstGlobal + m[2] * yDstGlobal + m[4];
                    ySrcGlobal = m[1] * xDstGlobal + m[3] * yDstGlobal + m[5];
                }
                else if (swayProcess == 2) {
                    var overlap = height/10; // vertical distance from height/2 in which we interpolate between the two transforms
                    if (yDst < height/2 - overlap) {
                        xSrcGlobal = -hipx + m1[0] * xDstGlobal + m1[2] * yDstGlobal + m1[4];
                        ySrcGlobal = m1[1] * xDstGlobal + m1[3] * yDstGlobal + m1[5];
                    }
                    else if (yDst < height/2 + overlap) {
                        var xSrcGlobal1,ySrcGlobal1,xSrcGlobal2,ySrcGlobal2;
                        xSrcGlobal1 = -hipx + m1[0] * xDstGlobal + m1[2] * yDstGlobal + m1[4];
                        ySrcGlobal1 = m1[1] * xDstGlobal + m1[3] * yDstGlobal + m1[5];
                        xSrcGlobal2 = m2[0] * xDstGlobal + m2[2] * yDstGlobal + m2[4];
                        ySrcGlobal2 = m2[1] * xDstGlobal + m2[3] * yDstGlobal + m2[5];
                        var f = (yDst - (height/2 - overlap)) / (overlap * 2);
                        xSrcGlobal = xSrcGlobal1*(1-f) + xSrcGlobal2*f;
                        ySrcGlobal = ySrcGlobal1*(1-f) + ySrcGlobal2*f;
                    }
                    else {
                        xSrcGlobal = m2[0] * xDstGlobal + m2[2] * yDstGlobal + m2[4];
                        ySrcGlobal = m2[1] * xDstGlobal + m2[3] * yDstGlobal + m2[5];
                    }
                }
                xSrc = xSrcGlobal + width/2;
                ySrc = ySrcGlobal + height/2;
                ySrc -= a[xDst];
                x1Src = Math.max(Math.min(Math.floor(xSrc), width-1), 0);
                x2Src = Math.max(Math.min(Math.ceil(xSrc), width-1), 0);
                y1Src = Math.max(Math.min(Math.floor(ySrc), height+overhang-1), 0);
                y2Src = Math.max(Math.min(Math.ceil(ySrc), height+overhang-1), 0);
                if (x1Src == x2Src) {
                    if (x1Src == 0) x2Src++; else x1Src--;
                }
                if (y1Src == y2Src) {
                    if (y1Src == 0) y2Src++; else y1Src--;
                }
                offSrc1 = y1Src*4*width + x1Src*4;
                offSrc2 = y1Src*4*width + x2Src*4;
                offSrc3 = y2Src*4*width + x1Src*4;
                offSrc4 = y2Src*4*width + x2Src*4;
                rint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+0] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+0] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+0] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+0]);
                gint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+1] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+1] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+1] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+1]);
                bint = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+2] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+2] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+2] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+2]);
                var alpha;
                alpha = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+3] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+3] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+3] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+3]);
                target.data[offDst] = rint; offDst++;
                target.data[offDst] = gint; offDst++;
                target.data[offDst] = bint; offDst++;
                target.data[offDst] = alpha; offDst++;
            }
        }
        canvas.getContext('2d').putImageData(target, 0, 0);
    } 
    
    function addXForm(a, b, c, d, e, f, m) {
        // a c e   ma mc me
        // b d f . mb md mf  
        // 0 0 1   0  0  1 
        m[0] = a * m[0] + c * m[1];     m[2] = a * m[2] + c * m[3];     m[4] = a * m[4] + c * m[5] + e; 
        m[1] = b * m[0] + d * m[1];     m[3] = b * m[2] + d * m[3];     m[5] = b * m[4] + d * m[5] + f;
    }
    
    function getIdles() {
        if (idleType == "none") 
            return [];
        else if (params.idleData) {
            var a = [];
            for (var i = 0; i < params.idleData[idleType].length; i++) {
                var s = params.idleData[idleType][i];
                var m = s.match(/([a-z]+)([0-9]+)-([0-9]+)/);
                if (m) {
                    for (var i = parseInt(m[2]); i <= parseInt(m[3]); i++)
                        a.push(m[1] + i);
                }
                else {
                    a.push(s);
                }
            }
            return a;
        }
        else {
            console.error("Character API missing idleData");
            return [];
        }
    }

    //
    // Idle
    //

    function startIdle() {
        if (!idleTimeout) idleTimeout = setTimeout(checkIdle, 1000)
    }

    function checkIdle() {
        // Called every second until cleanup
        var t = Date.now();
        var elapsed = t - (timeSinceLastIdleCheck||t);
        timeSinceLastIdleCheck = t;
        timeSinceLastAction += elapsed;
        timeSinceLastBlink += elapsed;

        if (loaded && !loading && !streaming && !animating && !playShield && loadPhase != 3 && !attention) {
            if (timeSinceLastAction > 1500 + Math.random() * 3500) {  // no more than 5 seconds with no action whatsoever
                timeSinceLastAction = 0;
                var idles = getIdles();
                var hasBlinkIdle = idles.length > 0 && idles[0] == "blink"; // if blink is the first idle then it is expected to be randomly interleaved with the other idles on it's own schedule
                // There WILL be an action - will it be a blink? Blinks must occur at a certain frequency. But hd characters incorporate blink into idle actions.
                if (hasBlinkIdle && timeSinceLastBlink > 5000 + Math.random() * 5000) {
                    timeSinceLastBlink = 0;
                    execute("blink", "", null, null, true, onIdleComplete);
                }
                // Or another idle routine?
                else {
                    if (hasBlinkIdle) idles.shift();
                    var idle = null;
                    // pick an idle that does not repeat - favor the first idle listed first - give us a chance to start with something quick/important to fetch
                    if (idles.length > 0) {
                        if (!lastIdle) { 
                            idle = idles[0];
                        }
                        else {
                            for (var guard = 10; guard > 0; guard--) {
                                idle = idles[Math.floor(Math.random() * idles.length)];
                                if (idle == lastIdle) continue;
                                break;
                            }
                        }
                    }
                    if (idle) {
                        lastIdle = idle;
                        //console.log("idle");
                        t1 = Date.now();
                        execute(idle, "", null, null, true, onIdleComplete);
                    }
                }
            }
        }
        idleTimeout = setTimeout(checkIdle, 1000);
    }

    function stopIdle() {
        if (idleTimeout) clearTimeout(idleTimeout);
        idleTimeout = null;
    }


    //
    // Cleanup - all timers stopped, resources dropped, etc.
    //

    this.cleanup = function() {
        stopAll();
        if (idleTimeout) clearTimeout(idleTimeout);
        if (preloadTimeout) clearTimeout(preloadTimeout);
        if (rafid) cancelAnimationFrame(rafid);
        rafid = null;
        var div = document.getElementById(divid);
        if (div) div.innerHTML = "";
        cancelAnyLoads();
        resetInnerVars();
        resetOuterVars();
    }

    //
    // Fader
    //

    function fadeInChar() {
        var topDiv = document.getElementById(divid + "-top");
        inFade = true;
        fadeIn(topDiv, 400, function() {
            inFade = false; 
            sceneFullyFadedIn();
        });
    }
    
    function fadeOutChar() {
        var topDiv = document.getElementById(divid + "-top");
        inFade = true;
        fadeOut(topDiv, 400, function() {
            inFade = false;
        });
    }

    function fadeIn(elem, ms, fn)
    {
        // opacity non-1 only while animating
        elem.style.opacity = 0;
        elem.style.visibility = "visible";
        if (ms)
        {
            var opacity = 0;
            var timer = setInterval( function() {
                opacity += 50 / ms;
                if (opacity >= 1)
                {
                    clearInterval(timer);
                    opacity = 1;
                    if (fn) fn();
                }
                elem.style.opacity = opacity;
            }, 50 );
        }
        else
        {
            elem.style.opacity = 1;
            if (fn) fn();
        }
    }

    function fadeOut(elem, ms, fn)
    {
        // opacity non-1 only while animating
        if (ms)
        {
            var opacity = 1;
            var timer = setInterval(function() {
                opacity -= 50 / ms;
                if (opacity <= 0)
                {
                    clearInterval(timer);
                    opacity = 1;
                    elem.style.visibility = "hidden";
                    if (fn) fn();
                }
                elem.style.opacity = opacity;
            }, 50 );
        }
        else
        {
            elem.style.opacity = 0;
            elem.style.visibility = "hidden";
			if (fn) fn();
        }
    }

    //
    // Play Shield
    //

    function setupPlayShield(cx, cy)
    {
        var e = document.getElementById(divid + "-playshield-canvas")
        if (e)
        {
            // Background
            var ctx = e.getContext('2d');
            ctx.fillStyle= "#000000";
            ctx.globalAlpha=0.5;
            ctx.fillRect(0,0,cx,cy);

            var x = cx/2;
            var y = cy/2;

            // Inner
            ctx.beginPath();
            ctx.arc(x, y , 25, 0 , 2*Math.PI, false);
            ctx.fillStyle = "#999999";
            ctx.globalAlpha = 0.5;
            ctx.fill();

            // Outer
            ctx.beginPath();
            ctx.arc(x, y , 27, 0 , 2*Math.PI, false);
            ctx.strokeStyle = "#cccccc";
            ctx.lineWidth = 5;
            ctx.globalAlpha = 1;
            ctx.stroke();

            // Triangle
            ctx.beginPath();
            x -= 12; y -= 15;
            ctx.moveTo(x, y);
            y += 30;
            ctx.lineTo(x, y);
            y -= 15; x += 30;
            ctx.lineTo(x, y);
            y -= 15; x -= 30;
            ctx.lineTo(x, y);
            ctx.fillStyle = "#cccccc";
            ctx.globalAlpha = 1;
            ctx.fill();

            e.onclick = onPlayShieldClick;
        }
    }

    function updateSway(framesSway) {
        if (swayTarget == undefined || Math.abs(sway - swayTarget) < 0.001) {
            if (that.playing()) {
                swayTarget = -animData.normalSwayRange + Math.random() * animData.normalSwayRange * 2;
                swayAccel = animData.normalSwayAccelMin + (animData.normalSwayAccelMax - animData.normalSwayAccelMin) * Math.random();
            }
            else {
                swayTarget = -animData.idleSwayRange + Math.random() * animData.idleSwayRange * 2;
                swayAccel = animData.idleSwayAccelMin + (animData.idleSwayAccelMax - animData.idleSwayAccelMin) * Math.random();
            }
        }
        while (framesSway > 0) {
            sway += (swayTarget - sway) * swayAccel;
            framesSway--;
        }
    }

    function updateBreath() {
        breath = (animData.shoulderDisplacement||0) * Math.max(0, Math.sin(breathTime * 2 * Math.PI / animData.breathCycle));
        breathTime += fpsInterval;
    }

    //
    // Misc
    //

    function createEvent(s, o) {
        if(typeof(Event) === 'function') {
            return new CustomEvent(s, {detail:o, cancelable:true});
        } 
    }

    // Convert regular text to a script, splitting on sentences. But if text already has script tags (i.e. has been authored as a
    // script in the dashboard), then use those tags.
    // "[look-right] Look over here. [look-at-user] See?" <=> [{do:"look-right", say:"Look over here."},{say:"See?"}] 

    var HIGH_LEVEL_TAGS = ["look-", "point-", "acknowledge", "agree", "disagree", "emphasize", "flirt", "greet", "smile", 
      "think", "wink", "amused", "angry", "concerned", "confused", "doubtful", "frustrated", "sad",
      "surprised", "happy", "air-quote", "finger-", "gesture-", "palm-", "thumbs-", "custom-"];

    function isScript(s) {
        for (var i = 0; i < HIGH_LEVEL_TAGS.length; i++) {
            if (s.indexOf("[" + HIGH_LEVEL_TAGS[i]) > -1)
                return true;
        }
        return false;
    }

    function scriptFromText(s) {
        if (!isScript(s)) {
            var aSentence = sentenceSplit(s);
            var aLine = [];
            for (var i = 0; i < aSentence.length; i++) {
                var o = {};
                o["say"] = aSentence[i];
                aLine.push(o);
            }
        }
        else {
            var p1 = 0;
            var p2 = -1;
            var aLine = [];
            var o = {};
            for (;;) {
                // p1 is the beginning of next tag
                var tmin = -1;
                for (var i = 0; i < HIGH_LEVEL_TAGS.length; i++) {
                    var t = s.indexOf("[" + HIGH_LEVEL_TAGS[i], p2 + 1);
                    if (t != -1 && (tmin == -1 || t < tmin)) tmin = t;
                } 
                p1 = tmin;
                // p2 is the end of the last tag - finish o if necessary
                if (p2 != -1) {
                    if (p1 != -1)
                        o.say = s.substr(p2 + 1, p1 - p2 - 1).trim(); 
                    else
                        o.say = s.substr(p2 + 1).trim(); // last line's say
                    if (o.say === "") delete o.say;
                    if (o.do == "look-at-user") delete o.do;
                    aLine.push(o);
                }
                else { // rare case of no tag on first line
                    o.say = s.substr(0, p1).trim();
                    if (o.say.length > 0) aLine.push(o);
                }
                if (p1 == -1) break;
                // start new o
                o = {};
                p2 = s.indexOf("]", p1);
                if (p2 != -1) {
                    var tag = s.substr(p1 + 1, p2 - p1 - 1);
                    var p = tag.indexOf(" and ");
                    if (p != -1) {
                        o.do = tag.substr(0, p);
                        var and = tag.substr(p+5, tag.length-(p+5));
                        p = and.indexOf(" ");
                        if (p !== -1) {
                            o.and = and.substr(0, p);
                            var rest = and.substr(p+1).trim();
                            if (o.and == "link") {
                                var m = rest.match(/^"([^"]*)"[ ]+"([^"]*)"$/);
                                o.url = m ? m[1] : '';
                                o.target = m ? m[2] : '';
                            }
                            else if (o.and == "command") {
                                var m = rest.match(/^"([^"]*)"$/);
                                o.value = m ? m[1] : '';
                            }
                        }
                        else {
                            o.and = and;
                        }
                    }
                    else {
                        o.do = tag;
                    }
                }
            }
        }
        return aLine;
    }
    
    function sentenceSplit(s) {
        // eslint-disable-next-line
        var a = (s + " ").replace(/([\.!\?]+[ ]+)/g, "$1\n").split("\n"); // add space, then add a \n after ". ", "?!  ", for example
        // then split on \n - this trick lets us keep that punctuation
        // finish by trimming each piece and remove the empty ones
        var b = [];
        for (var i = 0; i < a.length; i++) {
            var t = a[i].trim();
            if (t.length > 0) b.push(t);
        }
        return b;
    }

    //scriptFromText("Look over here. See?");
    //scriptFromText("[look-right] Look over here. [look-at-user] See?");
    //scriptFromText("Look over here. [look-at-user] See?");
    //scriptFromText("Look over here. [smile]");

    start();
}



