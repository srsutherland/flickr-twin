/**
 * Layer in charge of directly interacting with the HTML
 */
export class Renderer {
    /**
     * Create a new Renderer
     * @param {import ('./Controller').Controller} controller 
     */
    constructor(controller) {
        this.c = controller;
        this.idb = controller.idb;
        this.udb = controller.udb;
        this.renderParent = null;
        this.displaying = null;
        // Left and right arrow key pagination
        document.addEventListener("keydown", this.paginationKeypressHandler.bind(this))
    }

    /**
     * Clears the render area, or the body if none is assigned
     * @returns {Renderer} A reference to the calling object
     */
    clear() {
        if (!(this.renderParent instanceof Element)) {
            this.renderParent = null
            console.warn("Warning: r.renderParent was not instanceof Element, setting to null")
        }
        if (this.renderParent == null) {
            this.renderParent = document.body;
        }
        this.renderParent.innerHTML = "";
        return this;
    }

    /**
     * Appends HTML to the render parent node
     * @param {string} newHTML 
     * @returns {Renderer} A reference to the calling object
     */
    appendHTML(newHTML) {
        this.renderParent.insertAdjacentHTML("beforeend", newHTML);
        return this;
    }

    /**
     * Render the next page in a paginated display
     */
    next() {
        if (this.displaying.page >= this.displaying.max_page) {
            return;
        }
        this.displaying.page += 1;
        this.displaying.f.call(this, this.displaying)
    }

    /**
     * Render the previous page in a paginated display
     */
    previous() {
        if (this.displaying.page <= 1) {
            return;
        }
        this.displaying.page -= 1;
        this.displaying.f.call(this, this.displaying)
    }

    /**
     * Render the specified page in a paginated display
     * @param {number | string} page 
     */
    gotoPage(page) {
        this.displaying.page = page;
        this.displaying.f.call(this, this.displaying)
    }

    /**
     * Print the top result for user twins to the console
     * @param {number} max_count - Number of users to print (default: 30)
     * @param {boolean} recalculate - recalculate scores before printing (default: true)
     */
    print_results(max_count = 30, recalculate=true) {
        let twins_list = this.udb.sortedList(max_count);

        for (const twin of twins_list) {
            const favecount = twin.favecount;
            const name = twin.realname ? twin.realname : twin.username;
            const nsid = twin.nsid;
            console.log(`${favecount}: ${name} (https://www.flickr.com/photos/${nsid}/favorites)`);
        }
    }

    /**
     * Main function to display images. Takes an object with the following properties:
     * @param {Object} opts - Options object
     * @param {Array[Object]} [opts.images] - List of image objects to display. If directly provided, skips mode selection
     * @param {number} [opts.page] - Page number to display
     * @param {number} [opts.per_page] - Number of images to display per page
     * @param {boolean} [opts.recalculate] - Recalculate scores before displaying
     * @param {string} [opts.mode] - Mode of display. Has the following options:
     *  - "all" - Display all images
     *  - "excluding" - Display all images excluding hidden images
     *  - "by_id" - Display images by id
     *  - "default" - Display images excluding hidden images, with a minimum favecount. Default if no other mode is triggered
     * @param {boolean} [opts.all] - Display all images. The same as setting mode to "all"
     * @param {boolean} [opts.excluding] - Display all images excluding hidden images. The same as setting mode to "excluding"
     * @param {Array[string]} [opts.ids] - List of image ids to display. If provided, sets mode to "by_id"
     * @param {string} [opts.image_size] - A single character Flickr image size, or size in px. (@see resizeImages() for more info)
     */
    displayImages(opts = {}) {
        const defaultOpts = {
            page: 1,
            per_page: 20,
            recalculate: true,
        };
        // Guess input if opts is an array
        if (Array.isArray(opts)) {
            const inputArray = opts
            if (inputArray.every(i => typeof i === 'string')) {
                opts = {ids: inputArray};
                console.warn("Assuming input is array of ids; Use displayImages({ids: arry}) instead");
            } else if (inputArray.every(i => typeof i === 'object' && i.id != undefined)) {
                opts = {images: inputArray};
                console.warn("Assuming input is array of images; Use displayImages({images: arry}) instead");
            } else {
                throw new TypeError("Unknown list type passed to displayImages()");
            }
        }
        // Merge opts with default ops
        opts = { ...defaultOpts, ...opts };
        // Assign images
        let images = opts.images
        if (images == null) {
            if (opts.ids) {
                images = [...opts.ids].map(id => this.idb.get(id))
                opts.mode = "by_id"
            } else if (opts.excluding || opts.mode == "excluding") {
                images = this.idb.sortedListExcluding(this.c.getHidden(), calculateScores=opts.recalculate);
                opts.mode = "excluding"
            } else if (opts.all || opts.mode == "all") {
                if (opts.recalculate) { this.udb.calculateScores() }
                images = this.idb.sortedList(calculateScores=opts.recalculate)
                opts.mode = "all"
            } else {
                this.udb.calculateScores()
                images = this.idb.sortedListExcluding(this.c.getHidden(), calculateScores=opts.recalculate)
                const minfavecount = images[0]?.favecount / 5
                if (images[0]?.favecount > 2) {
                    images = images.filter(i => i.favecount > minfavecount);
                }
                opts.mode = "default"
            }
        }
        // Extract variables
        const per_page = Number(opts.per_page);
        opts.page = Number(opts.page);
        const cur = opts.page;
        const max = Math.ceil(images.length / per_page);
        opts.max_page = max;
        const images_onscreen = images.slice(per_page * (cur - 1), per_page * cur);
        // Render
        this.clear()
        this.renderPagination(cur, max)
        this.renderImages(images_onscreen, opts.image_size)
        this.renderPagination(cur, max)
        // Set state
        this.displaying = { ...opts, f: this.displayImages, images: images, images_onscreen: images_onscreen }
    }

    /**
     * Filter (and optionally alter the score of) the currently displayed objects
     * @param {function} filterFunction - function to filter the images. 
     *      Should take images objects as the argument.
     * @param {function} optionalScoreMapFunction - function to map the image scores (non-destructively). 
     *      Should takes images objects as the argument and return a number.
     *      Sorts the list after applying.
     */
    filterDisplaying(filterFunction, optionalScoreMapFunction) {
        if (!this.displaying || !this.displaying.images) {
            throw new Error("Not currently displaying any images")
        }
        if (this.displaying.images_unfiltered === undefined) {
            this.displaying.images_unfiltered = this.displaying.images
        }
        if (filterFunction) {
            this.displaying.images = this.displaying.images_unfiltered.filter(filterFunction)
        }
        if (optionalScoreMapFunction) {
            this.displaying.images = this.displaying.images.map(
                i => Object.assign(Object.assign({}, i), {score: optionalScoreMapFunction(i)})
            ).sort((a, b) => b.score - a.score)
        }
        this.displaying.f.call(this, this.displaying)
    }

    /**
     * Resize displayed images to another valid size, between 75 px and 1024 px
     * @param {string|number} size - single character Flickr image size, or size in px. 
     *      If invalid, show list 
     */
    resizeImages(size) {
        const sizes = ["s", "q", "t", "m", "n", "w", "z", "c", "b"]
        if (typeof size === 'number') {
            size = {
                75: 's',
                150: 'q',
                100: 't',
                240: 'm',
                320: 'n',
                400: 'w',
                500: '(none)',
                640: 'z',
                800: 'c',
                1024: 'b'
            }[size]
        }
        if (!sizes.includes(size)) {
            console.warn("s	thumbnail	75	cropped square\n" +
            "q	thumbnail	150	cropped square\n" +
            "t	thumbnail	100\n" +
            "m	small	240\n" +
            "n	small	320\n" +
            "w	small	400\n" +
            "(none)	medium	500\n" +
            "z	medium	640\n" +
            "c	medium	800\n" +
            "b	large	1024\n" +
            "h	large	1600	has a unique secret\n" +
            "k	large	2048	has a unique secret\n" +
            "3k	extra large	3072	has a unique secret\n" +
            "4k	extra large	4096	has a unique secret\n" +
            "f	extra large	4096	has a unique secret; only exists for 2:1 aspect ratio photos\n" +
            "5k	extra large	5120	has a unique secret\n" +
            "6k	extra large	6144	has a unique secret\n")
        } else {
            this.displaying.image_size = size
            this.displaying.f.call(this, this.displaying)
        }
    }

    /**
     * Return the html represention of a given image
     * @param {Object} img - An object representing a Flickr image, with the following properties:
     *      imgUrl - Url leading to the image file at a thumbnail resolution 
     *          (`https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_m.jpg`)
     *      url - Url of the image page 
     *          (`https://www.flickr.com/photos/${owner.nsid}/${photo.id}/`)
     *      favecount (optional) - Number of faves (by processed users) the image has received 
     * @returns {string} - A string of the html to display the given object
     */
    imageHTML(img) {
        if (img == null) {
            return `<div><a class="img-link"><div class="img-container"><div><img src="media/icon-missing.png"></div></div></a></div>`
        }
        return `<div>
                    <a href="${img.url}" target="_blank" class="img-link">
                        <div class="img-container" data-id="${img.id}">
                            <div><img src="${img.imgUrl}"></div>
                            <div>${img.score ? img.score.toFixed(2) : ""}${img.score && img.favecount ? " ‧ " : ""}${img.favecount ? img.favecount + " faves" : ""}</div>
                        </div>
                    </a>
                </div>`;
    }

    /**
     * Renders each of the given images in the render area
     * @param {Array} image_list - List of images to display
     * @param {string} [size] (optional) - Flickr image size char
     * @returns {Renderer} - A reference to this Renderer
     */
    renderImages(image_list, size = undefined) {
        let newHTML = `<div class="flex">`;
        for (const img of image_list) {
            let imgHTML = this.imageHTML(img);
            if (size !== undefined) {
                imgHTML = imgHTML.replace(/(\d+)_([a-f0-9]+)(_.)?\.jpg/, `$1_$2_${size}.jpg`)
            }
            newHTML += imgHTML;
        }
        this.appendHTML(newHTML + `</div>`);
        return this;
    }

    /**
     * Takes a list of image ids and displays them all on a single page.
     * @param {Array} id_list 
     */
    displayImagesByIDs(id_list) {
        const image_list = id_list.map(id => this.idb.get(id)).filter(img => img != null);
        this.displaying = { images: image_list }
        this.clear().renderImages(image_list);
    }

    /**
     * Display the top matching flicker twins
     * @param {number} max_count - Number of users to print
     */
    displayTwins(max_count = 30) {
        let twins_list = this.udb.sortedList(max_count);
        this.clear()
        this.renderUsers(twins_list)
        this.displaying = { f: this.displayTwins, users: twins_list }
    }

    renderUsers(user_list)  {
        let newHTML = `<div class="flex centered">`;
        for (const user of user_list) {
            newHTML += this.userHTML(user);
        }
        this.appendHTML(newHTML + `</div>`);
        return this;
    }

    userHTML(user) {
        if (user == null) {
            return `
            <li class="person"><a><span class="person-icon">
                <span class="circle-icon"><img src="media/icon-missing.png"></span>
                <span class="person-name"><span class="person-displayname">NULL</span></span>
            </span></a></li>`
        }
        return `
        <li class="person">
            <a href="https://www.flickr.com/photos/${user.nsid}/favorites/">
                <span class="person-icon">
                    <span class="circle-icon">
                        <img src="${user.buddyicon}">
                    </span>
                    <span class="person-name">
                        <span class="person-displayname">${user.name}</span>
                        <span class="person-username">${user.username}</span>
                    </span>
                    <span class="person-favecount">
                        (${user.favecount})
                    </span>
                </span>
            </a>
        </li>
        `
    }

    /**
     * Returns an array representing which page buttons to display, similar to the way Flickr
     *  shows pagination. Always displays the first two pages, 7 pages adjacent to the current page,
     *  and the last two pages. Omitted pages are represented by a single item of "-1"
     * @param {number} cur - Current page 
     * @param {number} max - Total number of pages
     * @returns {Array} - Array of numbers
     */
    paginationArray(cur, max) {
        const pagelist = []
        // Flank the current page by 3 adjacent pages, except at the beginning and end
        const curLeftFlank = Math.min(cur - 3, max - 6)
        const curRightFlank = Math.max(cur + 3, 7)
        for (let i = 1; i <= max; i++) {
            if (i > 2 && i < curLeftFlank) {
                i = curLeftFlank;
                pagelist.push(-1) //converted to dots
            } else if (i > curRightFlank && i < max - 2) {
                i = max - 1
                pagelist.push(-1) //converted to dots
            }
            pagelist.push(i)
            if (pagelist.length > max) break;
        }
        return pagelist
    }

    /**
     * Returns the html to display pagination buttons
     * @param {number} cur - Current page 
     * @param {number} max - Total number of pages
     * @returns {string} - Pagination HTML
     */
    paginationHTML(cur, max) {
        let newHTML = `<div class="pagination-view">`
        // Left arrow
        if (cur > 1) { // Don't display on first page
            newHTML +=
                `<a href="#" rel="prev" data-page="previous">
                    <span><i class="page-arrow"></i></span>
                </a>\n`
        } else {
            newHTML += `<span class="disabled"><i class="page-arrow"></i></span>`
        }
        // Numbered buttons
        for (const pagenum of this.paginationArray(cur, max)) {
            if (pagenum >= 1) { // Real page
                newHTML +=
                    `<a href="#" data-page="${pagenum}">
                        <span${pagenum == cur ? ` class="is-current"` : ``}>${pagenum}</span>
                    </a>\n`
            } else { // -1, i.e. dots
                newHTML += `<span class="moredots">•••</span>\n`
            }
        }
        // Right arrow
        if (cur < max) { // Don't display on last page
            newHTML +=
                `<a href="#" rel="next" data-page="next">
                    <span><i class="page-arrow right"></i></span>
                </a>`
        } else {
            newHTML += `<span class="disabled"><i class="page-arrow right"></i></span>`
        }
        return newHTML + `</div>`;
    }

    /**
     * Attach listeners and handlers to each pagination button
     */
    addPaginationListeners() {
        for (const a of document.querySelectorAll(".pagination-view a")) {
            a.addEventListener('click', this.paginationClickHandler.bind(this))
        }
    }

    /**
     * Handle clicks on pagination buttons
     * @param {MouseEvent} event - The triggering mouse click
     */
    paginationClickHandler(event) {
        let elem = event.target;
        while (elem.dataset.page == undefined) {
            elem = elem.parentElement;
        }
        const page = elem.dataset.page;
        if (page == 'next') {
            this.next()
        } else if (page == 'previous' || page == 'prev') {
            this.previous()
        } else if (page >= 1) {
            this.gotoPage(page)
        }
    }

    /**
     * Handles pagination using the left and right arrow keys
     * @param {KeyboardEvent} event - The triggering keydown event
     */
    paginationKeypressHandler(event) {
        const key = event.key;
        if (key == "ArrowRight") {
            this.next()
        } else if (key == "ArrowLeft") {
            this.previous()
        }
    }

    /**
     * Renders the pagination for the current display
     * @param {number} cur - Current page 
     * @param {number} max - Total number of pages
     * @returns {Renderer} - A reference to this Renderer
     */
    renderPagination(cur, max) {
        this.appendHTML(this.paginationHTML(cur, max));
        this.addPaginationListeners()
        return this;
    }

    displayProgress(percentage, message) {
        let progressbar_div
        let message_div
        
        if (!this.displaying || this.displaying.f != this.displayProgress) {
            this.clear()
            this.appendHTML(`
            <div class="flex centered">
                <div id="loading">
                    <div id="progressbar">
                        <div id="progress" style="width: 0%"></div>
                    </div>
                    <div id="message"></div>
                </div>  
            </div>
            `);
            progressbar_div = document.getElementById("progress")
            message_div = document.getElementById("message")
        } else {
            progressbar_div = this.displaying.progressbar_div
            message_div = this.displaying.message_div
        }

        progressbar_div.style.width = percentage + "%"
        if (message) {
            message_div.textContent = message
        }

        this.displaying = { 
            f: this.displayProgress, percentage: percentage, message: message, 
            progressbar_div: progressbar_div, message_div: message_div 
        }
    }

    errorMessage(message) {
        this.clear()
        this.appendHTML(`
        <div class="flex centered errormessage">
            ${message}  
        </div>
        `);
        console.error("displaying: " + message)
        this.displaying = { 
            f: this.errorMessage, message: message
        }
    }

    warnMessage(message) {
        this.clear()
        this.appendHTML(`
        <div class="flex centered warnMessage">
            ${message}  
        </div>
        `);
        console.warn("displaying: " + message)
        this.displaying = { 
            f: this.warnMessage, message: message
        }
    }
}
