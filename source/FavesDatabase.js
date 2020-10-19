'use strict';

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
     * @returns {object}
     */
    get(id) {
        return this.db[id];
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
     * Returns an Array of the contents of the db, sorted by fave count (highest first)
     * @param {number} max_count - Maximum number of items in the list. If omitted, returns the whole list.
     * @param {number} starting_from - Index to start from when slicing the list (for pagination). Defaults to 0.
     * @returns {Array} - The sorted Array
     */
    sortedList(max_count, starting_from = 0) {
        return Object.values(this.db)
            .sort((a, b) => { return b.favecount - a.favecount; })
            .slice(starting_from, starting_from + max_count);
    }

    /**
     * Returns an Array of the contents of the db, sorted by fave count (highest first), excluding exclude_list
     * @param {Array | Set} exclude_list - Set or list of items to exclude from the list. 
     * @param {number} max_count - Maximum number of items in the list. If omitted, returns the whole list.
     * @param {number} starting_from - Index to start from when slicing the list (for pagination). Defaults to 0.
     * @returns {Array} - The sorted Array
     */
    sortedListExcluding(exclude_list, max_count, starting_from = 0) {
        return this
            .excluding(exclude_list)
            .sort((a, b) => { return b.favecount - a.favecount; })
            .slice(starting_from, starting_from + max_count);
    }

    /**
     * @returns {Object} - The internal database, with insignificant members trimmed off.
     */
    trimmedDB(min_faves = 2) {
        let newdb = {};
        for (const key in this.db) {
            if (this.get(key).favecount >= min_faves) {
                newdb[key] = this.db[key];
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
        return Object.values(this.db).filter(
            (item) => !exclude_set.has(item.id || item.nsid)
        )
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

// eslint-disable-next-line no-unused-vars
class UserDatabase extends FavesDatabase {
    constructor() {
        super();
        this.storageKey = "udb";
        // TODO get old value from localstorage
    }

    addPerson(person) {
        this.set(person.nsid, {
            nsid: person.nsid,
            realname: person.realname,
            username: person.username,
            buddyicon: person.iconserver > 0 ?
                `http://farm${person.iconfarm}.staticflickr.com/${person.iconserver}/buddyicons/${person.nsid}.jpg` :
                "https://www.flickr.com/images/buddyicon.gif",
            faves: {},
            favecount: 0,
        });
    }

    add(json_response) {
        if (json_response.stat !== "ok") {
            console.log(json_response.stat);
            return;
        }
        const people = json_response.photo.person;
        const photo_id = json_response.photo.id;
        for (const person of people) {
            const nsid = person.nsid;
            if (!this.has(nsid)) {
                this.addPerson(person);
            }
            if (this.get(nsid).faves[photo_id]) {
                continue;
            }
            this.get(nsid).faves[photo_id] = person.favedate;
            this.get(nsid).favecount += 1;
        }
    }
}

// eslint-disable-next-line no-unused-vars
class ImageDatabase extends FavesDatabase {
    constructor() {
        super();
        this.storageKey = "idb";
        // TODO get old value from localstorage
    }

    addPhoto(photo) {
        const owner = typeof photo.owner == "string" ? photo.owner : photo.owner.nsid;
        this.set(photo.id, {
            id: photo.id,
            owner: owner,
            secret: photo.secret,
            server: photo.server,
            url: `https://www.flickr.com/photos/${owner}/${photo.id}/`,
            imgUrl: `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_m.jpg`,
            favecount: 0,
        });
    }

    add(json_response) {
        if (json_response.stat !== "ok") {
            console.log(json_response.stat);
            return;
        }
        //flickr.photos.getInfo
        if (json_response.photo && !this.has(json_response.photo.id)) {
            this.addPhoto(json_response.photo);
        } else { //flickr.favorites.getPublicList
            const photos = json_response.photos.photo;
            for (const photo of photos) {
                const id = photo.id;
                if (!this.has(id)) {
                    this.addPhoto(photo);
                }
                this.get(id).favecount += 1;
            }
        }
    }
}
