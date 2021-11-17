// ==UserScript==
// @name         Flickr Fave List
// @namespace    https://srsutherland.github.io/flickr-twin/
// @version      2021.11.14
// @description  Companion to flickr twin finder to maintain multiple lists
// @author       srsutherland
// @match        https://srsutherland.github.io/flickr-twin/*
// @match        https://www.flickr.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @require      http://userscripts-mirror.org/scripts/source/107941.user.js
// @require      https://greasyfork.org/scripts/408787-js-toast/code/js-toast.js?version=837479
// ==/UserScript==6

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
            downloadObjectAsJson(exportObj, "ffl_export-"+new Date().toISOString())
        }
    
        /**
         * Import extension setting from an object (usually a previously exported JSON string)
         * @param {Object} settings_obj - Object containing extension settings to save
         */
        import(settings_obj) {
            for (const [k,v] of Object.entries(settings_obj)) {
                GM_SuperValue.set(k, v)
            }
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
                iqwerty.toast.toast(`SourceURL already in db as "${sourceURLs[id]}"`)
            }
        }

        /**
         * Get the stored data for a given image id
         * @param {string} id - image id
         * @param {boolean} log - if truthy, log the info to the console
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
            this.awaitController().then(() => {
                this.hideAll()
                this.pushPhotoInfo()
            })
            this.createAdvancedPanel()
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
                iqwerty.toast.toast('Controller loaded')
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
         * Push stored photo info (used to display images without another apit request) to the FTF app
         */
        async pushPhotoInfo() {
            await this.awaitController()
            const db = GM_SuperValue.get("db", [])
            for (const photo of db) {
                this.c.idb.addPhoto(photo)
            }
            iqwerty.toast.toast('Photo info synced from extension')
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
            iqwerty.toast.toast('Photo info synced to extension')
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
            addButton("ffl-display-lists", "Display lists", () => { this.printLists(getChecked()) })
            addButton("ffl-paginate-lists", "Paginate lists", () => { this.c.r.displayImages({ids:allCheckedItems()}); })
            addButton("ffl-process-lists", "Process lists", () => { this.c.processPhotos(allCheckedItems()).then(() => this.updateScores()) })
            addButton("ffl-process-twins", "Smart process twins", () => { this.c.processUsersFromDBSmart(); })
            addButton("ffl-update-lists", "Display user stats", () => { this.updateAll(); this.log(); this.hideAll(); this.pullPhotoInfo(); })
            addButton("ffl-user-stats", "Update", () => { this.printUserStats(); })

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

        async updateScores() {
            this.awaitController()
            const userScorer = u => {
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
            this.c.udb.setScorer(userScorer)
            this.c.udb.calculateScores()
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
            for (let a of document.getElementsByTagName("a")) {
                a.addEventListener(("click"), function (e) {
                    e.preventDefault();
                    const oldnum = this.dataset.catnum;
                    const newnum = oldnum != undefined ? (Number(oldnum) + 1) % 5 : 0;
                    this.dataset.catnum = newnum
                    this.dataset.catname = cats[newnum]
                })
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
                right: 10px;
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
            newHTML += (`<th>total pages</th><th>score</th>`)
            for (const u of this.c.udb.sortedList(num)) {
                newHTML += (`<tr><td>${this.c.r.userHTML(u)}</td>`)
                for (const cat of this.categories) {
                    const ls = this.lists[cat]
                    newHTML += (`<td>${ls.map(id => this.c.idb.get(id)).filter(i => i?.faved_by.includes(u.nsid)).length}</td>`)
                }
                newHTML += (`<td>${u.pages || "?"}</td>`)
                newHTML += (`<td>${u.score}</td>`)
                newHTML += (`</tr>`)
            }
            this.c.r.appendHTML(newHTML + `</table>`)
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
                    iqwerty.toast.toast(`Added "${this.photoID}" to 404 ignore list`)
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
            for (const elem of document.querySelectorAll(".photo-list-photo-view a.overlay")) {
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
                    }
                }
            }
            this.catPillsEvent.adding = false;
        }

        addCSS() {
            document.head.insertAdjacentHTML("beforeend",
                `<style>
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
                .ffl-cat-exclude, .ffl-cat-hide {
                    opacity: 30%;
                }
                .ffl-cat-exclude:hover, .ffl-cat-hide:hover {
                    opacity: 100%;
                }
                </style>`
            )
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

    const loadFFL = () => {
        let ffl
        if (window.location.href.match("srsutherland.github.io/flickr-twin/") || window.location.href.match(localhosturl)) {
            ffl = new FFLTwinApp()
        } else if (window.location.href.match(/flickr\.com\/photos\/([^/]+)\/(\d+)[/$]/)) { //Photo page
            ffl = new FFLPhotoPage()
        } else if (window.location.href.match(/flickr\.com\/photos\/([^/]+)($|\/($|page\d+|with))/)) { //Photostream
            ffl = new FFLPhotoList()
        } else if (window.location.href.match(/flickr\.com\/photos\/([^/]+)\/favorites($|\/($|page\d+|with))/)) { //Favorites
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
        }
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
})();