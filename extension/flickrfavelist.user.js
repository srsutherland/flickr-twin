// ==UserScript==
// @name         Flickr Fave List
// @namespace    https://srsutherland.github.io/flickr-twin/
// @version      2021.06.17
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

    class FlickrFaveList {
        constructor() {
            this.categories = GM_SuperValue.get("categories", [])
            this.subcategories = GM_SuperValue.get("subcategories", [])
            this.lists = {};
            let logText = this.constructor.name + ": "
            for (const cat of this.categories) {
                this.updateList(cat)
                logText += `${cat} (${this.lists[cat].length}), `
            }
            console.log(logText)
        }

        updateList(category) {
            this.lists[category] = GM_SuperValue.get(category, [])
            return this.lists[category];
        }

        export() {
            const keys = ["categories", "subcategories", ...this.categories, ...this.subcategories, "sourceURL", "db"]
            let exportObj = {}
            for (const k of keys) {
                exportObj[k] = GM_SuperValue.get(k, [])
            }
            downloadObjectAsJson(exportObj, "ffl_export")
        }
    
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

        removeNulls() {
            for (const category of this.categories) {
                const ls = this.updateList(category)
                const newList = ls.filter(i => i !== null)
                GM_SuperValue.set(category, newList)
                this.lists[category] = newList;
            }
        }

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

        lookup(id, json) {
            const rvalue = []
            const log = (msg) => { if (!json) { console.log(msg) } }
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
            if (json) {
                return rvalue;
            }
        }
    }

    class FlickrFaveListTwin extends FlickrFaveList {
        constructor() {
            super()

            this.awaitController().then(() => {
                this.hideAll()
                this.pushPhotoInfo()
            })
            this.createAdvancedPanel()
        }

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

        async hideAll() {
            await this.awaitController()
            for (const list of Object.values(this.lists)) {
                this.c.hide(list)
            }
            console.log("All lists hidden")
        }

        async pushPhotoInfo() {
            await this.awaitController()
            const db = GM_SuperValue.get("db", [])
            for (const photo of db) {
                this.c.idb.addPhoto(photo)
            }
            iqwerty.toast.toast('Photo info synced from extension')
        }

        async pullPhotoInfo() {
            await this.awaitController()
            await this.pushPhotoInfo()
            const newdb = [].concat(...Object.values(this.lists))
                .map(i => this.c.idb.get(i))
                .filter(i => i)
                .map(p => {return {id:p.id, owner:p.owner, secret:p.secret, server:p.server}})
            GM_SuperValue.set("db", newdb)
            iqwerty.toast.toast('Photo info synced to extension')
        }

        createAdvancedPanel() {
            if (document.getElementById("control-advanced-dynamic") == null) {
                const fold = document.getElementById("control-advanced-fold")
                fold.insertAdjacentHTML("beforeend", `<div id="control-advanced-dynamic"></div>`)
            }
            const ap = document.getElementById("control-advanced-dynamic");
            ap.insertAdjacentHTML("beforeend", `<form id="ffl-lists"></form>`)
            const checkboxForm = document.getElementById("ffl-lists");

            for (let [cat, list] of Object.entries(this.lists)){
                let label = `${cat} (${list.length})`
                let newHTML = `<label class="ffl-list-check"><input type="checkbox" id="ffl-lists-${cat}" name="ffl-lists" value="${cat}"><span>${label}</span></label> `
                checkboxForm.insertAdjacentHTML("beforeend", newHTML)
            }

            const getChecked = () => {return [...checkboxForm.getElementsByTagName("input")].filter(e => e.checked).map(e => e.value)}
            const allCheckedItems = () => [].concat(...(getChecked().map(cat => this.lists[cat])))

            ap.insertAdjacentHTML("beforeend", 
            `<div>
                <button id="ffl-display-lists">Display lists</button>
                <button id="ffl-paginate-lists">Paginate lists</button>
                <button id="ffl-process-lists">Process lists</button>
            </div>`)
            document.getElementById("ffl-display-lists").addEventListener('click', () => { this.printLists(getChecked()) })
            document.getElementById("ffl-paginate-lists").addEventListener('click', () => { this.c.r.displayImages({ids:allCheckedItems()}) })
            document.getElementById("ffl-process-lists").addEventListener('click', () => { this.c.processPhotos(allCheckedItems()) })

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
            </style>`)
        }

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
    }

    class FlickrFaveListPhotoPage extends FlickrFaveList {
        constructor() {
            super()
            this.url = window.location.href
            this.photoID = window.location.href.match(/flickr\.com\/photos\/[^/]+\/(\d+)[/$]/)[1]
            this.checkIf404()
            this.createControlPanel()
            this.lookup(this.photoID) //Prints stored url to console
            this.addPhotoStreamLinkIfAbsent()
            //the link gets removed from the page after a while for some reason. Bodge to fix that.
            this.pslinkinterval = setInterval(() => { if (document.hasFocus()) this.addPhotoStreamLinkIfAbsent() }, 1000);
        }

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

        addPhotoStreamLinkIfAbsent() {
            const userID = window.location.href.match(/flickr\.com\/photos\/([\w-]+|\d+@N\d\d)\/\d+[/$]/i)[1]
            const psURL = `/photos/${userID}/with/${this.photoID}/`
            const backlinks = [...document.querySelectorAll(".entry-type.do-not-evict")]
            if (backlinks[0] && backlinks.every(e => !e.href.match(psURL))) {
                const newLink = `<a class="entry-type do-not-evict no-outline" style="top: 38px" href="${psURL}"><div class="icon"></div> Back to photostream</a>`
                backlinks[0].insertAdjacentHTML("afterend", newLink)
            }
        }

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

    class FlickrFaveListPhotoList extends FlickrFaveList {
        constructor() {
            super()
            this.url = window.location.href
            this.addCSS()
            this.catPillsEvent = {
                adding: false,
                queued: false
            }
            document.addEventListener('scroll', () => {
                this.queueCatPills()
            })
            window.setTimeout( () => { this.addCatPills() }, 1000)
        }

        getPhotoIDFromURL(url) {
            return url.match(/flickr\.com\/photos\/[^/]+\/(\d+)[/$]/)[1]
        }

        queueCatPills() {
            if (!this.catPillsEvent.adding) {
                this.addCatPills()
            } else if (!this.catPillsEvent.queued) {
                this.catPillsEvent.queued = true;
                window.setTimeout( () => {
                    this.addCatPills();
                    this.catPillsEvent.queued = false;
                }, 250)
            }
        }

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
                for (const c of ffl.lookup(this.getPhotoIDFromURL(elem.href),1)) {
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

    let ffl
    if (window.location.href.match("srsutherland.github.io/flickr-twin/")) {
        ffl = new FlickrFaveListTwin()
    } else if (window.location.href.match(/flickr\.com\/photos\/([^/]+)\/(\d+)[/$]/)) {
        ffl = new FlickrFaveListPhotoPage()
    } else if (window.location.href.match(/flickr\.com\/photos\/([^/]+)($|\/($|page\d+|with))/)) {
        ffl = new FlickrFaveListPhotoList()
    } else if (window.location.href.match(/flickr\.com\/photos\/([^/]+)\/favorites($|\/($|page\d+|with))/)) {
        ffl = new FlickrFaveListPhotoList()
    } else {
        ffl = new FlickrFaveList()
    }
    unsafeWindow.ffl = ffl
})();