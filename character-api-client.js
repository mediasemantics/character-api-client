// Character API Client 
// https://github.com/mediasemantics/charapi
// https://aws.amazon.com/marketplace/pp/prodview-43pgbzjb7krp6

export default CharacterApiClient;

function CharacterApiClient(divid, params) {
    var that = this;
    if (!params.animateEndpoint) return console.error("missing parameter animateEndpoint");

    var CLIENT_VERSION = "1.0";
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
        if (!params.catalogEndpoint) return console.error("missing parameter catalogEndpoint");
        xhrCatalog = new XMLHttpRequest();
        xhrCatalog.onload = function() {
            try {
                var o = JSON.parse(xhrCatalog.response);
                xhrCatalog = null;
            } catch (e) {
                xhrCatalog = null;
                console.error("cannot load catalog");
            }
            completeParamsFromCatalog(o);
            catalogLoaded();
        };
        xhrCatalog.onerror = function() {
            console.error("cannot load catalog");
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
        if (!div) return console.error("no div "+divid);

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
        if (audioContext) audioContext.resume();
        if (o) {
            // Process the object
            if (typeof o.say == "number") o.say = o.say.toString();
            else if (typeof o.say != "string") o.say = "";
            if (!loading && !animating && !stopping) {
                playCur = o;
                execute(o.do, o.say, o.audio, o.lipsync, false, onPlayDone);
            }
            else {
                if (!playCur && playQueue.length == 0)
                    stopAll(); // accelerate any running idle when we begin to play
                playQueue.push(o);
                // All queued messages are preload candidates
                preloadExecute(o.do, o.say, o.audio, o.lipsync);
            }
        }
        else document.getElementById(divid).dispatchEvent(createEvent("playComplete")); // always get one of these
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
        if (playCur && !apogee) onEmbeddedCommand({type:'apogee'});
        if (playQueue.length > 0) {
            playCur = playQueue.shift();
            execute(playCur.do, playCur.say, playCur.audio, playCur.lipsync, false, onPlayDone);
        }
        else {
            if (playCur) { // we also get here onIdleComplete
                playCur = null;
                document.getElementById(divid).dispatchEvent(createEvent("playComplete")); // i.e. all plays complete - we are idle
            }
        }
    }

    function onIdleComplete() {
        // if a play happens while running an idle automation, we just queue it up
        onPlayDone();
    }

    this.stop = function() {
        stopAll();
        playQueue = [];
    }

    this.volume = function() {
        return externalGainNode.gain.value;
    }
    
    this.setVolume = function(value) {
        externalGainNode.gain.value = value;
    }

    function onEmbeddedCommand(cmd) {
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
            if (key && key != "endpoint" && key != "fade" && key != "idleType" && key != "autoplay" && key != "playShield" && key != "preload" && key != "saveState" && key != "idleData" && key != "clientScale" && key != "sway" && key != "breath") // minus the parameters for charapiclient
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
    var loadPhase;                       // 0 = not loaded, 1 = audio/data/texture loaded, 2 = secondary textures loaded

    // State
    var initialState = "";

    // Loading
    var texture;                      // Latest loaded texture - we try to keep it down to eyes, mouth - the leftovers
    var animData;                     // animData to match texture.
    var secondaryTextures = {};       // e.g. {LookDownLeft:Texture}
    var defaultTexture;               // The initial texture is also the secondary texture named 'default'

    // Running
    var loaded;                     // True if default frame is loaded for a given character
    var loading;                    // True if we are loading a new animation - does not overlap animating
    var animating;                  // True if a character is animating
    var frame;                      // Current frame of animation
    var stopping;                   // True if we are stopping an animation - overlaps animating
    var starting;                   // True if we are starting an animation - overlaps animating
    var executeCallback;            // What to call on execute() return, i.e. when entire animation is complete
    var rafid;                      // Defined only when at least one character is animating - otherwise we stop the RAF (game) loop
    var atLeastOneLoadError;        // We use this to stop idle after first load error
    var inFade;                     // True if we are fading in or out char

    // Idle
    var idleTimeout;
    var timeSinceLastIdleCheck;
    var timeSinceLastAction;            // Time since any action, reset on end of a message - drives idle priority
    var timeSinceLastBlink;             // Similar but only for blink
    var lastIdle = "";                  // Avoid repeating an idle, etc.
    var idleCache = {};                 // Even though idle resources are typically in browser cache, we prefer to keep them in memory, as they are needed repeatedly    

    // Settle feature
    var timeSinceLastAudioStopped = 0;   // Used to detect if and how much we should settle for
    var settleTimeout;              // If non-0, we are animating true but are delaying slightly at the beginning to prevent back-to-back audio
    var delayTimeout;               // If non-0, we are animating true but are delaying audio slightly for leadingSilence

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
    
    function resetInnerVars() {
        gainNode = null;
        audioBuffer = null;
        audioSource = undefined;

        initialState = "";

        texture = undefined;
        animData = undefined;
        secondaryTextures = {};
        loadPhase = 0;
        defaultTexture = undefined;

        loaded = undefined;
        loading = undefined;
        animating = undefined;
        frame = undefined;
        stopping = undefined;
        starting = undefined
        executeCallback = undefined;
        idleTimeout = null;
        rafid = null;
        inFade = false;

        idleTimeout = null;
        timeSinceLastIdleCheck = 0;
        timeSinceLastAction = undefined;
        timeSinceLastBlink = undefined;
        lastIdle = "";

        timeSinceLastAudioStopped = 0;
        settleTimeout = undefined;
        delayTimeout = undefined;

        preload = true;
        preloaded = [];
        preloadQueue = [];
        preloading = null;
        preloadTimeout = null;
        
        random = undefined;
        suppressRandom = false;
    }

    function execute(tag, say, audio, lipsync, idle, callback) {
        // Shortcut out in common case where there is no action or audio, i.e. the author could have placed behavior here but did not.
        if (!tag && !say && !audio && loaded) {
            onEmbeddedCommand({type:'apogee'}); // however this could be a legit Look At User and Next - this handles it with no server involvement
            if (callback) callback();
            return;
        }
        
        apogee = false;        
        
        if (loading || animating) {
            console.error("internal error"); // execute called on a character while animating that character
            return;
        }

        if (random && random.length > 0 && !idle) suppressRandom = true; // immediately drive any random controllers to 0 (idles are assumed not to start with an immediate hand action)

        if (say) stageTranscript(transcriptFromText(say));

        executeCallback = callback;

        stopping = false;
        loading = true;
        animating = false;

        var addedParams = "";

        secondaryTextures = {};
        if (saveState) addedParams += "&initialstate=" + initialState;
        addedParams = addedParams + '&do=' + (tag||"");
        addedParams = addedParams + '&say=' + encodeURIComponent(say||"");

        audioBuffer = null;
        animData = null;
        texture = null;
        loadPhase = 0;
        
        if (say && containsActualSpeech(say)) {
            if (audio && lipsync) {
                addedParams = addedParams + '&lipsync=' +  encodeURIComponent(lipsync);
                speakRecorded(addedParams, audio, lipsync);
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

    function speakRecorded(addedParams, audioURL, lipsync) {
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
            var xhr = new XMLHttpRequest();
            xhr.open('GET', audioURL, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function () {
                audioContext.decodeAudioData(xhr.response, function (buffer) {
                    audioBuffer = buffer;
                    if (preloaded.indexOf(audioURL) == -1) preloaded.push(audioURL);
                    testAudioDataImageLoaded(addedParams);
                }, function (e) {
                    animateFailed();
                });
            };
            xhr.onerror = function() {animateFailed();}
            xhr.send();
        }
        if (preloaded.indexOf(audioURL) == -1) preloaded.push(audioURL);
    }

    function loadAnimation(addedParams) {
        var dataURL = makeGetURL(addedParams + "&type=data");
        var imageURL = makeGetURL(addedParams + "&type=image");
        
        // Idle cache shortcut
        if (idleCache[dataURL] && idleCache[imageURL]) {
            animData = idleCache[dataURL];
            texture = idleCache[imageURL];
            testAudioDataImageLoaded(addedParams);
            return;
        }
        
        // Load the data
        var xhr = new XMLHttpRequest();
        xhr.open('GET', dataURL, true);
        xhr.onload = function () {
            
            try {
                animData = JSON.parse(xhr.response);
                testAudioDataImageLoaded(addedParams);
            } catch(e) {animateFailed();}
        }
        xhr.onerror = function() {animateFailed();}
        xhr.send();
        
        // Load the image
        texture = new Image();
        texture.crossOrigin = "Anonymous";
        texture.onload = function() {
            testAudioDataImageLoaded(addedParams);
        };
        texture.onerror = function() {animateFailed();}
        texture.src = imageURL;
        
        // No need to preload these
        if (imageURL && preloaded.indexOf(imageURL) == -1) preloaded.push(imageURL);
        if (dataURL && preloaded.indexOf(dataURL) == -1) preloaded.push(dataURL);
    }
    
    function testAudioDataImageLoaded(addedParams) {
        if (loadPhase == 0 && audioBuffer && animData && texture && texture.complete) audioDataImageLoaded(addedParams);
    }
    
    function audioDataImageLoaded(addedParams) {
        loadPhase = 1;
    
        // Populate idle cache
        if (addedParams.indexOf("&do=idle") != -1) {
            var dataURL = makeGetURL(addedParams + "&type=data");
            var imageURL = makeGetURL(addedParams + "&type=image");
            idleCache[dataURL] = animData;
            idleCache[imageURL] = texture;
        }
        
        recordSecondaryTextures();
        loadSecondaryTextures(addedParams);
        testSecondaryTexturesLoaded(); // covers case of no secondary textures
    }

    function recordSecondaryTextures() {
        secondaryTextures = {};
        for (var i = 0; i < animData.textures.length; i++) {
            if (animData.textures[i] != "default")
                secondaryTextures[animData.textures[i]] = null;
        }
    }
    
    function loadSecondaryTextures(addedParams) {
        for (var key in secondaryTextures) {
            var textureURL = makeGetURL("&texture=" + key + "&type=image");
            
            // idle cache shortcut
            if (idleCache[textureURL]) {
                secondaryTextures[key] = idleCache[textureURL];
            }
            else {
                secondaryTextures[key] = new Image();
                secondaryTextures[key].crossOrigin = "Anonymous";
                secondaryTextures[key].onload = function () {
                    if (!secondaryTextures) return; // e.g. reset                    
                    
                    // populate idle cache
                    if (addedParams.indexOf("&do=idle") != -1)
                        idleCache[textureURL] = secondaryTextures[key];
                    
                    testSecondaryTexturesLoaded();
                };
                secondaryTextures[key].onerror = function() {animateFailed();}
                secondaryTextures[key].src = textureURL;
                if (textureURL && preloaded.indexOf(textureURL) == -1) preloaded.push(textureURL);
            }
        }
    }

    function testSecondaryTexturesLoaded() {
        if (loadPhase != 1) return;
        var allLoaded = true;
        for (var key in secondaryTextures)
            if (!secondaryTextures[key].complete) {allLoaded = false; break;}
        if (allLoaded) {
            if (audioBuffer == "na") // end use as sentinel
                audioBuffer = null;
            loadPhase = 2;
            getItStarted(!!audioBuffer);
        }
    }
    
    // just fire and forget at any time, as if you were running execute
    function preloadExecute(tag, say, audio, lipsync) {
        var addedParams = "";
        if (saveState) addedParams += "&initialstate=" + initialState;
        addedParams = addedParams + '&do=' + encodeURIComponent(tag||"");
        addedParams = addedParams + '&say=' + encodeURIComponent(say||"");
        if (say && audio && lipsync) {
            addedParams = addedParams + '&lipsync=' +  encodeURIComponent(lipsync);
        }
        if (say && !audio) {
            var audioURL = makeGetURL(addedParams + "&type=audio");
            preloadHelper(audioURL);
        }
        var imageURL = makeGetURL(addedParams + "&type=image");
        preloadHelper(imageURL);
        var dataURL = makeGetURL(addedParams + "&type=data");
        preloadHelper(dataURL);
    }

    function preloadHelper(url) {
        if (preloaded.indexOf(url) == -1 && preloadQueue.indexOf(url) == -1)
            preloadQueue.push(url);
        if (!preloadTimeout && preload)
            preloadTimeout = setTimeout(preloadSomeMore, 100);
    }

    function preloadSomeMore() {
        preloadTimeout = null;
        if (preloading || preloadQueue.length == 0) return;
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
        // version check
        if (animData.requireClient) {
            var breaking = parseInt(animData.requireClient.split(".")[0]);
            var feature = parseInt(animData.requireClient.split(".")[1]);
            if (breaking > parseInt(CLIENT_VERSION.split(".")[0])) return console.error("character requires newer client");
            else if (breaking == parseInt(CLIENT_VERSION.split(".")[0]) && feature > parseInt(CLIENT_VERSION.split(".")[1]) && !featureWarning) {console.warn("character requires newer client to be fully functional"); featureWarning = true;}
        }
        // render the first frame and start animation loop
        loading = false;
        showTranscript();
		// case where we are stopping before we got started
		if (stopping) {
		    animateComplete();
    		return;
		}
        animating = true;
        starting = true;

        // Settling feature - establish a minimum time between successive animations - mostly to prevent back to back audio - because we are so good at preloading
        if (settleTimeout) {clearTimeout(settleTimeout); settleTimeout = 0;}
        var t = Date.now();
        if (t - timeSinceLastAudioStopped < 333) {
            settleTimeout = setTimeout(onSettleComplete.bind(null, startAudio), 333 - (t - timeSinceLastAudioStopped));
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
        // start animation loop if needed
        if (!rafid) {
            rafid = requestAnimationFrame(animate);
            fpsInterval = 1000 / animData.fps;
            then = Date.now();
        }
        // start audio
        if (startAudio) {
            if (audioContext) {
                try {
                    audioSource = audioContext.createBufferSource();
                    audioSource.buffer = audioBuffer;
                    audioSource.connect(gainNode);
                    gainNode.gain.value = 1;
                    audioSource.start();
                } catch(e){}                    
            }
        }
        starting = false;
		// animation impacts sway in a subtle way
		if (Math.random() < 0.5) swayTarget = sway;
        if (!preloadTimeout && preload)
            preloadTimeout = setTimeout(preloadSomeMore, 100);
    }

    function animate() {
		rafid = null;
		now = Date.now();
        elapsed = now - then;
        if (elapsed <= fpsInterval) {
            rafid = requestAnimationFrame(animate);
            return;
        }
        then = now - (elapsed % fpsInterval);
        var framesSkip = Math.max(1, Math.floor(elapsed / fpsInterval)) - 1;
        //if (framesSkip > 0) console.log("dropped "+framesSkip+" frame(s)");
        
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
                    if (frame === undefined) 
                        frame = 0;
                    else { 
                        var frameNew = frame + 1 + framesSkip;
                        while (frame < frameNew) {
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
                                if (process >= 11 && process < 20) updateRandomWalk(process);
                                if (process == 1 || process == 2) {
                                    var o = updateTransform(src, recipe, i);
                                    var process = recipe[i][7];
                                    ctx.drawImage(canvasTransformDst[process-1],
                                        0, 0,
                                        recipe[i][4], recipe[i][5],
                                        recipe[i][0] + o.x, recipe[i][1] + o.y,
                                        recipe[i][4], recipe[i][5]);
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

        if (completed) {
            animating = false;
            stopping = false;
            frame = undefined;
            animateComplete();
        }
        
        rafid = requestAnimationFrame(animate);
    }

    function stopAll() {
        if (audioContext) {
            if (gainNode) gainNode.gain.setTargetAtTime(0, audioContext.currentTime, 0.015);
            timeSinceLastAudioStopped = Date.now();
        }
        if (loading || animating)
            stopping = true;
        if (delayTimeout) {
            clearTimeout(delayTimeout);
            delayTimeout = 0;
        }
        if (settleTimeout) {
            clearTimeout(settleTimeout);
            settleTimeout = 0;
            animating = false;
            animateComplete();
        }
    }

    function animateFailed() {
        console.error("service error");
        atLeastOneLoadError = true;
        loading = false;
        animateComplete();
    }

    function animateComplete() {
        timeSinceLastAction = 0;  // used in checkIdle

        if (!loaded) {
            loaded = true;

            // Pick up initial default texture if we are loading character for the first time
            if (!defaultTexture && texture && animData && animData.recipes)
                defaultTexture = texture;

            timeSinceLastBlink = 0;

            characterLoaded();
        }
        else {
            if (audioSource) {
                audioSource = null;
                timeSinceLastAudioStopped = Date.now();
            }
            if (params.saveState) initialState = animData.finalState;
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
        // Are layers with random process present in the next 6 frames? If so, suppressRandom = true, else false.
        var present = true;
        try {
            for (var d = 0; d < 6; d++) {
                var frameTest = frame + d;
                if (animData.frames[frameTest][1] == -1 || stopping && animData.frames[frameTest][1]) break; // stop searching when we run out of frames
                var framerec = animData.frames[frameTest];
                var recipe = animData.recipes[framerec[0]];
                var found = false;
                for (var i = 0; i < recipe.length; i++) {
                    var process = recipe[i][7]||0;
                    if (process >= 11 && process < 20) {found = true; break;}
                }
                if (!found) {present = false; break;}
            }
        } catch(e) {}
        suppressRandom = !present;
    }

    function updateRandomWalk(process) {
        var n = process - 10;
        // drive rapidly to frame 1
        if (suppressRandom) {
            if (random[n].frame > 1) random[n].frame = Math.round(random[n].frame/2);
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
        var rb = process == 1 ? animData.mouthBendRadius : (process == 2 || animData.jawBendRadius != undefined ? animData.jawBendRadius : 0);
        var rt = process == 1 ? animData.mouthTwistRadius : (process == 2 || animData.jawTwistRadius != undefined ? animData.jawTwistRadius : 0);
        var bend = - recipe[i][8] / 180 * Math.PI;
        var twist = recipe[i][9] / 180 * Math.PI;
        var side = recipe[i][10] / 180 * Math.PI;
        side += twist * animData.twistToSide;
        bend += side * (animData.sideToBend||0);
        var sideLength = animData.sideLength;//*2;
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
            addXForm(1, 0, 0, 1, x, y, m);
        }
        // Extract the portion of the image we want to a new temp context and get its bits as the source
        if (!canvasTransformSrc[process-1]) {
            canvasTransformSrc[process-1] = document.createElement('canvas');
            canvasTransformSrc[process-1].width = width;
            canvasTransformSrc[process-1].height = height;
        }
        canvasTransformSrc[process-1].getContext('2d', {willReadFrequently:true}).clearRect(0, 0, width, height);
        canvasTransformSrc[process-1].getContext('2d', {willReadFrequently:true}).drawImage(src, recipe[i][2], recipe[i][3], width, height, 0, 0, width, height);
        var source = canvasTransformSrc[process-1].getContext('2d', {willReadFrequently:true}).getImageData(0, 0, width, height);
        // Get the bits for a same-size region
        if (!canvasTransformDst[process-1]) {
            canvasTransformDst[process-1] = document.createElement('canvas');
            canvasTransformDst[process-1].width = width;
            canvasTransformDst[process-1].height = height;
        }
        var target = canvasTransformSrc[process-1].getContext('2d', {willReadFrequently:true}).createImageData(width, height);
        // Return the image displacement
        var deltax = 0;
        var deltay = 0;
        if (process == 1 || animData.jawBendRadius != undefined) {
            // Assume same size for destination image as for src, and compute where the origin will fall
            var xDstImage = Math.floor(xSrcImage + rt * Math.sin(twist));
            var yDstImage = Math.floor(ySrcImage - rb * Math.sin(bend));
            deltax = xDstImage - xSrcImage;
            deltay = yDstImage - ySrcImage;
            // Setup feathering
            var a = width / 2;
            var b = height / 2;
            var fudge = Math.round(width/40) - 1;
            var xp = width - 5 - fudge; // 5 pixel feathering
            var xpp = width - fudge; // but don't consider very edge pixels, at least in hi res
            var vp = (xp-a)*(xp-a)/(a*a);
            var vpp = (xpp-a)*(xpp-a)/(a*a);
            // Main loop
            var xDstGlobal,yDstGlobal,xSrcGlobalZ,ySrcGlobalZ,xSrcGlobal,ySrcGlobal,xSrc,ySrc,x1Src,x2Src,y1Src,y2Src,offSrc1,offSrc2,offSrc3,offSrc4,rint,gint,bint,aint;
            var offDst = 0;
            for (var yDst = 0; yDst < height; yDst++) {
                for (var xDst = 0; xDst < width; xDst++) {
                    xDstGlobal = xDst + 0.001 - width/2 + deltax ;
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
                    var alpha;
                    if (process == 1) {
                        var v = (xDst-a)*(xDst-a)/(a*a) + (yDst-b)*(yDst-b)/(b*b);
                        if (v > vpp) 
                            alpha = 0;
                        else if (v >= vp && v <= vpp) 
                            alpha = Math.round(255 * ((Math.sqrt(vpp) - Math.sqrt(v))/(Math.sqrt(vpp) - Math.sqrt(vp))));
                        else
                            alpha = 255;
                    }
                    else if (process == 2) {
                        alpha = Math.round((x2Src-xSrc)*(y2Src-ySrc) * source.data[offSrc1+3] + (xSrc-x1Src)*(y2Src-ySrc) * source.data[offSrc2+3] + (x2Src-xSrc)*(ySrc-y1Src) * source.data[offSrc3+3] + (xSrc-x1Src)*(ySrc-y1Src) * source.data[offSrc4+3]);
                        if (alpha < 222) alpha = 0; else alpha = 255;
                        if (yDst < height/10)
                            alpha = Math.min(alpha, yDst /  (height/10) * 255);
                    }
                    else {
                        alpha = 255;
                    }
                    target.data[offDst] = rint; offDst++;
                    target.data[offDst] = gint; offDst++;
                    target.data[offDst] = bint; offDst++;
                    target.data[offDst] = alpha; offDst++;
                }
            }
        }
        else if (process == 2) {
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
                    target.data[offDst] = gint; offDst++;
                    target.data[offDst] = bint; offDst++;
                    target.data[offDst] = alpha; offDst++;
                }
            }
        }
        canvasTransformDst[process-1].getContext('2d').putImageData(target, 0, 0);
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
            console.error("missing idleData");
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

        if (loaded && !loading && !animating && !playShield && !atLeastOneLoadError) {
            if (timeSinceLastAction > 1500 + Math.random() * 3500) {  // no more than 5 seconds with no action whatsoever
                timeSinceLastAction = 0;
                var idles = getIdles();
                var hasBlinkIdle = idles.length > 0 && idles[0] == "blink"; // if blink is the first idle then it is expected to be randomly interleaved with the other idles on it's own schedule
                // There WILL be an action - will it be a blink? Blinks must occur at a certain frequency. But hd characters incorporate blink into idle actions.
                if (hasBlinkIdle && timeSinceLastBlink > 5000 + Math.random() * 5000) {
                    timeSinceLastBlink = 0;
                    execute("blink", "", null, null, true, onIdleComplete.bind(null));
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
                        execute(idle, "", null, null, true, onIdleComplete.bind(null));
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



