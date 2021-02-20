import { UserDatabase, ImageDatabase } from "./FavesDatabase.js";
import { FlickrAPI } from "./FlickrAPI.js"
import { Renderer } from "./Renderer.js"

export class Controller {
    constructor() {
        this.api = new FlickrAPI();
        this.udb = new UserDatabase();
        this.idb = new ImageDatabase();
        this._processed_images = new Set();
        this._excluded = new Set();
        this._hidden = new Set();
        this.r = new Renderer(this);
    }

    async processPhotos(photo_ids) {
        const progress = new Progress(photo_ids.length).renderWith(this.r);
        for (const photo_id of photo_ids) {
            if (this._processed_images.has(photo_id)) {
                progress.duplicate(photo_id);
                continue;
            }
            this._processed_images.add(photo_id);
            //Load the first page of faves for each image, get total number of pages
            progress.await(this.api.getImageFavorites(photo_id).then((response) => {
                const pages = response.pages;
                console.log("%s: %s pages", photo_id, pages) //TODO remove debugging info
                progress.updatePages(pages)
                // Load each subpage
                for (let p = 2; p <= pages; p++) {
                    progress.awaitSub(this.api.getImageFavorites(photo_id, p).then((response) => {
                        this.udb.add(response);
                        progress.subUpdate(`${photo_id} ${p}`); //TODO remove debugging info
                    }));
                }
                this.udb.add(response);
                progress.update(`${photo_id} ${1}`); //TODO remove debugging info
            }).catch(error => {
                this._processed_images.delete(photo_id)
                progress.error(photo_id, error)
            }));
        }
        // Wait for all the api call promises to settle
        await progress.allSettled()
        progress.done();
    }

    async processUsers(user_ids) {
        const progress = new Progress(user_ids.length).renderWith(this.r);
        for (const user_id of user_ids) {
            progress.await(this.loadUserFavorites(user_id, {progress: progress}))
        }
        // Wait for all the api call promises to settle
        await progress.allSettled();
        progress.done();
    }

    async loadUserFavorites(user_id, opts = {}) {
        const progress = opts.progress || new Progress(1)
        const idb = opts.idb || this.idb
        // Load the first page of faves for each user, get the total number of pages
        await this.api.getUserFavorites(user_id).then((response) => {
            const pages = Math.min(response.pages, opts.max_pages || 50);
            if (response.pages > 50) {
                console.warn(`user ${user_id} has more than 50 pages of favorites`)
            }
            progress.updatePages(pages);
            // Load each subpage
            for (let i = 2; i <= pages; i++) {
                progress.awaitSub(this.api.getUserFavorites(user_id, i).then((response) => {
                    idb.add(response, { user_id: user_id });
                    progress.subUpdate()
                }))
            }
            idb.add(response, { user_id: user_id });
            progress.update();
        }).catch(error => {
            progress.error(user_id, error)
        })
        if (!opts.progress) {
            progress.done()
        }
        return idb;
    }

    async processPhotosFromUser(user_id) {
        // Done in one step to allow idb to be garbage collected immediately
        const photo_ids = (await this.loadUserFavorites(user_id, {idb: new ImageDatabase()} )).keys()  
        await this.processPhotos(photo_ids)
    }

    async processUsersFromDB(num = 20, starting_from = 0) {
        const users = this.udb.sortedList(num, starting_from).map(user => user.nsid)
        await this.processUsers(users);
    }

    /**
     * Make sure the specified photos are loaded into idb so you can display them
     * Uses api.getPhotoInfo() (flickr.photos.getInfo)
     * @param {Array} photo_ids - List of photo ids to load
     */
    async loadPhotos(photo_ids) {
        const progress = new Progress(photo_ids.length)
        for (const photo_id of photo_ids) {
            if (!this.idb.has(photo_id)) {
                progress.await(this.api.getPhotoInfo(photo_id).then(response => {
                    this.idb.add(response)
                    progress.update()
                }).catch(error => {
                    progress.error(photo_id, error)
                }))
            } else {
                progress.duplicate()
            }
        }
        await progress.allSettled()
        progress.done()
    }

    /**
     * Exclude ids from the process
     * @param {Iterable} list - List of ids to exclude
     */
    exclude(list) {
        for (const i of list) {
            this._excluded.add(i);
        }
    }

    /**
     * Hide ids from being displayed by the renderer
     * @param {Iterable} list - List of ids to hide
     */
    hide(list) {
        for (const i of list) {
            this._hidden.add(i);
        }
    }

    /**
     * @returns {Set} - Set of all the ids which should be hidden
     */
    getHidden() {
        return new Set([...this._processed_images, ...this._excluded, ...this._hidden])
    }

    /**
     * Returns true if the given id should be hidden
     * @param {string} id - Photo id to check 
     * @returns {boolean}
     */
    isHidden(id) {
        return this._processed_images.has(id) || this._excluded.has(id) || this._hidden.has(id)
    }
}

export class Progress {
    constructor(total_inputs) {
        this.number_of_inputs = total_inputs;
        this.total_inputs = total_inputs;
        this.inputs_processed = 0;
        this.total_pages = total_inputs;
        this.pages_processed = 0;
        this.duplicates = 0;
        this.errors = 0;
        this.awaited = [];
        this.awaitedSub = [];
    }

    renderWith(renderer_object) {
        this.renderer = renderer_object;
        return this;
    }

    toString() {
        return `${this.inputs_processed}/${this.total_inputs} : ${this.pages_processed}/${this.total_pages}`;
    }

    log(msg) {
        if (this.renderer instanceof Renderer) {
            let percentage = 100 * this.pages_processed / this.total_pages;
            this.renderer.displayProgress(percentage, this.toString());
        }
        if (!this.renderer || window.verbose_mode) {
            if (msg) {
                console.log("%s (%s)", this.toString(), msg);
            } else {
                console.log(this.toString());
            }
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

    error(input_id, msg) {
        this.errors += 1
        if (input_id) {
            console.error(`Error processing ${input_id}${msg ? ": " + msg : ""}`);
        }
    }

    /**
     * Collects promises from primary api calls
     * @param {Promise} promise 
     */
    await(promise) {
        this.awaited.push(promise)
    }

    /**
     * Collects promises from secondary api calls
     * @param {Promise} promise 
     */
    awaitSub(promise) {
        this.awaitedSub.push(promise)
    }

    /**
     * @returns {Promise} - Resolves when all collected api call promises have resolved/failed
     */
    async allSettled() {
        // Wait for all the page 1's...
        await Promise.allSettled(this.awaited)
        // ...and then for all the other pages
        await Promise.allSettled(this.awaitedSub)
    }

    /**
     * Log that the task has been completed
     */
    done() {
        let msg = `Done. Processed ${this.inputs_processed}/${this.number_of_inputs} items over ${this.pages_processed} requests`
        if (this.duplicates) {
            msg += ` with ${this.duplicates} duplicates`
        }
        console.log(msg + ".");
    }
}

export default Controller