import { UserDatabase, ImageDatabase } from "./FavesDatabase.js";
import { FlickrAPI } from "./FlickrAPI.js"
import { Renderer } from "./Renderer.js"
import { Progress } from "./Progress.js"

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
        const progress = new Progress().renderWith(this.r);
        for (const photo_id of photo_ids) {
            if (this._processed_images.has(photo_id)) {
                progress.duplicate(photo_id);
                continue;
            }
            this._processed_images.add(photo_id);
            //Load the first page of faves for each image, get total number of pages
            progress.await(this.api.getImageFavorites(photo_id).then((response) => {
                const pages = response.pages;
                // Load each subpage
                for (let p = 2; p <= pages; p++) {
                    progress.awaitSub(this.api.getImageFavorites(photo_id, p).then(response => this.udb.add(response)));
                }
                this.udb.add(response);
            })).catch(error => {
                this._processed_images.delete(photo_id)
                progress.error(photo_id, error)
            });
        }
        progress.log()
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
        const progress = new Progress().renderWith(this.r);
        for (const user_id of user_ids) {
            progress.await(this.loadUserFavorites(user_id, {progress: progress}))
        }
        progress.log()
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
        const progress = opts.progress || new Progress()
        const id_list = [];
        // If "discard" opt is set, change idb to a dummy object that discards the response
        const idb = opts.discard ? {add: () => null} : this.idb;
        // Load the first page of faves for each user, get the total number of pages
        progress.log()
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
        if (this.udb.size() == 0) {
            this.r.warnMessage("You have to find some twins first!");
            return Promise.reject("UserDatabase was empty")
        }
        const users = this.udb.sortedList(num, starting_from).map(user => user.nsid)
        await this.processUsers(users);
    }

    async processUsersFromDBSmart(max_requests = 1000) {
        if (this.udb.size() == 0) {
            this.r.warnMessage("You have to find some twins first!");
            return Promise.reject("UserDatabase was empty")
        }
        let resources_remaining = Math.min(this.api.getRemainingAPICalls(), max_requests)
        const maxUsers = Math.min(Math.floor(resources_remaining/5), 100)
        const sortedUsers = this.udb.sortedList(Math.min(resources_remaining, 1000))
        let currentUsers = sortedUsers.slice(0, maxUsers)
        const userqueue = sortedUsers.slice(maxUsers)
        const scoremult = {}
        const progress = new Progress().renderWith(this.r)
        console.log({resources_remaining:resources_remaining, maxUsers:maxUsers, sortedUsers:sortedUsers, currentUsers:currentUsers, userqueue:userqueue, scoremult:scoremult, progress:progress}) //TODO
        const compareScores = (a, b) => b.score * scoremult[b.nsid] - a.score * scoremult[a.nsid];
        const notExhausted = user => user.pages !== undefined && user.pages > user.pages_processing;
        //request the initial page for user when first processed
        const getInitialPage = (user) => {
            const user_id = user.nsid
            user.pages = undefined;
            user.pages_processed = undefined;
            user.pages_processing = 1
            scoremult[user_id] = 0
            resources_remaining -= 1
            console.log(`getInitialpage(${user_id})`)
            progress.await(this.api.getUserFavorites(user_id).then(response => {
                this.idb.add(response, { user_id: user_id })
                user.pages = response.pages;
                user.pages_processed = 1
                user.faves_processed = response.photo?.length || 0
                user.faves_total = response.total
                user.score = this.udb.scorer(user)
                scoremult[user_id] = 1
                console.log(`${user_id}: ${user.name}'s score is ${user.score} * ${scoremult[user_id]} = ${user.score * scoremult[user_id]}`) //TODO
            })).catch(error => {
                progress.error(user_id, error)
                user.pages = 0;
                user.pages_processed = 0
                user.faves_processed = 0
                user.total = 0
                scoremult[user_id] = 0
            })
        }
        //request the next page of user's favorites
        const getNextPage = (user) => {
            const user_id = user.nsid
            resources_remaining -= 1
            user.pages_processing += 1
            progress.awaitSub(this.api.getUserFavorites(user_id).then(response => {
                this.idb.add(response, { user_id: user_id })
                user.pages_processed += 1
                user.faves_processed += response.photo?.length || 0
                user.score = this.udb.scorer(user)
                console.log(`${user_id}: ${user.name}'s score is ${user.score} * ${scoremult[user_id]} = ${user.score * scoremult[user_id]}`) //TODO
            })).catch(error => {
                progress.error(user_id, error)
                user.pages = 0;
                user.pages_processed = 0
                scoremult[user_id] = 0
            })
            //bump user's score down by 10% for sorting purposes
            scoremult[user_id] = scoremult[user_id] * 0.90
            if (!notExhausted(user)) {
                scoremult[user_id] = 0;
            }
        }
        // // logic // //
        //get those initial pages 
        for (const user of currentUsers) {
            getInitialPage(user);
        }
        progress.log()
        //wait until 75% of requests have been processed
        await progress.waitForProgress(Math.ceil(maxUsers / 4))
        //main loop
        while(resources_remaining > 0 && currentUsers.length + userqueue.length > 0) {
            //remove users with no pages left to query
            currentUsers = currentUsers.filter(notExhausted);
            //fill the working set of users back up from the queue
            while (currentUsers.length < Math.min(maxUsers * 0.75, resources_remaining / 2) && userqueue.length > 0) {
                const userToAdd = userqueue.shift();
                getInitialPage(userToAdd);
                currentUsers.push(userToAdd);
                if (resources_remaining <= 0) {
                    break;
                }
            }
            //wait until 75% of requests have been processed
            await progress.waitForProgress(Math.ceil(maxUsers / 4))
            //sort users by modified score
            currentUsers.sort(compareScores)
            //grab the user at the top of the list
            const user = currentUsers[0]
            if (!(notExhausted(user))){
                break; //need to go to filter step early
            }
            //grab the next page of faves and bump user's score down by 10% for sorting purposes
            getNextPage(user);
        }
        // Wait for all the api call promises to settle
        await progress.allSettled();
        progress.done();
        console.log({resources_remaining:resources_remaining, maxUsers:maxUsers, sortedUsers:sortedUsers, currentUsers:currentUsers, userqueue:userqueue, scoremult:scoremult, progress:progress}) //TODO
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
        const progress = new Progress()
        for (const photo_id of photo_ids) {
            if (!this.idb.has(photo_id)) {
                progress.await(this.api.getPhotoInfo(photo_id).then(response => {
                    this.idb.add(response)
                })).catch(error => {
                    progress.error(photo_id, error)
                })
            } else {
                progress.duplicate()
            }
        }
        progress.log()
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

export default Controller