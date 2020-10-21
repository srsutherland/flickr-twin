'use strict';

// eslint-disable-next-line no-unused-vars
class Renderer {
    constructor(controller) {
        this.c = controller;
        this.idb = controller.idb;
        this.udb = controller.udb;
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
        document.body.innerHTML = newHTML + `</div>`;
    }

    displayImagesByIDs(id_list) {
        const image_list = id_list.map(id => this.idb.get(id)).filter(Boolean);
        this.displayImages(image_list);
    }

    displayAllImages(max_count = 100, page = 1) {
        const starting_from = (page - 1) * max_count;
        const image_list = this.idb.sortedList(max_count, starting_from);
        this.displayImages(image_list);
    }

    displayUnseenImages(max_count = 100, page = 1) {
        const starting_from = (page - 1) * max_count;
        const excluding = [...this.c.processed_images, ...this.c.excluded, ...this.c.hidden];
        const image_list = this.idb.sortedListExcluding(excluding, max_count, starting_from);
        this.displayImages(image_list);
    }
}
