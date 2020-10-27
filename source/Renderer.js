'use strict';

// eslint-disable-next-line no-unused-vars
class Renderer {
    constructor(controller) {
        this.c = controller;
        this.idb = controller.idb;
        this.udb = controller.udb;
        this.renderParent = null;
        this.displaying = null;
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
        this.renderParent.innerHTML += newHTML;
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
     * @param {number} max_count - Number of users to print
     */
    print_results(max_count = 30) {
        let twins_list = this.udb.sortedList(max_count);

        for (const twin of twins_list) {
            const favecount = twin.favecount;
            const name = twin.realname ? twin.realname : twin.username;
            const nsid = twin.nsid;
            console.log(`${favecount}: ${name} (https://www.flickr.com/photos/${nsid}/favorites)`);
        }
    }

    displayImages(opts = {}) {
        const defaultOpts = {
            page: 1,
            per_page: 20
        };
        // Merge opts with default ops
        opts = { ...defaultOpts, ...opts };
        // Assign images
        let images = opts.images
        if (images == null) {
            if (opts.ids) {
                images = [...opts.ids].map(id => this.idb.get(id))
                opts.mode = "by_id"
            } else if (opts.excluding || opts.mode == "excluding") {
                const excluding = [...this.c.processed_images, ...this.c.excluded, ...this.c.hidden];
                images = this.idb.sortedListExcluding(excluding);
                opts.mode = "excluding"
            } else if (opts.all || opts.mode == "all") {
                images = this.idb.sortedList()
                opts.mode = "all"
            } else {
                const excluding = [...this.c.processed_images, ...this.c.excluded, ...this.c.hidden];
                images = this.idb.sortedListExcluding(excluding)
                const minfavecount = images[0].favecount / 5
                if (images[0].favecount > 2) {
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
        this.addImageCSS()
        this.addPaginationCSS()
        this.clear()
        this.renderPagination(cur, max)
        this.renderImages(images_onscreen)
        this.renderPagination(cur, max)
        // Set state
        this.displaying = { ...opts, f: this.displayImages, images: images, images_onscreen: images_onscreen }
    }

    /**
     * Add CSS to the document for styling the image view
     */
    addImageCSS() {
        if (document.getElementById("flickr-twin-img-css") == undefined) {
            document.head.innerHTML +=
                `<style id="flickr-twin-img-css">
                    .img-container {
                        margin: 5px;
                        background: rgba(84,91,94,.5);
                    }
                    .flex {
                        display: flex;
                        flex-wrap: wrap;
                    }
                </style>`;
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
        return `<a href="${img.url}">
                <div class="img-container">
                    <div><img src="${img.imgUrl}"></div>
                    <div>${img.favecount ? img.favecount + " faves" : ""}</div>
                </div>
                </a>`;
    }

    /**
     * Renders each of the given images in the render area
     * @param {Array} image_list - List of images to display
     * @returns {Renderer} - A reference to this Renderer
     */
    renderImages(image_list) {
        this.addImageCSS();
        let newHTML = `<div class="flex">`;
        for (const img of image_list) {
            newHTML += this.imageHTML(img);
        }
        this.appendHTML(newHTML + `</div>`);
        return this;
    }

    displayImagesByIDs(id_list) {
        const image_list = id_list.map(id => this.idb.get(id)).filter(Boolean);
        this.displaying = { images: image_list }
        this.clear().renderImages(image_list);
    }

    /**
     * Returns an array representing which page buttons to display, similar to the way Flickr
     *  does pagination. Always displays the first two pages, 7 pages adjacent to the current page,
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
        if (cur > 1) {
            newHTML +=
                `<a href="#" rel="prev" data-page="previous">
                    <span><i class="page-arrow"></i></span>
                </a>\n`
        } else {
            newHTML += `<span class="disabled"><i class="page-arrow"></i></span>`
        }
        for (const pagenum of this.paginationArray(cur, max)) {
            if (pagenum >= 1) {
                newHTML +=
                    `<a href="#" data-page="${pagenum}">
                        <span${pagenum == cur ? ` class="is-current"` : ``}>${pagenum}</span>
                    </a>\n`
            } else {
                newHTML += `<span class="moredots">•••</span>\n`
            }
        }
        if (cur < max) {
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

    /**
     * Add CSS to the document for styling the pagination buttons
     */
    addPaginationCSS() {
        if (document.getElementById("flickr-twin-page-css") == undefined) {
            document.head.innerHTML +=
                `<style id="flickr-twin-page-css">
                    .pagination-view {
                        margin: 10px auto;
                        text-align: center;
                        min-height: 20px;
                    }
                    
                    .pagination-view a {
                        text-decoration-color: initial;
                    }
                    
                    .pagination-view a {
                        text-decoration: none;
                        display: inline-block;
                        border-radius: 3px;
                    }
                    
                    .pagination-view span {
                        color: rgb(157, 149, 136);
                    }
                    
                    .pagination-view span {
                        display: inline-block;
                        box-sizing: border-box;
                        min-width: 32px;
                        height: 32px;
                        padding: 0 10px;
                        line-height: 32px;
                        color: #898989;
                        text-align: center;
                        border-radius: 3px;
                        cursor: pointer;
                        vertical-align: top;
                        transition: background-color .15s ease-in-out;
                    }
                    
                    .pagination-view span.is-current {
                        background-image: initial;
                        background-color: rgb(0, 113, 178);
                        color: rgb(232, 230, 227);
                    }
                    
                    .pagination-view span.is-current {
                        background: #008ddf;
                        color: #fff;
                        font-weight: 600;
                    }
                    
                    .pagination-view a:hover span {
                        box-shadow: rgb(0, 113, 178) 0px 0px 0px 2px inset;
                    }
                    
                    .pagination-view i {
                        display: inline-block;
                        position: relative;
                        top: 3px;
                    }
                    
                    .pagination-view .page-arrow {
                        background: url(https://combo.staticflickr.com/ap/build/images/sprites/icons-cc4be245.png) -542px -334px no-repeat;
                        width: 8px;
                        height: 18px;
                    }
                    
                    .pagination-view .page-arrow.right {
                        -webkit-transform: rotate(180deg);
                        transform: rotate(180deg);
                    }

                    .pagination-view .disabled .page-arrow {
                        display: none;
                    }
                </style>`;
        }
    }
}
