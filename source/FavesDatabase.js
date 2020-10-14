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

/* eslint-disable no-unused-vars */
const udb = new UserDatabase();
const idb = new ImageDatabase();
