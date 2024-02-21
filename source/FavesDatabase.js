/**
 * Base class for UserDatabase and ImageDatabase
 */
class FavesDatabase {
    constructor() {
        this.db = {};
    }

    /**
     * Returns true if the db contains the specified id
     * @param {string} id 
     * @returns {boolean}
     */
    has(id) {
        return this.db[id] !== undefined;
    }

    /**
     * Get an object from db
     * @param {string} id 
     * @param {object} defaultValue - the value to return if id is not found. Undefined if not specified
     * @returns {object}
     */
    get(id, defaultValue = undefined) {
        const value = this.db[id]; 
        return value !== undefined ? value : defaultValue;
    }

    /**
     * Set the value of the specified id
     * @param {string} id 
     * @param {object} value 
     */
    set(id, value) {
        this.db[id] = value;
    }

    /**
     * Returns an Array containing the all keys (ids) in the db
     * @returns {Array}
     */
    keys() {
        return Object.keys(this.db)
    }
    
    /**
     * Returns an Array containing the all values in the db
     * @returns {Array}
     */
    values() {
        return Object.values(this.db)
    }

    /**
     * Returns an Array of [key, value] pairs for each item in the db
     * @returns {Array} 
     */
    entries() {
        return Object.entries(this.db)
    }

    size() {
        return Object.keys(this.db).length
    }

    /**
     * Calculate and set the favescore for each item in the db.
     * Defaults to number of faves if no other scoring function is provided to the function or fdb object
     * @param {function(object):number} scorer - a function that takes a db item and returns a score
     */
    calculateScores(scorer = this.scorer) {
        if (typeof scorer !== 'function') {
            scorer = i => i.favecount;
        }
        for (const i of this.values()) {
            i.score = scorer(i);
        }
    }

    /**
     * Sets the method used to calculate favescore
     * @param {function(object):number} scorer - a function that takes a db item and returns a score
     */
    setScorer(scorer) {
        if (typeof scorer !== 'function') {
            throw new TypeError("scorer must be a function")
        }
        this.scorer = scorer
    }

    /**
     * Returns an Array of the contents of the db, sorted by fave count (highest first)
     * @param {number} max_count - Maximum number of items in the list. If omitted, returns the whole list.
     * @param {number} starting_from - Index to start from when slicing the list (for pagination). Defaults to 0.
     * @param {boolean} calculate_scores - If true, recalculate scores before sorting. Defaults to true.
     * @returns {Array} - The sorted Array
     */
    sortedList(max_count, starting_from = 0, calculate_scores = true) {
        const end = max_count ? starting_from + max_count : undefined;
        if (calculate_scores) { this.calculateScores(); };
        return this.values()
            .sort((a, b) => { return b.score - a.score; })
            .slice(starting_from, end);
    }

    /**
     * Returns an Array of the contents of the db, sorted by fave count (highest first), excluding exclude_list
     * @param {Array | Set} exclude_list - Set or list of items to exclude from the list. 
     * @param {number} max_count - Maximum number of items in the list. If omitted, returns the whole list.
     * @param {number} starting_from - Index to start from when slicing the list (for pagination). Defaults to 0.
     * @param {boolean} calculate_scores - If true, recalculate scores before sorting. Defaults to true.
     * @returns {Array} - The sorted Array
     */
    sortedListExcluding(exclude_list, max_count, starting_from = 0, calculate_scores = true) {
        const end = max_count ? starting_from + max_count : undefined;
        if (calculate_scores) { this.calculateScores(); };
        return this
            .excluding(exclude_list)
            .sort((a, b) => { return b.score - a.score; })
            .slice(starting_from, end);
    }

    /**
     * @returns {Object} - The internal database, with insignificant members trimmed off.
     */
    trimmedDB(min_faves = 2) {
        let newdb = {};
        for (const key of this.keys()) {
            if (this.get(key).favecount >= min_faves) {
                newdb[key] = this.get(key);
            }
        }
        return newdb;
    }

    /**
     * 
     * @param {Array | Set} exclude_list - Set or list of items to exclude from the list. 
     * @returns {Array} - A new array containing that members of the db, excluding above
     */
    excluding(exclude_list) {
        let exclude_set
        if (exclude_list instanceof Array) {
            exclude_set = new Set(exclude_list)
        } else if (exclude_list instanceof Set) {
            exclude_set = exclude_list;
        } else {
            throw (new TypeError("exclude_list must be an array or set"))
        }
        return this.values().filter(
            (item) => !exclude_set.has(item.id || item.nsid)
        )
    }

    /**
     * Clear the faves for all items, leaving photo/user data (for rendering purposes)
     */
    clearFaves() {
        for (const item of this.values()) {
            if (item.faves) item.faves = {};
            if (item.faved_by) item.faved_by = [];
            item.favecount = 0;
        }
    }

    /**
     * Copy db to localstorage (may be too large)
     */
    store() {
        window.localStorage[this.storageKey] = JSON.stringify(this.db);
    }

    /**
     * Load db from localstorage
     */
    load() {
        this.db = JSON.parse(window.localStorage[this.storageKey]);
    }
}

/**
 * Database that stores user objects with their associated data
 * Indexed by user nsid
 * @extends FavesDatabase
 */
export class UserDatabase extends FavesDatabase {
    constructor() {
        super();
        this.storageKey = "udb";
        this.scorer = u => 
            u.pages ? 
                u.favecount / (Math.log2(u.pages) + 1) : 
                u.favecount;
    }

    /**
     * Takes an object containing a person's properties from the api or elsewhere and adds it to the database
     * @param {Object} photo - an object containing the properties of a person 
     * @returns {Object} - the added person object
     */
    addPerson(person) {
        if (!this.has(person.nsid)) {
            this.set(person.nsid, {
                nsid: person.nsid,
                name: person.name || person.realname || person.username,
                realname: person.realname,
                username: person.username,
                buddyicon: person.buddyicon || person.iconserver > 0 ?
                    `http://farm${person.iconfarm}.staticflickr.com/${person.iconserver}/buddyicons/${person.nsid}.jpg` :
                    "https://www.flickr.com/images/buddyicon.gif",
                faves: {},
                favecount: 0,
            });
        }
    }

    /**
     * Parse an api response containing one or more persons and adds them to the database
     * @param {Object} api_response - object created from a json api response
     */
    add(api_response) {
        //flickr.photos.getFavorites
        const people = api_response.person;
        const photo_id = api_response.id;
        for (const person of people) {
            const nsid = person.nsid;
            this.addPerson(person);
            if (this.get(nsid).faves[photo_id]) {
                continue;
            }
            this.get(nsid).faves[photo_id] = person.favedate;
            this.get(nsid).favecount += 1;
        }
    }
}

/**
 * Database that stores photo objects with their associated data
 * Indexed by photo id
 * @extends FavesDatabase
 */
export class ImageDatabase extends FavesDatabase {
    constructor() {
        super();
        this.storageKey = "idb";
        this.scorer = i => 
            this.udb ?
                i.score = i.faved_by.map(nsid => this.udb.get(nsid)?.score || 0).reduce((sum, cur) => sum + cur, 0) : 
                i.favecount
    }

    /**
     * Takes an object containing an image's properties from the api or elsewhere and adds it to the database
     * @param {Object} photo - an object containing the properties of an image 
     * @returns {Object} - the added photo object
     */
    addPhoto(photo) {
        if (!this.has(photo.id)) {
            const owner = typeof photo.owner == "string" ? photo.owner : photo.owner.nsid;
            const newPhoto = {
                id: photo.id,
                owner: owner,
                secret: photo.secret,
                server: photo.server,
                url: `https://www.flickr.com/photos/${owner}/${photo.id}/`,
                imgUrl: `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_m.jpg`,
                faved_by: [],
                favecount: 0,
            }
            this.set(photo.id, newPhoto);
            return newPhoto;
        } else {
            return this.get(photo.id)
        }
    }

    /**
     * Parse an api response containing one or more photos and adds them to the database
     * @param {Object} api_response - object created from a json api response
     * @param {Object} [opts] 
     * @param {bool} [opts.nofavecount] - if truthy, do not incremnt image fave count
     * @param {string} [opts.user_id] - nsid of the user the response is for, to record in image.faved_by
     */
    add(api_response, opts={}) {
        //flickr.photos.getInfo
        if (api_response.id && !this.has(api_response.id)) {
            this.addPhoto(api_response);
        } else { //flickr.favorites.getPublicList
            const photos = api_response.photo;
            for (const photo of photos) {
                const id = photo.id;
                const record = this.addPhoto(photo);
                if (!opts.nofavecount) {
                    record.favecount += 1;
                    if (opts.user_id && !record.faved_by.includes(opts.user_id)) {
                        record.faved_by.push(opts.user_id)
                    } else {
                        this.get(id).favecount -= 1;
                    }
                }
            }
        }
    }

    bindUDB(udb) {
        this.udb = udb
    }
}