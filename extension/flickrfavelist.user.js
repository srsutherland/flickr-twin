// ==UserScript==
// @name         Flickr Fave List
// @namespace    https://srsutherland.github.io/flickr-twin/
// @version      2023.11.22
// @description  Companion to flickr twin finder to maintain multiple lists
// @author       srsutherland
// @match        https://srsutherland.github.io/flickr-twin/*
// @match        https://www.flickr.com/*
// @match        https://flickr.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @require      http://userscripts-mirror.org/scripts/source/107941.user.js
// @require      https://greasyfork.org/scripts/408787-js-toast/code/js-toast.js?version=837479
// ==/UserScript==

(function() {
    'use strict';
    // eslint-disable-next-line no-redeclare
    /* global GM_SuperValue, GM_listValues, GM_info, unsafeWindow, iqwerty */
    if (window.fflLoaded) {
        console.warn(`Aborted loading extension version ${GM_info.script.version}; version ${window.fflLoaded} already loaded`);
        return; // Detect multiple versions and abort if already loaded.
    } else {
        window.fflLoaded = GM_info.script.version;
        console.log(`Loaded ${GM_info.script.name} version ${GM_info.script.version}`)
    }

    //dev, change if need
    const localhosturl = null && "http://localhost:8000"
    // @match        http://localhost:8000

    /**
     * Base Extension Class
     */
    class FlickrFaveList {
        constructor() {
            this.categories = GM_SuperValue.get("categories", [])
            this.subcategories = GM_SuperValue.get("subcategories", [])
            this.lists = {};
            this.weights = GM_SuperValue.get("weights", {})
            this.updateAll()
            this.log()
        }

        destroy() {
            // clean up intervals in child classes if neccescary; otherwise, do nothing.
        }

        /**
         * Return a string representation of this object, listing the type, categories, and
         * how many items they include. Example:
         * FFLTwinApp: best (20), good (34), less_good (42), exclude (29), e404 (4)
         * @returns {string} - 
         */
        toString() {
            return this.constructor.name + ": " + this.categories.map(cat => `${cat} (${this.lists[cat].length})`).join(", ")
        }

        /**
         * Log the string representation of this object to the console
         */
        log() {
            console.log(this.toString())
        }

        /**
         * Display a toast message
         */
        toast(msg) {
            try {
                // this script might be broken
                iqwerty.toast.toast(msg)
            } catch (e) {
                console.warn("Failed toast:", msg)
            }
        }

        /**
         * Update a category from local storage
         * @param {string} category 
         * @returns {Array} - The updated list
         */
        updateList(category) {
            this.lists[category] = GM_SuperValue.get(category, [])
            return this.lists[category];
        }

        /**
         * Update all categories from local storage
         * @returns {string} - updated string representation of this object
         */
        updateAll() {
            for (const cat of this.categories) {
                this.updateList(cat);
            }
            return this.toString()
        }

        /**
         * Export extension data to a JSON file
         */
        export() {
            const keys = ["categories", "subcategories", ...this.categories, ...this.subcategories, "weights", "sourceURL", "db"]
            let exportObj = {}
            for (const k of keys) {
                exportObj[k] = GM_SuperValue.get(k, [])
            }
            if (this.c.api.api_key) {
                exportObj.api_key = this.c.api.api_key
            }
            downloadObjectAsJson(exportObj, "ffl_export-" + new Date().toLocaleString('sv').replace(/ (\d+):(\d+):\d+/, "-$1$2"))
        }
    
        /**
         * Import extension setting from an object (usually a previously exported JSON string)
         * @param {Object} settings_obj - Object containing extension settings to save
         */
        import(settings_obj) {
            for (const [k,v] of Object.entries(settings_obj)) {
                if (k === "api_key") {
                    this.c.api.setAPIKey(v);
                    continue;
                }
                GM_SuperValue.set(k, v)
            }
        }

        /**
         * Import extension setting from JSON file
         */
         importFromFile() {
            getJsonUpload().then(j => this.import(j));
        }

        retrieve(GM_key) {
            if (GM_key != undefined) {
                return GM_SuperValue.get(GM_key, undefined)
            } else {
                return GM_listValues()
            }
        }

        /**
         * Add an image to a given category by id
         * @throws {TypeError} if either argument is not a string
         * @param {string} category - category to add to
         * @param {string} id - image id to add
         * @returns {number} - new length of list, or -1 it is already in the list
         */
        addItem(category, id) {
            assertIsString(category)
            assertIsString(id)
            const ls = this.updateList(category)
            if (!ls.includes(id)) {
                const len = ls.push(id)
                GM_SuperValue.set(category, ls)
                return len
            } else {
                return -1;
            }
        }

        /**
         * Remove an image from a given category by id
         * @throws {TypeError} if either argument is not a string
         * @param {string} category - category to remove from
         * @param {string} id - image id to remove
         * @returns {number} - the index of the removed item, (-1 if not found)
         */
        removeItem(category, id) {
            assertIsString(category)
            assertIsString(id)
            const ls = this.updateList(category)
            const ndx = ls.indexOf(id)
            if (ndx !== -1) {
                const newList = ls.filter(i => i !== id)
                GM_SuperValue.set(category, newList)
            }
            return ndx;
        }

        /**
         * Debugging maintainance function
         * Remove any nulls from categories.
         */
        removeNulls() {
            for (const category of this.categories) {
                const ls = this.updateList(category)
                const newList = ls.filter(i => i !== null)
                GM_SuperValue.set(category, newList)
                this.lists[category] = newList;
            }
        }

        /**
         * Record the url of the page an image is first added from
         * (This stores whether it was from browsing a user's favorites, the author's photostream, or neither)
         * Called when an image is added
         * @throws {TypeError} if either argument is not a string
         * @param {string} id - image id
         * @param {string} url - url (of current page) that id was first added
         */
        addSourceUrl(id, url) {
            assertIsString(id)
            assertIsString(url)
            const sourceURLs = GM_SuperValue.get("sourceURL", {})
            if (sourceURLs[id] == undefined) {
                sourceURLs[id] = url
                GM_SuperValue.set("sourceURL", sourceURLs)
            } else if (sourceURLs[id] !== url) {
                this.toast(`SourceURL already in db as "${sourceURLs[id]}"`)
            }
        }

        /**
         * Get the stored data for a given image id
         * @param {string} id - image id
         * @param {boolean} logInfo - if truthy, log the info to the console
         * @returns {Object} - object containing categories and source url for a given image, if any
         */
        lookup(id, logInfo) {
            const rvalue = []
            const log = (msg) => { if (logInfo) { console.log(msg) } }
            for (const cat of this.categories) {
                const ndx = this.lists[cat].indexOf(id)
                if (ndx !== -1) {
                    rvalue.push({category: cat, ndx: ndx})
                    log(`"${id}" in "${cat}" at position ${ndx} of ${this.lists[cat].length}`)
                }
            }
            const sourceURL = GM_SuperValue.get("sourceURL", {})[id]
            if (sourceURL) {
                rvalue.push({sourceURL: sourceURL})
                log(`Original URL: "${sourceURL}"`)
            }
            if (rvalue.length === 0) {
                log(`"${id}" not found`)
            }
            return rvalue;
        }

        /**
         * Check whether the image is categorized in at least one list
         * @param {string} id - image id 
         * @returns {boolean}
         */
        includes(id) {
            for (const list of Object.values(this.lists)) {
                if (list.includes(id)) {
                    return true;
                }
            }
            return false;
        }
    }

    /**
     * Mode for the Flicker Twin Finder app
     * @extends FlickrFaveList
     */
    class FFLTwinApp extends FlickrFaveList {
        constructor() {
            super()
            this.weights = GM_SuperValue.get("weights", {})
            for (const cat of this.categories) {
                this.weights[cat] = this.weights[cat] || 1
            }
            this.storedPhotoDBLength = 0;
            this.awaitController().then(() => {
                this.hideAll();
                this.pushPhotoInfo();
                window.addEventListener('beforeunload', (event) => {
                    // Confirm before navigating away if dbs not empty
                    if (this.c.udb.size() > 0 || this.c.idb.size() > this.storedPhotoDBLength) {
                        event.preventDefault();
                        // Chrome requires returnValue to be set.
                        event.returnValue = '';
                    }
                });
                this.c.makeAPIQueued();
            })
            this.createAdvancedPanel()
            this.createScorers()
        }

        destroy() {
            //when the page closes, save db data
            this.pullPhotoInfo()
        }

        /**
         * Wait for the Flickr Twin Finder app to initialise before trying to use it
         * @returns {Promise} - resolves once a reference to the controller has been obtained
         */
        async awaitController() {
            if (this.c != undefined) {
                return
            } else {
                const wait = ms => new Promise((r)=>setTimeout(r, ms))
                while (unsafeWindow.c == undefined) {
                    await wait(50)
                }
                this.c = unsafeWindow.c
                this.toast('Controller loaded')
            }
        }

        /**
         * Tell the FTF app to hide all the images we've already categorized from the photo list view
         */
        async hideAll() {
            await this.awaitController()
            for (const list of Object.values(this.lists)) {
                this.c.hide(list)
            }
            console.log("All lists hidden")
        }

        /**
         * Push stored photo info (used to display images without another api request) to the FTF app
         */
        async pushPhotoInfo() {
            await this.awaitController()
            const db = GM_SuperValue.get("db", [])
            for (const photo of db) {
                this.c.idb.addPhoto(photo)
            }
            this.storedPhotoDBLength = db.length;
            this.toast('Photo info synced from extension')
        }

        /**
         * For any image the extension has categorized, pull from FTF enough photo info 
         * to display the image without another api request
         */
        async pullPhotoInfo() {
            await this.awaitController()
            await this.pushPhotoInfo()
            const newdb = [].concat(...Object.values(this.lists))
                .map(i => this.c.idb.get(i))
                .filter(i => i) //remove nulls
                .map(p => {return {id:p.id, owner:p.owner, secret:p.secret, server:p.server}})
            GM_SuperValue.set("db", newdb)
            this.toast('Photo info synced to extension')
        }

        /**
         * Add FFL-specific controls to the FTF app control panel
         */
        createAdvancedPanel() {
            if (document.getElementById("control-advanced-dynamic") == null) {
                const fold = document.getElementById("control-advanced-fold")
                fold.insertAdjacentHTML("beforeend", `<div id="control-advanced-dynamic"></div>`)
            }
            const ap = document.getElementById("control-advanced-dynamic");

            // Category checkboxes
            ap.insertAdjacentHTML("beforeend", `<form id="ffl-lists"></form>`)
            const checkboxForm = document.getElementById("ffl-lists");

            for (let [cat, list] of Object.entries(this.lists)){
                let label = `${cat} (${list.length})`
                let catHTML = `<label class="ffl-list-check"><input type="checkbox" id="ffl-lists-${cat}" name="ffl-lists" value="${cat}"><span>${label}</span></label> `
                checkboxForm.insertAdjacentHTML("beforeend", catHTML)
            }

            const getChecked = () => {return [...checkboxForm.getElementsByTagName("input")].filter(e => e.checked).map(e => e.value)}
            this.getChecked = getChecked
            const allCheckedItems = () => [].concat(...(getChecked().map(cat => this.lists[cat])))
            this.allCheckedItems = allCheckedItems
            const allCheckedItemsNo404 = () => allCheckedItems().filter(i => this.lists.e404 ? !this.lists.e404.includes(i) : true)
            this.allCheckedItemsNo404 = allCheckedItemsNo404

            // Category weights
            ap.insertAdjacentHTML("beforeend", `<form id="ffl-weights"></form>`)
            const weightsForm = document.getElementById("ffl-weights");
            for (let [cat, weight] of Object.entries(this.weights)){
                let catHTML = `<label class="ffl-list-weight"><span>${cat} ×</span><input type="text" id="ffl-weights-${cat}" name="${cat}" value="${weight}" size=1></label> `
                weightsForm.insertAdjacentHTML("beforeend", catHTML)
            }

            const getWeights = () => Object.fromEntries([...weightsForm.elements].map(e=>[e.name, Number(e.value) || 0]))
            this.getWeights = getWeights
            const setWeights = () => { this.weights = getWeights(); GM_SuperValue.set("weights", this.weights) }
            for (const input of weightsForm.elements) {
                input.addEventListener("input", setWeights)
            }

            ap.insertAdjacentHTML("beforeend", `<div id="ffl-buttons"></div>`)
            const addButton = (id, label, clickHandler) => {
                const button = document.createElement("button")
                button.id = id;
                button.textContent = label;
                button.addEventListener('click', clickHandler)
                document.getElementById("ffl-buttons").insertAdjacentElement("beforeend", button)
            }
            this.addButton = addButton
            addButton("ffl-display-lists", "Display lists", () => { this.printLists(getChecked()) })
            addButton("ffl-paginate-lists", "Paginate lists", () => { this.c.r.displayImages({ids:allCheckedItems()}); })
            addButton("ffl-process-lists", "Process lists", () => { this.c.processPhotos(allCheckedItemsNo404()).then(() => this.updateScores()) })
            addButton("ffl-process-twins", "Smart process twins", () => { this.c.processUsersFromDBSmart(); })
            addButton("ffl-user-stats", "Display user stats", () => { this.printUserStats(); })
            addButton("ffl-full-routine", "Full routine 10k", () => { this.fullRoutine(10000); })
            addButton("ffl-update-lists", "Update", () => { this.updateAll(); this.log(); this.hideAll(); this.pullPhotoInfo(); })
            document.getElementById("ffl-buttons").insertAdjacentHTML("beforeend", `<p></p>`)
            // Import, export
            addButton("ffl-import", "Import FFL", () => { this.importFromFile(); })
            addButton("ffl-export", "Export FFL", () => { this.export(); })

            document.head.insertAdjacentHTML("beforeend", 
            `<style>
            #ffl-lists {
                margin: 5px 0;
            }

            .ffl-list-check {
                background-color: rgb(14, 114, 176);
                color: rgb(232, 230, 227);
                display: inline-block;
                padding: 5px;
                font-family: sans-serif;
                border-radius: 3px;
                cursor: pointer;
                margin: 2px
            }

            .ffl-cat-selected {
                filter: hue-rotate(150deg);
            }

            .ffl-list-check :checked {
                filter: hue-rotate(150deg);
            }
            
            .ffl-list-check :checked + span {
                color: #faa;
                font-weight: bold;
                text-shadow: 1px 1px 3px black;
            }

            .ffl-list-weight {
                margin-right: 1em;
            }

            .ffl-list-weight input {
                width: 2em;
            }
            </style>`)
        }

        /**
         * Generate alternative user scoring methods
         */
        createScorers() {
            this.userScorers = {}
            this.userScorers.weighted = u => {
                `weighted`
                if (!u.pages) {
                    return u.favecount / 10
                }
                let score = 0;
                for (const cat of this.categories) {
                    const list = this.lists[cat]
                    const weight = this.weights[cat]
                    if (weight == 0) continue;
                    for (const i of list.map(id => this.c.idb.get(id))) {
                        if (i?.faved_by.includes(u.nsid)) {
                            score += weight
                        }
                    }
                }
                return score / u.pages_processed + u.favecount / (10 * Math.log2(u.pages) + 1)
            }
            Object.defineProperty(this.userScorers.weighted, "name", { value: `weighted` })
            
            this.userScorers.redHerring = u => {
                `redHerring`
                //This should hypothetically find the images you most want to exclude from searches
                let normalScore = this.userScorers.weighted(u)
                normalScore = normalScore < 1 ? 1 : normalScore;
                let excludeScore = 0;
                for (const i of this.lists.exclude.map(id => this.c.idb.get(id))) {
                    if (i?.faved_by.includes(u.nsid)) {
                        excludeScore += 5
                    }
                }
                return excludeScore / normalScore
            }
            Object.defineProperty(this.userScorers.redHerring, "name", { value: `redHerring` })

            this.userScorers.weightedMultiplierFactory = catName => {
                const userScorer = u => {
                    `weightedMultiplier${catName}`
                    if (!u.pages) {
                        return u.favecount / 10
                    }
                    let score = 0;
                    const multList = this.lists[catName]
                    const multiplier = this.weights[catName]
                    for (const cat of this.categories) {
                        const list = this.lists[cat]
                        const weight = this.weights[cat]
                        if (weight == 0) continue;
                        for (const i of list.map(id => this.c.idb.get(id))) {
                            if (i?.faved_by.includes(u.nsid)) {
                                if (multList.includes(i?.id) && catName !== cat) {
                                    score += weight * multiplier
                                } else {
                                    score += weight
                                }
                            }
                        }
                    }
                    return score / u.pages_processed + u.favecount / (10 * Math.log2(u.pages) + 1)
                }
                this.userScorers[`weightedMultiplier_${catName}`] = userScorer
                Object.defineProperty(userScorer, "name", { value: `weightedMultiplier_${catName}` })
                return userScorer;
            }

            this.userScorers.redHerringFactory = normalScore => {
                const userScorer = u => {
                    `redHerring_${normalScore.name}`
                    //This should hypothetically find the images you most want to exclude from searches
                    let normalScore = this.userScorers.weighted(u)
                    normalScore = normalScore < 1 ? 1 : normalScore;
                    let excludeScore = 0;
                    for (const i of this.lists.exclude.map(id => this.c.idb.get(id))) {
                        if (i?.faved_by.includes(u.nsid)) {
                            excludeScore += 5
                        }
                    }
                    return excludeScore / normalScore
                }
                this.userScorers[`redHerring_${normalScore.name}`] = userScorer
                Object.defineProperty(userScorer, "name", { value: `redHerring_${normalScore.name}` })
                return userScorer;
            }
        }

        async updateScores() {
            this.awaitController()
            if (!Object.values(this.userScorers).includes(this.c.udb.scorer)) {
                this.c.udb.setScorer(this.userScorers.weighted)
            }
            this.c.udb.calculateScores()
        }

        /**
         * Add all visible, uncategorized images on the page to a category
         * @param {string} cat - category to add images to
         */
         categorizeAllVisible(cat) {
            if (!Object.keys(this.lists).includes(cat)) {
                throw new TypeError(`No category "${cat}" in lists`)
            }
            this.updateAll();
            //get visible ids from renderer's "displaying" object
            const ids = this.c.r.displaying.images_onscreen.map(i => i.id)
            let numAdded = 0;
            for (const id of ids) {
                if (!this.includes(id)) {
                    this.addItem(cat, id);
                    numAdded++;
                } 
            }
            const page = this.c.r.displaying.page;
            console.log(`Added ${numAdded} of ${ids.length} images on page ${page} to "${cat}" `)
        }

        /**
         * Add all visible, uncategorized images on the page to the "hidden" category
         */
        hideAllVisible() {
            this.categorizeAllVisible("hidden")
        }

        /**
         * Add all visible, uncategorized images on the page to the "exclude" category
         */
        excludeAllVisible() {
            this.categorizeAllVisible("exclude")
        }

        /**
         * Tell the FTF app to display the image in the given categories
         * Each category gets a header and a different-hued indent border
         * @param {Array<string>} categories 
         */
        async printLists(categories = this.categories) {
            await this.awaitController()
            await this.pushPhotoInfo()
            this.c.r.clear()
            const main = unsafeWindow.c.r.renderParent
            for (const [i,cat] of categories.entries()) {
                if (this.lists[cat] instanceof Array) {
                    let ls = this.lists[cat]
                    console.log(`${cat} (${ls.length})`)
                    let hue = i * 360/categories.length
                    main.insertAdjacentHTML("beforeend", `<h2>${cat}</h2><div id=${cat}-div style="border-left: 3px solid hsl(${hue},100%,50%)"></div>`)
                    this.c.r.renderParent = document.getElementById(cat+"-div")
                    this.c.r.displayImagesByIDs(ls)
                } else {
                    console.log(`${cat} not found, not displayed`)
                }
            }
            unsafeWindow.c.r.renderParent = main
        }

        /**
         * Debug function - Sorting mode
         * Put the app in a mode where clicking on a photo changes its category
         * @param {Array<string>} categories 
         */
        async sortingMode(categories) {
            const cats = categories || this.categories
            await this.printLists(cats)
            for (const a of document.getElementsByClassName("img-link")) {
                a.dataset.id = a.getElementsByClassName("img-container")[0].dataset.id
                a.addEventListener(("click"), function (e) {
                    e.preventDefault();
                    const oldnum = this.dataset.catnum;
                    const newnum = oldnum != undefined ? (Number(oldnum) + 1) % categories.length : 0;
                    this.dataset.catnum = newnum
                    this.dataset.catname = cats[newnum]
                })
            }
            this.resize = (size = "b") => {
                for (const img of document.getElementsByTagName("img")) {
                    img.src = img.src.replace(/_\w\.jpg/, `_${size}.jpg`)
                }
            }
            document.head.insertAdjacentHTML("beforeend", 
            `<style>
            .img-link {
                position: relative;
            }
            .img-link:after {
                content: attr(data-catnum)" "attr(data-catname);
                position: absolute;
                top: 7px;
                left: 10px;
                color: white;
                font-size: 1.6em;
                font-weight: bold;
                text-shadow: -2px -2px 1px #000, 2px -2px 1px #000, -2px 2px 1px #000, 2px 2px 1px #000;
            }
            </style>`)
        }

        /**
         * List the top n users in a table that displays how many hits there were from each list
         * @param {number} num - Max number of users
         * @param {Array<string>} categories 
         */
        async printUserStats(num=20, categories = this.categories) {
            await this.awaitController()
            this.c.r.clear()
            //html is built piecemeal before appending because otherwise Chrome "helpfully" closes the tags for you
            let newHTML = `<table><tr><th></th>`
            for (const cat of categories) {
                newHTML += (`<th> ${cat.replace(/_/g, '_<wbr/>')} </th>`)
            }
            newHTML += (`<th>pages processed</th><th>total pages</th><th>faves processed</th><th>total faves</th><th>score</th>`)
            for (const u of this.c.udb.sortedList(num)) {
                newHTML += (`<tr><td>${this.c.r.userHTML(u)}</td>`)
                for (const cat of this.categories) {
                    const ls = this.lists[cat]
                    newHTML += (`<td title="${cat}">${ls.map(id => this.c.idb.get(id)).filter(i => i?.faved_by.includes(u.nsid)).length}</td>`)
                }
                newHTML += (`<td title="pages processed">${u.pages_processed || "?"}</td>`)
                newHTML += (`<td title="total pages">${u.pages || "?"}</td>`)
                newHTML += (`<td title="faves processed">${u.faves_processed || "?"}</td>`)
                newHTML += (`<td title="total faves">${u.faves_total || "?"}</td>`)
                newHTML += (`<td title="score">${u.score}</td>`)
                newHTML += (`</tr>`)
            }
            this.c.r.appendHTML(newHTML + `</table>`)
        }

        /**
         * Performs a full FFL routine in order:
         * 1. Process all checked lists
         * 2. Process all users, smartly, up to a max num of requests
         * 3. Display the images
         * @param {number} maxUserpageRequests - maximum userpage request to make when processing users
         */
        async fullRoutine(maxUserpageRequests=3000) {
            await this.c.processPhotos(this.allCheckedItemsNo404())
            await this.updateScores()
            this.c.api.getRemainingAPICalls = () => maxUserpageRequests
            await this.c.processUsersFromDBSmart(maxUserpageRequests);
            await this.c.r.displayImages();
        } 

        /**
         * Display images when the api will be waiting for long enough to make it worth it
         * @param {number} minMinutes - minimum number of minutes until the next api call is available
         */
        async displayWhenReady(minMinutes=30) {
            window.clearInterval(this.displayWhenReadyInterval)
            const api = this.c.api
            const ms_until_call_expires = api.call_history[0] + 60 * 60 * 1000 - Date.now();
            const min_min_in_ms = minMinutes * 60 * 1000;
            const used_all_calls = api.call_history.length == api.max;
            const no_new_calls_for_x_minutes = ms_until_call_expires < min_min_in_ms;
            if (used_all_calls && no_new_calls_for_x_minutes) {
                console.log("displaying...")
                this.c.r.displayImages()
            } else {
                console.log("Not done, waiting 10s")
                this.displayWhenReadyInterval = window.setTimeout(() => this.displayWhenReady(), 10000)
            }
        }
    }

    /**
     * Mode for Flickr photo pages
     * @extends FlickrFaveList
     */
    class FFLPhotoPage extends FlickrFaveList {
        constructor() {
            super()
            this.url = window.location.href
            this.photoID = window.location.href.match(/flickr\.com\/photos\/[^/]+\/(\d+)[/$]/)[1]
            this.checkIf404()
            this.createControlPanel()
            this.lookup(this.photoID, true) //Prints categories and stored url to console
            this.addPhotoStreamLinkIfAbsent()
            //the link gets removed from the page after a while for some reason. Bodge to fix that.
            this.pslinkinterval = setInterval(() => { if (document.hasFocus()) this.addPhotoStreamLinkIfAbsent() }, 1000);
        }

        destroy() {
            //clean up photostream link adder interval
            clearInterval(this.pslinkinterval)
        }

        /**
         * Create the ffl control panel under the image with buttons to add and remove it from categories
         */
        createControlPanel() {
            try {
                this.cp = document.createElement("div")
                this.cp.id = "ffl_control_panel"
                const underPhoto = document.querySelector(".sub-photo-container.centered-content")
                underPhoto.insertAdjacentElement("afterbegin", this.cp)
                for (const cat of this.categories) {
                    const selected = this.lists[cat].includes(this.photoID) ? "ffl-cat-selected" : "";
                    this.cp.insertAdjacentHTML("beforeend", ` <button class="ffl-cat-button ${selected}" id="${cat}-button">${cat}</button>`)
                    const catButton = document.getElementById(`${cat}-button`)
                    catButton.addEventListener('click', () => {
                        const isSelected = "ffl-cat-selected"
                        if (!catButton.classList.contains(isSelected)) {
                            this.addItem(cat, this.photoID)
                            this.addSourceUrl(this.photoID, this.url)
                            catButton.classList.add(isSelected)
                            console.log(`Added "${this.photoID}" to "${cat}"`)
                        } else {
                            const ndx = this.removeItem(cat, this.photoID)
                            console.log(`Removed "${this.photoID}" from pos ${ndx} of "${cat}"`)
                            catButton.classList.remove(isSelected)
                        }
                    })
                }
                document.head.insertAdjacentHTML("beforeend",
                    `<style>
                    .ffl-cat-selected {
                        filter: hue-rotate(150deg);
                    }
                    #ffl_control_panel .ffl-cat-button {
                        padding: 0 5px;
                    }
                    </style>`
                )
            } catch (e) {
                console.error(e)
            }
        }

        /**
         * Add a "Back to [author] photostream" link if the referrer is another page (e.g. user favorites)
         */
        addPhotoStreamLinkIfAbsent() {
            const userID = window.location.href.match(/flickr\.com\/photos\/([\w-]+|\d+@N\d\d)\/\d+[/$]/i)[1]
            const psURL = `/photos/${userID}/with/${this.photoID}/`
            const backlinks = [...document.querySelectorAll(".entry-type.do-not-evict")]
            if (backlinks[0] && backlinks.every(e => !e.href.match(psURL))) {
                const newLink = `<a class="entry-type do-not-evict no-outline" style="top: 38px" href="${psURL}"><div class="icon"></div> Back to photostream</a>`
                backlinks[0].insertAdjacentHTML("afterend", newLink)
            }
        }

        /**
         * Check if the current page was a 404 error; if so, add item to the e404 list.
         */
        checkIf404() {
            urlExists(this.url).then( ok => {
                if (!ok) {
                    this.addItem("e404", this.photoID)
                    this.addSourceUrl(this.photoID, this.url)
                    this.toast(`Added "${this.photoID}" to 404 ignore list`)
                }
            })
        }
    }

    /**
     * Mode for Flickr pages with photo lists (favorites, photostream, etc)
     * @extends FlickrFaveList
     */
    class FFLPhotoList extends FlickrFaveList {
        constructor() {
            super()
            this.url = window.location.href
            this.addCSS()
            this.catPillsEvent = {
                adding: false,
                queued: false
            }
            this.scrollListener = document.addEventListener('scroll', () => {
                this.queueCatPills()
            })
            window.setTimeout( () => { this.addCatPills() }, 1000)
        }

        destroy() {
            clearTimeout(this.catPillsEvent.timeout)
            document.removeEventListener('scroll', this.scrollListener)
        }

        /**
         * Get the photo id from the url
         * @param {string} url 
         * @returns {string} - photo id
         */
        getPhotoIDFromURL(url) {
            return url.match(/flickr\.com\/photos\/[^/]+\/(\d+)[/$]/)[1]
        }

        /**
         * Tell the extension to try adding category pill to the photo list
         */
        queueCatPills() {
            if (!this.catPillsEvent.adding) {
                this.addCatPills()
            } else if (!this.catPillsEvent.queued) {
                this.catPillsEvent.queued = true;
                this.catPillsEvent.timeout = setTimeout( () => {
                    this.addCatPills();
                    this.catPillsEvent.queued = false;
                }, 250)
            }
        }

        /**
         * Add category pills to every categorized photo present in the photo list
         */
        addCatPills () {
            this.catPillsEvent.adding = true
            //selector for photostream, favorites, albums, etc
            const selector_masonry = ".photo-list-photo-view a.overlay"
            //selector for galleries
            const selector_gallery = ".photo-list-photo-container a.click-target"
            for (const elem of document.querySelectorAll(`${selector_masonry}, ${selector_gallery}`)) {
                const parent = elem.parentElement.parentElement.parentElement;
                if (parent.querySelector(".ffl-catpill-contain")) {
                    continue;
                }
                const catpill_container = document.createElement("div")
                catpill_container.classList.add("ffl-catpill-contain")
                parent.insertAdjacentElement("beforeend", catpill_container)
                for (const c of this.lookup(this.getPhotoIDFromURL(elem.href))) {
                    if (c.category) {
                        catpill_container.insertAdjacentHTML("beforeend", 
                            `<div class="ffl-catpill ffl-catpill-${c.category}"><span class="ffl-catpillname">${c.category}</span></div>`
                        )
                        parent.classList.add(`ffl-cat-${c.category}`)
                        parent.classList.add(`ffl-categorized`)
                    }
                }
            }
            this.catPillsEvent.adding = false;
        }

        /**
         * Add all visible, uncategorized images on the page to a category
         * @param {string} cat - category to add images to
         */
        categorizeAllVisible(cat) {
            if (!Object.keys(this.lists).includes(cat)) {
                throw new TypeError(`No category "${cat}" in lists`)
            }
            this.updateAll();
            //get visible ids from overlay
            const ids = [...document.querySelectorAll(`a.overlay`)].map(a => a.href.match(/\/(\d+)\//)[1])
            let numAdded = 0;
            for (const id of ids) {
                if (!this.includes(id)) {
                    this.addItem(cat, id);
                    numAdded++;
                } 
            }
            const page = this.url.match(/\/page(\d+)/) ? this.url.match(/\/page(\d+)/)[1] : 1
            console.log(`Added ${numAdded} of ${ids.length} images on page ${page} to "${cat}" `)
        }

        /**
         * Add all visible, uncategorized images on the page to the "hidden" category
         */
        hideAllVisible() {
            this.categorizeAllVisible("hidden")
        }

        /**
         * Add all visible, uncategorized images on the page to the "exclude" category
         */
        excludeAllVisible() {
            this.categorizeAllVisible("exclude")
        }

        /**
         * Make middle clicking an image add it to a category if not already categorized
         * @param {string} cat - category to add images to
         */
        middleClickCategorizeMode(cat) {
            this.updateAll();
            const categorizeImage = id => { 
                if (!this.includes(id)) {
                    this.addItem(cat, id)
                    console.log(`${id} added to ${cat}`) 
                } else {
                    console.warn(`${id} already categorized`)
                }
            }
            var links = [...document.querySelectorAll(`a.overlay`)]
            for (const a of links) {
                a.addEventListener("auxclick", e => {
                    if (e.button != 1) return;
                    e.preventDefault();
                    const id = e.target.href.match(/\/(\d+)\//)?.[1];
                    categorizeImage(id);
                    e.target.parentElement.parentElement.parentElement.classList.add(`ffl-cat-${cat}`);
                })
            }
        }

        /**
         * Make middle clicking an image add it to the "hidden" category if not already categorized
         */
        middleClickHideMode() {
            this.middleClickCategorizeMode("hidden");
        }

        /**
         * Make middle clicking an image add it to the "exclude" category if not already categorized
         */
        middleClickExcludeMode() {
            this.middleClickCategorizeMode("exclude");
        }

        addCSS() {
            //TODO change cat opacity
            document.head.insertAdjacentHTML("beforeend",
                `<style>
                .ffl-catpill-contain {
                    position: absolute;
                    top: 5px;
                }
                .ffl-catpill {
                    background: red;
                    border: 3px solid blue;
                    color: white;
                    display: inline-flex;
                    box-sizing: border-box;
                    padding: 1px .4em;
                    margin: 5px;
                    border-radius: 5em;
                    min-height: 1.5em;
                    min-width: 1.5em;
                }
                .photo-list-photo-view:hover .ffl-catpillname {
                    display: inline;
                }
                .ffl-catpillname {
                    display: none;
                }
                .ffl-categorized {
                    opacity: 50%;
                }
                .ffl-cat-hidden, .ffl-cat-hide {
                    opacity: 30%;
                }
                .ffl-cat-exclude {
                    opacity: 15%;
                }
                .ffl-categorized:hover {
                    opacity: 100%;
                }
                </style>`
            )
        }
    }

    /**
     * Mode for Flickr photo size pages
     * @extends FlickrFaveList
     */
    class FFLPhotoSizes extends FlickrFaveList {
        constructor() {
            super()
            this.url = window.location.href
            this.photoID = window.location.href.match(/flickr\.com\/photos\/[^/]+\/(\d+)[/$]/)[1]
            this.size = window.location.pathname.match(/sizes\/(\w+)[/$]/i)[1]
            this.addCSS()
            this.autoSize()
            this.changeAuthorLink()
        }

        async autoSize() {
            const resize = async (newSize) => {
                const newURL = window.location.href.replace(`/${this.size}/`, `/${newSize}/`)
                let response = await fetch(newURL)
                if (response.ok && response.url.match(`/sizes/${newSize}`)) {
                    window.location.replace(newURL);
                } else {
                    return Promise.reject(`no ${newSize} size`)
                }
            }
            const reallyLink = (size) => {
                const link = document.querySelector(`a[href*="/sizes/${size}"]`)
                if (link != undefined) {
                    link.href = link.href + `?really${size}`
                }
            } 
            if (this.size == 'l' && !window.location.search.match("reallyl")) {
                await resize("k").catch(e => { console.log(e); resize("h") }).catch(console.log)
            } if (this.size == 'z' && !window.location.search.match("reallyz")) {
                await resize("c").catch(console.log)
            } else {
                reallyLink("z")
                reallyLink("l")
            }
            this.changeAuthorLink()
        }

        changeAuthorLink() {
            const authorlink = document.getElementById("all-sizes-header").children[0].getElementsByTagName("a")[0]
            authorlink.href = authorlink.href.replace("photos", "people")
        }

        addCSS() {
            document.head.insertAdjacentHTML("beforeend",
                `<style>
                #main {
                    width: 98vw;
                }
                .spaceball {
                    display: none !important
                }
                </style>`
            )
            //display: none doesn't seem to help, so:
            document.querySelectorAll(".spaceball").forEach(spaceball => spaceball.remove())
        }
    }

    /***  Helper Functions ***/

    function downloadObjectAsJson(exportObj, exportName) {
        var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj));
        var downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", exportName + ".json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }
    unsafeWindow.downloadObjectAsJson = downloadObjectAsJson;

    /**
     * Opens the filepicker to select a file which is then parsed as JSON
     * @returns {Promise<object>} - A promise containing an the parsed JSON object
     */
    async function getJsonUpload () {
        const inputFileElement = document.createElement('input')
        inputFileElement.setAttribute('type', 'file')
        inputFileElement.setAttribute('accept', '.json')
        const event = new Promise(resolve => {
            inputFileElement.addEventListener('change', resolve, false)
        })
        inputFileElement.click()
        const { files } = (await event).target
        if (!files) { return }
        const fileText = await files[0].text()
        return JSON.parse(fileText)
    }
    unsafeWindow.getJsonUpload = getJsonUpload;

    async function urlExists(url) {
        const response = await fetch(url, { method: 'head' })
        return response.ok
    }

    function assertIsString(arg, name="arg") {
        if (typeof arg !== "string") {
            throw new TypeError(`${name} must be a string`)
        }
    }

    /*** Main ***/

    // regexes for matching Flickr URLs
    const reDomain = "flickr\\.com"
    const reUserID = "([^/]+)"
    const rePhotoID = "(\\d+)"
    const reIsPhotoSizes = new RegExp(`${reDomain}/photos/${reUserID}/${rePhotoID}/sizes[/$]`, "i");
    const reIsPhotoPage = new RegExp(`${reDomain}/photos/${reUserID}/${rePhotoID}[/$]`, "i");
    const reIsUserPhotoStream = new RegExp(`${reDomain}/photos/${reUserID}($|/($|page\\d+|with))`, "i");
    const reIsUserFavorites = new RegExp(`${reDomain}/photos/${reUserID}/favorites($|/($|page\\d+|with))`, "i");
    const reIsAlbum = new RegExp(`${reDomain}/photos/${reUserID}/albums/\\d+`, "i");
    const reIsGallery = new RegExp(`${reDomain}/photos/${reUserID}/galleries/\\d+`, "i");
    const reIsUserAbout = new RegExp(`${reDomain}/people/${reUserID}[^/]`, "i");
    const pageInfo = () => {
        return {
            isPhotoSizes: reIsPhotoSizes.test(window.location.href),
            isPhotoPage: reIsPhotoPage.test(window.location.href),
            isUserPhotoStream: reIsUserPhotoStream.test(window.location.href),
            isUserFavorites: reIsUserFavorites.test(window.location.href),
            isAlbum: reIsAlbum.test(window.location.href),
            isGallery: reIsGallery.test(window.location.href),
            isUserAbout: reIsUserAbout.test(window.location.href),
        }
    }

    const loadFFL = () => {
        let ffl
        const page = pageInfo()
        if (window.location.href.match("srsutherland.github.io/flickr-twin/") || window.location.href.match(localhosturl)) {
            ffl = new FFLTwinApp()
        } else if (page.isPhotoSizes) {
            ffl = new FFLPhotoSizes()
        } else if (page.isPhotoPage) {
            ffl = new FFLPhotoPage()
        } else if (page.isUserPhotoStream || page.isUserFavorites || page.isAlbum || page.isGallery || page.isUserAbout) {
            ffl = new FFLPhotoList()
        } else {
            ffl = new FlickrFaveList()
        }
        unsafeWindow.ffl = ffl
        window.ffl_lasthref = window.location.href;
    }
    loadFFL();

    //now set up extension reload for soft page navigation on the Flickr website
    if (!(unsafeWindow.ffl instanceof FFLTwinApp)) {
        const targetNode = document.getElementById('content');
        if (targetNode == undefined) {
            console.warn("Could not find content element")
        } else {
            const observerOptions = { childList: true, attributes: true, subtree: false };
            (new MutationObserver( () => {
                console.log("observed mutation")
                if (window.ffl_lasthref !== window.location.href) {
                    unsafeWindow.ffl.destroy();
                    delete unsafeWindow.ffl
                    console.log(`Navigated to ${window.location.href}`)
                    loadFFL()
                }
            })).observe(targetNode, observerOptions);
        }
    }
})();