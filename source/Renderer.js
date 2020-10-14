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

    displayImages(max_count = 100, page = 1) {
        this.addImageCSS();
        document.body.classList.add("flex");
        document.body.innerHTML = "";
        const starting_from = (page - 1) * max_count;
        for (const img of this.idb.sortedList(max_count, starting_from)) {
            document.body.innerHTML += this.imageHTML(img);
        }
    }

    displayUnseenImages(max_count = 100, page = 1) {
        this.addImageCSS();
        document.body.classList.add("flex");
        document.body.innerHTML = "";
        const starting_from = (page - 1) * max_count;
        for (const img of this.idb.sortedListExcluding(this.c.processed_images, max_count, starting_from)) {
            if (!this.c.processed_images[img.id]) {
                document.body.innerHTML += this.imageHTML(img);
            }
        }
    }
}
// eslint-disable-next-line no-unused-vars
const r = new Renderer();
