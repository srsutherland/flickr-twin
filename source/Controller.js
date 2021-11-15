import { UserDatabase, ImageDatabase } from "./FavesDatabase.js";
import { FlickrAPI } from "./FlickrAPI.js"
import { Renderer } from "./Renderer.js"

/**
 * Controller Object. Handles main control flow and instantiates + directs the other objects
 */
export class Controller {
    constructor() {
        this.api = new FlickrAPI();
        this.udb = new UserDatabase();
        this.idb = new ImageDatabase();
        this.idb.bindUDB(this.udb);
        this._processed_images = new Set();
        this._excluded = new Set();
        this._hidden = new Set();
        this.r = new Renderer(this);
    }

    /**
     * Takes a list of photo ids and queries which users have favorited them,
     * then records those users into the udb, keeping track of which and how many 
     * photos were favorited for each user. 
     * Uses api.getImageFavorites() (flickr.photos.getFavorites)
     * @param {(string[]|string)} photo_ids - an array of photo ids or a single photo id
     */
    async processPhotos(photo_ids) {
        if (typeof photo_ids === "string") {
            photo_ids = [photo_ids]
        }
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
                progress.updatePages(pages)
                // Load each subpage
                for (let p = 2; p <= pages; p++) {
                    progress.awaitSub(this.api.getImageFavorites(photo_id, p).then(response => this.udb.add(response)));
                }
                this.udb.add(response);
            }).catch(error => {
                this._processed_images.delete(photo_id)
                progress.error(photo_id, error)
            }));
        }
        // Wait for all the api call promises to settle
        await progress.allSettled()
        progress.done();
    }

    /**
     * Take a list of user ids and queries their favorite photos, recording that data in the idb
     * Uses api.getUserFavorites() (flickr.favorites.getPublicList)
     * @param {(string[]|string)} user_ids - an array of user ids or a single user id
     */
    async processUsers(user_ids) {
        if (typeof user_ids === "string") {
            user_ids = [user_ids]
        }
        const progress = new Progress(user_ids.length).renderWith(this.r);
        for (const user_id of user_ids) {
            progress.await(this.loadUserFavorites(user_id, {progress: progress}))
        }
        // Wait for all the api call promises to settle
        await progress.allSettled();
        progress.done();
    }

    /**
     * Load all pages of favorites for a user and add them to the db, returning a list of favorites
     * @param {string} user_id 
     * @param {Object} [opts]
     * @param {Object} [opts.discard] - do not add responses to database, only add to return value
     * @param {Object} [opts.progress] - progress object to pass in 
     * @param {Object} [opts.max_pages] - max pages of faves to process per user
     * @returns {string[]} - array of photo ids that the user has favorited
     */
    async loadUserFavorites(user_id, opts = {}) {
        const progress = opts.progress || new Progress(1)
        const id_list = [];
        // If "discard" opt is set, change idb to a dummy object that discards the response
        const idb = opts.discard ? {add: () => null} : this.idb;
        // Load the first page of faves for each user, get the total number of pages
        await this.api.getUserFavorites(user_id).then((response) => {
            const user = this.udb.get(user_id)
            if (user) {
                user.pages = response.pages
                user.pages_processed = user.pages_processed || 0
            }
            const pages = Math.min(response.pages, opts.max_pages || 50);
            if (response.pages > 50) {
                console.warn(`user ${user_id} has more than 50 pages of favorites`)
            }
            progress.updatePages(pages);
            const handleResponse = (response) => {
                id_list.push(...response.photo.map(photo=>photo.id))
                idb.add(response, { user_id: user_id });
                if (user) {
                    user.pages_processed += 1
                }
            }
            // Load each subpage
            for (let i = 2; i <= pages; i++) {
                progress.awaitSub(this.api.getUserFavorites(user_id, i).then(handleResponse))
            }
            handleResponse(response)
        }).catch(error => {
            progress.error(user_id, error)
        })
        if (!opts.progress) {
            progress.done()
        }
        return id_list;
    }

    /**
     * Query the favorite photos of the given user and then process them
     * Uses api.getUserFavorites() (flickr.favorites.getPublicList)
     * Uses api.getImageFavorites() (flickr.photos.getFavorites)
     * @param {string} user_id 
     */
    async processPhotosFromUser(user_id) {
        const photo_ids = await this.loadUserFavorites(user_id, {discard: true})
        await this.processPhotos(photo_ids)
    }

    /**
     * Process the favorites of the top num users in the database by score
     * @param {number} num - number of users to process
     * @param {number} starting_from - start from the nth user
     */
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
        if (typeof photo_ids === "string") {
            photo_ids = [photo_ids]
        }
        const progress = new Progress(photo_ids.length)
        for (const photo_id of photo_ids) {
            if (!this.idb.has(photo_id)) {
                progress.await(this.api.getPhotoInfo(photo_id).then(response => {
                    this.idb.add(response)
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
        if (typeof list === "string") {
            list = [list]
        }
        for (const i of list) {
            this._excluded.add(i);
        }
    }

    /**
     * Hide ids from being displayed by the renderer
     * @param {Iterable} list - List of ids to hide
     */
    hide(list) {
        if (typeof list === "string") {
            list = [list]
        }
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

/**
 * Used to track and display progress of long controller methods
 */
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

    /**
     * Set the renderer that gets called on log()
     * @param {Renderer} renderer_object 
     * @returns {Progress} - a reference to this object
     */
    renderWith(renderer_object) {
        this.renderer = renderer_object;
        return this;
    }

    toString() {
        const dups = this.duplicates ? `, ${this.duplicates} dups` : "";
        const errs = this.errors ? `, ${this.errors} errs` : "";
        return `${this.inputs_processed}/${this.total_inputs} : ${this.pages_processed}/${this.total_pages}${dups}${errs}`;
    }

    /**
     * Logs the status to the console, or if the renderer is set, tells it to redraw the progress bar
     * @param {string} msg - additional message to display
     */
    log(msg) {
        if (this.renderer instanceof Renderer) {
            let percentage = 100 * (this.pages_processed + this.errors) / this.total_pages;
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

    /**
     * Adds to the total number of pages
     * Called when a request first returns the number of pages of results
     * @param {*} pages - number of pages
     */
    updatePages(pages) {
        // in some cases, there can be zero pages of results
        if (pages) {
            // 1 page is already accounted for 
            this.total_pages += pages - 1;
        }
    }

    /**
     * Called when a primary request is completed
     * @param {string} msg - additional message to display
     */
    update(msg) {
        this.inputs_processed += 1;
        this.pages_processed += 1;
        this.log(msg)
    }

    /**
     * Called when a subpage request is completed
     * @param {string} msg - additional message to display
     */
    subUpdate(msg) {
        this.pages_processed += 1;
        this.log(msg)
    }

    /**
     * Indicate that an item is a duplicate and will not be processed,
     * so remove it from the progress total
     * @param {string} input_id - id of the duplicate item
     */
    duplicate(input_id) {
        this.duplicates += 1;
        this.total_inputs -= 1;
        this.total_pages -= 1;
        if (input_id) {
            console.warn(`${input_id} already processed`);
        }
    }

    /**
     * Called on error processing an item
     * @param {string} input_id - id of the item causing the error
     * @param {string} msg - additional message to display, usually the original error message
     */
    error(input_id, msg = "") {
        this.errors += 1
        if (input_id) {
            console.error(`Error processing ${input_id}${msg}`);
        }
    }

    /**
     * Collects promises from primary api calls
     * @param {Promise} promise 
     */
    await(promise, updateMsg) {
        this.awaited.push(promise)
        promise.then(() => this.update(updateMsg))
    }

    /**
     * Collects promises from secondary api calls
     * @param {Promise} promise 
     */
    awaitSub(promise, updateMsg) {
        this.awaitedSub.push(promise)
        promise.then(() => this.subUpdate(updateMsg))
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
        if (this.errors) {
            const prefix = this.duplicates ? "and" : "with"
            msg += ` ${prefix} ${this.errors} errors`
        }
        console.log(msg + ".");
    }
}

export default Controller