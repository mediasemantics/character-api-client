# Media Semantics Character API Reference Implementation (HTML Client)
HTML 5 Talking Avatar using Character API and AWS Polly.

## Overview
This module is part of the Reference Implementation for the [Character API](https://aws.amazon.com/marketplace/pp/B06ZY1VBFZ), a cloud-based Character Animation API available on the Amazon AWS Marketplace.

You can see the Reference Implementation running [here](https://mediasemantics.com/charapiclient.html). 

The module does not call the Character API directly. Instead, it calls a "caching server" that, in turn, calls the Character API and a Text-To-Speech API.
To get started, please see the [charapi](https://github.com/mediasemantics/charapi) github project.

## Installation
```
npm i @mediasemantics/character-api-client
```

## Usage

```
<div id="myDiv" style="width:250px; height:200px;"></div>

<script type="module">

import CharacterApiClient from './node_modules/@mediasemantics/character-api-client/character-api-client.js';

// Initialize your character in a div
var character;
document.addEventListener("DOMContentLoaded", function() {
    character = CharacterApiClient.setupDiv("myDiv", {
        character: "SusanHead",
        animateEndpoint: "http://localhost:3000/animate", 
        catalogEndpoint: "http://localhost:3000/catalog"
    });
})

</script>
```

In the [charapi](https://github.com/mediasemantics/charapi) project we show you how to create a simple server with endpoints 'animate' and 'catalog' on your local machine, at the endpoints shown above. When you deploy this to production, you will pass your new production endpoints to the module.

By building the caching server endpoints for your application, you gain the highest level of flexibility, security, and control over costs. If you are uncomfortable with building and maintaining server infrastructure, you can also use the Agent module in the <a href="https://mediasemantics.com">People Builder</a> service, also from Media Semantics. The Agent module has
a very similar API.

The character works like a puppet. Without any input, it exhibits an "idle" behavior. 
You can prompt it to say different things by invoking the `dynamicPlay()` function.
Each call to dynamicPlay consists of one line - typically a sentence. A line takes the form of a do/say pair representing a string to be spoken and a manner in which to speak it. You can also use a `do` by itself to perform a silent action, or a `say` by itself to speak with no deliberate action.

```
character.dynamicPlay({do:'look-right', say:'Look over here.'})
```

You can use the `stop()` method to smoothly stop any ongoing play. It's a good idea to do this before a `dynamicPlay()` if you want to interrupt any lines that may be playing:

```javascript
character.stop();
character.dynamicPlay({say: "Goodbye"});
```

Without the `stop()`, the "Goodbye" line would simply be queued up, and would play as soon as the current line is finished.

See the [character catalog](https://mediasemantics.com/characters.html) for examples of different `do` commands.

## Parameters

The required parameters are as follows:

| Parameter       | Description                                                                                                |
|-----------------|------------------------------------------------------------------------------------------------------------|
| width           | Width of the div.                                                                                          |
| height          | Height of the div.                                                                                         |
| character       | The id of the character - see [character catalog](https://mediasemantics.com/characters.html).             |
| animateEndpoint | The base url of the animate endpoint that you will build using the [Character API Reference Implementation](https://github.com/mediasemantics/charapi).  |
| catalogEndpoint | Similarly, this is the base url of your catalog endpoint.


## Reacting to events

Listen to events on the div object:

```javascript
document.getElementById("myDiv").addEventListener("characterLoaded", function() {console.log("characterLoaded")});
```

The `characterLoaded` event indicates that the character is loaded, that it's about to be displayed, and that it's ready to receive `dynamicPlay()` commands. 

## Longer texts

Maybe you have a paragraph of text to speak. You can use the following code to break it down into a series of `dynamicPlay()` calls:

```javascript
function speakParagraph(paragraph) {
     character.stop();
     let records = character.scriptFromText(paragraph); // breaks into sentences
     for (let record of records)
          character.dynamicPlay(record);
}
```

Breaking the paragaph down into sentences is necessary in order to lower the latency and to avoid limits on the length of the "say" field.

## Preloading lines

You can preload any line by using the `preloadDynamicPlay()` API. This works just like the regular `dynamicPlay()` API, but simply ensures that any required resources are cached in the local browser cache.

## Timing UI changes

You can attach an application command using the optional 'and' and 'value' fields.

```javascript
character.dynamicPlay({do:'look-right', say:'Look over here.', and:'command', value:'show someDiv'})
```

The value is surfaced in the `scriptCommand` event as the `event.detail` field.

```javascript
document.getElementById("myDiv").addEventListener("scriptCommand", function() {processCommand(e.detail)});
```

You often use commands with "do" actions such as "Look" and "Point". When you do, the event occurs at a "natural" point in the action, in this case when the character's head finishes turning in the given direction. The 'value' parameter is just a string, and you can apply your own rules on how to interpret it.

```javascript
function processCommand(s) {
    let command = s.split(" ")[0];
    let arg = s.split(" ")[1];
    if (command == "show") show(arg);
}
```

## Additional API

This Readme covers the basics, but please visit our [documentation](https://mediasemantics.com/KB106.html) for a full description of the API.
