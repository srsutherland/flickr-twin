'use strict';

//var db = {};
var processed_images = {};
//var idb = {};
//var twins = {};

class FlickrAPI {
  constructor(api_key) {
    if (api_key) {
      this.setAPIKey(api_key);
    } else if (window.localStorage["api_key"]) {
      this.api_key = window.localStorage["api_key"];
    }
  }

  setAPIKey(api_key) {
    this.api_key = api_key;
    window.localStorage["api_key"] = api_key;
  }

  checkAPIKey() {
    if (!(this.api_key && this.api_key.length > 5)) {
      throw new Error("No API key set")
    }
  }

  async getImageFavorites(photo_id, page = 1) {
    this.checkAPIKey();
    const baseurl = "https://www.flickr.com/services/rest/?format=json&nojsoncallback=1";
    const method = "&method=flickr.photos.getFavorites&per_page=50";
    const rest_url = `${baseurl}${method}&photo_id=${photo_id}&page=${page}&api_key=${this.api_key}`;
    const rest_response = await fetch(rest_url);
    const response_json = await rest_response.json(); //extract JSON from the http response
    return response_json;
  }

  async getUserFavorites(user_id, page = 1) {
    this.checkAPIKey();
    const baseurl = "https://www.flickr.com/services/rest/?format=json&nojsoncallback=1";
    const method = "&method=flickr.favorites.getPublicList&per_page=500";
    const rest_url = `${baseurl}${method}&user_id=${user_id}&page=${page}&api_key=${this.api_key}`;
    const rest_response = await fetch(rest_url);
    const response_json = await rest_response.json(); //extract JSON from the http response
    return response_json;
  }
}

const api = new FlickrAPI(); // KEY REDACTED

class FavesDatabase {
  constructor() {
    this.db = {}
  }

  sortedList(max_count) {
    return Object.values(this.db).sort((a, b) => { return b.favecount - a.favecount; }).slice(0, max_count)
  }

  trimmedDB(min_faves = 2) {
    let newdb = {}
    for (const key in this.db) {
      if (this.db[key].favecount >= min_faves) {
        newdb[key] = this.db[key]
      }
    }
    return newdb;
  }

  store() {
    window.localStorage[this.storageKey] = JSON.stringify(this.db)
  }

  load() {
    this.db = JSON.parse(window.localStorage[this.storageKey])
  }
}

class UserDatabase extends FavesDatabase {
  constructor() {
    super()
    this.storageKey = "udb"
    //get old value from localstorage
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
    }
  }

  add(json_response) {
    if (json_response.stat !== "ok") {
      console.log(json_response.stat)
      return;
    }
    const people = json_response.photo.person
    const photo_id = json_response.photo.id
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

  addPhoto(photo) {
    this.db[photo.id] = {
      id: photo.id,
      owner: photo.owner,
      secret: photo.secret,
      server: photo.server,
      url: `https://www.flickr.com/photos/${photo.owner}/${photo.id}/`,
      imgUrl: `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_m.jpg`,
      favecount: 0,
    }
  }

  add(json_response) {
    if (json_response.stat !== "ok") {
      console.log(json_response.stat)
      return;
    }
    const photos = json_response.photos.photo
    for (const photo of photos) {
      const id = photo.id;
      if (this.db[id] === undefined) {
        this.addPhoto(photo)
      }
      this.db[id].favecount += 1;
    }
  }
}

const udb = new UserDatabase();
const idb = new ImageDatabase();

const update = (inputs_processed, total_inputs, pages_processed, total_pages) => {
  console.log(`${inputs_processed}/${total_inputs} : ${pages_processed}/${total_pages}`);
}

// eslint-disable-next-line no-unused-vars
const processPhotos = async (photo_ids) => {
  const total_photos = photo_ids.length;
  let photos_processed = 0;
  let total_pages = total_photos;
  let pages_processed = 0;
  const first_page_promises = []
  const remaining_promises = []
  for (const photo_id of photo_ids) {
    if (processed_images[photo_id] === true) {
      console.warn(`${photo_id} already processed`);
      continue;
    }
    processed_images[photo_id] = true;
    first_page_promises.push(api.getImageFavorites(photo_id).then((response) => {
      const pages = response.photo.pages;
      total_pages += pages - 1 // 1 page is already accounted for 
      for (let i = 2; i <= pages; i++) {
        remaining_promises.push(api.getImageFavorites(photo_id, i).then((response) => {
          udb.add(response);
          pages_processed += 1;
          update(photos_processed, total_photos, pages_processed, total_pages);
        }));
      }
      udb.add(response);
      photos_processed += 1;
      pages_processed += 1;
      update(photos_processed, total_photos, pages_processed, total_pages);
    }));
  }
  await Promise.allSettled(first_page_promises);
  await Promise.allSettled(remaining_promises);
}

// eslint-disable-next-line no-unused-vars
const processUsers = async (user_ids) => {
  const total_users = user_ids.length;
  let users_processed = 0;
  let total_pages = total_users;
  let pages_processed = 0;
  const first_page_promises = []
  const remaining_promises = []
  for (const user_id of user_ids) {
    first_page_promises.push(api.getUserFavorites(user_id).then((response) => {
      const pages = response.photos.pages > 50 ? 50 : response.photos.pages;
      if (response.photos.pages > 50) {
        console.warn(`user ${user_id} `)
      }
      total_pages += pages - 1 // 1 page is already accounted for 
      for (let i = 2; i <= pages; i++) {
        remaining_promises.push(api.getUserFavorites(user_id, i).then((response) => {
          idb.add(response);
          pages_processed += 1;
          update(users_processed, total_users, pages_processed, total_pages)
        }))
      }
      idb.add(response);
      users_processed += 1;
      pages_processed += 1;
      update(users_processed, total_users, pages_processed, total_pages);
    }))
  }
  await Promise.allSettled(first_page_promises);
  await Promise.allSettled(remaining_promises);
}

// eslint-disable-next-line no-unused-vars
async function processUsersFromDB() {
  let u = [];
  for (const i of udb.sortedList(50)) {
    u.push(i.nsid)
  }
  await processUsers(u);
}

class Renderer {
  print_results(max_count = 30) {
    let twins_list = udb.sortedList(max_count);

    for (const twin of twins_list) {
      const favecount = twin.favecount
      const name = twin.realname ? twin.realname : twin.username
      const nsid = twin.nsid
      console.log(`${favecount}: ${name} (https://www.flickr.com/photos/${nsid}/favorites)`)
    }
  }

  displayImages(max_count = 100) {
    document.body.innerHTML = "";
    for (const img of idb.sortedList(max_count)) {
      document.body.innerHTML += `<a href="${img.url}">${img.favecount}<img src="${img.imgUrl}"></a>`
    }
  }

  displayUnseenImages(max_count = 100) {
    document.body.innerHTML = "";
    let total = 0;
    for (const img of idb.sortedList(10000)) {
      if (!processed_images[img.id]) {
        document.body.innerHTML += `<a href="${img.url}">${img.favecount}<img src="${img.imgUrl}"></a>`
        total++
      }
      if (total >= max_count) break;
    }
  }
}

// eslint-disable-next-line no-unused-vars
const r = new Renderer();

// eslint-disable-next-line no-unused-vars
function downloadObjectAsJson(exportObj, exportName) {
  var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj));
  var downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", exportName + ".json");
  document.body.appendChild(downloadAnchorNode); // required for firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}
