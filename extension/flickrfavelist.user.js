// ==UserScript==
// @name         Flickr Fave List
// @namespace    https://srsutherland.github.io/flickr-twin/
// @version      0.2
// @description  Companion to flickr twin finder to maintain multiple lists
// @author       srsutherland
// @match        https://srsutherland.github.io/flickr-twin/*
// @match        https://www.flickr.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @require      http://userscripts-mirror.org/scripts/source/107941.user.js
// @require      https://greasyfork.org/scripts/408787-js-toast/code/js-toast.js?version=837479
// ==/UserScript==

(function() {
    'use strict';
    // eslint-disable-next-line no-redeclare
    /* global GM_SuperValue, unsafeWindow, iqwerty */
    class FlickrFaveList {
        constructor() {
            this.categories = GM_SuperValue.get("categories", [])
            this.subcategories = GM_SuperValue.get("subcategories", [])
            this.lists = {};
            for (const cat of this.categories) {
                this.lists[cat] = GM_SuperValue.get(cat, [])
            }
            let logText = ""
            for (const cat of this.categories) {
                logText += `${cat} (${this.lists[cat].length}), `
            }
            console.log(logText)
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

        addItem(category, id) {
            const ls = GM_SuperValue.get(category, [])
            this.lists[category] = ls
            if (!ls.includes(id)) {
                ls.push(id)
                GM_SuperValue.set(category, ls)
            }
        }

        addSourceUrl(id, url) {
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
            for (const cat of this.categories) {
                const ndx = this.lists[cat].indexOf(id)
                if (ndx !== -1) {
                    rvalue.push({category: cat, ndx: ndx})
                    if (!json) {
                        console.log(`"${id}" in "${cat}" at position${ndx}`)
                    }
                }
            }
        }
    }

    class FlickrFaveListTwin extends FlickrFaveList {
        constructor() {
            super()

            this.awaitController().then(() => {
                this.hideAll()
                this.syncPhotoInfo()
            })
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

        async printLists(categories = this.categories) {
            await this.awaitController()
            await this.syncPhotoInfo()
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

        async hideAll() {
            await this.awaitController()
            for (const list of Object.values(this.lists)) {
                this.c.hide(list)
            }
            console.log("All lists hidden")
        }

        async syncPhotoInfo() {
            await this.awaitController()
            const db = GM_SuperValue.get("db", [])
            for (const photo of db) {
                this.c.idb.addPhoto(photo)
            }
            iqwerty.toast.toast('Photo info synced from extension')
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
        }

        createControlPanel() {
            try {
                this.cp = document.createElement("div")
                this.cp.id = "ffl_control_panel"
                const underPhoto = document.querySelector(".sub-photo-container.centered-content")
                underPhoto.insertAdjacentElement("afterbegin", this.cp)
                for (const cat of this.categories) {
                    const selected = this.lists[cat].includes(this.id) ? "ffl-cat-selected" : "";
                    this.cp.insertAdjacentHTML("beforeend", ` <button class="ffl-cat-button ${selected}" id="${cat}-button">${cat}</button>`)
                    const catButton = document.getElementById(`${cat}-button`)
                    catButton.addEventListener('click', () => {
                        this.addItem(cat, this.id)

                    })
                }
            } catch (e) {
                console.error(e)
            }   
        }

        checkIf404() {
            urlExists(this.url).then( ok => {
                if (!ok) {
                    this.addItem("e404", this.id)
                    this.addSourceUrl(this.id, this.url)
                    iqwerty.toast.toast(`Added "${this.id}" to 404 ignore list`)
                }
            })
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

    if (window.location.href.match("srsutherland.github.io/flickr-twin/")) {
        if (unsafeWindow.c) {
            //controllerLoaded();
          } else {
            Object.defineProperty(unsafeWindow, 'c', {
              configurable: true,
              enumerable: true,
              get: function() {
                return this._c;
              },
              set: function(val) {
                this._c = val;
                //controllerLoaded();
              }
            });
          }
    }

    let ffl
    if (window.location.href.match("srsutherland.github.io/flickr-twin/")) {
        ffl = new FlickrFaveListTwin()
    } else if (window.location.href.match(/flickr\.com\/photos\/[^/]+\/(\d+)[/$]/)) {
        ffl = new FlickrFaveListPhotoPage()
    } else {
        ffl = new FlickrFaveList()
    }
    unsafeWindow.ffl = ffl
})();