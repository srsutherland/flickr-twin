'use strict';

'use strict';

// eslint-disable-next-line no-unused-vars
class FlickrAPI {
    constructor(api_key) {
        if (api_key) {
            this.setAPIKey(api_key);
        } else if (window.localStorage["api_key"]) {
            this.api_key = window.localStorage["api_key"];
        }
        if (window.localStorage["call_history"]) {
            this.call_history = JSON.parse(window.localStorage["call_history"]);
        } else {
            this.call_history = [];
        }
    }

    toString() {
        if (this.api_key) {
            const calls = this.getNumberOfAPICalls();
            let returnValue = `"${this.api_key}": Used ${calls}/3500 calls this hour.`;
            if (calls > 0) {
                const ms_until_call_expires = this.call_history[0] + 60 * 60 * 1000 - Date.now();
                const time_formatted = new Date(ms_until_call_expires).toISOString().substr(11, 8);
                returnValue += ` Oldest call expires in ${time_formatted}`;
            }
            return returnValue;
        } else {
            return "No API key set";
        }
    }

    log() {
        console.log(this.toString());
    }

    setAPIKey(api_key) {
        this.api_key = api_key;
        window.localStorage["api_key"] = api_key;
    }

    getNumberOfAPICalls() {
        const one_hour_ago = Date.now() - 60 * 60 * 1000;
        while (this.call_history[0] < one_hour_ago) {
            this.call_history.shift();
        }
        return this.call_history.length;
    }

    useAPI() {
        if (!(this.api_key && this.api_key.length > 5)) {
            throw new Error("No API key set");
        }
        if (this.getNumberOfAPICalls() > 3500) {
            throw new Error("Exceeded API limit for this key");
        }
        this.call_history.push(Date.now());
        window.localStorage["call_history"] = JSON.stringify(this.call_history);
    }

    /**
     * https://www.flickr.com/services/api/flickr.photos.getFavorites.html
     * Returns a json object with a list of people who have favorited a given photo.
     * @param {string} photo_id - The ID of the photo to fetch the favoriters list for.
     * @param {number} page - The page of results to return. If this argument is omitted, it defaults to 1.
     */
    async getImageFavorites(photo_id, page = 1) {
        this.useAPI();
        const baseurl = "https://www.flickr.com/services/rest/?format=json&nojsoncallback=1";
        const method = "&method=flickr.photos.getFavorites&per_page=50";
        const rest_url = `${baseurl}${method}&photo_id=${photo_id}&page=${page}&api_key=${this.api_key}`;
        const rest_response = await fetch(rest_url);
        const response_json = await rest_response.json(); //extract JSON from the http response
        return response_json;
    }

    /**
     * https://www.flickr.com/services/api/flickr.favorites.getPublicList.html
     * Returns a json object with a list of favorite public photos for the given user.
     * @param {*} user_id - The user to fetch the favorites list for.
     * @param {*} page - The page of results to return. If this argument is omitted, it defaults to 1.
     */
    async getUserFavorites(user_id, page = 1) {
        this.useAPI();
        const baseurl = "https://www.flickr.com/services/rest/?format=json&nojsoncallback=1";
        const method = "&method=flickr.favorites.getPublicList&per_page=500";
        const rest_url = `${baseurl}${method}&user_id=${user_id}&page=${page}&api_key=${this.api_key}`;
        const rest_response = await fetch(rest_url);
        const response_json = await rest_response.json(); //extract JSON from the http response
        return response_json;
    }

    /**
     * https://www.flickr.com/services/api/flickr.photos.getInfo.html
     * Returns a json object with information about a photo.
     * @param {string} photo_id 
     */
    async getPhotoInfo(photo_id) {
        this.useAPI();
        const baseurl = "https://www.flickr.com/services/rest/?format=json&nojsoncallback=1";
        const method = "&method=flickr.photos.getInfo";
        const rest_url = `${baseurl}${method}&photo_id=${photo_id}&api_key=${this.api_key}`;
        const rest_response = await fetch(rest_url);
        const response_json = await rest_response.json(); //extract JSON from the http response
        return response_json;
    }
}

'use strict';

class FavesDatabase {
    constructor() {
        this.db = {};
    }

    sortedList(max_count, starting_from = 0) {
        return Object.values(this.db)
            .sort((a, b) => { return b.favecount - a.favecount; })
            .slice(starting_from, starting_from + max_count);
    }

    sortedListExcluding(exclude_list, max_count, starting_from = 0) {
        let exclude_dict = {};
        if (exclude_list instanceof Array) {
            for (const i of exclude_list) {
                exclude_dict[i] = true;
            }
        } else {
            exclude_dict = exclude_list;
        }
        return Object.values(this.db)
            .sort((a, b) => {
                const a_excluded = !!exclude_dict[a.id || a.nsid];
                const b_excluded = !!exclude_dict[b.id || b.nsid];
                //if both or neither are excluded
                if (a_excluded == b_excluded) {
                    return b.favecount - a.favecount;
                } else if (a_excluded) {
                    return 1; //move a towards end
                } else if (b_excluded) {
                    return -1; //move b towards end
                }
            })
            .slice(starting_from, starting_from + max_count);
    }

    trimmedDB(min_faves = 2) {
        let newdb = {};
        for (const key in this.db) {
            if (this.db[key].favecount >= min_faves) {
                newdb[key] = this.db[key];
            }
        }
        return newdb;
    }

    store() {
        window.localStorage[this.storageKey] = JSON.stringify(this.db);
    }

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
        this.db[person.nsid] = {
            nsid: person.nsid,
            realname: person.realname,
            username: person.username,
            buddyicon: person.iconserver > 0 ?
                `http://farm${person.iconfarm}.staticflickr.com/${person.iconserver}/buddyicons/${person.nsid}.jpg` :
                "https://www.flickr.com/images/buddyicon.gif",
            faves: {},
            favecount: 0,
        };
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
            if (this.db[nsid] === undefined) {
                this.addPerson(person);
            }
            if (this.db[nsid].faves[photo_id]) {
                continue;
            }
            this.db[nsid].faves[photo_id] = person.favedate;
            this.db[nsid].favecount += 1;
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
        this.db[photo.id] = {
            id: photo.id,
            owner: owner,
            secret: photo.secret,
            server: photo.server,
            url: `https://www.flickr.com/photos/${owner}/${photo.id}/`,
            imgUrl: `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_m.jpg`,
            favecount: 0,
        };
    }

    add(json_response) {
        if (json_response.stat !== "ok") {
            console.log(json_response.stat);
            return;
        }
        //flickr.photos.getInfo
        if (json_response.photo && !this.db[json_response.photo.id]) {
            this.addPhoto(json_response.photo);
        } else { //flickr.favorites.getPublicList
            const photos = json_response.photos.photo;
            for (const photo of photos) {
                const id = photo.id;
                if (this.db[id] === undefined) {
                    this.addPhoto(photo);
                }
                this.db[id].favecount += 1;
            }
        }
    }
}

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

const c = new Controller()
c.api.log()
