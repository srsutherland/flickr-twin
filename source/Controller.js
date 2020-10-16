'use strict';

// eslint-disable-next-line no-unused-vars
class Controller {
    constructor() {
        /* eslint-disable no-undef */
        this.api = new FlickrAPI();
        this.udb = new UserDatabase();
        this.idb = new ImageDatabase();
        this.processed_images = {};
        this.r = new Renderer();
        /* eslint-enable no-undef */
    }

    async processPhotos(photo_ids) {
        const progress = new Progress(photo_ids.length);
        const api_promises = [[], []];
        for (const photo_id of photo_ids) {
            if (this.processed_images[photo_id] === true) {
                progress.duplicate(photo_id);
                continue;
            }
            this.processed_images[photo_id] = true;
            api_promises[0].push(this.api.getImageFavorites(photo_id).then((response) => {
                const pages = response.photo.pages;
                console.log("%s: %s pages", photo_id, pages) //TODO remove debugging info
                progress.updatePages(pages)
                for (let p = 2; p <= pages; p++) {
                    api_promises[1].push(this.api.getImageFavorites(photo_id, p).then((response) => {
                        this.udb.add(response);
                        progress.subUpdate(`${photo_id} ${p}`); //TODO remove debugging info
                    }));
                }
                this.udb.add(response);
                progress.update(`${photo_id} ${1}`); //TODO remove debugging info
            }));
        }
        // Wait for all the page 1's...
        await Promise.allSettled(api_promises[0]);
        // ...and then for all the other pages
        await Promise.allSettled(api_promises[1]);
        progress.done();
    }

    async processUsers(user_ids) {
        const progress = new Progress(user_ids.length);
        const api_promises = [[], []];
        for (const user_id of user_ids) {
            api_promises[0].push(this.api.getUserFavorites(user_id).then((response) => {
                const pages = Math.min(response.photos.pages, 50);
                if (response.photos.pages > 50) {
                    console.warn(`user ${user_id} has more than 50 pages of favorites`)
                }
                progress.updatePages(pages);
                for (let i = 2; i <= pages; i++) {
                    api_promises[1].push(this.api.getUserFavorites(user_id, i).then((response) => {
                        this.idb.add(response);
                        progress.subUpdate()
                    }))
                }
                this.idb.add(response);
                progress.update();
            }))
        }
        // Wait for all the page 1's...
        await Promise.allSettled(api_promises[0]);
        // ...and then for all the other pages
        await Promise.allSettled(api_promises[1]);
        progress.done();
    }

    async processUsersFromDB(num = 20) {
        let u = [];
        for (const i of this.udb.sortedList(num)) {
            u.push(i.nsid)
        }
        await this.processUsers(u);
    }

    async loadPhotos(photo_ids) {
        const ls = []
        for (const photo_id of photo_ids) {
            ls.push(
                this.api.getPhotoInfo(photo_id).then(response => this.idb.add(response))
            )
        }
        await Promise.allSettled(ls)
    }

}

class Progress {
    constructor(total_inputs) {
        this.number_of_inputs = total_inputs;
        this.total_inputs = total_inputs;
        this.inputs_processed = 0;
        this.total_pages = total_inputs;
        this.pages_processed = 0;
        this.duplicates = 0;
        this.errors = 0;
    }

    toString() {
        return `${this.inputs_processed}/${this.total_inputs} : ${this.pages_processed}/${this.total_pages}`
    }

    log(msg) {
        if (msg) {
            console.log("%s (%s)", this.toString(), msg);
        } else {
            console.log(this.toString());
        }
    }

    updatePages(pages) {
        // in some cases, there can be zero pages of results
        if (pages) {
            // 1 page is already accounted for 
            this.total_pages += pages - 1;
        }
    }

    update(msg) {
        this.inputs_processed += 1;
        this.pages_processed += 1;
        this.log(msg)
    }

    subUpdate(msg) {
        this.pages_processed += 1;
        this.log(msg)
    }

    duplicate(input_id) {
        this.duplicates += 1;
        this.total_inputs -= 1;
        this.total_pages -= 1;
        if (input_id) {
            console.warn(`${input_id} already processed`);
        }
    }

    done() {
        let msg = `Done. Processed ${this.number_of_inputs} users`
        if (this.duplicates) {
            msg += ` with ${this.duplicates} duplicates`
        }
        console.log(msg + ".");
    }
}