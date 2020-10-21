'use strict';

// eslint-disable-next-line no-unused-vars
class Renderer {
    constructor(controller) {
        this.c = controller;
        this.idb = controller.idb;
        this.udb = controller.udb;
        this.renderParent = null;
    }

    clear() {
        if (this.renderParent == null) this.renderParent = document.body;
        this.renderParent.innerHTML = "";
        return this;
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

    displayImages(image_list) {
        this.addImageCSS();
        let newHTML = `<div class="flex">`;
        for (const img of image_list) {
            newHTML += this.imageHTML(img);
        }
        this.renderParent.innerHTML += newHTML + `</div>`;
        return this;
    }

    displayImagesByIDs(id_list) {
        const image_list = id_list.map(id => this.idb.get(id)).filter(Boolean);
        this.clear().displayImages(image_list);
    }

    displayAllImages(max_count = 100, page = 1) {
        const starting_from = (page - 1) * max_count;
        const image_list = this.idb.sortedList(max_count, starting_from);
        this.clear().displayImages(image_list);
    }

    displayUnseenImages(max_count = 100, page = 1) {
        const starting_from = (page - 1) * max_count;
        const excluding = [...this.c.processed_images, ...this.c.excluded, ...this.c.hidden];
        const image_list = this.idb.sortedListExcluding(excluding, max_count, starting_from);
        this.clear().displayImages(image_list);
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
