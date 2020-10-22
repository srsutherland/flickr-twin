'use strict';

// eslint-disable-next-line no-unused-vars
class Renderer {
    constructor(controller) {
        this.c = controller;
        this.idb = controller.idb;
        this.udb = controller.udb;
        this.renderParent = null;
        this.displaying = null;
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
            per_page: 50,
            mode: "excluding"
        };
        // Merge opts with default ops
        opts = { ...defaultOpts, ...opts };
        // Assign images
        let images = opts.images
        if (images == null) {
            const excluding = [...this.c.processed_images, ...this.c.excluded, ...this.c.hidden];
            images = this.idb.sortedListExcluding(excluding);
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
        this.clear()
        this.renderPagination(cur, max)
        this.renderImages(images_onscreen)
        this.renderPagination(cur, max)
        // Set state
        this.displaying = { ...opts, f: this.displayImages, images: images, images_onscreen: images_onscreen }
    }

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

    imageHTML(img) {
        return `<a href="${img.url}">
      <div class="img-container">
        <div><img src="${img.imgUrl}"></div>
        <div>${img.favecount} faves</div>
      </div>
    </a>`;
    }

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
        this.clear().renderImages(image_list);
    }

    displayAllImages(max_count = 100, page = 1) {
        const starting_from = (page - 1) * max_count;
        const image_list = this.idb.sortedList(max_count, starting_from);
        this.clear().renderImages(image_list);
    }

    displayUnseenImages(max_count = 100, page = 1) {
        const starting_from = (page - 1) * max_count;
        const excluding = [...this.c.processed_images, ...this.c.excluded, ...this.c.hidden];
        const image_list = this.idb.sortedListExcluding(excluding, max_count, starting_from);
        this.clear().renderImages(image_list);
    }

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

    paginationHTML(cur, max) {
        let newHTML = `<div class="pagination-view">`
        if (cur > 1) {
            newHTML +=
                `<a href="#" rel="prev" data-track="paginationLeftClick">
                    <span><i class="page-arrow"></i></span>
                </a>\n`
        }
        for (const pagenum of this.paginationArray(cur, max)) {
            if (pagenum >= 1) {
                newHTML +=
                    `<a href="#" data-track="pagination${pagenum}Click">
                        <span ${pagenum == cur ? `class="is-current"` : ``}>${pagenum}</span>
                    </a>\n`
            } else {
                newHTML += `<span class="moredots">•••</span>\n`
            }
        }
        if (cur < max) {
            newHTML +=
                `<a href="#" rel="next" data-track="paginationRightClick">
                    <span><i class="page-arrow right"></i></span>
                </a>`
        }
        return newHTML + `</div>`;
    }

    renderPagination(cur, max) {
        this.appendHTML(this.paginationHTML(cur, max));
        return this;
    }

    // todo: remove test code
    _printPaginationArray(list, cur) {
        let str = "[<]"
        for (let i of list) {
            if (i >= 1) {
                if (i == cur) {
                    str += ` *${i < 10 ? " " + i : i}*`
                } else {
                    str += ` [${i < 10 ? " " + i : i}]`
                }
            } else {
                str += `[..]`
            }
        }
        console.log(str + "[>]")
    }

    // todo: remove test code
    _testPaginationArray(max) {
        for (let cur = 1; cur <= max; cur++) {
            this._printPaginationArray(this.paginationArray(cur, max), cur)
        }
    }
}
