var db = {};
var processed_images = {};
var idb = {};
var twins = {};
const api_key = ""; //REDACTED

const getImageFavorites = async (api_key, photo_id, page) => {
  if (!page) {
    page = 1;
  }
  const baseurl = "https://www.flickr.com/services/rest/?format=json&nojsoncallback=1"
  const method = "&method=flickr.photos.getFavorites&per_page=50"
  const rest_url = `${baseurl}${method}&photo_id=${photo_id}&page=${page}&api_key=${api_key}`
  const rest_response = await fetch(rest_url);
  const response_json = await rest_response.json(); //extract JSON from the http response
  return response_json;
}

const getUserFavorites = async (api_key, user_id, page) => {
  if (!page) {
    page = 1;
  }
  const baseurl = "https://www.flickr.com/services/rest/?format=json&nojsoncallback=1"
  const method = "&method=flickr.favorites.getPublicList&per_page=500"
  const rest_url = `${baseurl}${method}&user_id=${user_id}&page=${page}&api_key=${api_key}`
  const rest_response = await fetch(rest_url);
  const response_json = await rest_response.json(); //extract JSON from the http response
  return response_json;
}

function addToDB(response) {
  if (response.stat !== "ok") {
    console.log(response.stat)
    return;
  }
  const people = response.photo.person
  const photo_id = response.photo.id
  for (const person of people) {
    const nsid = person.nsid;
    if (db[nsid] === undefined) {
      db[nsid] = {
        nsid: person.nsid,
        realname: person.realname,
        username: person.username,
        faves: {},
        favecount: 0,
      }
    }
    if (db[nsid].faves[photo_id]) {
      continue;
    }
    db[nsid].faves[photo_id] = person.favedate;
    db[nsid].favecount += 1;
    if (db[nsid].favecount > 1) {
      twins[nsid] = db[nsid];
    }
  }
}

const update = (photos_processed, total_photos, pages_processed, total_pages) => {
  console.log(`${photos_processed}/${total_photos} : ${pages_processed}/${total_pages}`);
}

// eslint-disable-next-line no-unused-vars
const processPhotos = (photo_ids) => {
  const total_photos = photo_ids.length;
  let photos_processed = 0;
  let total_pages = total_photos;
  let pages_processed = 0;
  for (const photo_id of photo_ids) {
    if (processed_images[photo_id] === true) {
      console.warn(`${photo_id} already processed`);
      continue;
    }
    processed_images[photo_id] = true;
    getImageFavorites(api_key, photo_id).then((response) => {
      const pages = response.photo.pages;
      total_pages += pages - 1 // 1 page is already accounted for 
      for (let i = 2; i <= pages; i++) {
        getImageFavorites(api_key, photo_id, i).then((response) => {
          addToDB(response);
          pages_processed += 1;
          update(photos_processed, total_photos, pages_processed, total_pages);
        })
      }
      addToDB(response);
      photos_processed += 1;
      pages_processed += 1;
      update(photos_processed, total_photos, pages_processed, total_pages);
    })
  }
}

function addToIDB(response) {
  if (response.stat !== "ok") {
    console.log(response.stat)
    return;
  }
  const photos = response.photos.photo
  for (const photo of photos) {
    const id = photo.id;
    if (idb[id] === undefined) {
      idb[id] = {
        id: photo.id,
        owner: photo.owner,
        secret: photo.secret,
        server: photo.server,
        url: `https://www.flickr.com/photos/${photo.owner}/${photo.id}/`,
        imgUrl: `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_m.jpg`,
        favecount: 0,
      }
    }
    idb[id].favecount += 1;
  }
}

// eslint-disable-next-line no-unused-vars
const processUsers = (user_ids) => {
  const total_users = user_ids.length;
  let users_processed = 0;
  let total_pages = total_users;
  let pages_processed = 0;
  for (const user_id of user_ids) {
    getUserFavorites(api_key, user_id).then((response) => {
      const pages = response.photos.pages > 50 ? 50 : response.photos.pages;
      if (response.photos.pages > 50) {
        console.warn(`user ${user_id} `)
      }
      total_pages += pages - 1 // 1 page is already accounted for 
      for (let i = 2; i <= pages; i++) {
        getUserFavorites(api_key, user_id, i).then((response) => {
          addToIDB(response);
          pages_processed += 1;
          update(users_processed, total_users, pages_processed, total_pages)
        })
      }
      addToIDB(response);
      users_processed += 1;
      pages_processed += 1;
      update(users_processed, total_users, pages_processed, total_pages);
    })
  }
}

function sortedList(db, max_count) {
  return Object.values(db).sort((a, b) => {return b.favecount - a.favecount;}).slice(0, max_count)
}

// eslint-disable-next-line no-unused-vars
function print_results(max_count) {
  if (!max_count) {
    max_count = 30;
  }
  let twins_list = sortedList(twins, max_count);

  for (const twin of twins_list) { 
    const favecount = twin.favecount
    const name = twin.realname?twin.realname:twin.username
    const nsid = twin.nsid
    console.log(`${favecount}: ${name} (https://www.flickr.com/photos/${nsid}/favorites)`)
  }
}

// eslint-disable-next-line no-unused-vars
function displayImages(max_count) {
  max_count = max_count ? max_count : 100;
  document.body.innerHTML = ""; 
  for (const img of sortedList(idb, max_count)) { 
    document.body.innerHTML += `<a href="${img.url}">${img.favecount}<img src="${img.imgUrl}"></a>`
  }
}

// eslint-disable-next-line no-unused-vars
function displayUnseenImages(max_count) {
  max_count = max_count ? max_count : 100;
  document.body.innerHTML = ""; 
  let total = 0;
  for (const img of sortedList(idb, 10000)) { 
    if (!processed_images[img.id]) {
      document.body.innerHTML += `<a href="${img.url}">${img.favecount}<img src="${img.imgUrl}"></a>`
      total++
    }
    if (total >= max_count) break;
  }
}

// eslint-disable-next-line no-unused-vars
function downloadObjectAsJson(exportObj, exportName){
  var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj));
  var downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href",     dataStr);
  downloadAnchorNode.setAttribute("download", exportName + ".json");
  document.body.appendChild(downloadAnchorNode); // required for firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

// eslint-disable-next-line no-unused-vars
function store() {
  const globals = ["db","processed_images", "twins", "idb"]

  for (const key of globals) try {
    window.localStorage[key] = JSON.stringify(window[key])
  } catch (e) {
    window.localStorage[key] = JSON.stringify(sortedList(window[key], 10000))
  }
  
}

// eslint-disable-next-line no-unused-vars
function load() {
  const globals = ["db","processed_images", "twins", "idb"]

  for (const key of globals)
  window[key] = JSON.parse(window.localStorage[key])
}
